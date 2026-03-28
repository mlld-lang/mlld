---
id: labels-trust
qa_tier: 2
title: Trust Labels
brief: trusted and untrusted - blocking dangerous flows from unverified data
category: effects
parent: labels
tags: [labels, trust, untrusted, security, policy]
related: [labels-overview, labels-sensitivity, labels-source-auto, labels-attestations, policy-label-flow, policy-operations]
related-code: [core/security/LabelTracker.ts, interpreter/eval/security.ts]
updated: 2026-03-27
---

Trust labels classify data reliability: `trusted` or `untrusted`.

These are taint-style labels. They are different from attestation labels such as `known` and `known:*`, which answer a narrower question: "was this specific value approved by a trusted source?" See `labels-attestations`.

```mlld
>> Declare untrusted variable
var untrusted @payload = "user input"

>> Semantic label on operation, mapped to destructive via policy
exe fs:w @wipe(data) = run cmd { rm -rf "@data" }

policy @p = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["fs:w"] }
}
```

**Trust asymmetry:** `untrusted` is sticky. Adding `trusted` to untrusted data creates a conflict (both labels are kept). Removing `untrusted` requires privilege via `=> trusted! @var`.

Use trust labels for conservative risk propagation. Use `known` / `known:*` for positive checks such as approved send destinations or approved destructive targets.

**Built-in rules:** Enable in policy defaults:

```mlld
policy @p = {
  defaults: { rules: ["no-untrusted-destructive", "no-untrusted-privileged"] }
}
```

| Rule | Blocks |
|------|--------|
| `no-untrusted-destructive` | `untrusted` → `destructive` operations |
| `no-untrusted-privileged` | `untrusted` → `privileged` operations |

These rules generate managed label-flow denials that can be overridden by an explicit privileged guard `allow` for specific operations — enabling a "broad rule + specific exception" pattern. Use `locked: true` on the policy to make them absolute.

**Flow blocked:**

```mlld
policy @p = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["fs:w"] }
}

var untrusted @payload = "data"
exe fs:w @wipe(data) = run cmd { echo "@data" }
show @wipe(@payload)
```

Error: `Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'`

The two-step flow: `fs:w` on exe → policy maps to `destructive` → `no-untrusted-destructive` rule blocks untrusted data.

**Alternative:** Label exe directly as `exe destructive @wipe(...)` to skip the mapping step. See `policy-operations`.

**Opt-in auto-labeling:** Instead of labeling every variable manually, `defaults.unlabeled` in policy config automatically labels all data that has no user-assigned labels:

```mlld
policy @p = {
  defaults: {
    unlabeled: "untrusted",
    rules: ["no-untrusted-destructive"]
  },
  operations: { destructive: ["fs:w"] }
}

var @data = <./input.txt>
exe fs:w @wipe(data) = run cmd { echo "@data" }
show @wipe(@data)
```

Error: `Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'` -- file-loaded data has no user labels, so `defaults.unlabeled: "untrusted"` applies the `untrusted` label automatically.

This is opt-in via policy config, not default behavior. Data with explicit labels (e.g., `var trusted @clean = ...`) is unaffected.

## Trust refinement via records

When `=> record` coercion runs on an `untrusted`-labeled exe result, the record refines trust at the field level:

- **Fact fields**: `untrusted` is cleared. The record declares the source authoritative for these fields.
- **Data fields**: `untrusted` is preserved. The record declares these are content, not authoritative.

```mlld
record @transaction = {
  facts: [id: string, recipient: string, amount: number],
  data: [subject: string]
}

exe untrusted @getTransactions() = run cmd {
  bank-cli list --format json
} => transaction
```

After coercion:
- `recipient` carries `fact:@transaction.recipient` and `untrusted` is cleared
- `subject` carries `untrusted` (preserved as data)

The `facts` declaration is already a trust assertion -- the developer is saying the source is authoritative for these fields. Trust refinement gives that assertion teeth. Fact fields pass `no-untrusted-destructive` cleanly while data fields remain tainted.

Trust refinement only applies to fields that survive as facts after `when` evaluation. If a `when` clause demotes the record to data, no fact labels are minted and `untrusted` is preserved on all fields. Records that fail schema validation are also not refined.

This is the one built-in field-level trust refinement at the exe boundary.

When the operation has explicit `controlArgs`, `no-untrusted-destructive` and `no-untrusted-privileged` scope their taint checks to those control args only. Fact-bearing control args pass (trust refinement cleared `untrusted`). Tainted data args (body, title, description) are not checked — they're expected payload in the planner-worker model.

Without `controlArgs`, behavior is unchanged — all args are checked. Override with `taintFacts: true` on the exe, invocation, or policy rule to force all-arg checking even when `controlArgs` is declared.
