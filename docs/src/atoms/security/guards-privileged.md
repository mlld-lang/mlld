---
id: guards-privileged
title: Privileged Guards
brief: Policy-generated guards that cannot be bypassed
category: security
parent: security
tags: [guards, privileged, policy, labels, trust, security]
related: [security-guards-basics, label-modification, pattern-audit-guard, security-policies]
related-code: [core/policy/guards.ts, interpreter/hooks/guard-pre-hook.ts, interpreter/hooks/guard-post-hook.ts]
updated: 2026-02-09
---

Policy rules generate privileged guards. These guards cannot be bypassed with `{ guards: false }` and can remove protected labels.

```mlld
>> Policy rules create privileged guards automatically
var @policyConfig = {
  defaults: { rules: ["no-secret-exfil"] },
  operations: { "net:w": "exfil" }
}
policy @p = union(@policyConfig)

var secret @key = "sk-12345"
exe net:w @send(data) = run cmd { printf "%s" "@data" }

>> Privileged guard still blocks — { guards: false } only disables user guards
show @send(@key) with { guards: false }
>> Error: Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'
```

**What privileged guards can do:**

| Action | Syntax | Effect |
|--------|--------|--------|
| Bless | `=> trusted! @var` | Remove `untrusted`, add `trusted` |
| Remove label | `=> !label @var` | Remove specific label |
| Clear labels | `=> clear! @var` | Remove all non-factual labels |

Non-privileged guards cannot remove ANY labels. Protected labels (`secret`, `untrusted`, `src:*`) get `PROTECTED_LABEL_REMOVAL`; other labels get `LABEL_PRIVILEGE_REQUIRED`. This ensures label removal is always a privilege escalation.

**Contrast — user guard cannot remove labels:**

```mlld
>> User-defined guard — NOT privileged
guard @bless after secret = when [
  * => allow with { removeLabels: ["secret"] }
]
>> PROTECTED_LABEL_REMOVAL: Cannot remove protected label 'secret' without privilege
```

**How guards become privileged:**

Currently, only policy-generated guards are privileged. User-defined `guard` directives are never privileged. This creates a security bottleneck: only policy-controlled code paths can clear taint.

**Notes:**
- `with { guards: false }` disables user guards but privileged guards still run
- `with { guards: only(...) }` and `except(...)` also preserve privileged guards
- User-defined `with { privileged: true }` is planned but not yet available
- See `label-modification` for privilege syntax details
