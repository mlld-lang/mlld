# Spec: Data Layer v3

## Status

Design spec based on decisions D1–D29 plus the v3 provenance-boundary clarifications. Supersedes v2.

v3 keeps the useful record/fact/store ideas from v2, but clarifies a missing architectural split:

- `record` / `fact:` / `mx.factsources` solve provenance on live values
- `display` projections control what LLMs see
- opaque `handle`s solve the LLM boundary problem
- boundary input canonicalization accepts what the runtime emitted

Sections marked **Future** preserve the broader direction from v2, but they are not part of the first implementation slice.

## Implementation Status

### Phase 1 — Provenance And Boundary Core

| # | Feature | Status |
|---|---------|--------|
| 1 | `record` as a rich but pure shaping/classification DSL | **Shipped** |
| 2 | `display` projections on records (bare, masked, handle-only) | **Shipped** |
| 3 | `exe ... => record` producing display-projected results with embedded handles | **Shipped** |
| 4 | Schema metadata (`@output.mx.schema.valid`, `@output.mx.schema.errors`) | **Shipped** |
| 5 | After-guard deny/retry on schema failures | **Shipped** |
| 6 | Field-level `fact:` labels | **Shipped** |
| 7 | Raw normalized `@value.mx.factsources` | **Shipped** |
| 8 | Opaque runtime-issued handles embedded in display-projected tool results | **Shipped** |
| 9 | Boundary input canonicalization (handles, previews, bare literals) | **Shipped** — see `plan-boundary-input-canonicalization.md` |
| 10 | Canonical named-operation identity (`op:named:...`) | **Shipped** |
| 11 | Fact-aware policy and guard queries on resolved live values | **Shipped** |
| 12 | Removal of the exact-value attestation registry | **Shipped** |
| 13 | Declarative `policy.facts.requirements` | **Shipped** |
| 14 | Handle-backed authorization in `with { policy }` bundles (single + array) | **Shipped** — tested |
| 15 | `@fyi.facts()` explicit discovery (secondary to display projections) | **Shipped** — retained as compatibility/utility tool |
| 16 | Record trust refinement (`untrusted` cleared on fact fields during coercion) | **Shipped** — see `spec-record-trust-refinement.md` |
| 17 | URL exfiltration defense (`no-novel-urls`, `exfil:fetch`, `mx.urls`) | **Shipped** — see `spec-url-exfiltration.md` |
| 18 | Array fact fields (`array` / `array?` with per-element proof) | **Shipped** — see `plan-record-array-facts.md` |
| 19 | Positive checks trust explicit `controlArgs` (any `fact:*` accepted) | **Shipped** — see `spec-positive-check-controlargs.md` |
| 20 | Non-controlArgs stripped from authorization at compilation time | **Shipped** — see `spec-strip-data-args-from-auth.md` |
| 21 | Centralized runtime repair spine (shared canonicalization, proof claims, repair reports) | **Shipped** — see `plan-runtime-repair-safe-yes.md` Phase 1 |
| 22 | Record root adapters (`@input`, `@key`, `@value` for scalar and map inputs) | **Shipped** — see `plan-runtime-repair-safe-yes.md` Phase 2 |
| 23 | Element-wise array auth canonicalization with equivalent-match dedupe | **Shipped** — see `plan-runtime-participant-auth-repair.md` |
| 24 | Proof preservation in materialized policy fragments (CollectionEvaluator) | **Shipped** |
| 25 | Auto-lift fact-bearing auth leaves to handle/live-value path | **Shipped** |
| 26 | Authorization denial classification (unlisted / compile_dropped / args_mismatch) | **Shipped** |
| 27 | Taint scoping to control args (`no-untrusted-destructive`/`privileged` check only control args when declared; `taintFacts: true` override) | **Shipped** — see `spec-taint-scoping-control-args.md` |
| 28 | Handle-first cross-phase identity: `ref` display mode, `handle` field type, named display modes, cleaner handle shape | **Shipped** — see `feat-proof-preserving-return-projections.md` |
| 29 | Display governs data fields in named modes (strict whitelist, unlisted fields omitted) | **Shipped** |
| 30 | Handle-based tool interfaces (`spec-handle-tool-interfaces.md`) | **Shipped** |
| 31 | `authorizations.deny` list and `@policy.build` / `@policy.validate` builtins | **Shipped** — see `spec-authorizations.md` |
| 32 | Proofless control arg rejection in runtime auth compilation | **Shipped** |
| 33 | Bucketed intent shape (`resolved`/`known`/`allow`) with `known` uninfluenced invariant | **Shipped** — see `spec-authorizations.md` |
| 34 | Imported `var tools` collections as first-class inputs for `@policy.build`/`@policy.validate` | **Shipped** |
| 35 | Builder/validator compile diagnostics (`report` field with strips, repairs, drops, proofs) | **Shipped** |
| 36 | Trusted data fields (`data: { trusted, untrusted }` with conditional `when` promotion) | **Shipped** — see `spec-trusted-data-fields.md` |
| 37 | Collection-key policy matching and arg-object spreading for dynamic tool dispatch | **Shipped** — see `req-runtime-tool-collection-policy-dispatch.md` |

### Phase 2 — Stronger Source And Namespace Semantics

Not yet implemented:

1. stores as namespaced APIs over exes
2. store-addressed facts such as `fact:@contacts.email`
3. authorization-aware store query filtering
4. stronger source identity:
   - `key`
   - store/entity-aware fact sources
   - possibly `@value.mx.samesource(@other)`
5. broader uses of `=> record` beyond exe output where they prove valuable

### Phase 3 — Broader Data Layer Runtime

Not yet implemented:

1. broader `@fyi` environment awareness (context, stores, inspect, ask)
2. box integration around stores / `@fyi`
3. shelf as inter-agent communication
4. persistence, event log, state snapshot, signing, and project layout details
5. data-field visibility restrictions via `display` (currently only fact fields are projected)
6. box-level display overrides beyond `"strict"` (`"masked"`, `"open"`)

---

## 1. Core Thesis

mlld needs a durable data layer, but the problem is now understood as two linked concerns:

- **provenance on live values**
- **safe reference across LLM boundaries**

The design has five primitives:

