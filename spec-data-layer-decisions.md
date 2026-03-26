# Data Layer Decisions

Decisions made while working through spec-data-layer.md. These feed back into the spec as amendments.

---

## Decided

### D1. Unified .llm/ project metadata directory
`.sig/` and `.mlld/` consolidate into `.llm/`. Subdirs: `.llm/sig/`, `.llm/audit/`, `.llm/store/`, `.llm/cache/`, etc. `.llm/sig/` becomes the standard path in the sig library itself. One-time migration tool ships with the version that makes this change.

### D2. sig canonical structured signing is upstream work
Canonical structured signing (spec Section 8.4) and the signed event envelope (Section 8.5) must be implemented in the sig library, not in mlld's sig-adapter. sig is cross-language/cross-project. This work happens first as its own spec/PR.

### D3. "Tools as exes" replaces "tools as resolvers"
Spec Section 12 rewritten. The architecture is: `backend → exe → store → query`. Exes are the adaptation boundary (guardable, labelable, auditable). Stores accumulate outputs. No data store traffic through the existing resolver interface. The concept is: heterogeneous data sources surfaced through exes into a unified store — like Gatsby source plugins into a unified query layer.

### D4. Stores are box resources, accessed via tool permissions
Stores have their own identity and lifecycle. Store operations are exes, so box access control uses the tools list — no separate `stores` config needed. Granular access via operation names:

```mlld
box @agent with {
  tools: [
    @contacts.[find, get],     // read-only access to contacts
    @memory.*,                 // full access to memory
    @searchContacts            // direct exe access
  ]
} [...]
```

Read/write distinction falls out of which operations you allow. `@contacts.find` + `@contacts.get` = read. Add `@contacts.put` = write. `@contacts.*` = full access. Follows existing attenuation pattern: parent declares, child can't widen.

### D5. JSONL + in-memory index for v0 storage
Starting implementation: append-only JSONL file per store, in-memory index for queries. Matches existing AuditLogger/AuditLogIndex patterns. SQLite or other backends are future options.

### D6. Stores are schema-less; records bring the knowledge
The store is dumb plumbing. Record primitives define shape, field classification, remapping, and conditional trust. Stores just map operations to exes. See D11.

### D7. Tool classification extends exe metadata
Field-level security metadata (control args, fact output fields) attaches to exe declarations. This extends existing operation-level labels (`destructive`, `net:w`) to field granularity. Classification metadata flows through the same taint/provenance system as labels. See `todo-tool-classes.md` for full research and prior art.

### D8. Store directive and operation model
A store is a first-class directive that maps named operations to user-defined exes. Stores can have nested sub-stores for multi-type APIs:

```mlld
store @contacts = {
  find: @searchContacts,
  get: @getContact,
  put: @addContact,
  favorites: @getFavoriteContacts
}

store @crm = {
  deals: {
    find: @searchDeals,
    get: @getDeal,
    stale: @getStaleDeals
  },
  customers: {
    find: @searchCrmContacts,
    get: @getCrmContact
  }
}
```

`@contacts.find(...)` calls `@searchContacts(...)` through the store. `@crm.deals.stale(50000, 30)` calls `@getStaleDeals(50000, 30)`. Conventional names (`find`, `get`, `put`, `has`) carry semantic meaning to the runtime and agents. Custom names (`stale`, `favorites`) are user-defined views. All operations are exes — guardable, auditable, trackable in `@mx.tools.calls`, exposable to agents via tool gateway.

The store itself has no built-in query operations over its backing JSONL. If you want a local cache query, you write an exe for it and wire it in. The store is dumb plumbing with a convention-based API.

`@store.mx` provides ambient session metadata: records touched, writers, counts, types seen. Read-only context, not a query interface.

### D9. "Promotion" is replaced by `fact:` labels
The spec's "promoted fields" concept is implemented as `fact:` labels flowing through the existing label/taint system. No new enforcement mechanism needed.

**What a fact is:** A value the source is authoritative for and vouches for as trustworthy. Something falsifiable or verifiable that we're asserting is reliable. Contact email = fact. Contact bio = not a fact. System-generated file ID = fact. User-written file content = not a fact.

**Label format:** `fact:` prefix + zero or more user-defined segments + terminal `@store.field`:

```
fact:@contacts.email                    // bare fact
fact:internal:@contacts.email           // qualified by record-level when
fact:enterprise:@crm.customers.email    // qualified by field value
fact:staff:@issues.title                // user convention
```

