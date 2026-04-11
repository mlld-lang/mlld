---
id: validate-features
title: Validate Features
brief: Static analysis warnings and error detection
category: cli
tags: [validation, warnings, static-analysis, undefined-variables, templates]
related: [config-files, config-cli-run]
related-code: [cli/commands/analyze.ts, core/registry/ConfigFile.ts]
updated: 2026-04-06
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

Suppressible codes include `exe-parameter-shadowing`, `deprecated-json-transform`, `hyphenated-identifier-in-template`, `privileged-wildcard-allow`, `guard-unreachable-arm`, `unknown-policy-rule`, `privileged-guard-without-policy-operation`, `guard-context-missing-exe`, `guard-context-missing-op-label`, `guard-context-missing-arg`, `policy-operations-unknown-label`, `policy-authorizations-deny-unknown-tool`, `policy-authorizations-authorizable-unknown-tool`, and `policy-label-flow-unknown-target`.

**Policy / guard validation:**

`mlld validate --format json` now surfaces policy declarations, richer executable metadata, record and shelf declarations, and richer guard structure:

```json
{
  "executables": [{
    "name": "send_email",
    "params": ["recipients", "subject", "body"],
    "labels": ["tool:w"],
    "controlArgs": ["recipients"],
    "updateArgs": ["subject"],
    "exactPayloadArgs": ["body"],
    "correlateControlArgs": true,
    "outputRecord": { "kind": "static", "name": "email_result" }
  }],
  "records": [{ "name": "email_result", "key": "message_id", "display": "legacy" }],
  "shelves": [{ "name": "pipeline", "slots": [{ "name": "selected", "record": "email_result", "cardinality": "singular" }] }],
  "policies": [{ "name": "task", "rules": ["no-send-to-unknown"], "operations": { "destructive": ["tool:w"] }, "locked": false }],
  "policyCalls": [{
    "callee": "@policy.build",
    "location": { "line": 24, "column": 14 },
    "status": "analyzed",
    "intentSource": "top_level_var",
    "toolsSource": "top_level_var",
    "taskSource": "top_level_var",
    "diagnostics": [
      { "reason": "known_not_in_task", "tool": "send_email", "arg": "recipient", "message": "Known literal 'evil-recipient' not found in task text" }
    ]
  }],
  "guards": [{
    "name": "authSendEmail",
    "timing": "before",
    "filter": "op:tool:w",
    "privileged": true,
    "arms": [
      { "condition": "@mx.args.recipients ~= [\"alice@example.com\"]", "action": "allow" },
      { "condition": "@mx.op.name == \"send_email\"", "action": "resume", "reason": "return valid JSON" }
    ]
  }]
}
```

This is useful when validating LLM-generated policies/guards before execution.

`policyCalls` is JSON-only analyzer detail for statically analyzable `@policy.build(...)` and `@policy.validate(...)` callsites. Each entry is either:

- `status: "analyzed"` with concrete diagnostics
- `status: "skipped"` with a `skipReason` such as `dynamic-source-intent`, `dynamic-source-tools`, `dynamic-source-task`, `unsupported-expression`, or `unresolved-top-level-binding`

Skipped entries stay out of default text output so `mlld validate` only reports actionable issues.

**Executable metadata validation:**

`mlld validate` now fails early for executable metadata mistakes that would otherwise fail only at runtime:

- unknown `with { ... }` keys such as `contolArgs`
- `controlArgs` / `updateArgs` / `exactPayloadArgs` entries that are not declared params
- overlap errors such as `updateArgs` intersecting `controlArgs`
- non-boolean `correlateControlArgs`

**Record and shelf validation:**

`mlld validate` now catches statically knowable record and shelf definition errors before execution:

- record key fields that are missing or optional
- impure computed record fields
- invalid record display and `when` declarations
- executable `=> record` references to unknown records
- shelf references to unknown records or slots
- invalid shelf merge/cardinality combinations
- statically obvious `box.shelf` alias conflicts and unknown slot targets

**Static policy call validation:**

`mlld validate` also analyzes a conservative static subset of `@policy.build(...)` and `@policy.validate(...)` callsites when the intent, tools, and optional `task` resolve from inline literals, top-level literal vars, or static field access on those vars.

It currently catches:

- unknown tools and args
- denied tools from `with { policy: ... }` overrides
- unconstrained control-arg authorizations
- proofless `resolved` values that should be handle-backed
- `known` literals not present in `options.task`
- `exactPayloadArgs` literals not present in `options.task`
- update authorizations that omit all declared `updateArgs`

Dynamic callsites are skipped rather than guessed, and are surfaced only in JSON under `policyCalls`.

Generic data objects are not treated as policy declarations just because they contain an `authorizations` field. Validation applies that schema only to `/policy` declarations and to statically analyzable `@policy.build(...)` / `@policy.validate(...)` callsites.

**Semantic guard/policy warnings:**

`mlld validate` also warns about likely-authoring mistakes that are syntactically valid:

- `unknown-policy-rule` for typos in built-in rule names
- `privileged-wildcard-allow` for `guard privileged ... when [ * => allow ]`
- `guard-unreachable-arm` when an earlier guard arm already covers a later one
- `privileged-guard-without-policy-operation` when a privileged `op:` guard does not match any policy operation label
- `policy-operations-unknown-label` when `policy.operations` references labels not present in the validation context
- `policy-authorizations-deny-unknown-tool` when `policy.authorizations.deny` names a tool that does not exist in scope
- `policy-label-flow-unknown-target` when `policy.labels.*.allow` / `deny` targets do not match declared categories or validation-context labels

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
- `policy.operations` points at labels that no exe in the context carries
- `policy.authorizations.deny` names tools missing from the context
- `policy.labels` deny/allow targets do not match declared operation categories or context labels

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

Returns structured data: `executables`, `records`, `shelves`, `exports`, `imports`, `guards`, `policies`, `needs`, `warnings`, `redefinitions`, `antiPatterns`. For templates, includes `template` with `type`, `variables`, and `discoveredParams`.