- **`record`** — declares the shape of data: typed fields, facts vs data classification, display projections, field remapping, conditional trust, and LLM output parsing *(shipped)*
- **`display`** — controls what LLMs see per field: bare, masked, or handle-only *(shipped)*
- **`exe`** — talks to a backend; `exe ... => record` is the primary trust boundary *(shipped)*
- **`handle`** — an opaque runtime-issued reference to a live provenance-bearing value, embedded in display-projected tool results *(shipped)*
- **`store`** — a later namespaced API over exes that upgrades record-addressed facts into store-addressed facts *(not yet implemented)*

In phase 1, `=> record` is not universal. It is implemented first on executable output because that is the concrete trust boundary mlld needs immediately. Later, the language can generalize record coercion more broadly.

On top of these, `fact:` labels and `mx.factsources` flow through the existing taint/label system to enable field-level authorization. No new enforcement mechanism — facts are labels. The old exact-value registry is removed rather than preserved as a parallel trust model.

---

## 2. Records

A `record` is a first-class directive that declares:

- **Typed fields** — `string`, `number`, `boolean`, with `?` for optional
- Which fields are **facts** (authoritative — the source vouches for them)
- Which fields are **data** (content — useful but not trustworthy for action)
- **Field remapping** from API field names to clean names
- **Computed fields** combining multiple input fields
- **Conditional trust** via `when` — the record's own data describes its trust characteristics
- **Optional later dedup key** for entity identity
- **Display projection** — which fields the agent sees and how (bare, masked, handle-only)
- **Validation behavior** — what happens when data doesn't match the schema

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?, @input.organization as org: string?],
  data: [notes: string?, bio: string?],
  display: [name, { mask: "email" }],
  when [
    internal => :internal
    * => :external
  ]
}

record @deal = {
  key: id,
  facts: [id: string, @input.dealname as name: string, @input.dealstage as stage: string,
          amount: number, @input.closedate as close_date: string, @input.hubspot_owner_id as owner: string,
          { name: `@input.customer_first @input.customer_last` }],
  data: [description: string?, notes: string?]
}

record @task = {
  facts: [id: string, status: string, assignee: string],
  data: [title: string, description: string, priority: number?]
}

record @web_result = {
  data: [url: string, title: string, snippet: string, body: string?]
}

record @note = {
  data: [text: string, tags: string?, saved_at: string]
}
```

Some examples below still show `key` because it remains part of the longer-term record design. Identity and dedup are described in this spec, but they are intentionally deferred until after phase 1.

### 2.1 Facts and Data

Every field in a record is either a fact or data. Facts are values the source is authoritative for — something falsifiable or verifiable that the source vouches for as trustworthy. Data is content — useful for reasoning but not safe for authorization decisions.

**Declaring a field as a fact is a trust assertion.** The system will treat it as ground truth for authorization decisions — not hallucination, not attacker-controlled content. Only declare facts for fields where the source is genuinely authoritative. If a record declares `facts: [body]` on an email, the system will trust email bodies for authorization. That's almost certainly wrong — but it's the record author's responsibility, clearly visible in the record definition, and auditable in the threat model.

| | Facts | Data |
|---|---|---|
| Contact email | Yes — contacts API is authoritative | |
| Contact bio | | Yes — user-written, could contain anything |
| Deal amount | Yes — CRM is authoritative | |
| Email body | | Yes — user-written, injection vector |
| Web search snippet | | Yes — attacker-controllable |
| Agent note | | Yes — agent recollection, could be influenced |

### 2.2 Field Remapping

`@input.field_name as alias` remaps an API field to a clean record field name. `@input` refers to the raw exe return value.

`{ alias: template }` creates a computed field from multiple input fields.

### 2.3 Conditional Trust (`when`)

The record-level `when` clause reads field values from the input data (`@input`) and converts them to label segments on ALL facts:

```mlld
record @contact = {
  facts: [email, name, phone],
  data: [notes, bio],
  when [
    internal => :internal
    * => :external
  ]
}
```

A contact with `internal: true` → in phase 1, all facts get `fact:internal:@contact.email`, `fact:internal:@contact.name`, etc.

A contact with `internal: false` → in phase 1, all facts get `fact:external:@contact.email`, etc.

In phase 1, where stores are not yet part of the implementation slice, the corresponding labels are record-addressed:

- `fact:internal:@contact.email`
- `fact:external:@contact.email`

Later, once stores land, the same classification can also mint store-addressed labels such as `fact:internal:@contacts.email`.

**Booleans** test truthiness by field name. **Strings/enums** match values:

```mlld
when [
  lifecycle == "customer" => :customer
  lifecycle == "lead" => :lead
  * => data
]
```

The `=> data` branch demotes ALL fields to data — no facts at all. "Records with unknown lifecycle are useful content but not authoritative for anything."

### 2.4 Classification Fields

Fields referenced in a `when` clause are evaluated from `@input` (the raw exe return) for classification purposes. They are NOT stored in the record unless also listed in `facts` or `data`:

```mlld
record @contact = {
  facts: [email, name, phone],
  data: [notes, bio],
  when [
    internal => :internal      // `internal` read from @input, consumed by classification
    * => :external             // not stored in the record — the label captures the information
  ]
}
```

The `internal` boolean becomes the `:internal` label segment on the record's facts. The value is consumed by classification, not persisted as a field. The event log records the `when` evaluation result for auditability.

### 2.5 Typed Schemas and Validation

Type annotations on fields (`string`, `number`, `boolean`, `string?` for optional) make the record a typed schema. When `=> record` is applied to a value, the runtime validates the result against the schema.

**Validation behavior** is configurable per record:

```mlld
record @task = {
  facts: [id: string, status: string, assignee: string],
  data: [title: string, description: string, priority: number?],
  validate: "demote"     // default
}
```

| Mode | Behavior |
|------|----------|
| `"demote"` (default) | Invalid records are ingested with all fields demoted to data. No fact labels. Warning logged. |
| `"strict"` | Invalid data is an error. The operation fails. |
| `"drop"` | Invalid fields are dropped. Valid fields keep their classification. |

Validation results are exposed on the output metadata: `@output.mx.schema.errors` contains the list of validation failures (missing required fields, type mismatches). Guards can inspect this for retry logic.

`@output.mx.schema.valid` exposes the success boolean directly so guards can branch without interpreting the full error payload.

### 2.6 Display Projections

The `display` clause controls which fields an agent sees when tool results enter its context window. This is the mechanism that makes handles structural rather than opt-in.

Three visibility levels:

| Level | Syntax | Agent sees | Example |
|---|---|---|---|
| **Bare** | `field_name` in display | Full value | `Sarah Baker` |
| **Masked** | `{ mask: "field_name" }` in display | Type-aware masked preview | `s***@gmail.com` |
| **Handle-only** | Fact field not in display | Handle placeholder | `[handle:h_a7x9k2]` |

Default behavior:

- No `display` clause → all fields visible (backwards compatible)
- `display` present → only listed fields visible to the agent; unlisted fact fields become handle-only
- Data fields remain visible regardless — they're content for reasoning, not authorization-critical

Example:

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
```

