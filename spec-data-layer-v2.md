# Spec: Data Layer v2

## Status

Design spec based on decisions D1–D29. Supersedes v1. Merges the earlier fyi spec (agent environment awareness).

---

## 1. Core Thesis

mlld needs a durable data layer. The design has three primitives:

- **`record`** — declares the shape of data: typed fields, facts vs data classification, field remapping, conditional trust, and LLM output parsing
- **`exe`** — talks to a backend and references a record via `=> type`
- **`store`** — maps named operations to exes, providing a namespaced API over data sources

`=> record` is a universal coercion operator. Anywhere a value is produced — exe, var, when, for, if, pipeline — applying a record parses, coerces, validates, and labels it. Records are both the target type and the trust classifier.

On top of these, `fact:` labels flow through the existing taint/label system to enable field-level authorization. No new enforcement mechanism — facts are labels.

---

## 2. Records

A `record` is a first-class directive that declares:

- **Typed fields** — `string`, `number`, `boolean`, with `?` for optional
- Which fields are **facts** (authoritative — the source vouches for them)
- Which fields are **data** (content — useful but not trustworthy for action)
- **Field remapping** from API field names to clean names
- **Computed fields** combining multiple input fields
- **Conditional trust** via `when` — the record's own data describes its trust characteristics
- **Optional dedup key** for entity identity
- **Validation behavior** — what happens when data doesn't match the schema

```mlld
record @contact = {
  facts: [email: string, name: string, phone: string?, @input.organization as org: string?],
  data: [notes: string?, bio: string?],
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

A contact with `internal: true` → all facts get `fact:internal:@contacts.email`, `fact:internal:@contacts.name`, etc.

A contact with `internal: false` → all facts get `fact:external:@contacts.email`, etc.

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

### 2.6 LLM Output Parsing

When `=> record` is applied to a value, the runtime handles messy LLM output automatically:

1. **Strip prose** — extracts structured data from markdown fences, "Here's the JSON:" preambles, leading/trailing text
2. **Parse** — JSON or YAML
3. **Coerce** — `"42"` → `42` for number fields, `"true"` → `true` for booleans, trims whitespace on strings
4. **Validate** — required fields present, types match (after coercion)
5. **Label** — applies facts/data classification and `when` clause

This is `@parse.llm` baked into the record. No explicit parsing step needed — the record knows it might be receiving LLM output and handles the messiness.

### 2.7 `=> record` as Universal Coercion

`=> record` works anywhere a value is produced. It's not exe-specific — it's a general-purpose operator for "parse, coerce, validate, and label this value according to the record definition":

```mlld
// exe output
exe @claudeTask(prompt) = @claude(@prompt, @config) => task

// var assignment
var @result = @claude(@prompt) => task

// when branch
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

The `as` keyword is an alternative syntax: `@value as task` is equivalent to `@value => task`.

`=> record` produces fact labels everywhere — not just inside stores. When the exe is mapped to a store, the label uses the store name (`fact:@contacts.email`) — this is the authorization-grade label. When used standalone, the label uses the record name (`fact:@contact.email`) — useful for typing but weaker provenance. Authorization policies should reference store-addressed facts for security-critical checks.

### 2.8 Record Identity

Every record gets a prefixed ID:

| Record has | ID source | Format | Dedup behavior |
|------------|-----------|--------|----------------|
| `key: id` | User-declared field value | `key:{value}` | Same key = same entity |
| Facts but no key | Content hash of facts | `hash:sha256:{hash}` | Same facts = same entity |
| Only data | Generated UUID | `uuid:{uuid}` | Every write is unique |

The prefix makes the identity strategy unambiguous. Data-only changes (updated `notes` with unchanged facts) don't create a new entity — they update the existing record in the state snapshot.

**Recommendation:** Use `key` for any entity with natural identity that might change over time (contacts, deals, files). Hash-based dedup means any fact change creates a new entity — the old record stays in the store with stale values. For entities without natural keys (search results, logs), hash or UUID dedup is fine.

---

## 3. Exes

