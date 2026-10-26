# DSH Context Mask

Adds a `/mask` command to DeepSeek Harness: replaces a span of conversation history the model can see with a short notice.

## What it does

The longer you talk to a model, the longer the context grows. Sometimes a stretch in the middle is no longer useful — a failed attempt, a pile of failed tool output. This plugin lets you remove the context you no longer want the model to reference from the model's view. It touches nothing else on disk: the original session log, tool results and your project files are all preserved.

The removed span becomes a short notice, not zero tokens.

## Background

This plugin came out of a real incident: an agent got stuck in a reasoning loop — repeating "Let me go" without ever acting — and interrupting it did not help. Masking that history let it finish the task.

[Read the story](https://yiheng-lab.github.io/dsh-context-mask/) · [中文版](https://yiheng-lab.github.io/dsh-context-mask/zh.html)

## Installation

**Requirements**

| Item | Requirement |
| --- | --- |
| DeepSeek Harness Desktop | 0.2.0-rc.2 or later |
| Node.js | 22 or later |

**Option 1: Clone and install by local path**

```powershell
git clone https://github.com/yiheng-lab/dsh-context-mask.git
dsh plugin --profile desktop add "C:\your\path\dsh-context-mask"
```

**Option 2: Install the tarball from Releases**

```powershell
dsh plugin --profile desktop add "C:\your\path\dsh-context-mask-0.2.0-preview.1.tgz"
```

> - The path must be **absolute**
> - Replace `desktop` with your own profile name
> - You can also install from the DSH UI: sidebar **Plugins** page → install bundle → enter the absolute path

Restart DSH after installing, then type `/mask` in a session to open the dialog.

## Usage

1. Type `/mask`
2. Find the start and end of the span you want to mask in the list, then click `设起点` (Set Start) / `设终点` (Set End)
3. Click `预览区间` (Preview Range) to confirm how many messages will be masked
4. Click `Apply Range`, then `最终确认 Apply` (Final Confirm)

## ⚠️ Notes

- **There is no undo.** Check the start and end positions before applying.
- **Do not include the leading System prompt.** DSH protects it, and the UI will not let you select it.
- After masking, the model may still infer the content by reading project files or earlier messages. 
- Try it in a **disposable session** first, and only use it on important sessions once you are confident.
- This is an experimental plugin (`0.2.0-preview.1`). Evaluate the risk yourself.

## Uninstall

```powershell
dsh plugin --profile desktop remove dsh-context-mask
```

Masking you have already applied **remains in effect** after uninstalling.

## License

MIT © 2026 Yiheng Chen