The runtime parses the terminal `@store.field`. Middle segments are opaque — mlld propagates them but assigns no built-in meaning. Users build their own trust-tier conventions.

**Policy integration:** Policy rules can condition allow/deny on fact labels. Fact labels can create exceptions to taint restrictions:

```mlld
policy @p = {
  labels: {
    "secret": {
      deny: ["op:cmd:*"],
      allow: ["send_email(fact:internal:@contacts.email)"]
    }
  }
}
```

The `(fact:internal:@contacts.email)` condition on an allow rule means: "this taint restriction is lifted when the value carries this fact label." Specific allow overrides general deny.

### D10. Facts and taint are independent, composable dimensions
A value can carry BOTH `src:mcp` taint AND `fact:@contacts.email`. These answer different questions:

- `src:mcp` = where did this data come from?
- `fact:@contacts.email` = is this field authoritative?

They don't conflict. At enforcement time:
1. Label flow checks taint rules (can this data reach this operation?)
2. Fact conditions on allow rules can create exceptions (this specific fact overrides this taint restriction)
3. Guards can inspect both for surgical decisions

Facts do NOT strip or override taint. Taint is never removed. Facts create policy exceptions — an allow rule conditioned on a fact label permits data through a deny that would otherwise block it. The taint remains visible for audit and inspection.

### D11. `record` primitive for shape, labeling, and remapping
A `record` is a new first-class primitive that declares the shape of data coming from an exe, including which fields are facts vs data, field remapping, computed fields, and conditional trust qualification.

```mlld
record @deal = {
  facts: [id, @input.company_name as company, stage, amount, close_date, owner,
          { name: `@input.customer_first_name @input.customer_last_name` }],
  data: [description, notes],
  when [
    owner == "Adam" => :mydeal
  ]
}

record @contact = {
  facts: [email, name, phone],
  data: [notes, bio],
  when [
    internal => :internal
    * => :external
  ]
}

record @issue = {
  facts: [number, title, state, labels],
  data: [body],
  when [
    author in @staffList => :staff
    author in @maintainers => :maintainer
    * => data
  ]
}
```

**Key features:**

- **`facts: [...]` and `data: [...]`** — field-level trust classification. Every field is either authoritative (fact) or content (data).
- **`@input.field_name as alias`** — field remapping. API returns `company_name`, record calls it `company`.
- **`{ alias: template }`** — computed fields. Combine multiple input fields into one record field using template interpolation.
- **Record-level `when`** — conditionally qualifies ALL facts on the record based on field values. Booleans test truthiness by field name. Strings/enums match values. The matched value (`:internal`, `:staff`, etc.) becomes a segment in the fact label. The field referenced in the `when` condition is a field ON the record — the record's own data is converted into label metadata. `internal: true` on the record becomes `fact:internal:` on its facts. The data describes its own trust characteristics.
- **`=> data` demotion** — a `when` branch can demote ALL fields to data, stripping fact status entirely. "Community-authored issues are useful content but not authoritative for anything."

**Exe references record:**

```mlld
exe @searchContacts(query) = run cmd { contacts-api search @query } => contact
exe @getContact(id) = run cmd { contacts-api get @id } => contact
```

The `=> contact` says "my output is a `contact` record — apply its labeling and remapping rules." Multiple exes share the same record definition. Labeling declared once.

**Three primitives, clean separation:**
- `record` = shape + labeling rules + remapping + conditional trust
- `exe` = implementation + which record it produces
- `store` = API namespace + operations

---

## In Progress

### Auto-ingestion behavior
When a store-mapped exe returns, the runtime auto-ingests the result as a signed record. This is a runtime side effect, not an agent action. Auto-ingestion from `@searchContacts` into `@contacts` happens regardless of box tool permissions — the orchestrator configured it, the agent just called the exe. Detail implementation TBD.

### Store record as StructuredValue
Query results should be StructuredValues: `.data` = record fields, `.mx` carries fact labels, writer, scope, signature metadata. Existing field access, `for` iteration, and `.mx` inspection all work. Detail mapping TBD.

### Narrative update
`spec-data-layer-narrative.md` needs rewrite to incorporate: multi-type stores, `record` primitive, HTTP/Node SDK exe examples, field remapping, `facts`/`data` split, email subject as attack vector. In progress.

