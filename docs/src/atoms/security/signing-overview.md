---
id: signing-overview
title: Signing Overview
brief: Cryptographic integrity for templates
category: security
parent: security
tags: [signing, verification, security, templates]
related: [sign-verify, autosign-autoverify, labels-overview, pattern-audit-guard, pattern-dual-audit]
related-code: [core/security/SignatureManager.ts]
updated: 2026-02-01
---

Sign templates to create verifiable records of LLM instructions.

```mlld
>> Sign a template
var @prompt = `Review @input for safety.`
sign @prompt with sha256

>> Verify checks signature and logs the result
verify @prompt
```

**Sign templates, not interpolated results:**

```mlld
>> CORRECT: Sign before interpolation
var @template = `Evaluate @data for issues.`
sign @template with sha256

>> WRONG: Signing after interpolation includes tainted content
var @result = `Evaluate @untrustedData for issues.`
sign @result with sha256
```

Signing after interpolation authenticates attacker-controlled content — the signature vouches for tainted data, defeating its purpose.

**Why it matters:**
- Prompt injection can manipulate LLM reasoning
- Prompt injection cannot forge cryptographic signatures
- Auditor LLMs call `verify` to compare instructions against originals

**Notes:**
- Signatures stored in `.mlld/sec/sigs/`
- See `sign-verify` for directive syntax
- See `autosign-autoverify` for policy automation
