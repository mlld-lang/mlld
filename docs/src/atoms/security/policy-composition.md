---
id: policy-composition
title: Policy Composition
brief: How multiple policies combine their rules
category: security
parent: security
tags: [policy, composition, import, profiles]
related: [security-policies, policy-capabilities, policy-auth, policy-label-flow]
related-code: [interpreter/eval/policy.ts]
updated: 2026-02-09
qa_tier: 2
---

Multiple policies compose automatically when imported or declared.

```mlld
>> Team policy allows echo and git
/policy @p1 = { capabilities: { allow: ["cmd:echo:*", "cmd:git:*"] } }

>> Project policy allows echo and node
/policy @p2 = { capabilities: { allow: ["cmd:echo:*", "cmd:node:*"] } }

>> Effective: only echo (intersection of both policies)
/run { echo "allowed by both" }
```

**Import pattern:**

```mlld
/import policy @baseline from "./baseline.mld"
/import policy @company from "./company.mld"
/policy @localPolicy = { deny: { sh: true } }
```

**Composition rules:**

| Field | Rule | Effect |
|-------|------|--------|
| `allow` | Intersection | Must be allowed by ALL policies |
| `deny` | Union | Denied by ANY policy |
| `danger` | Intersection | Must be opted into by ALL |
| `limits` | Minimum | Most restrictive wins |

**Note:** If allow lists have no overlap, the intersection is empty and all operations are blocked. Ensure shared baseline commands appear in all layers.

**Profile selection** considers composed policy. The first profile whose `requires` all pass is selected:

```mlld
/policy @p = { deny: { sh: true } }

/profiles {
  full: { requires: { sh } },
  readonly: { requires: { } }
}

>> Selects "readonly" because sh is denied
/show @mx.profile
```

Label deny rules and auth configs from all layers merge via union — a `deny` on `secret → op:cmd` from ANY layer blocks that flow in the merged policy.

See `security-policies` for basic definition, `policy-capabilities` for capability syntax, `policy-label-flow` for label rules.
