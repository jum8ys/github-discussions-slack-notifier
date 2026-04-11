---
name: execute-prompt
description: Execute the instructions written in PROMPT.md. Use when asked to "execute instructions" (指示を実行して).
allowed-tools: all
---

Read PROMPT.md and execute all instructions written in it.

```bash
cat PROMPT.md
```

If the file does not exist, inform the user that PROMPT.md was not found.

If the file exists, interpret its contents as instructions and carry them out faithfully.