Agent sees `{ name: "Sarah Baker", email: "s***@gmail.com", phone: "[handle:h_a7x9k2]", notes: "Met at conference" }`. The agent selects by name. Handles are the only path to masked and handle-only fields.

Masking is type-aware and deterministic within an execution (same value masks the same way every time):

| Type | Masked form |
|---|---|
| Email | `s***@gmail.com` |
| Name | `S*** B****` |
| Phone | `+1-***-**42` |
| ID/IBAN | `acct…2957` |

Display projections make handles mandatory where they matter. The agent can't copy what it can't see. No extra tool calls, no guards forcing handle usage — the handle is embedded in the tool result.

For bare fields (or records with no `display` clause), the agent sees the full value. Literal matching at authorization compile time can link those values back to their fact proof from same-session tool results.

Box-level overrides can force stricter display regardless of record defaults:

```mlld
box @worker with { display: "strict" } [...]
```

`"strict"` forces all fact fields to handle-only. Useful for workers handling untrusted content.

### 2.7 LLM Output Parsing

When `=> record` is applied to a value, the runtime handles messy LLM output automatically:

1. **Strip prose** — extracts structured data from markdown fences, "Here's the JSON:" preambles, leading/trailing text
2. **Parse** — JSON or YAML
3. **Coerce** — `"42"` → `42` for number fields, `"true"` → `true` for booleans, trims whitespace on strings
4. **Validate** — required fields present, types match (after coercion)
5. **Label** — applies facts/data classification and `when` clause

This is `@parse.llm` baked into the record. No explicit parsing step needed — the record knows it might be receiving LLM output and handles the messiness.

### 2.8 `=> record` In Phase 1 And Later

In phase 1, `=> record` is required on executable output. That is the primary trust boundary for:

- MCP / API / CLI results
- LLM exe output
- any other backend result that must become a live typed value with provenance

Phase 1 does **not** require universal coercion syntax everywhere a value is produced. The record system is still designed so that broader coercion can be added later:

```mlld
// Phase 1: exe output
exe @claudeTask(prompt) = @claude(@prompt, @config) => task
exe @searchContacts(query) = @mcp.searchContacts(@query) => contact
```

Later, the same coercion model may generalize more broadly:

```mlld
// possible later surface
var @result = @claude(@prompt) => task

when @value [
  true => @value as task
]

// for loop
for @item in @rawData [
  var @clean = @item => contact
]

// pipeline
var @tasks = @claude(@prompt) | @parse => task
```

The `as` keyword is still a plausible later surface: `@value as task` would be equivalent to `@value => task`.

In phase 1, `=> record` produces record-addressed facts such as `fact:@contact.email`. Later, when a store maps the exe and provides a stronger namespace, the same coercion can mint store-addressed facts such as `fact:@contacts.email`.

### 2.9 Future: Record Identity

Every record gets a prefixed ID:

| Record has | ID source | Format | Dedup behavior |
|------------|-----------|--------|----------------|
| `key: id` | User-declared field value | `key:{value}` | Same key = same entity |
| Facts but no key | Content hash of facts | `hash:sha256:{hash}` | Same facts = same entity |
| Only data | Generated UUID | `uuid:{uuid}` | Every write is unique |

The prefix makes the identity strategy unambiguous. Data-only changes (updated `notes` with unchanged facts) don't create a new entity — they update the existing record in the state snapshot.

`key` and the identity/dedup system are intentionally deferred until after phase 1. The model above is still the intended longer-term direction, but records do not need identity semantics in order to ship the provenance and handle architecture.

---

## 3. Exes

Exes talk to backends. In phase 1, the `=> type` annotation attaches a record's rules to the exe's output and becomes the primary runtime trust boundary:

```mlld
// API/CLI exes — structured data in, record out
exe @searchContacts(query) = run cmd { contacts-cli search @query } => contact
exe @getContact(id) = run cmd { contacts-cli get @id } => contact

exe @searchDeals(query) = node {
  const hubspot = await import('@hubspot/api-client');
  const client = new hubspot.Client({ accessToken: process.env.HUBSPOT_API_KEY });
  const response = await client.crm.deals.searchApi.doSearch({ query, properties: [...] });
  return response.results.map(r => r.properties);
} => deal

// LLM exe — messy prose in, typed record out
exe @claudeTask(prompt) = @claude(@prompt, @config) => task

// Simple exes
exe @webSearch(query) = run cmd { web-cli search @query } => web_result
exe @saveNote(text, tags) = js {
  return { text, tags, saved_at: new Date().toISOString() };
} => note
```

When an exe returns, the runtime applies the record's rules in order:

1. **Parse** — strip prose/fences, extract JSON/YAML
2. **Coerce** — type conversion (`"42"` → `42`)
3. **Remap** — field name mapping (`@input.dealname as name`)
4. **Compute** — evaluate pure computed/composable fields
5. **Validate** — schema check. `validate: "demote"` → all fields become data. `validate: "strict"` → error.
6. **When** — conditional classification. May demote to all-data via `=> data` branch.
7. **Label** — assign `fact:` labels to surviving fact fields
8. **Factsource** — attach normalized `mx.factsources` to record-derived values
9. **Expose schema metadata** — set `@output.mx.schema.valid`, `@output.mx.schema.errors`, and mode/status details
10. **Display project** — apply `display` clause to produce the LLM-visible representation with embedded handles for masked/handle-only fact fields

Validation and `when` both come before labeling. If either demotes the record to all-data, no fact labels are assigned.

Later, once stores/persistence/signing land, additional steps can follow:

10. **ID** — `key:{value}`, hash identity, or UUID depending on the later identity model
11. **Sign** — JCS canonical serialization + signature
12. **Append** — event to log, update state snapshot

That later ingestion path is still useful, but it is intentionally not part of the first provenance/handle implementation slice.

For LLM-backed exes, `=> record` is especially powerful: the LLM returns free-form text with embedded JSON, and the record handles extraction, parsing, type coercion, validation, and trust labeling in one step.