Exes talk to backends. The `=> type` annotation attaches a record's rules to the exe's output:

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
4. **Validate** — schema check. `validate: "demote"` → all fields become data. `validate: "strict"` → error.
5. **When** — conditional classification. May demote to all-data via `=> data` branch.
6. **ID** — `key:{value}` if declared, `hash:sha256:{facts}` if facts survived steps 4-5, `uuid:{uuid}` if all-data
7. **Label** — assign `fact:` labels to surviving fact fields
8. **Sign** — JCS canonical serialization + signature
9. **Append** — event to log, update state snapshot

Validation and `when` both come before labeling and ID. If either demotes the record to all-data, no fact labels are assigned and ID falls through from hash to UUID. This auto-ingestion is an orchestrator-owned privileged write — a runtime side effect, not an agent action. The agent called the exe; the runtime recorded the observation.

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

## 4. Stores

A store maps named operations to exes. It's dumb plumbing — a namespaced API over data sources.

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

### 4.5 Persistence

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
fact:@contact.email                        // record name — standalone use
fact:internal:@contact.email               // with when qualifier
fact:internal:@contacts.email              // store name — when exe is mapped to a store
fact:customer:@crm.contacts.email          // nested store path
fact:verified:staff:@contacts.email        // multiple user-defined segments
```

The terminal `@name.field` identifies the source. When the exe is mapped to a store, the store name is used (e.g., `@contacts`). When used standalone (`var @result = @data => contact`), the record name is used (e.g., `@contact`). These are **different namespaces intentionally**:

- `fact:internal:@contacts.email` — store-addressed. Data went through the `@contacts` store via auto-ingestion. **Authorization-grade.**
- `fact:internal:@contact.email` — record-addressed. The `@contact` record was applied standalone. Useful for typing and validation, but carries weaker provenance.

Authorization policies should reference store-addressed facts when the trust decision depends on the data having come from a specific source. A policy matching `fact:@contacts.email` will NOT match record-addressed `fact:@contact.email` — and that's the correct behavior.

This prevents laundering: an agent using `mlld.eval()` to apply `=> contact` to untrusted data produces record-addressed facts that don't satisfy store-addressed policy rules.

Middle segments are opaque — mlld propagates them but assigns no built-in meaning. Users build their own trust-tier conventions via record `when` clauses and guards.

### 5.2.1 Future: Fact Source Handles (Needs More Design)

The label format above captures **fact provenance class**: “this value descends from an authoritative `email` field on `@contact`” or, later, on `@contacts`. That is enough for many first-release policy checks.

A more robust lineage layer may also expose normalized fact-source handles on metadata, for example:

- `@value.mx.factsources` — raw set of normalized source handles
- possibly later `@value.mx.samesource(@other)` — sugar for “do these values share at least one fact source?”

The purpose of this layer is not exact-string rebinding. It is stronger and more structural: values can preserve their source identity because they carry provenance from the originating fact field, even after field access and ordinary transformations.

Likely handle components include some subset of:

- record name
- optional store name
- optional entity id or key
- field name
- canonical `source_ref`

This area needs more design before it should be treated as stable surface area. In particular:

- when a transformed value still counts as “the same source”
- when provenance must be dropped and the value becomes a bare string again
- whether first release should expose only raw `mx.factsources` or also ship a helper like `mx.samesource(@other)`
- how store/entity identity composes with record-addressed facts

For now, the core model remains: `fact:` labels carry authorization-relevant provenance class, and future fact-source handles can strengthen integrity checks without reverting to exact-value registry semantics.

### 5.3 Facts and Taint Are Independent

A value can carry BOTH `src:mcp` taint AND `fact:internal:@contacts.email`. These answer different questions:

- `src:mcp` = where did this data come from?
- `fact:internal:@contacts.email` = is this field authoritative, and what trust tier?

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
      allow: ["send_email(fact:internal:@contacts.email)"]
    }
  }
}

// Desugars to:
allow: [{ op: "send_email", when: ["fact:internal:@contacts.email"] }]

// Structured form available for complex cases:
allow: [{ op: "send_email", when: ["fact:internal:@contacts.email"], when_not: ["src:web"] }]
```

