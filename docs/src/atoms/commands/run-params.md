---
id: run-params
title: Run Parameter Syntax
brief: Parameter passing conventions by language
category: commands
parent: run
tags: [execution, commands, parameters, javascript, python]
related: [run-basics, exe-simple]
related-code: [interpreter/eval/run.ts, interpreter/env/python-variable-helpers.ts]
updated: 2026-01-22
qa_tier: 2
---

**Parameter syntax by language:**
- `cmd`: interpolate with `@param`
- `sh`: use shell variables as `$param`
- `js`/`node`: parameters as JavaScript variables
- `py`/`python`: parameters as Python variables (strings by default)

```mlld
>> JavaScript - parameters are typed values
exe @process(items) = js { return items.map(x => x * 2) }
var @result = @process([1, 2, 3])  >> [2, 4, 6]

>> Python - parameters arrive as strings
exe @add(a, b) = py { print(int(a) + int(b)) }
var @sum = @add(5, 3)  >> 8

>> Python with complex types (wrapped with metadata)
exe @analyze(data) = py {
import json
parsed = json.loads(data) if isinstance(data, str) else data
print(json.dumps(parsed))
}
```

**Python variable helpers:**
- `mlld.is_variable(x)` - check if value is a wrapped mlld Variable
- Variables have `__mlld_type__` and `__mlld_metadata__` attributes
- Arrays/lists and dicts pass through with metadata preserved