### 3.1 MCP Tool Classification

MCP tools imported from external servers can be annotated with records:

```mlld
// Shorthand on the import line
import tools { @searchContacts => contact } from mcp "google-contacts-server"

// Or post-import annotation
import tools { @searchContacts } from mcp "google-contacts-server"
exe @searchContacts => contact
```

The MCP server doesn't need to know about mlld's record system. The user attaches classification at import time.

---

## 4. Future: Stores

Stores remain the intended longer-term namespaced API over exes, but they are not required for phase 1.

Phase 1 works with record-addressed facts and live provenance-bearing values directly. Stores matter later when mlld needs:

- namespaced data APIs such as `@contacts.find(...)`
- store-addressed facts such as `fact:@contacts.email`
- observation/mutation semantics over named collections
- persistent indexed data beyond the immediate exe boundary

A store maps named operations to exes. It's still dumb plumbing — a namespaced API over data sources.

```mlld
store @contacts = {
  find: @searchContacts,
  get: @getContact
}

store @crm = {
  deals: {
    find: @searchDeals,
    get: @getDeal,
    stale: @getStaleDeals
  },
  contacts: {
    find: @searchCrmContacts
  }
}

store @memory = {
  note: @saveNote,
  plan: @savePlan,
  persist: true
}
```

### 4.1 Operations

`@contacts.find("Mark")` calls `@searchContacts("Mark")` through the store. `@crm.deals.stale(50000, 30)` calls `@getStaleDeals(50000, 30)`. Dotted access resolves through field access to the exe, then calls it — no new grammar needed.

**Conventional names** with semantic meaning to the runtime and agents:

| Name | Meaning |
|------|---------|
| `schema` | Orientation — record types, field names, counts, samples |
| `find` | Query — matching records |
| `get` | Detail — single record by ID |
| `put` | Write — create/update a record |
| `has` | Check — does a matching record exist |

Custom names (`stale`, `favorites`, `internal`) are user-defined views. All operations are exes — guardable, auditable, trackable in `@mx.tools.calls`, exposable to agents via the tool gateway.

### 4.2 Multi-Type Stores

A single API often serves multiple entity types. Nested sub-stores group operations by type:

```mlld
store @crm = {
  deals: { find: @searchDeals, get: @getDeal, stale: @getStaleDeals },
  contacts: { find: @searchCrmContacts, get: @getCrmContact }
}
```

`@crm.deals.find(...)` and `@crm.contacts.find(...)` are separate operations on the same store.

### 4.3 Progressive Disclosure

Store operations support progressive disclosure — agents query at increasing levels of detail:

1. `contacts.schema()` → orientation (field names, counts, samples)
2. `contacts.find(query)` → matching records
3. `contacts.get(id)` → single record, full detail

Agents that call `schema` before `find` plan better queries and iterate less. This is a convention, not a feature — the user wires exes that implement each level.

### 4.4 Ambient Metadata

`@store.mx` provides session metadata to orchestration code:

- `@contacts.mx.count` — records seen this session
- `@contacts.mx.types` — record types ingested
- `@contacts.mx.writers` — which exes wrote to it

Read-only context, not a query interface.

### 4.5 Authorization-Aware Query Filtering

Stores are the point where the runtime can proactively narrow results based on active policy.

A raw `exe` is a shell command — the runtime can't control its query. But a store-backed operation like `@contacts.find("Sarah")` is mediated by the runtime. The store knows the record schema, the policy knows the fact requirements, and the store can filter results before they enter the agent's context.

If the active policy includes `no-send-to-external` (requiring `fact:internal:*.email`), a store `find` operation can return only internal contacts. The agent never sees external contacts' handles. It can't authorize what it can't reference.

This is proactive enforcement at the query boundary — strictly more powerful than reactive blocking at dispatch. The exact filtering semantics (pre-query vs post-query, how to handle stores backed by external APIs) need design, but the architectural point is: stores are where the runtime has enough control to narrow results rather than just blocking actions.

### 4.6 Persistence

Stores are ephemeral by default — the in-memory index starts empty each run. Fact labels from previous runs do NOT carry into the current session's store or authorization checks. `persist: true` loads historical entries from the state snapshot at startup — use this for agent memory that needs cross-session continuity, not for authorization-relevant stores.

The event log always accumulates regardless — audit trail is unconditional. The state snapshot reflects the latest state across all runs for file taint and audit purposes, but is not the store query surface unless `persist: true` is set.

**Note on persistent facts:** When `persist: true` loads historical facts, they carry the same `fact:` labels as fresh ones — the runtime does not distinguish by age. This is a convention boundary: don't persist stores whose facts are used for authorization unless you intend historical facts to remain valid. If freshness checking is needed in the future, facts could carry run IDs, but this is out of scope for v0.

```mlld
store @contacts = { find: @searchContacts }                   // ephemeral
store @memory = { note: @saveNote, persist: true }            // loads history
```

---

## 5. Fact Labels

The `fact:` label is how field-level trust flows through mlld's security system. No new enforcement mechanism — facts are labels.

### 5.1 What a Fact Is

A value the source is authoritative for and vouches for as trustworthy. Something falsifiable or verifiable.

- Contact email from the contacts API = fact
- Contact bio (user-written free text) = not a fact
- System-generated file ID = fact
- Email body (user-written content) = not a fact
- Web search snippet = not a fact
- Agent's note about a contact = not a fact

### 5.2 Label Format

`fact:` prefix + zero or more user-defined segments + terminal `@name.field`:

```
fact:@contact.email                        // phase 1: record-addressed
fact:internal:@contact.email               // phase 1: with when qualifier
fact:internal:@contacts.email              // later: store-addressed
fact:customer:@crm.contacts.email          // later: nested store path
fact:verified:staff:@contacts.email        // later: multiple user-defined segments
```

The terminal `@name.field` identifies the source. In phase 1, where `exe ... => record` is the first implementation slice, facts are record-addressed by default (for example `@contact`). Later, when a store names the source, the same field can also mint store-addressed facts (for example `@contacts`).

These are **different namespaces intentionally**:

- `fact:internal:@contact.email` — record-addressed. Phase 1's main authorization and guard surface.
- `fact:internal:@contacts.email` — store-addressed. A later stronger form when the trust decision depends on a named store source.

In phase 1, policies and guards should reference record-addressed facts or wildcard field patterns such as `fact:*.email`. Later, when stores land, policies can use store-addressed facts when the trust decision depends on data having come from a specific named store.