### Workspace open questions
1. Dynamic tool access — `@workspace.*` as blanket grant vs granular control for agent-defined exes
2. Eval scoping — what's in scope during `mlld.eval()`? Probably "same as the box"
3. Template mechanics — how receiving agent evaluates a workspace template, auto-signing
4. Workspace lifecycle — per-orchestration? Explicit? Persistent?

---

## Decided (continued)

### D12. Progressive disclosure convention for store operations
Store operations should support progressive disclosure. Conventional operation names:

| Name | Level | Returns |
|------|-------|---------|
| `schema` | 0 — orientation | Record types, field names, counts, samples |
| `find` | 1 — query | Matching records |
| `get` | 2 — detail | Single record, full fields |
| `preview` | 0 — workspace | Metadata for a named value |

These are conventions, not built-ins. The user wires exes that implement each level. Agents and tooling can rely on the semantic meaning. RLM benchmarks show schema-first agents average 2.8 iterations vs 6.1 for blind exploration — `schema` is a capability multiplier.

Two audiences: agents call `contacts.schema()` as a tool; orchestrators read `@contacts.mx` as ambient metadata.

### D13. Workspace: inter-agent symbolic communication
Agents can define named values, exes, and templates in a shared workspace store. Other agents reference them by name. Data lives in mlld's runtime, not in context windows.

The workspace is a store — same patterns, same security model, same box access control:

```mlld
box @analyst with {
  tools: [@crm.[find, get], @workspace.[set, define_exe, template]]
} [...]

box @outreach with {
  tools: [@contacts.[find, get], @email.send, @workspace.*]
} [...]
```

Agent-defined values carry `src:agent` taint, no fact labels. Useful for reasoning and coordination, not authoritative for action. The existing security model handles trust without modification.

### D14. Agent eval: agents as programmers via `mlld.eval()`
Agents with access to `mlld.eval()` (or `mlld -e`) can write mlld code that runs against workspace variables and store data without the data entering the agent's context window. The RLM pattern — LLM writes code against data it can't see — landing natively in mlld.

Key properties:
- Taint survives transformations (filtered contacts keep their fact labels)
- Policy applies (eval runs inside the same security context)
- Records apply (output stays typed with facts/data classification)
- Templates are signable (agent-written instructions can be verified by downstream agents)

Agents can define reusable exes in the workspace that other agents call as tools. The analyst writes the scoring logic; the outreach agent consumes it.

### D18. Classification for MCP tools via `=> type`

`=> record_type` is a universal primitive that works everywhere exes exist:

```mlld
// On an exe definition
exe @searchContacts(query) = run cmd { contacts-cli search @query } => contact

// On an imported MCP tool (post-import annotation)
import tools { @searchContacts } from mcp "google-contacts-server"
exe @searchContacts => contact

// Shorthand on the import line
import tools { @searchContacts => contact } from mcp "google-contacts-server"
```

All three mean the same thing: apply the `@contact` record's rules (facts/data classification, field remapping, `when` clause) to this exe's output. The MCP server author doesn't need to know about mlld's record system — the user attaches classification at import or wiring time.

### D17. Record identity, deduplication, and versioning

Every record in the store has a prefixed ID. The prefix indicates the identity source:

| Record has | ID source | Format | Dedup behavior |
|------------|-----------|--------|----------------|
| `key: id` | User-declared field value | `key:{value}` | Explicit — same key = same entity |
| Facts but no key | Content hash of facts | `hash:sha256:{hash}` | Implicit — same facts = same entity |
| Only data | Generated UUID | `uuid:{uuid}` | None — every write is unique |

```mlld
record @deal = {
  key: id,                        // dedup by key:d_123
  facts: [id, name, stage, amount],
  data: [description]
}

record @contact = {
  facts: [email, name, phone],    // dedup by hash of (email, name, phone)
  data: [notes, bio],
  when [internal => :internal, * => :external]
}

record @note = {
  data: [text, tags, saved_at]    // no dedup — uuid per write
}
```

The prefix makes the identity strategy unambiguous — you always know whether a record was deduped by explicit key, content hash, or is a unique observation.

**Versioning:** The event log is append-only. Multiple observations of the same ID (key or hash) are all preserved in the log. The state snapshot materializes the latest version per ID. History is always available in the event log for audit/replay.

**Data-only changes:** If fact fields are unchanged but data fields differ, the content hash stays the same — the observation updates the data in the state snapshot but doesn't create a new entity. This is correct because data fields aren't authoritative.

