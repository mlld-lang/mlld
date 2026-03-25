---
id: policy-operations
qa_tier: 2
title: Operation Risk Labels
brief: Label exe functions with risk categories for policy enforcement
category: config
parent: policy
tags: [labels, operations, exfil, destructive, privileged, security]
related: [labels-sensitivity, labels-trust, security-guards-basics, policy-authorizations]
related-code: [core/policy/label-flow.ts, core/policy/builtin-rules.ts]
updated: 2026-03-24
---

Classify operations by risk using the two-step pattern: label exe functions with semantic labels describing WHAT they do, then map those to risk categories in policy.

```mlld
>> Step 1: Semantic labels describe the operation
exe net:w @postToSlack(msg) = run cmd { slack-cli "@msg" }
exe fs:w @deleteFile(path) = run cmd { rm -rf "@path" }

>> Step 2: Policy groups semantic labels under risk categories
policy @p = {
  defaults: { rules: ["no-secret-exfil", "no-untrusted-destructive"] },
  operations: {
    exfil: ["net:w"],
    destructive: ["fs:w"]
  }
}
```

Now `secret` data cannot flow to `@postToSlack` (exfil rule) and `untrusted` data cannot flow to `@deleteFile` (destructive rule).

**Why two steps?**

- **Reusability:** Many functions share the same semantic label (`net:w` applies to Slack, email, webhooks). Changing the risk classification of `net:w` updates all of them at once.
- **Flexibility:** The same exe definition works under different policies. A dev policy might allow `net:w`; a production policy classifies it as `exfil`.
- **Composability:** Semantic labels are stable across teams and libraries. Risk classifications are a policy decision, not a code decision.

**Risk categories:**

| Category | Meaning |
|----------|---------|
| `exfil` | Sends data outside the system |
| `destructive` | Deletes or modifies data irreversibly |
| `privileged` | Requires elevated permissions |

Risk labels can be hierarchical. `exfil:send` is a child of `exfil`, so `no-secret-exfil` still blocks secrets sent through it, while `no-send-to-unknown` adds a positive check on named destination args such as `recipient`, `recipients`, `cc`, and `bcc`. `destructive:targeted` is a child of `destructive`, so `no-untrusted-destructive` still applies while `no-destroy-unknown` adds a positive check that the named target arg (for example `id`) is `known`.

**Multiple labels:** Combine when an operation has multiple risks:

```mlld
exe net:w, fs:w @exportAndDelete(data) = run cmd { backup_and_delete "@data" }

policy @p = {
  operations: { exfil: ["net:w"], destructive: ["fs:w"] }
}
```

**Alternative -- direct risk labeling:** You can label exe functions directly with risk categories, skipping the mapping step:

```mlld
exe exfil @sendToServer(data) = run cmd { curl -d "@data" https://api.example.com }
exe destructive @deleteFile(path) = run cmd { rm -rf "@path" }
```

This is simpler but couples exe definitions to risk categories. The two-step pattern is preferred for maintainability.

See `policy-authorizations` for how operations interact with per-tool authorization and control-arg enforcement.

**Complete example:**

```mlld
policy @p = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { exfil: ["net:w"] }
}

var secret @patientRecords = <clinic/patients.csv>
exe net:w @post(data) = run cmd { curl -d "@data" https://api.example.com }

show @post(@patientRecords)
```

Error: `Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'`
