---
id: autosign-autoverify
qa_tier: 2
title: Autosign and Autoverify
brief: Policy automation for signing and verification
category: security
parent: signing
tags: [signing, verification, policy, automation]
related: [signing-overview, sign-verify]
related-code: [core/security/sig-adapter.ts, interpreter/eval/auto-sign.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-03-23
---

Policy defaults automatically sign instruction variables and inject verification for LLM exes, eliminating boilerplate while maintaining cryptographic integrity.

| Default | Purpose |
|---------|---------|
| `autosign` | Sign instructions/variables on creation |
| `autoverify` | Inject verification for llm-labeled exes |

**Basic configuration:**

```mlld
policy @p = { verify_all_instructions: true }

var @auditPrompt = ::Review @input for safety::
exe llm @audit(input) = run cmd { claude -p "@auditPrompt" }
```

`verify_all_instructions: true` expands to `defaults: { autosign: ["instructions"], autoverify: true }`. Explicit `defaults` values take precedence over the shorthand.

The instruction is auto-signed on creation. When `@audit()` runs, mlld injects verification instructions for instruction-marked variables.

**What gets auto-signed:**

With `autosign: ["instructions"]` (aliases: `instruction`, `instruct`, `inst`, `templates`):
- All string literals (`::`, `` ` ``, `"`, `'`)
- Templates from `.att` files
- Executables returning templates

**Label-based autosign:**

```mlld
autosign: {
  instructions: true,
  labels: ["prompt", "system"],
  variables: ["@*Prompt"]
}
```

Variables with matching labels or name patterns are also signed and marked as instructions.

**Autoverify options:**

```mlld
autoverify: true                        >> Default verification
autoverify: template "./custom-verify.att"  >> Custom template
```

**What autoverify does:**
1. Detects signed variables passed to `llm`-labeled exes
2. Sets `MLLD_VERIFY_VARS` in command environment
3. Prepends verification instructions to prompt
4. Implicitly allows `cmd:mlld:verify` capability

**Autoverify + enforcement guard:**

`autoverify` injects verification instructions but cannot force compliance. Pair with an enforcement guard to require it:

```mlld
guard @ensureVerified after llm = when [
  @mx.tools.calls.includes("verify") => allow
  * => retry "Must verify instructions before proceeding"
]
```

Autoverify for the happy path, the guard for enforcement. See `pattern-audit-guard`.

This example intentionally uses `@mx.tools.calls` instead of `@mx.tools.history`. The guard is enforcing behavior of the current `llm` execution. Use `@mx.tools.history` when the rule should follow a specific value's provenance across later steps.

**Why this matters:**

Without automation:
```mlld
var @prompt = ::Review @input::
sign @prompt with sha256
exe llm @audit(input) = run cmd {
  MLLD_VERIFY_VARS=prompt claude -p "Verify first: mlld verify prompt\n@prompt"
}
```

With autosign/autoverify: same security, no boilerplate.

**Claude CLI demo (module-based):**

This demo assumes `claude` is available on your PATH.

```mlld
import { @claude } from @mlld/claude

policy @p = {
  defaults: {
    autosign: ["templates"],
    autoverify: true
  }
}

var @auditPrompt = ::
Review the text below and reply only with "OK" if it is safe.

<text>
Hello from the autoverify demo.
</text>
::

exe llm @audit() = @claude(@auditPrompt, { model: "haiku" })
show @audit()
```

**Defense against prompt injection:**

Autosign and autoverify prevent instruction tampering. An attacker cannot:
- Forge signatures (requires key)
- Modify signed templates (breaks signature)
- Bypass verification (pair with an enforcement guard (see above) to require verification)

**Signature storage:** `.sig/content/{varname}.sig.json` and `.sig/content/{varname}.sig.content`

| Use Case | Configuration |
|----------|---------------|
| Sign all templates | `autosign: ["templates"]` |
| Sign by name pattern | `autosign: { variables: ["@*Prompt"] }` |
| Verify all LLM calls | `autoverify: true` |
| Custom verify flow | `autoverify: template "./verify.att"` |

See `signing-overview` for threat model, `sign-verify` for manual directives.
