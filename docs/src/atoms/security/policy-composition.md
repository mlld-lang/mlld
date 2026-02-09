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
---

Multiple policies compose automatically when imported or declared.

```mlld
/import policy @baseline from "./baseline.mld"
/import policy @company from "./company.mld"
/var @localConfig = { deny: { sh: true } }
/policy @localPolicy = union(@localConfig)
```

**Composition rules:**

| Field | Rule | Effect |
|-------|------|--------|
| `allow` | Intersection | Must be allowed by ALL policies |
| `deny` | Union | Denied by ANY policy |
| `danger` | Intersection | Must be opted into by ALL |
| `limits` | Minimum | Most restrictive wins |

```mlld
>> Policy A allows echo+jq, Policy B allows echo
>> Effective allow: echo (intersection)
/import policy @p1 from "./policy-one.mld"
/import policy @p2 from "./policy-two.mld"
/show @mx.policy.configs.allow.cmd
```

**Profile selection** considers composed policy. The first profile whose `requires` all pass is selected:

```mlld
/var @denyShell = { deny: { sh: true } }
/policy @p = union(@denyShell)

/profiles {
  full: { requires: { sh } },
  readonly: { requires: { } }
}

>> Selects "readonly" because sh is denied
/show @mx.profile
```

Auth configs from imported policies merge via union, so imported modules can provide their own credential mappings that compose with local auth configs.

See `security-policies` for basic definition, `policy-capabilities` for capability syntax.
