---
id: autosign-autoverify
title: Autosign and Autoverify
brief: Policy automation for signing and verification
category: security
parent: security
tags: [signing, verification, policy, automation]
related: [signing-overview, sign-verify]
related-code: [interpreter/eval/auto-sign.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-02-01
---

Policy defaults automatically sign templates and inject verification for LLM exes, eliminating boilerplate while maintaining cryptographic integrity.

| Default | Purpose |
|---------|---------|
| `autosign` | Sign templates/variables on creation |
| `autoverify` | Inject verification for llm-labeled exes |

**Basic configuration:**

```mlld
var @policyConfig = {
  defaults: {
    autosign: ["templates"],
    autoverify: true
  }
}
policy @p = union(@policyConfig)

var @auditPrompt = ::Review @input for safety::
exe llm @audit(input) = run cmd { claude -p "@auditPrompt" }
```

The template is auto-signed on creation. When `@audit()` runs, mlld injects `MLLD_VERIFY_VARS='auditPrompt'` and prepends verification instructions.

**What gets auto-signed:**

With `autosign: ["templates"]`:
- Template literals (`::` syntax)
- Templates from `.att` files
- Executables returning templates

**Pattern-based autosign:**

```mlld
autosign: {
  templates: true,
  variables: ["@*Prompt", "@*Instructions"]
}
```

Variables matching patterns are signed even if not templates.

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

var @policyConfig = {
  defaults: {
    autosign: ["templates"],
    autoverify: true
  }
}
policy @p = union(@policyConfig)

var @auditPrompt = ::
Review the text below and reply only with "OK" if it is safe.

<text>
Hello from the autoverify demo.
</text>
::

exe llm @audit() = @claude(@auditPrompt, "haiku", @base)
show @audit()
```

**Defense against prompt injection:**

Autosign and autoverify prevent instruction tampering. An attacker cannot:
- Forge signatures (requires key)
- Modify signed templates (breaks signature)
- Bypass verification (LLM instructions require it)

**Signature storage:** `.mlld/sec/sigs/{varname}.sig` and `.content`

| Use Case | Configuration |
|----------|---------------|
| Sign all templates | `autosign: ["templates"]` |
| Sign by name pattern | `autosign: { variables: ["@*Prompt"] }` |
| Verify all LLM calls | `autoverify: true` |
| Custom verify flow | `autoverify: template "./verify.att"` |

See `signing-overview` for threat model, `sign-verify` for manual directives.
