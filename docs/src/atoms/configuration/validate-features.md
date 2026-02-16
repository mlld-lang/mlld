---
id: validate-features
title: Validate Features
brief: Static analysis warnings and error detection
category: configuration
parent: config-files
tags: [validation, warnings, static-analysis, undefined-variables]
related: [config-files, config-cli-run]
related-code: [cli/commands/analyze.ts, core/registry/ConfigFile.ts]
updated: 2026-02-16
qa_tier: 2
---

The `mlld validate` command detects common mistakes before runtime.

```bash
mlld validate module.mld
mlld validate module.mld --error-on-warnings
mlld validate module.mld --format json
```

**Undefined variable detection:**

```mlld
var @name = "alice"
show @nmae
>> Warning: @nmae undefined, did you mean @name?
```

Warns about typos like `@mx.now` (should be `@now`).

**Variable redefinition detection:**

```mlld
var @count = 0
when @condition [
  var @count = 1
  >> Error: cannot redefine @count in nested scope
]
```

mlld variables are immutable. Use `let` for block-scoped values or `+=` for accumulation.

**Reserved name conflicts:**

```mlld
var @now = "custom"
>> Error: cannot redefine reserved @now
```

Reserved names: `@now`, `@base`, `@mx`, `@p`, `@env`, `@payload`, `@state`.

**Builtin shadowing:**

```mlld
exe @transform() = [
  let @parse = "not-a-transformer"
  >> Info: @parse shadows built-in transform in this scope
]
```

Shadowable builtins: `@parse`, `@exists`, `@upper`, `@lower`, etc. Reported as info, not errors.

**Exe parameter shadowing:**

```mlld
exe @process(result) = [
  => @result
]
>> Warning: @result can shadow caller variables
>> Suggestion: use @status instead
```

Generic parameter names (`result`, `output`, `data`, `value`, `response`) warn about collision risk.

**Suppressing warnings:**

Add `mlld-config.json` to suppress intentional patterns:

```json
{
  "validate": {
    "suppressWarnings": ["exe-parameter-shadowing"]
  }
}
```

Suppressible codes: `exe-parameter-shadowing`, `mutable-state`, `when-exe-implicit-return`, `deprecated-json-transform`.

**Exit codes:**

- Exit 0: valid syntax, no errors
- Exit 1: parse errors or hard validation errors
- Exit 1 with `--error-on-warnings`: any warnings present

**JSON output:**

```bash
mlld validate module.mld --format json
```

Returns structured data: `executables`, `exports`, `imports`, `guards`, `needs`, `warnings`, `redefinitions`, `antiPatterns`.
