# Spec: Signed Promoted Store

## Status

Conceptual design memo. This is a product-shape exploration, not an implementation plan.

This document rewrites the earlier design in a simpler form:

- one store
- signed records
- scoped queries
- promotion-marked authoritative fields
- tools as resolvers

The intent is to find the smallest design that can serve:

- authority / authorization
- agent memory
- graph-like retrieval
- provenance and auditability

without pushing all of that complexity into policy rules or taint over raw strings.

---

## 1. Core Thesis

mlld likely needs a durable data layer, but it does not need a giant graph platform or a new full-blown database model.

The smallest design I currently believe in is:

**A signed store of records. Tools populate it automatically. Promotion rules mark which fields are admissible for authorization. Policies query the store at dispatch time. Agent memory uses the same store but remains untrusted.**

That gives one substrate for:

- trusted data reuse
- runtime-generated values
- memory
- provenance
- structured retrieval

---

## 2. Why This Exists

Today, many hard agent-security problems reduce to this bad pattern:

- an LLM emits a raw string like `"mark@example.com"` or `"26"`
- the runtime has to decide whether that string is safe

This is brittle.

The alternative is:

- store durable records for useful values
- sign those records for provenance
- mark only specific fields as authoritative
- let policy check the store instead of trusting raw literals

This also helps memory and retrieval:

- the agent can query structured state instead of re-parsing long tool output
- the same system can hold notes, observations, contacts, files, and relationships

---

## 3. Design Goals

1. Support action authorization without depending on taint surviving arbitrary LLM mediation.
2. Support runtime-generated values like created file IDs.
3. Support agent memory in the same substrate.
4. Support graph-like retrieval without requiring a heavy graph query language in v0.
5. Reuse `sig` rather than inventing a second provenance system.
6. Keep the user-facing model small.

## 4. Non-Goals

- Not a general-purpose database.
- Not a full graph product in v0.
- Not a requirement that tools immediately switch to opaque refs.
- Not a replacement for policy. This changes what policy operates on.

---

## 5. The Model

The design has four practical pieces:

1. Signed record log
2. Materialized store
3. Scoped queries
4. Promotion rules

### 5.1 Signed Record Log

Every store write becomes a signed event.

This should build on existing `sig` infrastructure:

- content signing
- verification
- signer identity
- audit trail
- persistence across restarts

Conceptually:

- `store.put(...)` writes a record event
- the event is signed with `sig`
- the signed event is appended to a durable log

The signature proves:

- who wrote the record
- what the record contents were
- when it was written
- that the record has not been tampered with

Important:

**Signing is provenance, not authority.**

A signed record says "this came from this writer." It does not by itself say "this field is safe for all future actions." That is what promotion is for.

### 5.2 Materialized Store

On top of the signed log, the runtime maintains a queryable store of current records.

Users mainly interact with the store, not the raw signed log.

The log is for:

- audit
- replay
- integrity
- provenance

The store is for:

- lookup
- query
- filtering
- agent memory retrieval
- authorization checks

### 5.3 Scoped Queries

Store queries should always be scope-aware.

Likely scopes:

- task
- session
- global

This is important because ambient store membership is too broad.

Bad:

- "recipient is any contact record anywhere in the store"

Better:

- "recipient is a promoted email field from a contact record in this task/session scope"

The right design probably makes scope explicit in queries and authorization constraints.

### 5.4 Promotion Rules

Promotion is the trust boundary for authorization.

Not every field returned by a trusted tool is authoritative.

Examples:

- `search_contacts_by_name` may promote `email`, `name`, `phone`
- `create_file` may promote `id`, `filename`
- `list_files` may promote `id`, `filename`, `size`
- `search_emails` may promote nothing

Why:

- `search_emails` returns attacker-controlled content
- even a valid tool can return mixed-trust payloads
- writer identity alone is too coarse

Promotion answers:

- which fields from which record types are admissible for authorization
- under what scope and provenance they may be used

This is the anti-laundering rule.

### 5.5 Where Promotion Rules Come From

Promotion metadata lives in **per-tool classification** — the same place control-arg metadata lives (e.g., `_classification.json` generated alongside tool declarations). It is not configured by users per-record.

