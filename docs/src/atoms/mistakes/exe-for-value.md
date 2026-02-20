---
id: exe-for-value
title: Using exe for Values
brief: Use var for computed values, exe for functions
category: mistakes
tags: [mistakes, var, exe]
related: [variables-basics, exe-simple]
related-code: []
updated: 2026-01-11
---

**Wrong:** Using `exe` to compute a value without parameters.

```mlld
>> WRONG: exe without parameters for a computed value
exe @date() = cmd {date}
var @now = @date()
```

**Right:** Use `var` for values, `exe` for functions that take parameters.

```mlld
>> RIGHT: var for computed values
var @date = cmd {date}
show @date

>> RIGHT: exe when you need parameters
exe @format(dt, fmt) = cmd {date -d @dt +"@fmt"}
var @nice = @format(@date, "%Y-%m-%d")
```

**Key rule:**
- `var` = value (no parameters)
- `exe` = function (takes parameters)

If you're not passing arguments, use `var`.