This prevents laundering later: an agent using `mlld.eval()` to apply `=> contact` to untrusted data can at most produce record-addressed facts, not store-addressed ones tied to a named ingestion path.

Middle segments are opaque — mlld propagates them but assigns no built-in meaning. Users build their own trust-tier conventions via record `when` clauses and guards.

### 5.2.1 Fact Source Metadata And Future Source Handles

The label format above captures **fact provenance class**: “this value descends from an authoritative `email` field on `@contact`” or, later, on `@contacts`. That is enough for many first-release policy checks.

Phase 1 also exposes a more structural lineage layer on metadata:

- `@value.mx.factsources` — raw set of normalized source handles

Later, mlld may also expose:

- `@value.mx.samesource(@other)` — sugar for “do these values share at least one fact source?”

The purpose of this layer is not exact-string rebinding. It is stronger and more structural: values can preserve their source identity because they carry provenance from the originating fact field, even after field access and ordinary transformations.

Likely handle components include some subset of:

- record name
- optional store name
- optional entity id or key
- field name
- canonical `source_ref`

The raw `@value.mx.factsources` surface is part of the intended first implementation. Stronger helper semantics still need more design. In particular:

- when a transformed value still counts as “the same source”
- when provenance must be dropped and the value becomes a bare string again
- how store/entity identity composes with record-addressed facts

For now, the core model remains: `fact:` labels carry authorization-relevant provenance class, and `mx.factsources` preserves stronger lineage metadata without reverting to exact-value registry semantics.

### 5.3 Facts and Taint Are Independent

A value can carry BOTH `src:mcp` taint AND `fact:internal:@contact.email`. These answer different questions:

- `src:mcp` = where did this data come from?
- `fact:internal:@contact.email` = is this field authoritative, and what trust tier?

At enforcement time:

1. Label flow checks taint rules (can this data reach this operation?)
2. Fact conditions on allow rules create exceptions (this fact overrides this taint restriction)
3. Guards can inspect both for surgical decisions

Facts do NOT strip or override taint. Taint is never removed. Facts create policy exceptions.

### 5.4 Policy Integration

Policy rules can condition allow/deny on fact labels. String shorthand desugars to structured form:

```mlld
policy @p = {
  labels: {
    "secret": {
      deny: ["op:cmd:*"],
      allow: ["send_email(fact:internal:@contact.email)"]
    }
  }
}

// Desugars to:
allow: [{ op: "send_email", when: ["fact:internal:@contact.email"] }]

// Structured form available for complex cases:
allow: [{ op: "send_email", when: ["fact:internal:@contact.email"], when_not: ["src:web"] }]
```

Later, when stores land, the same policy shape can target store-addressed facts such as `fact:internal:@contacts.email`.

### 5.5 Guard Integration

Guards can inspect fact labels for surgical decisions:

```mlld
guard @internalOnlySecrets before @email.send = when [
  @input.any.mx.labels.includes("secret")
    && @mx.args.to.mx.has_label("fact:internal:*.email") => allow
  @input.any.mx.labels.includes("secret") => deny "Secret content can only be sent to internal contacts"
  * => allow
]
```

Guards can also inspect raw fact-source metadata when stronger lineage debugging or integrity checks are needed:

```mlld
guard @debugRecipient before @email.send = when [
  @mx.args.to.mx.factsources => allow
  * => deny "recipient has no fact source"
]
```

Guards can also validate record schemas and retry on failure — particularly useful for LLM-backed exes:

```mlld
guard after @claudeTask = when [
  @output.mx.schema.errors => retry "Previous answer contained errors: @output.mx.schema.errors"
  * => allow
]
```

The LLM gets structured feedback about what was wrong (missing fields, type mismatches). On retry, it corrects its output. The record validates again. This creates a self-correcting loop where the record schema is the contract and the guard enforces it.

---

## 6. Handles And LLM Boundaries

`record` / `fact:` / `mx.factsources` solve provenance on live values. They do **not** by themselves solve the LLM boundary problem. If a planner or worker retypes a literal email or ID, provenance is lost.

`handle`s solve that second problem.

### 6.1 What A Handle Is

A handle is:

- opaque
- runtime-issued
- execution-scoped
- a reference to a live provenance-bearing value

Handles are delivered to agents primarily through display projections on tool results. When a record's `display` clause masks or omits a fact field, the agent sees a handle placeholder instead of the raw value. The handle is the boundary token; the thing it points at is a specific fact-bearing live value.

A handle is **not**:

- a copied literal
- a planner-authored path
- an expression string
- a permanent public ID baked into every record field

Example wire shape:

```json
{ "recipient": { "handle": "h_a7x9k2" } }
```

### 6.2 Lifecycle

The lifecycle is:

1. `exe ... => record` produces a live value with `fact:` labels and `mx.factsources`
2. the record's `display` clause determines which fields the agent sees: bare (full value), masked (type-aware preview), or handle-only (opaque reference)
3. handles are minted for masked and handle-only fact fields and embedded directly in the tool result
4. the runtime records which projected forms (handles, previews, literals) were emitted to the current LLM tool session
5. the agent sees the display-projected result — names for selection, handles for authorization-critical values
6. the agent returns values in authorizations or tool calls — handles, masked previews, or bare literals
7. the runtime canonicalizes agent-produced values back to original live values via boundary input canonicalization (section 6.8)
8. policy and guards enforce on the canonical live values with their full provenance

The runtime is conservative in what it emits and liberal in what it accepts. The agent can copy whichever form feels natural — handle wrapper, masked preview, or bare literal — and the runtime resolves it back to the live value with provenance, provided it was actually emitted to that LLM session.

### 6.3 Display Projections As The Primary Handle Delivery

Display projections (section 2.6) replace `@fyi.facts()` as the primary handle mechanism. Agents get handles from tool results directly — no extra discovery step.

The agent calls a tool, gets display-projected results:

```json
{
  "name": "Sarah Baker",
  "email": { "preview": "s***@gmail.com", "handle": { "handle": "h_a7x9k2" } },
  "phone": { "handle": { "handle": "h_b3m8q1" } },
  "notes": "Met at conference"
}
```

The agent can return any emitted form. Boundary canonicalization (section 6.8) resolves it:

```json
{ "recipient": { "handle": "h_a7x9k2" } }
{ "recipient": "s***@gmail.com" }
```

