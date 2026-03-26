---
id: labels-attestations
qa_tier: 2
title: Attestations
brief: known and known:* are value-scoped approvals used by destination and target rules
category: effects
parent: labels
tags: [labels, attestations, known, trust, security]
related: [labels-overview, labels-trust, policy-operations, policy-authorizations, security-guards-basics, facts-and-handles]
updated: 2026-03-24
---

`known` and `known:*` form mlld's built-in attestation namespace.

Attestations are different from taint-style trust labels such as `untrusted`:

- `untrusted` means risky data influenced this value, so it spreads conservatively
- `known` means this specific value was approved or verified by a trusted source, so it stays value-scoped

Examples of attestation labels:

- `known`
- `known:internal`
- `known:verified`

Every value exposes attestations directly:

```mlld
var known @recipient = "acct-1"
show @recipient.mx.attestations
```

`@recipient.mx.attestations` returns `["known"]`. For compatibility, the same labels also appear in `@recipient.mx.labels`, but positive policy checks read the attestation channel.

## Built-in Rules

Built-in positive checks use attestations on named args:

- `no-send-to-unknown` requires destination args such as `recipient`, `recipients`, `cc`, or `bcc` to carry `known`
- `no-send-to-external` requires those destination args to carry `known:internal`
- `no-destroy-unknown` requires targeted destructive args such as `id` to carry `known`

Namespace matching is prefix-based. `known:internal` satisfies a requirement for `known`, but bare `known` does not satisfy `known:internal`.

## Native Tool Calls

Across native tool calling, attestation is rebound by exact value match.

If a trusted lookup tool returns an attested value and the model later passes that same value back unchanged as a tool arg, mlld reattaches the attestation to that arg. If the model invents, reformats, or transforms the value, attestation is lost and positive checks fail closed.

This is why attestation is safe for approvals like recipients, IDs, file handles, and other exact values returned by trusted tools.

## Planner Authorizations

`with { policy }` authorizations also preserve planner-time attestations on pinned values.

If a planner pins `recipient: @approvedRecipient` and `@approvedRecipient` carried `known`, the authorization guard carries that attestation requirement forward. A later worker call can satisfy inherited positive checks only when the pinned planner value was actually attested at plan time.

## Facts

Record-derived `fact:` labels also satisfy positive checks. `fact:*.email` satisfies `no-send-to-unknown` and `fact:*.id` satisfies `no-destroy-unknown`, alongside `known` attestations.

Facts provide field-level proof from authoritative sources (contacts databases, CRM systems), while `known` attestations are value-scoped approvals. Both are valid proof for positive checks. See `facts-and-handles` for the full record/fact/handle model.