### D15. Storage architecture: event log + state snapshot

Two files per project:

- **`.llm/store/events.jsonl`** — append-only event log. Source of truth. Every record seen, fact assigned, file written with taint. Tagged by run UUID. Never clobbered, never overwritten. Multiple scripts append safely.
- **`.llm/store/state.json`** — materialized current state snapshot. Derived from the event log. Fast reads at startup. Updated incrementally. Rebuildable from the event log if corrupted or missing.

Stores are routers to external sources with a metadata sidecar — the JSONL records provenance (what was seen, how it was labeled, signatures), not data. Native stores (agent memory, workspace) are the exception where the JSONL IS the data.

Store behavior:
- Ephemeral by default — in-memory index starts empty each run, populated as exes return data
- `persist: true` loads historical entries from the state snapshot at startup
- Event log always accumulates regardless of persistence setting — audit trail is unconditional
- State snapshot always reflects latest state across all runs — file taint from a month ago is always available

### D16. Run identity and lineage breadcrumbs

Every `mlld` invocation gets a UUID. A `run_start` event is appended:

```jsonl
{"event":"run_start","run":"run_def","ts":"...","context":{"previous":"run_abc","script":"llm/run/outreach/main.mld"}}
```

`previous` read from state snapshot before overwriting. For multi-box orchestrations: orchestrator UUID in `context.orchestration`, box runs get `context.depends_on` linking to prior boxes.

Forks out of scope for v0. The `context` breadcrumbs give future lineage support a place to land without building machinery now.

---

## Deferred

### ~~Store-backed authorization constraints (`in_store`)~~ → Superseded by D9
`in_store` was designed before fact labels existed. Fact labels on values already prove store membership and field authority — no need to query the store at dispatch time. The policy condition syntax (`send_email(fact:internal:@contacts.email)`) covers the same use case more cleanly.

### MCP classification extension
Proposing a standard classification metadata extension for MCP tool definitions. Depends on mlld's classification model being proven internally first.

### ~~Canonical serialization algorithm~~ → D22

### ~~Deduplication strategy~~ → D17

### ~~Record versioning / mutability~~ → D17

### D22. JCS (RFC 8785) for canonical serialization in sig

sig uses JSON Canonicalization Scheme (RFC 8785) as the canonical serialization algorithm for structured record signing. This is part of the sig upstream work (D2) — implemented in the sig library, consumed by mlld. JCS handles deterministic key ordering, unicode normalization, and number formatting across languages. Fast path optimization for simple inputs (ASCII keys, basic types) where naive sort produces identical output.

### D21. `record` is a new directive keyword

`record @contact = { ... }` is a new top-level directive like `store`, `policy`, `guard`. Gives a clear declarative signal — scannable in scripts, better error messages. The `when` clause inside the record body reuses existing `when` syntax but needs grammar/interpreter glue for the record context.

Remaining grammar items (`store` directive, `=> type` on exes, box tool list `@contacts.[find, get]` / `@workspace.*`) are implementation glue — no open design questions.

### D19. Dotted exe invocation — no grammar change needed

`@crm.deals.stale(50000, 30)` already works: chained field access resolves to an exe, then `(args)` calls it. The store declaration produces a nested data structure where leaf values are exe references. Field access naturally finds them. No new grammar rule.

### D20. Policy condition syntax — string shorthand desugars to structured form

String `"send_email(fact:internal:@contacts.email)"` is shorthand. Parser splits on `(` — before is capability pattern, inside parens is label condition. Desugars to structured form internally:

```mlld
// Shorthand (covers 90% of cases)
allow: ["send_email(fact:internal:@contacts.email)"]

// Desugars to
allow: [{ op: "send_email", when: ["fact:internal:@contacts.email"] }]

// Structured form available for complex cases
allow: [{ op: "send_email", when: ["fact:internal:@contacts.email"], when_not: ["src:web"] }]
```

Follows existing mlld pattern where string shorthand desugars to structured form (e.g., pipeline syntax → `with { pipeline: [...] }`).

### ~~Classification delivery for MCP tools~~ → D18

### D23. `@fyi` — unified agent environment awareness

`@fyi` is the read surface for everything an agent knows about its environment. Merges the earlier fyi spec (file awareness, provenance) with store metadata and shelf.