Both resolve to the same live value with `fact:@contact.email`. The handle wrapper is the explicit path. The masked preview is accepted tolerantly if it maps uniquely in the current LLM session.

The `@fyi` namespace stays as infrastructure for broader agent awareness (context, shelf, stores, inspect, ask). The `@fyi.facts()` tool is removed from the agent-facing surface — its internal plumbing (fact requirement resolver, pattern matching, operation-arg mappings) powers display projections, enforcement, and literal matching from the inside.

### 6.4 Policy-Aware Display Projection

Display projections consult the fact requirement resolver to determine which fact fields qualify for handles based on active policy.

If the active policy includes `no-send-to-external` (requiring `fact:internal:*.email`), the display projection knows only internal contacts qualify. External contacts' email fields don't get handles — the agent can't authorize what it can't reference.

This is proactive enforcement at the data boundary. The same requirement resolver that powers positive checks at dispatch now also filters which fact fields get handles in tool results. Discovery and enforcement are driven by the same fact semantics.

### 6.5 Canonical Operation Identity

The canonical operation identity is `op:named:...`, shared across guard matching/querying, policy, authorization, and runtime op context.

- canonical user-facing ref for a named operation is `op:named:send_email`
- namespaced tools/exes use the same shape, for example `op:named:crm_deals_get`
- exact-operation guard targeting uses that same identity: `guard before op:named:send_email = ...`
- guard/runtime context exposes the canonical identity at `@mx.op.ref`

This avoids carrying separate concepts for function-name guards, policy operation keys, and runtime operation names.

### 6.6 Trusted Task And Config Values

Not every trusted value comes from a tool result. Some come from structured task input or config.

The same model applies:

- lift structured trusted task/config values into live provenance-bearing values via `=> record`
- display projections embed handles for masked/handle-only fact fields
- literal matching links bare field values back to their fact proof
- resolve handles back to those live values before use

Free-form user prose is not automatically authorization-grade just because the user typed it. If it must participate in authorization-critical flow, it still needs to become a structured live value first.

### 6.7 Handle Wrapper Shape

The handle wire shape is intentionally strict.

The runtime should recognize a handle wrapper only when the object has exactly one key:

```json
{ "handle": "h_a7x9k2" }
```

Objects with extra keys are ordinary payload objects, not handle wrappers. Recursive resolution can still walk arrays and objects looking for exact handle-wrapper leaves, but it should not reinterpret arbitrary objects as live-value references.

### 6.8 Boundary Input Canonicalization

The runtime is conservative in what it emits and liberal in what it accepts. At the LLM boundary, the runtime accepts any form it actually emitted to the current LLM tool session and canonicalizes it back to the original live value.

Resolution order for security-relevant argument positions:

1. **Handle wrapper**: `{ "handle": "h_xxx" }` — resolve via root-scoped handle registry. Works across planner/worker boundaries.
2. **Emitted masked preview**: exact string match against previews emitted in the current LLM session. Session-local scope.
3. **Emitted bare literal**: exact string match against bare literals emitted in the current LLM session. Session-local scope.
4. **No match**: leave unresolved. Normal positive checks and authorization decide.

Scope rules:

- **Handle resolution is root-scoped.** Planner-issued handles work in worker authorization and tool dispatch.
- **Preview/literal resolution is session-local.** Planner previews do not silently become valid worker inputs. Only values the runtime emitted to THIS LLM session are matchable.
- **Display mode controls what's matchable.** Bare fields emit literals (matchable). Masked fields emit previews (matchable). Handle-only fields emit no preview or literal (only the handle resolves).

Canonicalization applies only to security-relevant positions:

- exe `controlArgs`
- built-in positive-check target/destination positions
- declarative `policy.facts.requirements` positions
- authorization constraint values

Payload args (email body, file content, descriptions) remain ordinary data and are not rewritten.

Ambiguity handling:

- If a preview or literal maps to multiple emitted live values in the current session, the runtime fails closed.
- The error tells the model to use the handle wrapper from the tool result.
- Handles are the disambiguation path, not the only path.

Unknown handles fail closed. Values the runtime never emitted to the session have no match. This replaces the old equality-based registry with a scoped, projection-aware boundary model.

---

## 7. Future: Box Integration

Store operations are exes, so box access control uses the tools list. No separate store config for stores.

```mlld
box @analyst with {
  tools: [@crm.deals.*, @shelve],
  shelf: {
    write: [prospects, scores],
    read: [@openDeals as deals, @targetCompanies as companies]
  },
  fyi: {
    context: @analystContext,
    stores: [@crm]
  }
} [...]
```

**Tools:** Read/write distinction falls out of which operations you allow. `@contacts.[find, get]` = read. Add `@contacts.put` = write. `@contacts.*` = full access.

**Shelf:** Controls which shelf keys the agent can see and write. `write: [key]` grants `@shelve` for listed keys. `read: [key]` grants visibility. `read: [@var as key]` wires an orchestrator variable onto the shelf. `shelf: *` = full access.

**Fyi:** Controls agent environment awareness. `context` wires in domain-specific reference material, and `stores` controls which stores the agent sees metadata for. Files and shelf visibility derive from other box config. Fact discovery is handled by display projections on tool results rather than explicit `fyi.facts` roots.

### Observation vs Mutation

Store interactions produce two kinds of state change:

- **Observation** — when an exe returns, the runtime indexes what was returned. This updates the event log and state snapshot (metadata sidecar). It's runtime bookkeeping, not an agent action. Not gated by box tool permissions. `find` and `get` trigger observations.
- **Mutation** — the agent explicitly writes data via `put` or `@shelve`. This is a user-visible write. Gated by box tool permissions.

Both affect state. The difference is who initiated it and whether permissions apply. Auto-ingestion is an observation — an orchestrator-owned privileged write to the metadata sidecar. The orchestrator configured the store mapping; the agent just called the tool.

---

## 8. Future: Broader `@fyi` — Agent Environment Awareness

Display projections (section 2.6) replace `@fyi.facts()` as the primary handle mechanism. The broader `@fyi` design is still useful for agent environment awareness, and should land after the provenance/handle/display core is stable. The `@fyi` namespace and plugin infrastructure remain — `fyi.facts` was one tool that got absorbed into display projections.

Longer-term, `@fyi` is the unified read surface for everything an agent knows about its environment. It merges file awareness, shelf contents, store metadata, and provenance inspection into one introspection surface.