The tool classification declares which return fields are authoritative:

```json
{
  "search_contacts_by_name": {
    "promoted_fields": ["email", "name", "phone"],
    "record_type": "contact"
  },
  "search_emails": {
    "promoted_fields": [],
    "record_type": "email"
  },
  "create_file": {
    "promoted_fields": ["id", "filename"],
    "record_type": "file"
  },
  "list_files": {
    "promoted_fields": ["id", "filename", "size"],
    "record_type": "file"
  }
}
```

The runtime applies promotion automatically when writing tool results to the store. When `search_contacts_by_name` returns, the runtime writes a contact record with `promoted: ["email", "name", "phone"]` based on the classification. No user action required.

This keeps promotion consistent and auditable — it's declared once per tool, not scattered across individual records or policy fragments.

---

## 6. Records

The store holds records. A record is:

- structured data
- metadata
- provenance
- signature-backed integrity

### 6.1 Minimal Record Shape

```json
{
  "id": "rec_a3f8",
  "type": "contact",
  "fields": {
    "email": "mark@example.com",
    "name": "Mark Davies",
    "org": "BlueParrow"
  },
  "tags": ["contact", "bluesparrow"],
  "writer": "search_contacts_by_name",
  "scope": "session:abc",
  "promoted": ["email", "name"],
  "signature": {
    "signer": "system:runtime",
    "sig_id": "sig_xyz"
  },
  "created_at": "2026-03-17T00:00:00Z"
}
```

### 6.2 Required Metadata

At minimum, records need:

- `id`
- `type`
- `fields`
- `tags`
- `writer`
- `scope`
- `promoted`
- signature metadata
- timestamps

### 6.3 Stable IDs

Records should have stable IDs from day one, even if tools still consume raw values.

This helps with:

- deduplication
- audit
- later adoption of refs
- relationship tracking

But opaque refs do not need to be the main user-facing pattern in v0.

---

## 7. Writers and Trust

The simplest useful distinction is:

- tool/runtime-written
- agent-written
- user-written
- system-written

The important rule is:

**Agent-written records are useful for reasoning but are never authoritative for action unless explicitly promoted by a trusted step.**

### 7.1 Tool Writes

Trusted tools write records automatically when they execute.

Example:

- `search_contacts_by_name("Mark")` writes contact records
- `list_files()` writes file records
- `create_file(...)` writes a created-file record

This should be a runtime behavior, not something every user manually scripts.

### 7.2 Agent Writes

Agents can write notes, observations, summaries, and working memory to the same store.

Example:

```json
{
  "type": "memory",
  "fields": {
    "note": "Mark prefers PDFs"
  },
  "tags": ["memory", "mark", "preference"],
  "writer": "agent:worker",
  "scope": "task:123",
  "promoted": []
}
```

This is useful memory.

It is not admissible for authorization.

### 7.3 User Writes

User-provided data may need its own treatment.

Example:

- explicit user-provided email address
- signed user instruction

This is probably not the same as tool-resolved data, even if both can be authoritative.

So the store should preserve writer identity, not flatten everything into a binary trusted/untrusted flag.

---

## 8. Implications for `sig` / Sign / Verify

This design should build on `sig`, not beside it.

But it is important not to overload `sig` with responsibilities that belong to the store or the policy layer.

### 8.1 Architectural Split

The clean split should mirror the filesystem integrity architecture in [FILESYSTEM-INTEGRITY.md](/Users/adam/mlld/FILESYSTEM-INTEGRITY.md):

1. `sig` handles signing, verification, identity, and tamper evidence.
2. The store handles indexing, queryability, and materialized current state.
3. Promotion rules handle authority.
4. Policy handles enforcement.

This means:

- `sig` is the provenance substrate
- the store is the retrieval substrate
- promotion is the admissibility boundary
- policy is the decision boundary

That separation is important.

If `sig` starts deciding whether a field is authoritative, or whether a tool arg is allowed, the model collapses.

### 8.2 What `sig` Should Continue to Mean

For store records, a signature should mean:

