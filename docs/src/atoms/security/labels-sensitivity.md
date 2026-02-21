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
| `secret` | Confidential secrets, credentials, proprietary data | Customer lists, credentials, trade secrets |
| `sensitive` | Confidential but not cryptographic | Business data, internal configs |
| `pii` | Personally identifiable information | Email addresses, names, SSNs |

**Declaring sensitivity labels:**

```mlld
var secret @customerList = <internal/customers.csv>
var pii @patientRecords = <clinic/patients.csv>
var sensitive @internalConfig = <./company-config.json>
```

The label appears before the variable name when you declare it.

**Auto-applied `secret` label:**

Values retrieved from the keychain automatically receive the `secret` label and `src:keychain` source taint:

```mlld
var @key = keychain.get("api-token")
show @key.mx.labels
show @key.mx.taint
```

Output: `["secret"]` and `["secret", "src:keychain"]`

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
var secret @customerList = <internal/customers.csv>
var @parsed = @customerList | @parse
var @firstTen = @parsed.slice(0, 10)
var @summary = `Top customers: @firstTen`

show @summary.mx.labels
```

Output: `["secret"]`

The `secret` label propagates through the parse, the slice operation, and the template interpolation. This is critical: you cannot accidentally remove sensitivity by transforming data.

**Security rules for sensitivity labels:**

Policy defines built-in rules that block dangerous flows:

| Rule | Behavior |
|------|----------|
| `no-secret-exfil` | Blocks `secret` data from flowing to operations labeled `exfil` |
| `no-sensitive-exfil` | Blocks `sensitive` data from flowing to `exfil` operations |

These rules are opt-in via policy configuration:

```mlld
policy @p = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil"
    ]
  }
}
```

**What counts as `exfil`?**

`exfil` is a risk classification you apply to your semantic operation labels via `policy.operations`. You label exe functions with semantic labels describing what they do (e.g. `net:w`), then policy maps those to risk categories:

```mlld
>> Semantic label describes what the operation does
exe net:w @sendToServer(data) = run cmd {
  curl -d "@data" https://example.com/collect
}

>> Policy maps semantic labels to risk categories
policy @p = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}
```

**Blocked flow example:**

```mlld
policy @p = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}

var secret @customerList = <internal/customers.csv>
exe net:w @postToWebhook(data) = run cmd {
  curl -d "@data" https://hooks.example.com/ingest
}

show @postToWebhook(@customerList)
```

Error: the `secret` label on `@customerList` cannot flow to the `exfil`-classified operation per the `no-secret-exfil` rule.

**Alternative — direct risk labeling:** You can skip the two-step pattern and label operations directly as `exe exfil @sendToServer(...)`. This works but couples the exe definition to the risk category. See `policy-operations` for details.

**Using sensitivity in guards:**

Guards can check for sensitivity labels and enforce custom rules:

```mlld
guard before op:show = when [
  @input.any.mx.labels.includes("secret") => deny "Cannot display secrets"
  * => allow
]

var secret @recipe = <vault/secret-recipe.txt>
show @recipe
```

This blocks showing any secret-labeled data.

**Why sensitivity labels work:**

Sensitivity labels are enforced by the mlld runtime, not by LLM reasoning. Even if an LLM is tricked via prompt injection:

1. The secret data still carries its `secret` label
2. The operation still has its risk labels (`exfil`, `network`, etc.)
3. Policy rules block the dangerous combination
4. The operation fails regardless of LLM intent

This is defense in depth: the LLM may try to exfiltrate a secret, but the label system prevents it from succeeding.
