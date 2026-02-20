---
id: run-params
title: Run Parameter Syntax
brief: Parameter passing conventions by language
category: commands
parent: run
tags: [execution, commands, parameters, javascript, python]
related: [run-basics, exe-simple]
related-code: [interpreter/eval/run.ts, interpreter/env/python-variable-helpers.ts]
updated: 2026-02-17
qa_tier: 2
---

**Parameter syntax by language:**
- `cmd`: interpolate with `@param`
- `sh`: use shell variables as `$param`
- `js`/`node`: parameters as JavaScript variables
- `py`/`python`: parameters as Python variables (typed values)

```mlld
>> JavaScript - parameters are typed values
exe @process(items) = js { return items.map(x => x * 2) }
var @result = @process([1, 2, 3])  >> [2, 4, 6]

>> Python - parameters are typed values
exe @add(a, b) = py { print(a + b) }
var @sum = @add(5, 3)  >> 8

>> Python with complex types (metadata preserved)
exe @analyze(data) = py {
import json
print(json.dumps(data))
}
```

**Python variable helpers** (available as `mlld` global, no import needed):
- `mlld.is_variable(x)` - check if value is a wrapped mlld Variable
- Variables have `__mlld_type__` and `__mlld_metadata__` attributes
- Arrays/lists and dicts pass through with metadata preserved
