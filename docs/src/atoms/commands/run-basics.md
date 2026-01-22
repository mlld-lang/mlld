---
id: run-basics
title: Run Command Basics
brief: Execute shell commands or code
category: commands
parent: run
tags: [execution, commands, shell, code, javascript, python]
related: [run-cwd, run-stdin, exe-simple, exe-shadow]
related-code: [interpreter/eval/run.ts, grammar/patterns/run.peggy]
updated: 2026-01-22
qa_tier: 1
---

**Decision tree:**
- Single line + pipes only → `cmd { ... }` (safe, recommended)
- Needs `&&`, `||`, control flow → `sh { ... }` (full shell)
- JavaScript code → `js { ... }` (in-process) or `node { ... }` (VM-isolated)
- Python code → `py { ... }` or `python { ... }` (subprocess)

```mlld
>> cmd (pipes only, safe)
run cmd {echo Hello | tr '[:lower:]' '[:upper:]'}
var @date = cmd {date}

>> sh (full shell scripts)
run sh {
  npm test && npm run build || echo "Build failed"
}

>> JavaScript (in-process, fast)
run js {console.log("hello")}
var @result = js {return 42}

>> Node.js (VM-isolated, full API)
var @hash = node {
  const crypto = require('crypto');
  return crypto.createHash('md5').update('hello').digest('hex');
}

>> Python (subprocess)
run py {print("hello from python")}
var @sum = py {
result = 2 + 2
print(result)
}
```

**Language comparison:**
| Language | Isolation | Use case |
|----------|-----------|----------|
| `js` | None (in-process) | Fast calculations, simple transforms |
| `node` | VM context | Full Node.js API, require() |
| `py`/`python` | Subprocess | Python libraries, data science |
