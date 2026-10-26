/** Manual Context Mask: Host. Compatible with DSH Desktop 0.2.0-rc.2. */
import { randomUUID } from 'node:crypto'
import {
  RANGE_NOTICE, currentSurface, listSurface, parseRangeInput,
  previewRange, publicRangePreview,
} from './range-core.js'

export const name = 'dsh-context-mask'
export const inject = ['commands', 'sessionQuery', 'sessions']
const MAX_ROWS = 400
const SINGLE_PLACEHOLDER = '[Context Mask: the user manually excluded a previous assistant response after a generation failure. No engineering operation should be inferred from that response.]'

function isToolBearing(event, events) {
  if (event.type !== 'assistant/message') return true
  const {turn,step,message} = event.data
  if (message.content.some(block=>block.type === 'tool-call')) return true
  return events.some(e=>(e.type==='tool/call'||e.type==='tool/result')&&e.data.turn===turn&&e.data.step===step)
}
function assistantPreview(event) {
  const content = event.data.message.content ?? []
  let text = content.filter(x=>typeof x.text === 'string').map(x=>x.text).join(' ')
  if (!text && Array.isArray(event.data.stream)) {
    text = event.data.stream.filter(x=>typeof x?.text==='string'||typeof x?.chunk?.text==='string')
      .slice(0,5).map(x=>x.text??x.chunk.text).join(' ')
  }
  return String(text).replace(/\s+/g,' ').slice(0,400)
}
function summarizeAssistants(events, surface) {
  return surface.events.filter(e=>e.type==='assistant/message').slice(-MAX_ROWS).map(e=>{
    const blocked=isToolBearing(e,events)
    return {seq:e.seq, turn:e.data.turn, step:e.data.step,
      tokens:e.data.usage?.outputTokens??null, interrupted:e.data.interrupted===true,
      preview:assistantPreview(e),maskable:!blocked,
      reason:blocked?'This step contains tool calls or tool results. Use Range Mask.':null}
  })
}
function errorText(e) {return e instanceof Error?e.message:String(e)}
function parseSeqs(input) {
  const raw=String(input).trim()
  if(!/^\d+(?:,\d+)*$/u.test(raw))throw new Error('Expected comma-separated Seq IDs, e.g. 12,37')
  const seqs=raw.split(',').map(Number)
  if(seqs.length===0||seqs.length>20||seqs.some(n=>!Number.isSafeInteger(n))||new Set(seqs).size!==seqs.length)
    throw new Error('Select 1–20 distinct valid Seq IDs.')
  return seqs
}
function placeholderMessage(content) {
  return {id:randomUUID(),role:'user',content:[{type:'text',text:content}],source:{kind:'user'}}
}
function assertObserved(actual, expected) {
  if(actual.length!==expected.length || actual.some((id,i)=>id!==expected[i])) {
    throw new Error('Session Surface changed unexpectedly; original events remain. Inspect session before retrying.')
  }
}