| Section | What it shows |
|---------|--------------|
| `@fyi.files` | Workspace files with descriptions, taint counts |
| `@fyi.shelf` | Shared values from agents/orchestrator |
| `@fyi.stores` | Store metadata — record types, counts, field names |
| `@fyi.run` | Current run UUID, previous run, script path |
| `@fyi.context` | User-wired domain context (help, docs, conventions) |
| `@fyi.inspect(ref)` | Deep provenance for any artifact (file, record, shelf value) |

`@fyi` separates from `@mx`: `@mx` = metadata about the current **operation** (taint, labels, guard context). `@fyi` = awareness of the **environment** (files, shelf, stores, provenance, context).

System fyi (files, stores, run, inspect) is always available in boxes by default — it's read-only metadata about things the agent already has access to. Gated by existing access controls: you only see stores you have tool access to, shelf keys you're granted, files in your workspace.

### D24. `@shelve()` — taint-tracked shelf writes

`@shelve(key, value)` is an exe — goes through the security pipeline, gets taint tracking, auditable. `@fyi.shelf` is the read surface (ambient, field access on `@fyi`). `@mx` is never directly written to; `@shelve()` is the write path.

Agent-defined values carry `src:agent` taint, no fact labels. A compromised agent shelving `@safeEmail = "evil@attacker.com"` gains nothing — no fact label, `no-send-to-unknown` blocks it.

`@shelve()` is also useful outside inter-agent communication — stateful object accumulation, lazy variable collection in loops.

### D25. Shelf access control in boxes

Box config gates shelf visibility with `shelf: { read: [...], write: [...] }`:

```mlld
box @analyst with {
  tools: [@crm.deals.*],
  shelf: {
    write: [prospects, scores],
    read: [@openDeals as deals, @targetCompanies as companies]
  }
} [...]
```

- `write: [key]` — agent can `@shelve(key, value)` for listed keys. Implies `@shelve` tool is provided.
- `read: [key]` — agent can see `@fyi.shelf.key` for listed keys.
- `read: [@var as key]` — orchestrator wires a variable onto the shelf with a name the agent sees. Uses existing `as` remapping pattern.
- No `shelf.write` → no `@shelve` tool provided.
- `shelf: *` — full read/write access to all shelf keys.

### D26. `@fyi` in box config

Boxes own fyi configuration. No fyi injection through LLM provider modules — "if you want fyi, make a box."

```mlld
box @analyst with {
  tools: [@crm.deals.*],
  shelf: { write: [prospects], read: [@openDeals as deals] },
  fyi: {
    context: @analystContext,      // user-wired domain context (help, docs, conventions)
    stores: [@crm],               // which stores show up in fyi
    // files and shelf visibility derived from other box config
  }
} [...]
```

`fyi.context` is opt-in domain context per box. `fyi.stores` controls which stores the agent can see metadata for. Files and shelf derive from the box's existing workspace and shelf config.

### D27. `fyi` tool — structured default, optional model upgrade

**Step 1 (ship):** `fyi` is a structured query tool. First token routes to section. Deterministic, free, no model call.

```
fyi()                          → overview of everything
fyi("files")                   → workspace file listing
fyi("shelf")                   → shelf keys and metadata
fyi("stores")                  → accessible store metadata
fyi("inspect /src/index.js")   → deep provenance
fyi("context")                 → user-wired domain context
fyi("run")                     → current run info
```

**Step 2 (iterate):** Observe where structured routing breaks down with real usage.

**Step 3 (upgrade):** `fyi.ask` optionally wires in a model for natural language queries:

```mlld
box @analyst with {
  fyi: {
    context: @analystContext,
    stores: [@crm],
    ask: @claude({ model: "haiku" })
  }
} [...]
```

When wired, the agent gets `fyi.ask("which contacts have open deals over $50k?")` as an additional tool. The haiku model has the raw fyi tools internally, composes multi-step lookups. The structured `fyi` tool remains available for direct access.

### D28. Record `when` fields are classification inputs, not stored fields

Fields referenced in a record's `when` clause are evaluated from `@input` (the raw exe return) for classification purposes. They are NOT stored in the record unless also listed in `facts` or `data`.

```mlld
record @contact = {
  facts: [email, name, phone],
  data: [notes, bio],
  when [
    internal => :internal      // `internal` read from @input, consumed by classification
    * => :external             // NOT stored in the record — the label captures the information
  ]
}
```

The `internal` boolean becomes the `:internal` label segment on the record's facts. The value is consumed by classification, not persisted as a field. The event log records the `when` evaluation result for auditability.

