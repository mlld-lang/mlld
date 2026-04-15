# Spec v2 Revision — Implementer's Summary

**Target spec**: `spec-input-records-and-tool-catalog.md` (v2, 2026-04-15)
**Scope**: changes since the v1 draft that the Phase 1 implementation was built against, plus the concrete Phase 2 feature set.
**Audience**: the implementer landing Phase 2.

This document is a direct diff of design intent. Use the spec itself as the authoritative source; this summary explains *what moved* and *why*, so you know which parts of Phase 1's scaffolding to revisit.

---

## 1. Headline: field attribute bag is gone

**v1 design** (deprecated, do not implement):

```mlld
record @send_email_inputs = {
  facts: [recipients: array { allowlist: @internal_domains }],
  data: {
    trusted:   [subject: string { exact: true }],
    untrusted: [body: string]
  }
}
```

**v2 design** (implement this):

```mlld
record @send_email_inputs = {
  facts: [recipients: array],
  data: {
    trusted:   [subject: string],
    untrusted: [body: string]
  },
  exact:     [subject],
  allowlist: { recipients: @internal_domains }
}
```

### What changed

The v1 draft introduced a per-field trailing `{ ... }` attribute bag, with a plan to extend to user-defined `attr @name` in v3. v2 reverses that:

- **Field-level syntax is now exactly `name: type[?]`.** No trailing `{ ... }` anywhere. Parser must reject it (see §14.3 `field_attribute_bag_used`).
- **Built-in concerns are promoted to top-level record sections.** They sit as peers of `key:`, `correlate:`, `supply:`, `validate:`.
- **No user-extension mechanism ships in v2.** If one ships later, the shape is "register a new top-level section," not "register a new per-field attribute." §2.8.

### Why it changed

The built-ins are load-bearing mlld semantics, not pluggable decorators. Sharing a grammar mechanism with a hypothetical user-extension system (1) obscured that fact, (2) created naming-collision risk before any concrete extension need existed, and (3) routed first-class validator rules through a generic attribute-bag dispatcher. The top-level-section design keeps each concern's validator code direct and co-located with its section-level error codes, and matches the grammar shape already established by `key:`, `correlate:`, `supply:`, `validate:`.

### Implementer impact

If Phase 1 stubbed a per-field attribute-bag parse path: **delete it**. Record field parsing is exactly what it is today for output records, plus the `handle` type extension (already present in the output-record grammar).

---

## 2. Five top-level input-only sections to implement

These are the Phase 2 deliverables. All are grammar-native — no extension mechanism. Each has a dedicated runtime check and a dedicated set of validation / dispatch error codes.

### 2.1 `exact: [field, ...]` — replaces `exactPayloadArgs`