- this record event was written by a known identity
- this exact content was observed and recorded
- it has not been modified since signing
- the write is part of a durable audit trail

It should **not** mean:

- this field is automatically safe for authorization
- this external system cryptographically attested the value
- this record can be used in any policy context

In other words:

**signing is provenance, not authority**

The existing signing story for prompts and files already points in the right direction:

- sign the thing you want cryptographic integrity around
- verify it later
- let higher layers decide what that proof means

The store should use the same principle.

### 8.3 Recommended Change: Treat Store Writes as Signed Structured Events

Today `sig:sign-content` is string-oriented.

For the store model, `sig` should support signing **structured records/events** directly, not only ad hoc strings.

Recommended concept:

- every store write is an event
- the event payload is canonicalized
- the canonical payload is signed
- the signed event becomes part of the durable record log

This is better than treating records as arbitrary string blobs because:

- store records are structured objects
- canonicalization needs to be consistent
- verification should operate on the same canonical structure
- the resulting event envelope should be reusable by the store, audit tools, and LLM verifiers

### 8.4 Canonical Structured Signing

`sig` should gain a first-class concept of signing canonical structured values.

Requirements:

- stable canonical serialization for JSON-like structured values
- deterministic field ordering
- explicit algorithm/versioning
- ability to sign nested record payloads without bespoke stringification in each caller

Without this, store record signing will be fragile:

- different callers may stringify differently
- semantically identical records may hash differently
- verification becomes caller-dependent

This could be surfaced in one of two ways:

#### Option A: Extend `sig:sign-content`

Allow:

- `content` as string
- or `value` as structured JSON
- plus `kind`
- plus standardized metadata

This keeps one generic signing endpoint.

#### Option B: Add a Record/Event-Oriented API

Add something like:

- `sig:sign-record`
- `sig:verify-record`

This is clearer semantically, but adds surface area.

My preference is:

- keep one generic signing substrate
- but make structured payloads first-class

That means the implementation can still use one storage/signing engine, while the store layer can depend on canonical structured signing without inventing its own conventions.

### 8.5 Signed Event Envelope

The store likely wants a normalized signed event shape, not just "some signed content with metadata."

Conceptually:

```json
{
  "kind": "record",
  "namespace": "store",
  "event": {
    "op": "put",
    "record_id": "rec_a3f8",
    "type": "contact",
    "fields": {
      "email": "mark@example.com",
      "name": "Mark Davies"
    },
    "tags": ["contact", "bluesparrow"],
    "writer": "search_contacts_by_name",
    "scope": "session:abc",
    "promoted": ["email", "name"],
    "request_id": "req_123"
  },
  "signature": {
    "algorithm": "sha256",
    "signed_by": "system:runtime",
    "signed_at": "2026-03-17T00:00:00Z"
  }
}
```

The exact shape can vary, but the idea matters:

- records are signed as events
- the envelope is stable
- verification can return the full normalized object

### 8.6 Signer Identity vs Writer Identity

This is one of the most important interface clarifications.

The signer is not the same as the logical writer.

Example:

- signer: `system:runtime`
- writer: `search_contacts_by_name`

These answer different questions:

- **signer**: who is attesting that this event was recorded faithfully?
- **writer**: what operation or actor produced the data?

Conflating them would be a mistake.

The store and authorization layer will often care about `writer`.

The cryptographic integrity layer will often care about `signer`.

Both need to survive verification.

### 8.7 Standardized Metadata for Signed Store Events

If the store is going to build on `sig`, the metadata envelope should stop being free-form in practice, even if it remains technically extensible.

Recommended standardized metadata fields:

- `kind`
- `namespace`
- `writer`
- `type`
- `scope`
- `request_id`
- `task_id`
- `session_id`
- `source_op`
- `derived_from`
- `record_id`

Why standardize:

- consistent audit tooling
- consistent verification output
- consistent indexing/materialization
- consistent LLM-facing trust inspection

This is exactly the kind of thing that becomes painful if every caller invents its own metadata shape.

### 8.8 A Unified Verify Envelope

Right now sign/verify has multiple modes:

- file signing
- content signing
- variable signing

For the store, verification should return a normalized result shape across all artifact kinds.

