---
id: labels-facts
title: Fact Labels
brief: Field-level proof from authoritative sources via fact: labels
category: effects
parent: labels
tags: [labels, facts, records, proof, security, authorization]
related: [labels-overview, labels-attestations, records-basics, facts-and-handles, policy-authorizations]
related-code: [core/policy/fact-labels.ts, core/policy/fact-requirements.ts, interpreter/eval/records/coerce-record.ts]
updated: 2026-03-27
qa_tier: 2
---

`fact:` labels provide field-level proof that a value came from an authoritative source. They are minted by record coercion and consumed by positive policy checks.

**How facts are created:**

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?]
}

exe @getContact(id) = run cmd {
  contacts-cli get @id --format json
} => contact
```

When `@getContact("1")` returns `{ email: "ada@example.com", name: "Ada", notes: "..." }`:

- `email` gets `fact:@contact.email`
- `name` gets `fact:@contact.name`
- `notes` gets no fact label

If the exe result also carries `untrusted`, record coercion refines that inherited taint:

- fact fields keep their `fact:` proof and clear inherited exe `untrusted`
- data fields keep inherited exe `untrusted`
- other labels such as `src:mcp` stay attached

If a `when` clause demotes the record to data, or validation demotes the record, no fact labels are minted and `untrusted` is preserved on every field.

## Fact label anatomy

Fact labels have the form `fact:[tier:]@record.field`:

| Label | Meaning |
|---|---|
| `fact:@contact.email` | Email from a contact record, no tier |
| `fact:internal:@contact.email` | Email from an internal contact |
| `fact:external:@contact.email` | Email from an external contact |
| `fact:@deal.id` | ID from a deal record |

Tiers come from `when` clauses in the record definition.

## Pattern matching

Positive checks and discovery match facts with patterns:

| Pattern | Matches |
|---|---|
| `fact:@contact.email` | Exact record and field |
| `fact:*.email` | Any record's email field |
| `fact:internal:*.email` | Internal-tier email from any record |
| `fact:*.id` | Any record's id field |

Wildcard `*` matches any record name. Tier-qualified patterns only match values with that tier.

## Policy rules that use facts

Built-in positive checks accept both `fact:` labels and `known` attestations:

- `no-send-to-unknown` -- destination args must carry `fact:*.email` or `known`
- `no-send-to-external` -- destination args must carry `fact:internal:*.email` or `known:internal`
- `no-destroy-unknown` -- target args must carry `fact:*.id` or `known`

## Declarative fact requirements

Policy can declare additional fact requirements per operation and argument:

```json
{
  "facts": {
    "requirements": {
      "@email.send": {
        "recipient": ["fact:*.email"]
      },
      "@crm.delete": {
        "id": ["fact:*.id"]
      }
    }
  }
}
```

These compose conjunctively with built-in requirements. If both a built-in rule and a declarative requirement apply, a candidate must satisfy both.

## Discovery

Agents discover facts through display projections on tool results. When a record has a `display` clause, fact fields cross the LLM boundary as masked previews or handle-only references. The agent gets handles directly in the data it fetches -- no extra discovery step.

The fact requirement resolver powers both display projections and enforcement. It derives requirements from:

1. Built-in symbolic specs (like `op:named:email_send`)
2. Live operation metadata (`labels`, `controlArgs`)
3. Declarative `policy.facts.requirements`

If none resolve, discovery returns nothing. It never guesses from arg names.

For explicit cross-root discovery, `@fyi.facts()` remains available as a secondary tool. See `fyi-facts`.

## Fact sources

Fact-bearing values also carry `mx.factsources` -- normalized source handles for provenance tracking:

```mlld
show @contact.email.mx.factsources
```

Each entry is a `{ kind, ref, sourceRef, field, tiers }` object. This is the structured provenance model that later features can build on for same-source checks and entity identity.

## Guards with facts

Guards can check for specific fact labels:

```mlld
guard @internalOnly before op:named:sendemail = when [
  @mx.args.recipient.mx.has_label("fact:internal:@contact.email") => allow
  * => deny "Only internal contacts"
]
```

`has_label` supports the same pattern matching as positive checks.

## Facts vs attestations

Both are positive proof, but they work at different levels:

| | Facts | Attestations |
|---|---|---|
| Granularity | Field-level | Value-level |
| Source | Record classification | Explicit `known` declaration |
| Created by | `exe ... => record` | `var known @x`, trusted tool results |
| Carries | Source, record, field, tier | Approval status |

Both satisfy positive policy checks. Facts are the richer model -- they describe *what kind* of authoritative value this is, not just that it's approved.

See `records-basics` for the record DSL. See `facts-and-handles` for how facts and handles work in the security model.
