# Template Outside Exe

## Description

The `template` keyword is used to create an executable from an external `.att` file. It only works in `exe` definitions, not `var` or `let` assignments.

## Example Error

```mlld
var @task = template "./task.att"
```

## Correct Usage

```mlld
exe @task(arg1, arg2) = template "./task.att"
var @result = @task("value1", "value2")
```

## Why This Matters

Templates are functions that accept parameters and interpolate them. They need the `exe` context to define what parameters they accept.