At minimum, verification should surface:

- `verified`
- `kind`
- `id`
- `hash`
- `signed_by`
- `signed_at`
- canonical signed payload or content
- metadata

For store records specifically, verify should make it easy to inspect:

- writer
- scope
- type
- promoted fields
- request/session/task metadata

That would let:

- the store rebuild or audit from verified events
- humans inspect provenance
- LLM auditors reason about trust boundaries from verified data

### 8.9 Suggested Surface Changes

These are the interface-level changes I would consider.

#### CLI / Live Stdio / SDK

Keep existing file/content flows, but add structured-event support:

- existing: `sig:sign`
- existing: `sig:verify`
- existing: `sig:sign-content`
- suggested: allow structured payload signing via the same generic path

Possible request shape:

```json
{
  "method": "sig:sign-content",
  "params": {
    "kind": "record",
    "id": "rec_a3f8",
    "identity": "system:runtime",
    "value": {
      "record_id": "rec_a3f8",
      "writer": "search_contacts_by_name",
      "type": "contact",
      "scope": "session:abc",
      "fields": {
        "email": "mark@example.com"
      }
    },
    "metadata": {
      "namespace": "store",
      "request_id": "req_123"
    }
  }
}
```

Possible verify result shape:

```json
{
  "verified": true,
  "kind": "record",
  "id": "rec_a3f8",
  "hash": "sha256:abc123",
  "signedBy": "system:runtime",
  "signedAt": "2026-03-17T00:00:00Z",
  "payload": {
    "record_id": "rec_a3f8",
    "writer": "search_contacts_by_name",
    "type": "contact",
    "scope": "session:abc",
    "fields": {
      "email": "mark@example.com"
    }
  },
  "metadata": {
    "namespace": "store",
    "request_id": "req_123"
  }
}
```

This keeps the signing substrate generic while making structured verification usable.

#### Runtime Helpers

On top of generic `sig`, the runtime/store layer likely needs helpers like:

- append signed record event
- verify signed record event
- iterate signed record events for replay/rebuild

These helpers should probably live above `sig`, not inside its core API.

### 8.10 Query / Audit / Inspection Surfaces

If the store builds on signed events, the inspection tools should eventually grow to show that.

Good future directions:

- `mlld status` for store records or scopes
- trust/provenance inspection for records
- unified audit view across `.sig` and store events
- maybe a store-oriented equivalent of `status --taint`

The main idea:

the user should be able to ask not just "is this file signed?" but also:

- where did this record come from?
- who signed it?
- what writer produced it?
- what fields are promoted?
- is it currently verified?

That would create the "texture" discussed in the conversation: LLMs and humans can inspect trust boundaries rather than trusting plain text markers.

### 8.11 What Should Not Move into `sig`

The following should stay out of `sig` proper:

- promotion rules
- `authorizations` logic
- policy decisions
- store query semantics
- admissibility checks like `in_store`

Why:

- these are application/runtime semantics
- they depend on tool classification and policy context
- they are not properties of signing itself

`sig` should provide proofs.

Higher layers should decide what those proofs authorize.

### 8.12 Minimal Change Set

If the goal is to align tightly with this store design without a giant rewrite, the minimum valuable changes are:

1. canonical structured signing support
2. standardized metadata for signed record events
3. normalized verify envelope for structured payloads
4. clean separation of signer identity vs writer identity
5. store/runtime helpers that build on `sig`, not parallel to it

That is enough to make `sig` a strong substrate for the signed promoted store.

---

## 9. Queries

The store surface should stay simple.

Likely operations:

- `put`
- `get`
- `find`
- `has`
- `verify`

### 9.1 Query Shape

The main query pattern should be:

- by scope
- by type
- by tags
- by field values
- optionally by writer
- optionally by promoted field

Conceptually:

```mlld
store.find(
  scope: "task:current",
  type: "contact",
  tags: ["bluesparrow"],
  field: { name: "Mark Davies" },
  promoted: ["email"]
)
```

That is enough for a lot of useful retrieval.

### 9.2 Graph-Like Queries Without Heavy Graph

We do not need a full graph query language in v0.

A large amount of graph-like behavior can come from:

