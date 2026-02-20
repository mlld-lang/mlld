---
id: sign-verify
title: Sign and Verify
brief: Directive syntax for signing and verification
category: security
parent: security
tags: [signing, verification, cryptography]
related: [signing-overview, autosign-autoverify]
related-code: [core/security/sig-adapter.ts, interpreter/eval/sign-verify.ts, cli/commands/verify.ts]
updated: 2026-02-01
---

The `sign` and `verify` directives provide cryptographic integrity for templates. Sign to create a verifiable record; verify to detect tampering or injection.

**Sign syntax:**

```mlld
sign @variable with sha256
sign @variable by "signer" with sha256
```

**What gets signed:**

Templates are signed with placeholders intact, not interpolated:

```mlld
var @auditPrompt = ::Review @input and reject if unsafe::
sign @auditPrompt by "security-team" with sha256
```

This signs `Review @input and reject if unsafe` - the `@input` placeholder remains.

**Verify directive:**

```mlld
verify @prompt
```

In scripts, `verify` checks signature integrity silently — execution continues on success, errors on failure.

**Verification failure:**

If content changes after signing, `verify` returns `verified: false` with an `error` message.

**CLI verification:**

```bash
mlld verify auditCriteria
MLLD_VERIFY_VARS=auditCriteria mlld verify
mlld verify prompt instructions  # multiple variables
```

LLMs call `mlld verify` to check authenticity of their instructions. CLI returns:

```json
{
  "verified": true,
  "template": "Review @input and reject if unsafe",
  "hash": "sha256:abc123...",
  "signedBy": "security-team",
  "signedAt": "2026-02-01T10:30:00Z"
}
```

| Field | Description |
|-------|-------------|
| `verified` | True if signature matches content |
| `template` | Original signed content |
| `hash` | Signature with algorithm prefix |
| `signedBy` | Signer identity (optional) |
| `signedAt` | ISO 8601 timestamp |

**Audit pattern example:**

```mlld
var @auditCriteria = ::
Review @findings and approve only if:
1. No secrets exposed
2. No destructive operations
3. All data sources trusted
::

sign @auditCriteria by "security-team" with sha256
```

Pass to an LLM with instructions to verify via `mlld verify auditCriteria`. The LLM compares verified content against its context to detect injection.

**Signature storage:**

Signatures stored in `.sig/content/`:
- `{varname}.sig.json` - Metadata (hash, algorithm, signer, timestamp)
- `{varname}.sig.content` - Signed content

See `autosign-autoverify` for policy automation, `signing-overview` for threat model.
