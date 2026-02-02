---
id: sign-verify
title: Sign and Verify
brief: Directive syntax for signing and verification
category: security
parent: security
tags: [signing, verification, cryptography]
related: [signing-overview, autosign-autoverify]
related-code: [interpreter/eval/sign-verify.ts]
updated: 2026-02-01
---

Sign templates and verify their integrity.

```mlld
>> Sign a variable
sign @prompt with sha256

>> Sign with identity
sign @prompt by "security-team" with sha256

>> Verify returns original content + metadata
verify @prompt
```

**Verify output:**

```json
{
  "verified": true,
  "template": "Review @input and reject if unsafe",
  "hash": "sha256:abc123...",
  "signedby": "security-team",
  "signedat": "2026-02-01T10:30:00Z"
}
```

**CLI verification:**

```bash
mlld verify auditCriteria
MLLD_VERIFY_VARS=auditCriteria mlld verify
```

**Notes:**
- Signatures stored in `.mlld/sec/sigs/`
- Templates signed with placeholders intact (not interpolated)
- `verified: false` when content modified after signing
- See `autosign-autoverify` for policy automation
