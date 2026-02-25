---
id: sign-verify
title: Sign and Verify
brief: Sign templates and verify their integrity
category: security
parent: security
tags: [signing, verification, security, cryptography, templates]
related: [signing-overview, labels-overview, guards-basics]
related-code: [core/security/sig-adapter.ts, interpreter/eval/sign-verify.ts, cli/commands/verify.ts]
updated: 2026-02-01
qa_tier: 2
---

The `sign` and `verify` directives provide cryptographic integrity for templates. Sign a template to create a verifiable record of your original instructions. Verify retrieves that signed content, enabling detection of tampering or injection.

**Sign directive syntax:**

```mlld
sign @variable with sha256
sign @variable by "signer" with sha256
```

**Parameters:**

- `@variable` - The variable to sign (typically a template)
- `by "signer"` - Optional identity of who signed it
- `with sha256` - Hash algorithm (currently only sha256 is supported)

**What gets signed:**

For templates, the signature covers the template text with placeholders intact (not the interpolated result). For other variables, the signature covers the stringified value.

```mlld
var @auditPrompt = ::Review @input and reject if unsafe::
sign @auditPrompt by "security-team" with sha256
```

This signs `Review @input and reject if unsafe` - the template with `@input` as a placeholder.

**Verify directive syntax:**

```mlld
verify @variable
```

The verify directive outputs a verification result object to stdout:

```json
{
  "verified": true,
  "template": "Review @input and reject if unsafe",
  "hash": "sha256:abc123...",
  "signedBy": "security-team",
  "signedAt": "2026-02-01T10:30:00Z"
}
```

**Verification fields:**

| Field | Type | Description |
|-------|------|-------------|
| `verified` | boolean | True if signature matches content |
| `template` | string | Original signed content |
| `hash` | string | Signature hash with algorithm prefix |
| `signedBy` | string | Optional signer identity |
| `signedAt` | string | ISO 8601 timestamp |

**Signature storage:**

Signatures are stored in `.sig/content/`:

- `{varname}.sig.json` - Signature metadata (hash, algorithm, signer, timestamp)
- `{varname}.sig.content` - Signed content

These files are created automatically when you sign a variable.

**Verification failure:**

When content changes after signing, `verified` is `false` and `error` describes the mismatch.

```mlld
var @prompt = ::Review @input::
sign @prompt by "alice" with sha256
verify @prompt
```

Output shows `"verified": true` because content matches signature.

If the template is modified after signing, verify detects the mismatch and outputs `"verified": false` while still showing the original signed template content.

**The audit pattern:**

Signing enables cryptographically verified audit workflows. Sign your audit criteria before use:

```mlld
var @auditCriteria = ::
Review @findings and approve only if:
1. No secrets are exposed
2. No destructive operations are performed
3. All data sources are trusted
::

sign @auditCriteria by "security-team" with sha256
```

The signed template can be passed to an LLM with instructions to verify authenticity via `mlld verify auditCriteria`. The CLI reads `MLLD_VERIFY_VARS` from the environment to know what to verify.

**CLI verification:**

The `mlld verify` command checks signatures from the environment variable `MLLD_VERIFY_VARS`:

```bash
MLLD_VERIFY_VARS=auditCriteria mlld verify
```

Or pass variable names directly:

```bash
mlld verify auditCriteria
mlld verify prompt instructions
```

Output is JSON with verification results.

**Autosign and autoverify:**

Policy can automatically sign templates and inject verification. With `autosign: ["templates"]`, templates are automatically signed when created. With `autoverify: true`, mlld automatically injects verify instructions and sets `MLLD_VERIFY_VARS` in the command environment.

```mlld
policy @p = {
  defaults: {
    autosign: ["templates"]
  }
}

var @auditPrompt = ::Review @input::
```

The `@auditPrompt` template is automatically signed when created because of `autosign: ["templates"]`.

See `signing-overview` for the conceptual foundation and threat model.