### D30. Records as typed schemas with validation

Record field declarations support type annotations: `string`, `number`, `boolean`, `string?` (optional). `validate` config controls behavior on failure: `"demote"` (default — ingest with all fields as data), `"strict"` (error), `"drop"` (drop invalid fields). Validation results exposed via `@output.mx.schema.errors` for guard inspection.

### D31. LLM output parsing baked into records

When `=> record` is applied to a value, the runtime auto-parses LLM output: strips prose/fences, parses JSON/YAML, coerces types (`"42"` → `42`, `"true"` → `true`), then validates against the schema. This is `@parse.llm` built into the record — no explicit parsing step needed.

### D32. `=> record` is a universal coercion operator

`=> record` works anywhere a value is produced — exe, var, when, for, if, pipeline. It's not exe-specific. `@value as record` is an alternative syntax. The record is both the target type and the trust classifier. Parsing, coercion, validation, and labeling happen in one step.

### D33. Schema validation guard pattern

Guards can check `@output.mx.schema.errors` and retry with structured feedback:

```mlld
guard after @claudeTask = when [
  @output.mx.schema.errors => retry "Previous answer contained errors: @output.mx.schema.errors"
  * => allow
]
```

Creates a self-correcting loop where the record schema is the contract and the guard enforces it.

### D34. Record pipeline order
1. **Parse** — strip prose/fences, extract JSON/YAML
2. **Coerce** — type conversion (`"42"` → `42`)
3. **Remap** — field name mapping (`@input.dealname as name`)
4. **Validate** — schema check. May demote all fields to data.
5. **When** — conditional classification. May demote all fields to data.
6. **ID** — `key:{value}` if declared, `hash:sha256:{facts}` if facts survived, `uuid:{uuid}` if all-data
7. **Label** — assign `fact:` labels to surviving fact fields
8. **Sign** — JCS canonical serialization + signature
9. **Append** — event to log, update state snapshot

ID comes after validate and when because both can eliminate facts. If demoted to all-data at step 4 or 5, no fact fields to hash — falls through to UUID.

### D35. Fact labels work everywhere, use record name or store name
`=> record` produces fact labels anywhere — exe, var, when, for, pipeline. The label terminal uses the store name when the exe is mapped to a store (`fact:@contacts.email`), record name when standalone (`fact:@contact.email`). Policy matches either. The record author decides what's a fact; the system trusts that declaration regardless of context.

### D36. Observation vs mutation terminology
Store interactions produce two kinds of state change: **observations** (runtime indexes what was returned — not gated by permissions) and **mutations** (agent explicitly writes via put/shelve — gated by permissions). Auto-ingestion is an observation.

### D37. Shelf KV ships, dynamic callables are future work
Shelf as key-value store (`@shelve(key, value)` writes, `@fyi.shelf` reads) ships with the data layer. Agent-defined exes and templates via shelf are experimental — security model for dynamic callables has open questions and is future work.

### D38. Store-addressed vs record-addressed facts
Store-addressed facts (`fact:@contacts.email`) are authorization-grade — data went through a specific store via auto-ingestion. Record-addressed facts (`fact:@contact.email`) are produced by standalone `=> record` application — useful for typing/validation but weaker provenance. Authorization policies should reference store-addressed facts for security-critical checks. This prevents laundering: agent-applied `=> record` on untrusted data produces record-addressed facts that don't satisfy store-addressed policy rules.

### D39. `mlld.eval()` cannot define new records
Records are orchestrator-level declarations. `mlld.eval()` can USE existing records (`@data => contact`) but cannot create new `record` directives. Prevents agents from minting custom fact definitions.

### D29. GPT review fixes (round 2)

Addressing findings from external review:

1. **Auto-ingestion framing** — auto-ingestion is an orchestrator-owned privileged write to the metadata sidecar, not an agent action. The spec should state this explicitly.
2. **Scoping** — stores are ephemeral by default. Store `.mx` and queries reflect current session's index only. The state snapshot persists for file taint and audit, but is not the store query surface. No regression from v1 scoping.
3. **`internal` field** — resolved by D28 (when fields are classification inputs from `@input`).
4. **`@workspace` collision** — resolved by D23/D24 (shelf under `@fyi`, write via `@shelve()`).
5. **Hash instability** — acceptable tradeoff. Recommend `key` for entities with natural identity. Hash dedup is the safety net for keyless records.
