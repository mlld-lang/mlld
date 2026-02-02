---
id: autosign-autoverify
title: Autosign and Autoverify
brief: Policy automation for signing and verification
category: security
parent: security
tags: [signing, verification, policy, automation]
related: [signing-overview, sign-verify]
related-code: [interpreter/eval/auto-sign.ts]
updated: 2026-02-01
---

Automatically sign templates and inject verification for LLM exes.

```mlld
var @policyConfig = {
  defaults: {
    autosign: ["templates"],
    autoverify: true
  }
}
policy @p = union(@policyConfig)

>> Templates auto-signed on creation
var @prompt = ::Review @input for safety::

>> LLM exes get verification injection
exe llm @audit(input) = run cmd { claude -p "@prompt" }
```

**Autosign options:**

```mlld
>> Sign all templates
autosign: ["templates"]

>> Sign variables by pattern
autosign: { templates: true, variables: ["@*Prompt"] }
```

**Autoverify options:**

```mlld
>> Use default verification
autoverify: true

>> Custom verification template
autoverify: template "./verify.att"
```

**What autoverify does:**
- Sets `MLLD_VERIFY_VARS` in command environment
- Prepends verification instructions to prompt
- Implicitly allows `cmd:mlld:verify` capability

**Notes:**
- See `sign-verify` for manual signing
- See `signing-overview` for threat model
