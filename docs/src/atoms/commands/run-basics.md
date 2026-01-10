---
id: run-basics
title: Run Command Basics
brief: Execute shell commands or code
category: commands
parent: run
tags: [execution, commands, shell, code]
related: [run-cwd, run-stdin, exe-simple]
related-code: [interpreter/eval/run.ts, grammar/patterns/run.peggy]
updated: 2026-01-05
---

**Decision tree:**
- Single line + pipes only → `cmd { ... }` (safe, recommended)
- Needs `&&`, `||`, control flow → `sh { ... }` (full shell)
- JavaScript/Python code → `js { ... }` / `python { ... }`

```mlld
>> cmd (pipes only, safe)
run cmd {echo Hello | tr '[:lower:]' '[:upper:]'}
var @date = cmd {date}

>> sh (full shell scripts)
run sh {
  npm test && npm run build || echo "Build failed"
}

>> js/python (code execution)
run js {console.log("hello")}
var @result = js {return 42}
```