export function apply(ctx) {
  const register=(def)=>ctx.commands.register(def)
  const list=register({
    name:'mask_list',description:'Human-only, list Assistant messages and current Surface positions',
    handler:async ({agent})=>{
      try {
        const surface=await ctx.sessionQuery.readSurface(agent.session.id)
        const entries=agent.session.snapshotEvents()
        const positions=listSurface(currentSurface(agent.session))
        return {kind:'success',text:JSON.stringify({
          sessionId:agent.session.id,
          count:surface.events.filter(e=>e.type==='assistant/message').length,
          entries:summarizeAssistants(entries,surface),
          surfaceEntries:positions.entries,
          surfaceCount:positions.count,
          surfaceOmitted:positions.omitted,
          protectedSeq:positions.protectedSeq,
        })}
      }catch(e){return {kind:'error',text:errorText(e)}}
    },
  })
  const single=register({
    name:'mask_apply',input:{hint:'SEQ[,SEQ]...'},
    description:'Human-confirmed masking of individual Assistant messages without tool dependencies',
    handler:async ({agent,rawInput,signal})=>{
      let seqs
      try{seqs=parseSeqs(rawInput)}catch(e){return {kind:'error',text:errorText(e)}}
      try {
        return await agent.runMaintenance(async maintenanceSignal=>{
          signal?.throwIfAborted();maintenanceSignal.throwIfAborted()
          const surface=await ctx.sessionQuery.readSurface(agent.session.id)
          const active=new Map(surface.events.map(e=>[e.seq,e]))
          const events=agent.session.snapshotEvents()
          for (const seq of seqs){
            const item=active.get(seq)
            if(!item||item.type!=='assistant/message')throw new Error(`Seq ${seq} is not a current Assistant message; unchanged.`)
            if(isToolBearing(item,events))throw new Error(`Seq ${seq} has tool dependencies. Use Range Mask; unchanged.`)
          }
          let applied=0
          for(const seq of seqs){
            try{
              signal?.throwIfAborted();maintenanceSignal.throwIfAborted()
              agent.session.append('user/message',placeholderMessage(SINGLE_PLACEHOLDER),{
                surfaceOp:{op:'replace',startSeq:seq,endSeq:seq},sourceEventSeqs:[seq],
              });applied++
            }catch(e){throw new Error(`Partial result: ${applied}/${seqs.length} masked. Failed at ${seq}: ${errorText(e)}`)}
          }
          const persisted=await ctx.sessions.flush(agent.session)
          if(persisted===false)throw new Error('Masks appended, but persistence is NOT confirmed. Inspect session.')
          const after=agent.session.surface.nodes
          if(seqs.some(seq=>after.includes(seq)))throw new Error('Masks appended but Surface verification failed; inspect session.')
          return {kind:'success',text:`Masked ${seqs.length} Assistant message(s): ${seqs.join(', ')}. Original log preserved.`}
        })
      }catch(e){return {kind:'error',text:errorText(e)}}
    },
  })
  const rangePreview=register({
    name:'mask_range_preview', input:{hint:'START_SEQ END_SEQ'},
    description:'Read-only preview/validation for one contiguous model-visible Surface range',
    handler:async ({agent,rawInput})=>{
      try{
        const {start,end}=parseRangeInput(rawInput)
        const plan=previewRange(currentSurface(agent.session),start,end)
        return {kind:'success',text:JSON.stringify(publicRangePreview(plan))}
      }catch(e){return {kind:'error',text:errorText(e)}}
    },
  })
  const rangeApply=register({
    name:'mask_range_apply',input:{hint:'START_SEQ END_SEQ PREVIEW_TOKEN'},
    description:'Human-confirmed atomic replacement of a contiguous Surface range',
    handler:async ({agent,rawInput,signal})=>{
      try{
        const {start,end,token}=parseRangeInput(rawInput,true)
        return await agent.runMaintenance(async maintenanceSignal=>{
          signal?.throwIfAborted();maintenanceSignal.throwIfAborted()
          const snapshot=currentSurface(agent.session)
          const plan=previewRange(snapshot,start,end)
          if(plan.token!==token)throw new Error('Session changed since preview. Refresh and preview the range again; nothing was changed.')
          const removedSet=new Set(plan.originalSeqs)
          const expected=snapshot.ids.filter(seq=>!removedSet.has(seq))
          const insertAt=snapshot.ids.indexOf(start)
          // One append is the entire mutation: no partial range masks are possible.
          let added
          try{
            added=agent.session.append('user/message',placeholderMessage(RANGE_NOTICE),{
              surfaceOp:{op:'replace',startSeq:start,endSeq:end},
              sourceEventSeqs:plan.originalSeqs,
            })
          }catch(e){throw new Error(`Replacement rejected; no range change was appended: ${errorText(e)}`)}
          expected.splice(insertAt,0,added.seq)
          assertObserved(agent.session.surface.nodes,expected)
          let persisted
          try{persisted=await ctx.sessions.flush(agent.session)}catch(e){
            throw new Error(`Range replacement appended, but disk flush failed: ${errorText(e)}. Inspect session before retrying.`)
          }
          if(persisted===false)throw new Error('Range replacement appended, but persistence was not confirmed. Inspect session before retrying.')
          return {kind:'success',text:`Range Mask applied: Seq ${start}–${end} (${plan.total} model-visible messages, including ${plan.toolCalls} tool call(s)). Original Event Log and real tool outputs/files unchanged.`}
        })
      }catch(e){return {kind:'error',text:errorText(e)}}
    },
  })
  return ()=>{list();single();rangePreview();rangeApply()}
}