- typed records
- field references
- tags
- filtered queries

Examples:

- files where `shared_with == mark@example.com`
- contacts where `org == "BlueParrow"`
- events where `participants` contains a promoted contact email

Explicit edges may still be useful later, but they are not required to make the design valuable.

---

## 10. Authorization Integration

The store does not replace `policy.authorizations`.

It gives `authorizations` a better thing to talk about.

### 10.1 Current Phase 1

Phase 1 still uses literal pinning.

That should ship first.

### 10.2 Data-Layer Phase

Later, `authorizations` can support store-backed constraints.

Example:

```json
{
  "authorizations": {
    "allow": {
      "send_email": {
        "args": {
          "recipients": {
            "in_store": {
              "scope": "task:current",
              "type": "contact",
              "field": "email",
              "promoted": true
            }
          }
        }
      }
    }
  }
}
```

Meaning:

- this arg must match a promoted `email` field
- from a `contact` record
- in current task scope

This is much narrower than ambient store membership.

### 10.3 Dispatch-Time Check

At enforcement time, the runtime asks:

- does the arg match a record in scope?
- is the matching field promoted?
- is the record signed and verified?
- does its provenance satisfy the constraint?

If yes, allow.

This solves runtime-generated value cases cleanly without asking the runtime to trust naked LLM strings.

---

## 11. Agent Memory

This same store should serve ordinary agent memory.

Examples:

- observations
- summaries
- preferences
- temporary plans
- prior tool results

The advantage is that the agent can query structured memory instead of re-reading chat history or parsing huge tool outputs.

### 11.1 The Utility Connection

The store also helps agents reason about tool results more accurately. Consider the "always-fail" tasks in AgentDojo where `list_files` returns full file content for 26 files (~3000 tokens). LLMs consistently confuse "lots of visible text" with "large file size," misidentifying the largest file.

With the store: `list_files` writes structured file records (id, filename, size, shared_with). The agent queries `store.find(type: "file")` and gets a clean table of metadata — no content noise. Sorting by size, filtering by shared_with, or finding the largest file becomes trivial.

This is not just security infrastructure — it makes agents smarter by giving them structured access to tool results rather than forcing them to re-parse long unstructured text.

### 11.2 Trust Separation

The important rule is:

- memory records are often useful
- memory records are not automatically authoritative

This is why shared substrate works:

- same store
- different provenance
- different promotion status

---

## 12. Tools as Resolvers

This design should adopt the "tools as resolvers" idea.

That means:

- tools populate the store when they execute
- backends can vary
- the query surface stays the same

This fits the "meld" idea — mlld is named for melding things together, and the data layer is where that happens concretely. Heterogeneous data sources (contacts API, file system, calendar service, database, third-party API) are melded into one queryable signed store with uniform security metadata. The agent and the security model both operate on the same unified substrate regardless of where the data originated.

This is why the data layer belongs in mlld specifically rather than being a generic external component. The melding of heterogeneous sources with consistent security properties is core to what mlld does.

Sources in practice:

- AgentDojo tools
- API-backed tools
- database-backed tools
- filesystem-backed tools

all become sources of signed records in the same store.

I would keep "resolver" mostly as an implementation/configuration idea, not a heavy user-facing concept in v0.

The important behavior is:

- heterogeneous sources
- normalized into one queryable signed store

---

## 13. Relationship to `fact:*`

This design covers much of what `fact:*` was trying to solve.

Instead of saying:

- this free-floating string carries `fact:file:created`

the store says:

- this value matches the promoted `id` field of a signed `file` record created in this scope

That is usually easier to explain and audit.

This does not forbid `fact:*` as an internal mechanism.

But it suggests that the durable user-facing story should probably be:

- signed records
- promoted fields
- scoped queries

not:

- taint facts on arbitrary values

---

## 14. Minimal v0 Product Shape

If this were being shaped as a product, I would aim for:

1. One signed store
2. Automatic tool-result ingestion
3. Agent memory writes
4. Scope-aware queries
5. Promotion metadata per tool/type/field
6. Store-backed authorization constraints later

What I would avoid in v0:

