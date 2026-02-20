---
id: validate-features
title: Validate Features
brief: Static analysis warnings and error detection
category: configuration
parent: config-files
tags: [validation, warnings, static-analysis, undefined-variables, templates]
related: [config-files, config-cli-run]
related-code: [cli/commands/analyze.ts, core/registry/ConfigFile.ts]
updated: 2026-02-18
qa_tier: 2
---

The `mlld validate` command detects common mistakes before runtime. Supports `.mld`, `.mld.md`, `.att`, and `.mtt` files. Pass a directory to validate all files recursively.

```bash
mlld validate ./my-project/                   # Validate all files recursively (recommended)
mlld validate ./my-project/ --verbose         # Full details for all files
mlld validate module.mld                      # Validate a single module
mlld validate template.att                    # Validate a template
mlld validate module.mld --error-on-warnings  # Fail on warnings
mlld validate module.mld --format json        # JSON output
```

**Undefined variable detection:**

```mlld
var @name = "alice"
show @nmae
>> Warning: @nmae undefined
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

Suppressible codes: `exe-parameter-shadowing`, `deprecated-json-transform`, `hyphenated-identifier-in-template`.

**Template validation (.att / .mtt):**

```bash
mlld validate prompts/welcome.att
```

Reports all `@variable` and `@function()` references found in the template. When validating a directory, parameters are resolved from `exe` declarations across the entire project tree. For single-file validation, sibling `.mld` files are scanned. Discovered parameters are shown and undefined references are flagged:

```
Valid template (.att)

variables    @name, @role, @unknownVar
params       name, role (from exe declarations)

Warnings (1):
  @unknownVar (line 5:1) - undefined variable
    hint: @unknownVar is not a known parameter. Known: name, role
```

**Template `@for` anti-pattern:**

`.att` templates using strict-mode `@for` syntax are flagged — use `/for ... /end` instead:

```
⚠ prompts/report.att
    "@for" is not valid in templates. Use "/for ... /end" instead. (line 8)
      hint: In .att templates, use /for @var in @collection ... /end (slash prefix, no brackets).
```

**Directory validation:**

```bash
mlld validate ./my-project/
mlld validate ./my-project/ --verbose
```

Recursively validates all `.mld`, `.mld.md`, `.att`, and `.mtt` files. Default output is concise — clean files get a green checkmark, only files with issues show details:

```
  ✓ lib/utils.mld
  ✓ lib/helpers.mld
  ⚠ prompts/welcome.att
      @unknownVar (line 5) - undefined variable
  ✗ broken.mld
      Expected directive (line 3:1)

4 files: 3 passed, 1 failed, 1 with warnings
```

Use `--verbose` for full per-file details. Exit code 1 if any file fails.

**Exit codes:**

- Exit 0: valid syntax, no errors
- Exit 1: parse errors or hard validation errors
- Exit 1 with `--error-on-warnings`: any warnings present

**JSON output:**

```bash
mlld validate module.mld --format json
```

Returns structured data: `executables`, `exports`, `imports`, `guards`, `needs`, `warnings`, `redefinitions`, `antiPatterns`. For templates, includes `template` with `type`, `variables`, and `discoveredParams`.
