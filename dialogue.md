# Data Layer Design Dialogue

## Round 1: Adam's notes on spec review

1. One adjacent question: we need to reconcile .sig vs .mlld paths. .sig was its own separate dir to allow cross-project usage where you're not using mlld. I actually think we might use .llm as the generic "config/tmp/logs/module cache" dir instead, which solves this: then it's .llm/sig and .llm/audit etc and also matches our convention of using llm/ as the organizing dir for scripts "'llm/' is the llm-related-code equiv of the src/ dir" was the idea. maybe confusing to use a .llm and llm dir but _probably_ not?

2. `sig` is a standalone project but it's intended to be interoperable across multiple projects and languages, so it's important this dependency is handled in a standardized way

3. The "tools as resolvers" language is wrong: "tools as exes" is really the right way to phrase this mindset; we want all tools we give agents to be exes that we can use to enforce guard polices. an exe is a function; it could point to a specific view of a data store. there is no desire for data stores to go through the existing resolver interface, but there is the _conceptual_ mirror of "this thing exists here, we are making it available via this api" -- I'm quite inspired by the first time I used Gatsby and found I was able to wire in all kinds of stuff and just expose the right pieces of it in the api that made sense within my application; that's ultimately what I'm meaning when I've been thinking about this as "like resolvers" -- maybe data interface maps? idk what the right term is for the concept, but it's the concept I'm trying to articulate as much as anything. the interesting thing is that an exe can be a tool and can be a data store and can be both!

4. I think boxes _do_ have persistent scopes (we can name them as variables) -- are you sure this is right? I'm not sure box and data scopes are really related as a thing where our data store is going to use a box -- BUT I definitely think a box would contain specific data stores it has access to in the same way we have files as a primitive which are made available in a named box, and I think the files analogy is _probably_ the way to compose it. so you might establish stores available to an agent in a specific context and then make those easily available in a box with some tools and files. wdyt? does that clarify anything?

5. can you think through how promotion vs labels/taint should work and what those interfaces should look like?

5b. jsonl + in-memory should be the starting place for record storage

6. I need to understand more about tool classification -- I have heard the term "classification" but I don't know it in this context. I assume "type of tool" but I don't have a broader understanding of what people are doing with this and what the expectation here is.

7. I think we do something like

store @mystorename = {
  type: "api|cli|db|?",
  form: "rest|graphql|stdio|sql",
  schema: { ??? }
}
but I have _no_ idea and this ^ seems even too simplistic AND like we're taking on work that should be handled in modules (we're not going to interpret SQL for example). honestly, gatsby is probably a good reference

## Round 2: Working through notes

### #1 — .llm as unified project metadata dir

Agreed: `.llm/` is runtime state (gitignored), `llm/` is source code (committed). Same pattern as `.git/` vs repo. Not confusing.

Store lives at `.llm/store/` (or `.llm/data/`). Audit at `.llm/audit/`. Sig at `.llm/sig/`.

**Decision:** .sig → .llm/sig migration. No backward compat needed (only Adam using it). Ship a one-time migration tool that detects `.sig/` or `.mlld/`, explains the change, confirms, reorganizes to `.llm/`.

**Decision:** Make `.llm/sig/` the standard path in the sig library itself (not an mlld-specific override).

### #2 — sig as standalone cross-language project

Key constraint: canonical structured signing (spec Section 8.4) must live in the sig library, not in mlld's sig-adapter. The signed event envelope should be a sig-level concept. This means sig work happens first as its own spec/PR before mlld consumes it.

### #3 — "tools as exes" not "tools as resolvers"

The architecture is: `backend → exe → store → query`. The exe is the adaptation point. The store is the accumulation point. Guards apply at the exe boundary. Promotion applies at the store boundary.

The concept Adam is reaching for: heterogeneous backends (APIs, databases, CLIs, files) surfaced through exes into a unified queryable store. Like Gatsby's data layer where source plugins wire in diverse backends and expose them through a unified GraphQL query surface. The exe IS the source plugin.

Spec Section 12 needs rewriting: replace "tools as resolvers" with "tools as exes" / "source adapters" framing.

**Open sub-question:** Does every store write go through an exe call, or can the runtime auto-ingest tool results directly? → Resolved: auto-ingestion is a runtime side effect when store-mapped exes return. The exe call is the trigger; the runtime handles the store write.

### #4 — Stores as box resources (like files)

Stores are not scoped BY boxes. Stores are resources ATTACHED TO boxes. Like files.

Refined: store operations ARE exes, so box access uses the tools list — no separate `stores` config. `@contacts.[find, get]` in tools = read access. Add `@contacts.put` = write. `@contacts.*` = full access.

### #6 — Tool classification

Full research written to `todo-tool-classes.md`. Key insight: classification is field-level security metadata on tool inputs AND outputs. mlld already does operation-level classification via exe labels (`destructive`, `net:w`). The gap is field-level metadata (which args are control args, which return fields are facts).

Integration path: use existing `with { ... }` pattern on exe declarations. Classification metadata flows through the same taint/provenance system as labels. See todo-tool-classes.md for prior art (AgentDojo, Invariant, Google DeepMind work) and proposed syntax.

