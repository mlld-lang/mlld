---
id: exe-simple
title: Exe Simple Forms
brief: Define reusable commands, code, and templates
category: commands
parent: exe
aliases: [exec, function, func, js, py, javascript, python]
tags: [functions, reusable, templates, commands, javascript, python]
related: [exe-blocks, exe-shadow, exe-prose, run-basics, variables-basics]
related-code: [interpreter/eval/exe.ts, grammar/patterns/exe.peggy]
updated: 2026-01-22
qa_tier: 2
---

**exe vs var:** `exe` defines functions (takes parameters). `var` creates values (no parameters). Use `exe` when you need to pass arguments; use `var` for computed values.

`mlld validate` warns when exe parameters use generic names such as `result`, `output`, or `data` because they can shadow caller variables. Prefer specific names such as `status`, `finalOutput`, or `inputData`.

**Simple forms:**

```mlld
>> Command
exe @list(dir) = cmd {ls -la @dir | head -5}

>> JavaScript (in-process)
exe @add(a, b) = js { return a + b }

>> Node.js (VM-isolated)
exe @hash(text) = node {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

>> Python
exe @add(a, b) = py { print(int(a) + int(b)) }
exe @calculate(x, y) = py {
result = x ** 2 + y ** 2
print(result)
}

>> Template
exe @greet(name) = `Hello @name!`

>> External template file
exe @welcome(name, role) = template "./prompts/welcome.att"

>> Prose (requires config)
exe @analyze(data) = prose:@config { session "Analyze @data" }
```

**Python notes:**
- Use `print()` to return values (captured as string output)
- Parameters arrive as strings; use `int()`, `float()` for math
- Standard library available: `import json`, `import math`, etc.