`@fyi` separates from `@mx`: `@mx` = metadata about the current **operation** (taint, labels, guard context). `@fyi` = awareness of the **environment** (files, shelf, stores, provenance, context).

### 8.1 Sections

| Section | What it shows |
|---------|--------------|
| `@fyi.files` | Workspace files with descriptions, taint counts |
| `@fyi.shelf` | Shared values from agents/orchestrator |
| `@fyi.stores` | Store metadata — record types, counts, field names |
| `@fyi.run` | Current run UUID, previous run, script path |
| `@fyi.context` | User-wired domain context (help, docs, conventions) |

### 8.2 `@fyi.inspect()` — Unified Provenance

Deep provenance for any artifact type:

```
@fyi.inspect("/src/index.js")              → file: origin, taint chain, edit history
@fyi.inspect(@contacts, "key:d_123")       → record: writer, facts, when result, signature
@fyi.inspect(@fyi.shelf.prospects)         → shelf value: who wrote it, taint, timestamp
```

One inspection surface across files, records, and shelf values. Different details, same shape.

### 8.3 File Awareness

Agents see a unified filesystem tree. `@fyi.files` lists workspace files with descriptions and taint counts:

```json
{
  "path": "/",
  "entries": [
    { "name": "docs", "type": "directory", "taint_count": 0 },
    { "name": "src", "type": "directory", "taint_count": 3 },
    { "name": "readme.md", "type": "file", "desc": "Project overview", "taint_count": 0 }
  ]
}
```

Descriptions flow from `file`/`files` declarations. `taint_count` signals "this has history — inspect if needed." The agent sees files, not resolver structure.

### 8.4 Progressive Disclosure

The same three-level pattern across all sections:

| Level | Files | Stores | Shelf |
|-------|-------|--------|-------|
| 0 — orient | `fyi("files")` → names, descriptions, taint counts | `fyi("stores")` → types, fields, counts | `fyi("shelf")` → keys, types, sizes |
| 1 — query | read file | `contacts.find(query)` → records | `@fyi.shelf.key` → value |
| 2 — detail | `fyi("inspect /src/index.js")` → provenance | `contacts.get(id)` → full record | `fyi("inspect shelf prospects")` → provenance |

Agents that orient before querying plan better and iterate less.

### 8.5 Access Gating

`@fyi` shows what the agent already has access to. It doesn't grant new access.