### #7 — Store declaration syntax

The Gatsby insight applies directly: the store is dumb plumbing with a convention-based API. It does NOT know backends. Modules/exes bring the backend knowledge.

Store maps named operations to user-defined exes:

```mlld
store @contacts = {
  find: @searchContactsAPI,
  get: @getContact,
  put: @addContact,
  internal: @searchInternalOnly,
  favorites: @getFavoriteContacts
}
```

Conventional names (`find`, `get`, `put`, `has`) have semantic meaning to the runtime/agents. Custom names are user-defined views. All are exes — guardable, auditable, tool-gateway compatible.

## Round 3: Store design and fact model

### Store operation model

The store declaration maps operations to exes. No magic built-in operations — the user wires everything up:

```mlld
exe @searchContactsAPI(name) = run cmd { contacts-api search @name }
  with { facts: ["email", "name", "phone"], record_type: "contact" }

exe @getContact(id) = run cmd { contacts-api get @id }
  with { facts: ["email", "name", "phone"], record_type: "contact" }

exe @addContact(record) = run cmd { contacts-api create @record }

store @contacts = {
  find: @searchContactsAPI,
  get: @getContact,
  put: @addContact,
  internal: @searchInternalOnly,
  favorites: @getFavoriteContacts
}
```

`@contacts.find("Mark")` calls `@searchContactsAPI("Mark")`. The store provides namespacing, access control, and auto-ingestion. The exe provides the implementation.

If someone wants to query the store's accumulated local records (previously ingested results), they write an exe for that and wire it in. The JSONL backing is an implementation detail for signing/audit/persistence — not a query surface the user interacts with directly.

`@contacts.mx` provides ambient session metadata (records touched, writers, counts, types). Read-only context.

### Box access via tools

Store operations are exes, so box access is just tool permissions:

```mlld
box @agent with {
  tools: [
    @contacts.[find, get],
    @memory.*,
    @searchContacts
  ]
} [...]
```

No separate `stores` config. The read/write distinction falls out of which operations you list.

Auto-ingestion from a store-mapped exe is a runtime side effect, not gated by box tool permissions. The orchestrator configured the store mapping; the agent just called the tool.

### "Promotion" → `fact:` labels

The spec's "promoted fields" concept is replaced by `fact:` labels in the existing label/taint system.

**A fact is:** a value the source is authoritative for and vouches for as trustworthy. Something falsifiable or verifiable.

**Declaration on exes:**

```mlld
exe @searchContacts(name) = run cmd { ... }
  with { facts: ["email", "name"], record_type: "contact" }
```

**Label format:** `fact:` + optional user-defined segments + `@store.field`

```
fact:@contacts.email                    // bare fact
fact:verified:@contacts.email           // user trust tier
fact:community:@issues.title            // user trust tier
```

Runtime parses the terminal `@store.field`. Middle segments are opaque — propagated, matchable in policy, but no built-in meaning. Users define their own trust-tier conventions.

### Facts × taint interaction

Facts and taint are independent, composable dimensions. A value can carry both `src:mcp` and `fact:@contacts.email`.

Policy rules can condition allow/deny on fact labels. Facts create exceptions to taint restrictions — they don't strip or override taint:

```mlld
policy @p = {
  labels: {
    "secret": {
      deny: ["op:cmd:*"],
      allow: ["send_email(fact:@contacts.email)"]
    }
  }
}
```

Guards can assign fact labels conditionally at ingestion time:

```mlld
guard after @issues.list = when [
  @output.author in @staffList => label fact:verified:@issues.title
  @output.author in @maintainers => label fact:@issues.title
  * => // no fact label
]
```

Both policy (declarative exceptions) and guards (imperative inspection) use the same label data. No new enforcement mechanism — facts are labels, labels are the universal currency.

---

# Open Questions

### A. Canonical serialization format
RFC 8785 (JCS) vs simpler approach. Blocked on sig upstream work (D2).

### E. Store lifecycle and persistence
- Where does the JSONL file live? `.llm/store/{storename}.jsonl`?
- Is the store per-script-run? Per-project?
- When a script finishes, does the store persist for next run?
- If so, how does a new run know which store to load?

### F. Deduplication strategy
If `search_contacts_by_name("Mark")` and `list_contacts()` both return Mark Davies, do we get two records or one? What's the merge key?

### G. Record versioning / mutability
Append-only log but real data changes. Update/supersede semantics? "Latest write wins" materialization?

### H. Classification delivery for MCP tools
MCP tool schemas come from the server. Where does fact/classification metadata live for MCP tools?

### J. Store records as StructuredValue
Query results should be StructuredValues with `.data` = record fields and `.mx` carrying fact/writer/scope metadata. Detail mapping TBD.

### L. Policy condition syntax extension
The `(fact:@contacts.email)` condition on policy allow/deny rules is new syntax. Today allow/deny entries are flat capability patterns like `cmd:git:*`. Parenthetical conditions need grammar design.

### M. Dotted exe invocation grammar
`@contacts.find(...)` needs grammar support. Either "resolve field, call result" (composition of existing patterns) or "look up exe named `@contacts.find`" (new pattern). Needs grammar design work.
