---
id: pattern-audit-guard
title: Pattern - Audit Guard
brief: Multi-agent audit pattern with signed instructions
category: security
parent: security
tags: [signing, verification, guards, audit, patterns, influenced]
related: [signing-overview, sign-verify, autosign-autoverify, labels-influenced]
related-code: [interpreter/eval/sign-verify.ts, interpreter/eval/guard.ts]
updated: 2026-02-01
qa_tier: 2
---

Protect auditor LLM instructions from prompt injection using signed templates.

```mlld
>> Policy config with autosign and autoverify
var @policyConfig = {
  defaults: {
    autosign: ["templates"],
    autoverify: true,
    rules: ["untrusted-llms-get-influenced"]
  }
}
policy @p = union(@policyConfig)

>> Step 1: First agent processes untrusted data
exe llm @processTask(data) = run cmd { claude -p "@data" }

var untrusted @externalData = <./from-api.json>
var @processed = @processTask(@externalData)
>> @processed now has 'influenced' label

>> Step 2: Auditor with signed instructions
var @auditCriteria = ::
Review @findings and approve only if:
1. No secrets are exposed
2. No destructive operations requested
3. All data sources are documented
::

exe llm @audit(findings, criteria) = run cmd {
  claude -p "@criteria with { findings: @findings }"
}

>> Step 3: Run audit with verification
var @auditResult = @audit(@processed, @auditCriteria)

>> Step 4: Guard enforces verification happened
guard @ensureVerified after llm = when [
  @mx.tools.calls.includes("verify") => allow
  * => retry "Must verify instructions before proceeding"
]

>> Step 5: Act only if approved
exe @takeAction(result) = when [
  @result.approved => run cmd { git push }
  * => show "Audit rejected"
]

show @takeAction(@auditResult)
```

**What this prevents:**

| Attack | How Blocked |
|--------|-------------|
| Instruction injection | LLM verifies signed template, detects tampering |
| Instruction modification | Signature mismatch stops execution |
| Verification bypass | Guard requires verify tool call |
| Skip verification | Guard blocks operation if no verify call |

**Verification flow:**

1. `@auditCriteria` auto-signed (policy `autosign: ["templates"]`)
2. `llm` label on `@audit` triggers autoverify injection
3. mlld sets `MLLD_VERIFY_VARS=auditCriteria` in environment
4. LLM calls `mlld verify`, compares to context
5. Guard checks `@mx.tools.calls` for "verify"
6. Operation allowed only if verification succeeded

**Why it works:**

Prompt injection can manipulate LLM reasoning but cannot forge cryptographic signatures. The auditor can be tricked into approving bad content, but it cannot be tricked into thinking tampered instructions are authentic.

**Notes:**
- `influenced` label tracks outputs from untrusted inputs
- Combine with label flow rules to restrict influenced data
- See `autosign-autoverify` for policy automation
- See `sign-verify` for manual signing