- a full graph query language
- public user-managed views as a major concept
- opaque refs as the default tool interface
- a large trust taxonomy beyond what writers and promotion already express

---

## 15. Open Questions

1. Should scope be a string convention or a typed structure?
2. Should promotion live on tool classification, record types, or both?
3. How should deduplication work when multiple tools emit the same entity?
4. Should store ingestion be always automatic, or configurable per tool?
5. What is the smallest useful query syntax?
6. How much of this belongs in mlld core versus SDK/runtime wrappers?
7. Should store queries be available inside guards directly, or compiled from authorization constraints only?
8. How should signed log storage map onto existing `.sig` layout?
9. When do explicit refs become worth adding?

---

## 16. Workspace: Inter-Agent Symbolic Communication

### 16.1 The Problem

When Agent A produces a result and Agent B needs it, the result travels through context as text. If it's 10,000 prospect records, that's tens of thousands of tokens of noise in Agent B's context window. Agent B re-parses it, might misread fields, loses precision on numbers. This is the fundamental bottleneck in multi-agent architectures.

### 16.2 The Pattern

Agents can define named values, functions, and templates in a shared workspace. Other agents reference them by name. The data lives in mlld's runtime, not in anyone's context window.

The workspace is a store — same patterns, same security model, same box access control.

```mlld
store @workspace = {
  set: @workspaceSet,
  get: @workspaceGet,
  preview: @workspacePreview,
  find: @workspaceFind
}
```

### 16.3 Agent-Defined Values

Agent A analyzes data and saves a result:

```
Agent A calls: workspace.set("topProspects", [{ name: "Mark", score: 92 }, ...])
```

Agent B accesses it progressively — metadata first, detail on demand:

```
Agent B calls: workspace.preview("topProspects")
→ { count: 12, fields: ["name", "email", "score", "org"], sample: [{ name: "Mark", score: 92 }] }

Agent B calls: workspace.get("topProspects", { filter: { score: ">80" }, fields: ["name", "email"] })
→ [{ name: "Mark", email: "mark@..." }, { name: "Jane", email: "jane@..." }]
```

Agent B never sees the full dataset. It sees structure, decides what it needs, fetches that. Progressive disclosure through tool calls.

### 16.4 Agent-Defined Exes

An agent can define a function that other agents consume:

```
Agent A (analyst): workspace.define_exe("scoreProspect", "js { return input.revenue * 0.4 + input.engagement * 0.6 }")
```

Now Agent B calls `workspace.scoreProspect(record)` as a tool. The analyst wrote the scoring logic once. It runs in mlld's runtime with full security. Agent B consumes it without knowing or caring about the implementation.

### 16.5 Agent-Defined Templates

An agent can create an uninterpolated template — instructions with placeholders:

```
Planner calls: workspace.template("outreachPlan", "for @c in @prospects [ @email.send(@c.email, @subject, @body) ]")
```

The worker agent receives `@outreachPlan` as a template — placeholders intact. The worker evaluates it in its own context, binding `@prospects`, `@subject`, `@body` to its own values. The planner writes logic; the worker executes it.

This connects to signing: the template can be signed by the planner. The worker verifies before executing. This is autosign/autoverify applied to inter-agent communication.

### 16.6 Eval: Agents as Programmers

If the agent has access to `mlld -e` (or a `mlld.eval()` MCP tool), with workspace variables and store access pre-injected, the agent can write code that processes data without the data entering its context window:

```
Agent has @prospects (10,000 records) in the workspace.

Agent writes: mlld.eval('var @top = @prospects | filter { .score > 80 } | sort .score desc | take 10; show @top')
```

The mlld runtime processes 10,000 records. 10 come back. The agent never saw the other 9,990. It wrote code against data it can't see — the RLM pattern (Recursive Language Models, ~87% accuracy on DABench data analysis tasks) landing natively in mlld.

What makes this better than a generic Python REPL:

- **Taint survives.** Filtered contacts still carry their fact labels. Transformations don't strip provenance.
- **Policy applies.** The eval runs inside the same security context — guards, label flow, capabilities, all active.
- **Records apply.** Output is still typed. A filtered contact is still a contact with its facts/data classification intact.
- **Signing works.** If the agent writes a template, it can be signed. Downstream agents verify.