- **Shape**: array of field names declared in `data:`.
- **Validate-time rules** (§6.2): every named field must exist in the record (`exact_field_undefined`) and be in `data:` (`exact_field_not_in_data`).
- **Builder-time check** (§1.3): each named field's value must appear verbatim in `{ task: @query }` passed to `@policy.build`. Case-insensitive, trimmed, substring match.
- **If task text is not provided** to the builder: skip the section and emit `exact_check_skipped_no_task` advisory (don't silently pass).
- **Error on failure**: `exact_not_in_task` (§14.7).

### 2.2 `update: [field, ...]` — replaces `updateArgs`

- **Shape**: array of field names declared in `data:`.
- **Validate-time rules** (§6.2): every named field must exist (`update_field_undefined`), be in `data:` (`update_field_not_in_data`), disjoint from `facts:`, and the catalog entry's `labels:` must include `update:w` (`update_without_label`).
- **Builder + dispatch check** (§1.3): at least one named field must have a non-null value on the proposed/dispatched intent.
- **Error on failure**: `no_update_fields` (§14.7).

### 2.3 `allowlist: { field: <set>, ... }`

- **Shape**: map keyed by field name; each value is either
  - a **record reference** (`@approved_domains`) — the referenced record's fact-field values form the membership set, walked at check time,
  - an **array literal or variable** (`["wire", "ach"]`, `@valid_types`).
- **Exe-valued sets are not supported in v2**. If you encounter a closed-over exe reference, emit `allowlist_invalid_target`.
- **Validate-time rules**: field must exist (`allowlist_field_undefined`); target must be a valid shape (`allowlist_invalid_target`); target-record must be output-directed (`allowlist_target_is_input_record`).
- **Builder + dispatch check**: value must be in the set. On array-typed fields, check per element; proofless/disallowed elements are dropped individually (same as today's array control arg handling).
- **Error on failure**: `allowlist_mismatch` (§14.7).

### 2.4 `blocklist: { field: <set>, ... }` — new

- **Shape**: identical to `allowlist`.
- **Semantics**: value must NOT be in the set. Inverse of allowlist.
- **Composition**: may coexist with `allowlist:` on the same field; both must pass (intersection: in allowlist AND not in blocklist).
- **Validate-time rules and builder + dispatch check**: parallel to `allowlist:`, with error codes `blocklist_field_undefined`, `blocklist_invalid_target`, `blocklist_target_is_input_record`, `blocklist_match`.

### 2.5 `optional_benign: [field, ...]`

- **Shape**: array of field names referencing **optional facts** (`?` in `facts:`).
- **Validate-time rules** (§6.2): every named field must exist (`optional_benign_field_undefined`); must be an optional fact field, not required and not a data field (`optional_benign_invalid_field`).
- **Dispatch-time behavior**: none. This section is pure documentation for the validator — it suppresses the `optional_fact_declared` advisory for listed fields.
- **v3 plan**: advisory becomes error; listing in `optional_benign:` becomes mandatory for every optional fact. Spec this now so suites adopt it early.

---

## 3. `handle` is a type, not an attribute

Clarified in v2 but largely unchanged:

- `name: handle` on a fact field requires the dispatched value to arrive as a handle-bearing reference; bare strings fail with `handle_expected_plain_string`.
- `name: handle` on a `data:` field is `handle_on_data` error.
- Same grammar used on output records today, extended to input records. One story.

No new grammar work needed beyond ensuring the type keyword is accepted in input-record fact field declarations.

---

## 4. Check-phase routing (§1.3)

Phase 2 turns the old single dispatch-time story into an explicit builder/dispatch split:

| Check | Builder | Dispatch |
|---|---|---|
| `facts:` proof | yes | yes |
| `data.trusted` taint check | yes | yes |
| `exact` | yes | no |
| `allowlist` | yes | yes |
| `blocklist` | yes | yes |
| `update` | yes | yes |
| `optional_benign` | no (validator only) | no |
| `correlate` | no | yes |
| `supply` | no | yes (Phase 3) |

Dispatch order is:

1. Arity / presence.
2. Type check.
3. `facts:` proof check (`proofless_control_arg` / `proofless_source_arg`).
4. `data.trusted` label check (`trusted_payload_tainted`).
5. **Cross-field policy sections** — `allowlist` → `blocklist` → `update`. `exact` is builder-only. `optional_benign` is validator-only.
6. `correlate` check.
7. `supply:` check (Phase 3).

`@policy.build` runs the builder-side subset before compiling the policy fragment. Shared checks reuse the same code across phases and differ only by the emitted `phase` field.

---

## 5. New validator rules (§6.2)

Rewritten for the new sections. Quick reference — every field name referenced by a top-level section must be declared in `facts:` or `data:`. Section-specific rules:

| Section | Rule | Error code |
|---|---|---|
| `exact` | field must be in `data:` | `exact_field_not_in_data` |
| `update` | field must be in `data:`, disjoint from `facts:` | `update_field_not_in_data` |
| `update` | tool labels must include `update:w` | `update_without_label` |
| `allowlist` / `blocklist` | target must be record / array | `allowlist_invalid_target` / `blocklist_invalid_target` |
| `allowlist` / `blocklist` | target-record must be output-directed | `allowlist_target_is_input_record` / `blocklist_target_is_input_record` |
| `optional_benign` | field must be an optional fact (not required; not data) | `optional_benign_invalid_field` |
| all sections | named field must exist in the record | `<section>_field_undefined` |

The direction-determination rule also expands: a record is an **input record** if it has any of `supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`. Mixing any of those with `display:` is `mixed_record_direction`.

---

## 6. Error catalog changes (§14)

### Deleted codes

- `duplicate_attribute_key` — no attribute bag to have duplicates.
- `unknown_attribute` — no attribute bag to have unknown keys.
- `attribute_on_output_record_ignored` — no bag anywhere, so nothing to warn about.
- `exact_on_fact` — replaced by `exact_field_not_in_data` (more precise).
- `update_on_fact` — replaced by `update_field_not_in_data`.

### Added codes

- `field_attribute_bag_used` — parse-time error on any trailing `{ ... }` after a field type, with hint pointing to the matching top-level section.
- `unknown_record_section` — parse-time error on unknown top-level section names. The v2 section list is closed.
- `exact_field_undefined`, `exact_field_not_in_data`
- `update_field_undefined`, `update_field_not_in_data`
- `allowlist_field_undefined`, `allowlist_invalid_target`, `allowlist_target_is_input_record`
- `blocklist_field_undefined`, `blocklist_invalid_target`, `blocklist_target_is_input_record`, `blocklist_match`
- `optional_benign_field_undefined`, `optional_benign_invalid_field`
- `key_field_undefined`
- `exact_check_skipped_no_task` — advisory when `exact:` is present but `{ task }` isn't.

### Updated codes

- `optional_fact_declared` hint now points to adding the field to `optional_benign:` (top-level), not `{ optional_benign: true }` (per-field).
- `mixed_record_direction` now enumerates the full set of input-only sections that conflict with `display:`.

---

## 7. Rollout phase wording (§13)

- **Phase 1** — marked **Shipped** in the spec. No remaining work here.
- **Phase 2** — marked **Shipped** in the spec. Deliverables landed: all five top-level sections above + validator rules + error catalog changes + `@toolDocs` / `<tool_notes>` rendering for the new sections.
- **Phase 3** — `supply:`. Not Phase 2's problem.
- **Phase 4** — legacy removal. Not Phase 2's problem.

---

## 8. Test coverage (§11) — what to add

- **Behavioral parity per section.** Port the legacy fixture matrix:
  - `exactPayloadArgs` test cases → `exact:` section test cases (same inputs, same assertions).
  - `updateArgs` test cases → `update:` section test cases.
  - Any ad-hoc per-tool validation helper that resembled an allowlist → replace with `allowlist:` and assert parity.
- **New coverage for blocklist.** No legacy equivalent; fresh fixtures. Cover: value in set → deny; value not in set → allow; array-typed field, one element in set → that element dropped; both allowlist and blocklist on the same field → must pass both.
- **optional_benign advisory suppression.** Optional fact without `optional_benign` listing → advisory fires. Same fact listed → advisory suppressed. Elevation to error is a v3 concern but the v2 advisory behavior must be correct.
- **Direction-determination.** Record with only `exact:` → classified as input record. Record with only `allowlist:` → input. Record with `display:` + any input-only section → `mixed_record_direction` error.
- **Parser rejection.** Trailing `{ attr: value }` on any field in any record → `field_attribute_bag_used`. Test with `facts:` and `data:` fields, both trusted and untrusted.

---

## 9. Docs atom updates (§15.4)

When Phase 2 ships, update:

- `core/31-records--basics.md` — add a §"Input records" subsection covering the top-level input-only sections. The current atom covers output-record shape only; it needs the input-direction story added (not a wholesale rewrite).
- `config/07b-policy--authorizations.md` — the "Control-Arg Enforcement", "Update and Payload Arg Enforcement", and "Cross-Arg Correlation" subsections currently reference exe-level metadata (`controlArgs`, `updateArgs`, `exactPayloadArgs`). Rewrite each to read from the input record's `facts:`, `update:`, `exact:`, `correlate:` sections. Legacy examples can stay for Phase 2–3 but must be labeled legacy.
- `mcp/03-mcp--tool-collections.md` — replace `expose` / `optional` / flat `controlArgs` examples with `inputs: @R` examples. Keep `bind:` / `labels:` / `mlld:`.
- `core/14-exe--metadata.md` — strip `controlArgs` and `sourceArgs` sections; these metadata keys move to input records.

---

## 9.5 Catalog field rename: `authorizable:` → `can_authorize:`

Separate from the Phase 2 input-record work but landing in the same commit:

- **Catalog field name** changes from `authorizable:` to `can_authorize:` on every tool entry.
- **Policy field name** changes from `policy.authorizations.authorizable` to `policy.authorizations.can_authorize`. Same value shape (`{ "role:*": [@tool, ...] }`).
- **`@policy.build` rejection** of `authorizable` on runtime intent becomes rejection of `can_authorize` on runtime intent (rejection rule unchanged — it's still developer base-policy-only).
- **Error code** `authorizable_invalid` → `can_authorize_invalid`.
- **New deprecation warning** `legacy_authorizable_field` — fires when a catalog entry uses the v1 draft field name `authorizable:`. Accepts the value as if it were `can_authorize:` (semantics unchanged) but emits the warning so authors migrate.

Rationale: `authorizable` reads in English as "this role can be authorized" (passive), which is the opposite of the intent. `can_authorize` is active-voice: "this role can authorize this tool." See spec §5.4.

Rename affects catalog parsing, policy compilation, and all mlld-owned docs / examples. Mechanical find-replace plus the new warning code. Any framework or host consuming the renamed fields updates its own helpers separately — not part of this mlld change.

## 10. Non-deliverables for Phase 2

Explicitly out of scope for this phase:

- `supply:` runtime check (Phase 3).
- User-extension primitive (Phase 4, or never).
- Exe-valued `allowlist` / `blocklist` sets (deferred with user extensions).
- Subset `correlate: ["a", "b"]` (deferred; §10.5).
- Legacy-shape removal (Phase 4).
- Output-record behavioral changes (none anywhere in this spec).
- Automatic input-record scaffolding from MCP JSON Schema (future revision; §9).

---

## 11. Quick greppable reference

New record section keywords to lex/parse: `exact`, `update`, `allowlist`, `blocklist`, `optional_benign`.

New runtime check phases in this order: `allowlist` → `blocklist` → `exact` → `update`.

New error codes to register: `field_attribute_bag_used`, `unknown_record_section`, `exact_field_undefined`, `exact_field_not_in_data`, `exact_check_skipped_no_task`, `exact_not_in_task`, `update_field_undefined`, `update_field_not_in_data`, `update_without_label`, `no_update_fields`, `allowlist_field_undefined`, `allowlist_invalid_target`, `allowlist_target_is_input_record`, `allowlist_mismatch`, `blocklist_field_undefined`, `blocklist_invalid_target`, `blocklist_target_is_input_record`, `blocklist_match`, `optional_benign_field_undefined`, `optional_benign_invalid_field`, `key_field_undefined`.

Deleted error codes to remove from any stub catalog: `duplicate_attribute_key`, `unknown_attribute`, `attribute_on_output_record_ignored`, `exact_on_fact`, `update_on_fact`.

Single unchanged invariant: **input records validate, output records mint.** Every new section in this revision reinforces that asymmetry — nothing here lets an input record assign labels or coerce values.
