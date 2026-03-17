---
id: validate-features
title: Validate Features
brief: Static analysis warnings and error detection
category: cli
tags: [validation, warnings, static-analysis, undefined-variables, templates]
related: [config-files, config-cli-run]
related-code: [cli/commands/analyze.ts, core/registry/ConfigFile.ts]
updated: 2026-03-16
qa_tier: 2
---

The `mlld validate` command detects common mistakes before runtime. Supports `.mld`, `.mld.md`, `.att`, and `.mtt` files. Pass a directory to validate all files recursively.

```bash
mlld validate ./my-project/                   # Validate all files recursively (recommended)
mlld validate ./my-project/ --verbose         # Full details for all files
mlld validate module.mld                      # Validate a single module
mlld validate template.att                    # Validate a template
mlld validate app/index.mld --deep            # Follow imports and templates from an entry file
mlld validate guards.mld --context tools.mld  # Validate guards against tool declarations
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

**Optional parameter pass-through warnings:**

```mlld
exe @inner(x, timeout) = sh { echo @timeout }
exe @outer(x, timeout) = [
  let @result = @inner(@x, @timeout)
  => @result
]
var @r = @outer("hello")
>> Warning: @timeout may be omitted by callsites and fail when passed to @inner
```

This catches wrapper patterns where trailing exe parameters are omitted by callers and then forwarded into nested function calls.

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

Suppressible codes include `exe-parameter-shadowing`, `deprecated-json-transform`, `hyphenated-identifier-in-template`, `privileged-wildcard-allow`, `guard-unreachable-arm`, `unknown-policy-rule`, `privileged-guard-without-policy-operation`, `guard-context-missing-exe`, `guard-context-missing-op-label`, and `guard-context-missing-arg`.

**Policy / guard validation:**

`mlld validate --format json` now surfaces policy declarations, exe labels, and richer guard structure:

```json
{
  "executables": [{ "name": "send_email", "params": ["recipients"], "labels": ["tool:w"] }],
  "policies": [{ "name": "task", "rules": ["no-send-to-unknown"], "operations": { "destructive": ["tool:w"] }, "locked": false }],
  "guards": [{
    "name": "authSendEmail",
    "timing": "before",
    "filter": "op:tool:w",
    "privileged": true,
    "arms": [
      { "condition": "@mx.args.recipients ~= [\"alice@example.com\"]", "action": "allow" },
      { "condition": "@mx.op.name == \"send_email\"", "action": "deny", "reason": "recipients not authorized" }
    ]
  }]
}
```

This is useful when validating LLM-generated policies/guards before execution.

**Semantic guard/policy warnings:**

`mlld validate` also warns about likely-authoring mistakes that are syntactically valid:

- `unknown-policy-rule` for typos in built-in rule names
- `privileged-wildcard-allow` for `guard privileged ... when [ * => allow ]`
- `guard-unreachable-arm` when an earlier guard arm already covers a later one
- `privileged-guard-without-policy-operation` when a privileged `op:` guard does not match any policy operation label

These stay warnings, not errors.

**Context-aware guard validation:**

Use `--context` to validate guards against one or more tool modules:

```bash
mlld validate guards.mld --context tools/workspace.mld
mlld validate guards.mld --context tools/,shared/tooling.mld --format json
```

With context, validation warns when:

- a function filter references an exe that does not exist
- an `op:` filter does not match any exe label in the context
- `@mx.args.someName` references a parameter not declared on the guarded exe

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

Returns structured data: `executables`, `exports`, `imports`, `guards`, `policies`, `needs`, `warnings`, `redefinitions`, `antiPatterns`. For templates, includes `template` with `type`, `variables`, and `discoveredParams`.