An analyst agent can write a reusable mlld function and put it in the workspace:

```
mlld.eval('exe @scoreAndRank(prospects, threshold) = @prospects | filter { .score > @threshold } | sort .score desc | take 10')
```

Downstream agents call `workspace.scoreAndRank(@myData, 80)` as a tool. The analyst wrote the logic once. It runs in mlld's runtime with full security.

### 16.7 Security Model

Agent-defined values carry agent provenance:

- `src:agent` taint (or `src:agent:analyst`, `src:agent:worker`)
- No fact labels by default — agent-produced data is useful for reasoning, not authoritative for action
- Policy can restrict what agent-defined values can flow into
- Templates are signable and verifiable

A compromised agent that defines `@safeRecipient = "evil@attacker.com"` gains nothing — the value has no fact label, so `no-send-to-unknown` blocks it. The existing security model handles this without modification.

### 16.8 Box Integration

```mlld
box @analyst with {
  tools: [
    @crm.[find, get],
    @workspace.[set, define_exe, template]
  ]
} [
  run cmd { claude -p "Analyze prospects and define a scoring function" }
]

box @outreach with {
  tools: [
    @contacts.[find, get],
    @email.send,
    @workspace.*
  ]
} [
  run cmd { claude -p "Send outreach to top-scoring prospects" }
]
```

The workspace is scoped to the orchestration. Both boxes see the same workspace. The tools list controls what each agent can access.

### 16.9 Open Questions

1. **Dynamic tool access.** Agent A defines `workspace.scoreProspect`. Agent B needs to call it. The orchestrator wrote the box config before Agent A ran — it doesn't know that exe name exists. `@workspace.*` covers it as a blanket grant, but is that sufficient for granular control?

2. **Eval scoping.** When the agent runs `mlld.eval(code)`, what's in scope? The answer is probably "same scope as the box" — same stores, same tools, same policy. But this needs to be explicit.

3. **Template mechanics.** How does the receiving agent evaluate a workspace template? `mlld.eval(@outreachPlan)`? Does it get auto-signed when created? How does the worker bind its own variables to the template's placeholders?

4. **Workspace lifecycle.** Is the workspace per-orchestration (created implicitly when the first agent writes to it)? Explicitly declared? Does it persist after the script finishes? If it persists, how does a new run connect to it?

---

## 17. Progressive Disclosure Convention

Store operations should support progressive disclosure — agents query at increasing levels of detail.

### Conventional operation names

| Name | Level | Returns |
|------|-------|---------|
| `schema` | 0 — orientation | Record types, field names, counts, sample values |
| `find` | 1 — query | Matching records (summaries or full, exe decides) |
| `get` | 2 — detail | Single record, full fields |
| `preview` | 0 — workspace | Metadata for a named value (type, count, fields, sample) |

These are conventions, not built-ins. The user wires exes that implement each level. But agents and tooling can rely on the semantic meaning of these names.

### Why this matters

The RLM benchmarks show that LLMs plan significantly better when they see structure before querying. Models that inspect schema first average 2.8 iterations per task; models that explore blindly average 6.1. For agents interacting with stores, a `schema` call before `find` is a capability multiplier, not just a convenience.

The `schema` operation also naturally surfaces fact/data classification — the agent can see which fields are authoritative before retrieving any records.

### Two audiences

- **Agent (inside box):** calls `contacts.schema()` as a tool → gets orientation. Progressive disclosure through tool calls.
- **Orchestrator (outside box):** reads `@contacts.mx` → gets ambient metadata. No tool call needed.

---

## 18. Working Thesis

The simplest viable data-layer design is not:

- a full graph engine
- a new taint system
- or just a generic key-value store

It is:

- a signed append-only record log
- with a materialized scoped store
- where tools write records automatically
- agents write untrusted memory to the same substrate
- and promotion rules mark which fields are authoritative for authorization

That feels like the smallest design that genuinely serves:

- provenance
- memory
- graph-like retrieval
- runtime-generated values
- and future authorization constraints

with one coherent model.
