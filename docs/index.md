---
layout: default
title: An Agent Stuck in a Reasoning Loop
---

# An Agent Stuck in a Reasoning Loop

[中文版](zh.html)

*A story about a reasoning loop, and how masking a slice of context fixed it.*

## The incident

While I was using DeepSeek Harness (DSH) to get work done, I hit a strange failure. After running for a while, the assistant message started repeating: "Let me go", "Let me read", "Let me go" — endlessly announcing the next action without ever taking it.

I interrupted it and asked what was wrong.

It analyzed the situation, said it had entered a loop, and then said it had "escaped".

It had not. It went straight back into the loop. At one point it even wrote "STOP" to itself to try to break out. That failed too.

It burned through its output limit, asked me to send "continue". I did, and it got stuck again.

I assumed it was just instability from a long run, so I asked it to summarize what had happened so far. It looped again.

I don't know exactly why it happens, but I believe the loop occurs inside the base model's own generation process, not in a tool call. And I believe the large amount of looping output had polluted the model's subsequent context — so that after that point, whatever instruction I gave it, it was more likely to fall back into a loop.

So I built this plugin to test one idea: if the model never sees that looping reasoning, can it break out?

## Does it actually work?

Before the real fix, I ran a control experiment. I had the model invent two dossiers, A and B, then used the plugin to mask the part of the context containing B, and asked about both. It still remembered A, and could not recall B.

Then I went back to the incident, masked all the context involved in the loop, and gave the instruction again. This time the reasoning still contained "Let me read" and "Let me go" — but those sentences no longer stopped it from calling tools. It finished the turn.

---

[Back to the plugin](https://github.com/yiheng-lab/dsh-context-mask)