### 5.5 Guard Integration

Guards can inspect fact labels for surgical decisions:

```mlld
guard @internalOnlySecrets before @email.send = when [
  @input.any.mx.labels.includes("secret")
    && @mx.args.to.mx.labels.includes("fact:internal:@contacts.email") => allow
  @input.any.mx.labels.includes("secret") => deny "Secret content can only be sent to internal contacts"
  * => allow
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

## 6. Box Integration

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

**Fyi:** Controls agent environment awareness. `context` wires in domain-specific reference material. `stores` controls which stores the agent sees metadata for. Files and shelf visibility derive from other box config.

### Observation vs Mutation

Store interactions produce two kinds of state change:

- **Observation** — when an exe returns, the runtime indexes what was returned. This updates the event log and state snapshot (metadata sidecar). It's runtime bookkeeping, not an agent action. Not gated by box tool permissions. `find` and `get` trigger observations.
- **Mutation** — the agent explicitly writes data via `put` or `@shelve`. This is a user-visible write. Gated by box tool permissions.

Both affect state. The difference is who initiated it and whether permissions apply. Auto-ingestion is an observation — an orchestrator-owned privileged write to the metadata sidecar. The orchestrator configured the store mapping; the agent just called the tool.

---

## 7. `@fyi` — Agent Environment Awareness

`@fyi` is the unified read surface for everything an agent knows about its environment. It merges file awareness, shelf contents, store metadata, and provenance inspection into one introspection surface.

`@fyi` separates from `@mx`: `@mx` = metadata about the current **operation** (taint, labels, guard context). `@fyi` = awareness of the **environment** (files, shelf, stores, provenance, context).

### 7.1 Sections

| Section | What it shows |
|---------|--------------|
| `@fyi.files` | Workspace files with descriptions, taint counts |
| `@fyi.shelf` | Shared values from agents/orchestrator |
| `@fyi.stores` | Store metadata — record types, counts, field names |
| `@fyi.run` | Current run UUID, previous run, script path |
| `@fyi.context` | User-wired domain context (help, docs, conventions) |

### 7.2 `@fyi.inspect()` — Unified Provenance

Deep provenance for any artifact type:

```
@fyi.inspect("/src/index.js")              → file: origin, taint chain, edit history
@fyi.inspect(@contacts, "key:d_123")       → record: writer, facts, when result, signature
@fyi.inspect(@fyi.shelf.prospects)         → shelf value: who wrote it, taint, timestamp
```

One inspection surface across files, records, and shelf values. Different details, same shape.

### 7.3 File Awareness

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

### 7.4 Progressive Disclosure

The same three-level pattern across all sections:

| Level | Files | Stores | Shelf |
|-------|-------|--------|-------|
| 0 — orient | `fyi("files")` → names, descriptions, taint counts | `fyi("stores")` → types, fields, counts | `fyi("shelf")` → keys, types, sizes |
| 1 — query | read file | `contacts.find(query)` → records | `@fyi.shelf.key` → value |
| 2 — detail | `fyi("inspect /src/index.js")` → provenance | `contacts.get(id)` → full record | `fyi("inspect shelf prospects")` → provenance |

Agents that orient before querying plan better and iterate less.

### 7.5 Access Gating

`@fyi` shows what the agent already has access to. It doesn't grant new access.

- `@fyi.files` — always available (agent's own workspace)
- `@fyi.shelf` — gated by `shelf` config (which keys are visible)
- `@fyi.stores` — gated by `tools` config (metadata only for stores the agent has tool access to)
- `@fyi.inspect` — works on anything the agent can already see
- `@fyi.run` — always available
- `@fyi.context` — opt-in domain context wired in box `fyi` config

### 7.6 MCP Tool Exposure

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

### 7.7 Optional Model Upgrade (`fyi.ask`)

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

## 8. Shelf — Inter-Agent Communication

The shelf is a shared key-value surface for passing data between agents. Write via `@shelve()` (an exe — taint-tracked, auditable). Read via `@fyi.shelf` (ambient context).

### 8.1 Writing

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

### 8.2 Reading

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

### 8.3 Agent Eval

Agents with access to `mlld.eval()` (or `mlld -e`) can write mlld code that runs against shelf values and store data without the data entering context:

```
Agent has @fyi.shelf.prospects (10,000 records).
Agent writes: mlld.eval('var @top = @fyi.shelf.prospects | filter { .score > 80 } | sort .score desc | take 10; show @top')
```

The runtime processes 10,000 records. 10 come back. Taint survives. Policy applies. Records stay typed. The agent wrote code against data it can't see — the RLM pattern landing natively in mlld.

**Security constraint:** `mlld.eval()` cannot define new `record` directives. Records are orchestrator-level declarations. Eval can use existing records (`@data => contact` where `@contact` was defined by the orchestrator) but can't create new ones. This prevents agents from minting custom fact definitions.

### 8.4 Shelf Access Control

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

### 8.5 Scope and Maturity

**Shelf as key-value store** — settled. `@shelve(key, value)` writes, `@fyi.shelf.key` reads, box config gates access. Ships with the data layer.

### 8.6 Future: Agent-Defined Exes, Templates, and Dynamic Callables

The following capabilities build on the shelf KV foundation but have open security questions. They are experimental and do not ship in v0.

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

## 8. Storage Architecture

### 8.1 Event Log

`.llm/store/events.jsonl` — append-only. Source of truth. Every record observation, fact assignment, file write with taint. Tagged by run UUID. Never clobbered.

```jsonl
{"event":"run_start","run":"run_def","ts":"...","context":{"previous":"run_abc","script":"llm/run/outreach/main.mld"}}
{"event":"record_seen","run":"run_def","ts":"...","store":"contacts","id":"hash:sha256:a3f8","exe":"searchContacts","fields":{...},"facts":["fact:external:@contacts.email"],"sig":"..."}
```

### 8.2 State Snapshot

`.llm/store/state.json` — materialized current state. Fast reads at startup. Updated incrementally. Rebuildable from the event log.

Contains current taint per file, current fact labels per record, last-seen run per entity. The state snapshot always reflects the latest state across all runs — file taint from a month ago is there.

### 8.3 Run Identity

Every `mlld` invocation gets a UUID. The `run_start` event records the UUID and a `context` with breadcrumbs:

- `previous` — last run of this script (read from state snapshot)
- `script` — which script is running
- `orchestration` — parent orchestrator UUID (for multi-box flows)
- `depends_on` — prior box in the chain

Forks and lineage tracking are future work. The `context` breadcrumbs give them a place to land.

### 8.4 Signing

Records are signed using the sig library. sig uses JCS (RFC 8785) for canonical serialization — deterministic key ordering, unicode normalization, consistent number formatting across languages.

The signature proves: what was written, by which exe, when, and that the record hasn't been tampered with. Signer is `system:runtime`. Writer is the exe name.

Canonical structured signing and the signed event envelope are implemented in the sig library (cross-language, cross-project), consumed by mlld.

---

## 9. Project Structure

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

## 10. Design Principles

### Stores are dumb plumbing
The store maps names to exes. It doesn't know backends, doesn't interpret SQL, doesn't enforce schemas. Modules and exes bring the backend knowledge.

### Records describe their own trust
The `when` clause converts field values to label segments. `internal: true` becomes `fact:internal:` on the record's facts. The data describes its own trust characteristics — no external guard or mapping step needed for the common case.

### Facts are labels
No new enforcement mechanism. `fact:` labels flow through the existing taint/label/policy/guard pipeline. Everything that works with labels works with facts immediately.

### Exes are the universal boundary
Every data source interaction is an exe call. Exes are guardable, auditable, labelable, tool-gateway-compatible. This is how heterogeneous backends (APIs, databases, CLIs, SDKs, MCP tools) get unified into one security model.

### Separation of concerns
Building the agent, analyzing threats, and securing it are separate activities. Security primitives (records, policies, guards, facts) are declarative overlays on orchestration code, not interleaved with it. Each layer is independently writable, auditable, and replaceable. See `spec-security-philosophy.md`.