- `@fyi.files` — always available (agent's own workspace)
- `@fyi.shelf` — gated by `shelf` config (which keys are visible)
- `@fyi.stores` — gated by `tools` config (metadata only for stores the agent has tool access to)
- `@fyi.inspect` — works on anything the agent can already see
- `@fyi.run` — always available
- `@fyi.context` — opt-in domain context wired in box `fyi` config

### 8.6 MCP Tool Exposure

`fyi` is exposed to agents as a single MCP tool. First token routes:

```
fyi()                                → overview of everything
fyi("files")                         → workspace file listing
fyi("files /src")                    → subdirectory listing
fyi("shelf")                         → shelf keys and metadata
fyi("shelf prospects")               → specific shelf value metadata
fyi("stores")                        → accessible store metadata
fyi("stores contacts")               → contacts store field names, counts, samples
fyi("inspect /src/index.js")         → file provenance
fyi("inspect contacts key:d_123")    → record provenance
fyi("inspect shelf prospects")       → shelf value provenance
fyi("context")                       → user-wired domain context
fyi("run")                           → current run info
```

One tool, descriptive queries. Agents discover the surface by calling `fyi()` with no args.

### 8.7 Optional Model Upgrade (`fyi.ask`)

The structured `fyi` tool is the default — deterministic, free, no model call. For natural language queries that span multiple sections, `fyi.ask` optionally wires in a model:

```mlld
box @analyst with {
  fyi: {
    context: @analystContext,
    stores: [@crm],
    ask: @claude({ model: "haiku" })
  }
} [...]
```

When wired, the agent gets `fyi.ask("which contacts have open deals over $50k?")`. The haiku model has the raw fyi tools internally, composes multi-step lookups. The structured `fyi` tool remains available for direct access. Cost is explicit — the user chose to put a model there.

---

## 9. Future: Shelf — Inter-Agent Communication

Shelf remains the intended inter-agent communication primitive, but it should land after the provenance and handle core.

The shelf is a shared key-value surface for passing data between agents. Write via `@shelve()` (an exe — taint-tracked, auditable). Read via `@fyi.shelf` (ambient context).

### 9.1 Writing

`@shelve(key, value)` puts a named value on the shelf. It's an exe — goes through the security pipeline, produces `toolCall` audit events, carries taint.

```
Analyst calls: shelve("topProspects", [{ name: "Mark", score: 92 }, ...])
Analyst calls: shelve("scoringNotes", "Weighted by deal value and recency")
```

Agent-defined values carry `src:agent` taint, no fact labels. A compromised agent shelving `evil@attacker.com` gains nothing — no fact label, `no-send-to-unknown` blocks it.

`@shelve()` is also useful outside inter-agent communication — accumulating results in loops, building up state incrementally:

```mlld
for @url in @urls [
  var @result = @fetch(@url)
  @shelve(@url, @result)
]
show @mx.shelf
```

### 9.2 Reading

`@fyi.shelf` provides ambient read access:

```
Outreach calls: fyi("shelf")
→ { keys: ["topProspects", "scoringNotes"], writers: ["agent:analyst"] }

Outreach calls: fyi("shelf topProspects")
→ { count: 5, fields: ["name", "deal_id", "score", "email"], sample: [{ name: "Mark", score: 92 }] }
```

Or direct field access in orchestration code:

```mlld
show @fyi.shelf.topProspects
show @fyi.shelf.topProspects.mx.taint    // ["src:agent"]
```

### 9.3 Agent Eval

Agents with access to `mlld.eval()` (or `mlld -e`) can write mlld code that runs against shelf values and store data without the data entering context:

```
Agent has @fyi.shelf.prospects (10,000 records).
Agent writes: mlld.eval('var @top = @fyi.shelf.prospects | filter { .score > 80 } | sort .score desc | take 10; show @top')
```

The runtime processes 10,000 records. 10 come back. Taint survives. Policy applies. Records stay typed. The agent wrote code against data it can't see — the RLM pattern landing natively in mlld.

**Security constraint:** `mlld.eval()` cannot define new `record` directives. Records are orchestrator-level declarations. Eval can use existing records (`@data => contact` where `@contact` was defined by the orchestrator) but can't create new ones. This prevents agents from minting custom fact definitions.

### 9.4 Shelf Access Control

Box config gates shelf visibility:

```mlld
box @analyst with {
  tools: [@crm.deals.*],
  shelf: {
    write: [prospects, scores],
    read: [@openDeals as deals, @targetCompanies as companies]
  }
} [...]
```

- `write: [key]` — grants `@shelve(key, value)` for listed keys. Implies `@shelve` tool is provided.
- `read: [key]` — grants `@fyi.shelf.key` visibility for listed keys.
- `read: [@var as key]` — wires an orchestrator variable onto the shelf with a name the agent sees. Same `as` remapping pattern as records.
- No `shelf.write` → no `@shelve` tool provided.
- `shelf: *` — full read/write access to all keys.

### 9.5 Scope and Maturity

**Shelf as key-value store** — still the intended design, but not part of phase 1. `@shelve(key, value)` writes, `@fyi.shelf.key` reads, and box config gates access once shelf lands.

### 9.6 Future: Agent-Defined Exes, Templates, and Dynamic Callables

The following capabilities build on the shelf KV foundation but have open security questions. They are experimental and do not ship in the initial shelf release.

**Agent-defined exes:** An agent could define a function via eval that other agents call:

```
Analyst: mlld.eval('exe @scoreProspect(p) = js { return p.revenue * 0.4 + p.engagement * 0.6 }')
Outreach: calls scoreProspect(record) as a tool
```

**Agent-defined templates:** An agent could create uninterpolated templates that other agents evaluate in their own context, with signing/verification for integrity.

**Open questions:**

1. **Dynamic tool access.** Agent A defines an exe via eval. Agent B calls it. Permission model TBD.
2. **Eval scoping.** What's in scope during `mlld.eval()`? Probably same scope as the box — same stores, tools, policy.
3. **Template mechanics.** How does the receiving agent evaluate a shelf template? Does it auto-sign on creation?
4. **Shelf lifecycle.** Ephemeral per-orchestration by default. Persistent option TBD.
5. **Fact laundering via eval.** Even with existing records, `mlld.eval()` applying `=> record` to untrusted data produces record-addressed facts. Store-addressed policy rules prevent these from being authorization-grade, but the interaction needs hardening.

---

## 10. Future: Storage Architecture

### 10.1 Event Log

`.llm/store/events.jsonl` — append-only. Source of truth. Every record observation, fact assignment, file write with taint. Tagged by run UUID. Never clobbered.

```jsonl
{"event":"run_start","run":"run_def","ts":"...","context":{"previous":"run_abc","script":"llm/run/outreach/main.mld"}}
{"event":"record_seen","run":"run_def","ts":"...","store":"contacts","id":"hash:sha256:a3f8","exe":"searchContacts","fields":{...},"facts":["fact:external:@contacts.email"],"sig":"..."}
```

### 10.2 State Snapshot

`.llm/store/state.json` — materialized current state. Fast reads at startup. Updated incrementally. Rebuildable from the event log.

Contains current taint per file, current fact labels per record, last-seen run per entity. The state snapshot always reflects the latest state across all runs — file taint from a month ago is there.

### 10.3 Run Identity

Every `mlld` invocation gets a UUID. The `run_start` event records the UUID and a `context` with breadcrumbs:

- `previous` — last run of this script (read from state snapshot)
- `script` — which script is running
- `orchestration` — parent orchestrator UUID (for multi-box flows)
- `depends_on` — prior box in the chain

Forks and lineage tracking are future work. The `context` breadcrumbs give them a place to land.

### 10.4 Signing

Records are signed using the sig library. sig uses JCS (RFC 8785) for canonical serialization — deterministic key ordering, unicode normalization, consistent number formatting across languages.

The signature proves: what was written, by which exe, when, and that the record hasn't been tampered with. Signer is `system:runtime`. Writer is the exe name.

Canonical structured signing and the signed event envelope are implemented in the sig library (cross-language, cross-project), consumed by mlld.

---

## 11. Future: Project Structure

All runtime state lives under `.llm/`:

```
.llm/
  sig/                    # signatures (managed by sig library)
  store/
    events.jsonl          # append-only event log
    state.json            # materialized current state
  audit/                  # security audit log
  cache/                  # module cache
```

`.llm/` is gitignored (runtime state). `llm/` is committed (source code — scripts, prompts, configs). Same pattern as `.git/` vs repo contents.

Migration tool ships with the version that makes this change — detects `.sig/` or `.mlld/`, explains the reorganization, confirms, moves files.

---

## 12. Design Principles

### Records mint provenance
Records shape data, classify facts vs data, and attach schema/provenance metadata. They are the foundation of the live trust model.

### Display projections control disclosure
Records declare what agents see via `display`. Fact fields can be bare (visible), masked (preview), or handle-only (opaque reference). The agent can't copy what it can't see.

### Handles preserve provenance across LLM boundaries
Handles are embedded in display-projected tool results for masked and handle-only fields. The agent uses handles to reference values it can't see directly. The runtime resolves handles to live values with provenance at authorization and dispatch time.

### The boundary is Postel's Law
The runtime is conservative in what it emits (safe projections) and liberal in what it accepts (handles, masked previews, bare literals). Boundary input canonicalization resolves any emitted form back to the live value. Display modes control what's emitted; the acceptance surface follows from what was emitted. Ambiguity fails closed with handle guidance.

### Stores are dumb plumbing
The store maps names to exes. It doesn't know backends, doesn't interpret SQL, doesn't enforce schemas. Modules and exes bring the backend knowledge.

### Records describe their own trust
The `when` clause converts field values to label segments. `internal: true` becomes `fact:internal:` on the record's facts. The data describes its own trust characteristics — no external guard or mapping step needed for the common case.

### Facts are labels
No new enforcement mechanism. `fact:` labels flow through the existing taint/label/policy/guard pipeline. Everything that works with labels works with facts immediately.

### Exes are the first trust boundary
Every data source interaction is an exe call. In phase 1, exes are where `=> record` first lands, so they are the first place mlld parses, validates, labels, and exposes schema results on live values.

### Separation of concerns
Building the agent, analyzing threats, and securing it are separate activities. Security primitives (records, policies, guards, facts) are declarative overlays on orchestration code, not interleaved with it. Each layer is independently writable, auditable, and replaceable. See `spec-security-philosophy.md`.
