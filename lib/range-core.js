/**
 * Pure Range Mask plan helpers. DSH 0.2.0-rc.2 surface sequences are ordered
 * model-visible events; tool/call execution trace events are NOT surface nodes.
 * This module never changes the original events or external tool state.
 */
import { createHash } from 'node:crypto'

export const MAX_DISPLAY_ROWS = 1200
export const RANGE_NOTICE = '[Context Mask: the user excluded a contiguous section of earlier conversation history. The omitted section may have contained user prompts, assistant messages and tool results. Its contents must not be inferred from this notice. Re-check real workspace files or tools when needed.]'
const TYPES = new Set(['system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result'])

export function parseSeq(value, label = 'Seq') {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${label} must be a non-negative integer Seq ID.`)
  const n = Number(value)
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a safe integer Seq ID.`)
  return n
}
export function parseRangeInput(input, needsToken = false) {
  const parts = String(input).trim().split(/\s+/u)
  if (parts.length !== (needsToken ? 3 : 2)) {
    throw new Error(needsToken ? 'Expected: START END PREVIEW_TOKEN' : 'Expected: START END')
  }
  const start = parseSeq(parts[0], 'Start')
  const end = parseSeq(parts[1], 'End')
  if (needsToken && !/^[a-f0-9]{64}$/u.test(parts[2])) throw new Error('Invalid preview token. Preview this range again.')
  return { start, end, ...(needsToken ? {token:parts[2]} : {}) }
}

/** Current live Session, not transcript and not stale session-query snapshots. */
export function currentSurface(session) {
  const events = session.snapshotEvents()
  const ids = session.surface.nodes
  const ordered = ids.map(seq => {
    const event = events[seq]
    if (!event || event.seq !== seq || !TYPES.has(event.type)) {
      throw new Error(`Surface seq ${seq} is missing or malformed.`)
    }
    return event
  })
  return {events, ordered, ids: [...ids], generation: session.surface.contentGeneration}
}

function messageOf(event) {
  return event.type === 'user/message' ? event.data : event.data.message
}
export function snippet(event, limit = 170) {
  const blocks = messageOf(event)?.content || []
  const text = blocks.filter(x => x && typeof x.text === 'string').map(x => x.text).join(' ')
  const result = text || (event.type === 'assistant/message'
    ? (event.data.stream || []).filter(x => typeof x.text === 'string' || typeof x.chunk?.text === 'string')
      .slice(0, 4).map(x => x.text ?? x.chunk.text).join(' ')
    : '')
  const normalized = String(result).replace(/\s+/gu, ' ').trim()
  if (normalized) return normalized.slice(0, limit)
  if (event.type === 'assistant/message') return '(no text / tool calls / stream only)'
  if (event.type === 'tool/result') return '(empty tool result)'
  return '(empty content)'
}
export function displayEntry(event) {
  const callCount = event.type === 'assistant/message'
    ? (event.data.message.content || []).filter(x => x.type === 'tool-call').length
    : 0
  return {
    seq: event.seq,
    type: event.type,
    role: messageOf(event).role,
    turn: event.data.turn ?? null,
    step: event.data.step ?? null,
    preview: snippet(event),
    tokens: event.type === 'assistant/message' ? event.data.usage?.outputTokens ?? null : null,
    toolCalls: callCount,
    protected: event.type === 'system/message',
  }
}
export function listSurface(snapshot) {
  const all = snapshot.ordered
  const first = all[0]
  return {
    entries: all.slice(-MAX_DISPLAY_ROWS).map(displayEntry),
    count: all.length,
    omitted: Math.max(0, all.length - MAX_DISPLAY_ROWS),
    protectedSeq: first?.type === 'system/message' ? first.seq : null,
  }
}

/**
 * Validate ALL retained tool history, not just total call/result counts.
 * Each tool result must match an earlier unmatched call by its actual ID.
 * Historic duplicates of a call ID after a complete previous pair are permitted.
 */
export function checkToolPairs(retained) {
  const pending = new Map()
  for (const e of retained) {
    if (e.type === 'assistant/message') {
      for (const block of e.data.message.content) {
        if (block.type !== 'tool-call') continue
        const id = block.id
        if (typeof id !== 'string' || !id) throw new Error(`Seq ${e.seq} has a malformed tool call ID.`)
        if (pending.has(id)) throw new Error(`Duplicate unanswered tool call ID ${id} at Seq ${e.seq}.`)
        pending.set(id, e.seq)
      }
    } else if (e.type === 'tool/result') {
      const id = e.data.message.toolCallId ?? e.data.message.source?.callId
      if (typeof id !== 'string' || !pending.has(id)) {
        throw new Error(`Tool result Seq ${e.seq} has no preceding matching Assistant tool call (ID ${String(id)}). Adjust the range to include both.`)
      }
      pending.delete(id)
    }
  }
  if (pending.size) {
    const samples = [...pending].slice(0, 3).map(([id,seq])=>`${id} (Assistant Seq ${seq})`).join(', ')
    throw new Error(`Unanswered tool call(s) would remain: ${samples}. Adjust the range to include corresponding results.`)
  }
}

export function previewRange(snapshot, startSeq, endSeq) {
  const nodes = snapshot.ordered
  const startIndex = nodes.findIndex(e => e.seq === startSeq)
  const endIndex = nodes.findIndex(e => e.seq === endSeq)
  if (startIndex < 0 || endIndex < 0) throw new Error('Start/End Seq must both be current model-visible Surface messages. Refresh and select again.')
  if (startIndex > endIndex) throw new Error('Start must appear before End in model-visible history.')
  if (startIndex === 0 && nodes[0].type === 'system/message') {
    throw new Error('Cannot replace the leading system prompt. Choose a later Start.')
  }
  const removed = nodes.slice(startIndex, endIndex+1)
  // DSH will insert a user-role notice at startIndex. The notice carries no tool calls.
  const retained = nodes.slice(0,startIndex).concat(nodes.slice(endIndex+1))
  checkToolPairs(retained)
  const types = {}
  let calls = 0
  for (const e of removed) {
    types[e.type] = (types[e.type]||0)+1
    if (e.type === 'assistant/message') calls += e.data.message.content.filter(b=>b.type === 'tool-call').length
  }
  const warning = []
  if (types['system/message'] || types['developer/message']) warning.push('This range also masks system/developer updates. Tool availability or runtime instructions might change.')
  // Binding to the complete current surface avoids applying a preview against a changed session.
  const fingerprint = createHash('sha256').update(JSON.stringify({
    ids:snapshot.ids, gen:snapshot.generation, startSeq, endSeq,
  })).digest('hex')
  return {
    startSeq, endSeq, token:fingerprint,
    total: removed.length, types, toolCalls: calls,
    first:displayEntry(removed[0]), last:displayEntry(removed.at(-1)),
    examples: removed.slice(0,4).map(displayEntry),
    warnings:warning,
    originalSeqs: removed.map(e=>e.seq),
  }
}

export function publicRangePreview(plan) {
  const {originalSeqs, ...publicPlan} = plan
  return publicPlan
}
