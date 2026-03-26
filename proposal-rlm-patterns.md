# Proposal: RLM Patterns for the Signed Promoted Store

## Context

[A Data Scientist RLM That Lives in Your Program](https://kmad.ai/A-Data-Analysis-Agent-That-Lives-in-Your-Program) describes Recursive Language Models (RLMs) — LLMs embedded in a REPL with symbolic access to typed data (DataFrames). The LLM sees a schema preview, writes code iteratively against the actual data, and produces typed outputs. On the DABench benchmark (257 data analysis tasks), a generic RLM solver achieves ~87% accuracy across two different models with zero task-specific prompting.

The RLM work validates a core thesis of the data-layer spec: structured data access makes LLMs dramatically more capable than raw text dumps. Several patterns from the RLM approach are worth considering for the store design.

---

## 1. Store Schema Preview

### The RLM pattern

The `rlm_preview()` method shows the LLM a compact representation of a DataFrame: row count, column names and types, and a few sample rows. The LLM uses this to plan queries before executing them. It never sees the full dataset in context.

### What the store should consider

When an agent needs to understand what the store contains, it shouldn't have to dump all records into context or guess at query filters blind. A preview surface would let the agent inspect store contents structurally:

```
store.preview(scope: "task:current")

→ 14 records in scope
  contact (5): fields [email, name, phone, org] — 3 promoted fields
  file (7):    fields [id, filename, size, shared_with] — 2 promoted fields
  memory (2):  fields [note] — 0 promoted fields
```

This is a metadata query, not a data query. It answers "what's here and what shape is it?" without retrieving record contents.

Why this matters: the RLM benchmarks show that LLMs plan better queries when they can see structure first. The store's query surface (`find` by scope/type/tags/fields) is simpler than pandas, but agents still need orientation before querying — especially when multiple tool executions have populated the store with heterogeneous record types.

A preview surface also naturally exposes promotion metadata, which helps the agent understand which fields are authoritative without retrieving individual records.

---

## 2. Iterative Query as the Expected Pattern

### The RLM pattern

RLMs run 3–7 iterations on average: explore structure, compute something, inspect results, refine, verify, produce output. The REPL persists state across iterations. This iterative exploration is not a failure mode — it's the design.

### What the store should consider

The store query surface should assume agents will query iteratively, not get the right `find` on the first attempt. This has design implications:

- **Queries should be cheap.** If every `store.find()` requires verification of every matching record's signature, iterative exploration becomes expensive. Consider lazy verification — verify on access to promoted fields or on authorization checks, not on every query.

- **Query results should be inspectable, not just consumable.** Returning a count or summary before full results lets the agent decide whether to refine the query or retrieve all matching records. Something like:

  ```
  store.find(scope: "task:current", type: "contact")
  → 5 records matching

  store.find(scope: "task:current", type: "contact", field: { org: "BlueSparrow" })
  → 2 records matching
  → [rec_a3f8, rec_b7c2]
  ```

- **Scope narrowing is natural.** Agents will often start broad (all records in scope) and narrow (by type, then by field). The query API should make this progression feel natural rather than requiring fully-specified queries upfront.

---

## 3. Typed Output Constraints

### The RLM pattern

DSPy signatures define typed output fields: `overall_churn_rate: float`, `worst_channel: str`. The RLM must produce values that match these types. This constrains what the LLM outputs without constraining how it gets there.

### What the store should consider

This is conceptually parallel to promotion. Both are mechanisms for saying "not all output is equally structured or trustworthy." The RLM forces typed outputs at the signature level; the store forces structured fields at the record level.

The interesting overlap is for agent-written records. When an agent writes a memory or observation to the store, should the store enforce any schema on what goes in? The current spec leaves agent-written records loosely structured (`type: "memory"`, `fields: { note: "..." }`).

A lightweight type constraint — "memory records of type `analysis_result` must have fields `metric`, `value`, `confidence`" — could make agent memory more queryable without requiring full schema enforcement. This is closer to the DSPy signature pattern: declare what shape you expect, let the agent fill it in.

This is a minor point. The spec's current treatment of agent-written records as loosely structured is probably right for v0. But as agents start writing more structured observations (not just free-text notes), some type guidance could help.

---

## 4. Symbolic Access vs. Value Access

### The RLM pattern

The key RLM distinction: the LLM accesses data *symbolically* (as named variables in a REPL) rather than having values dumped into the context window. The LLM writes code that operates on the variable, never seeing the full contents.

### What the store should consider

The store already leans this way — agents query by scope/type/tags rather than having all records injected into context. But there's a spectrum:

- **Fully materialized**: inject all matching records into LLM context (wasteful, noisy)
- **Query results**: agent issues `store.find()`, gets back matching records (current spec direction)
- **Symbolic reference**: agent gets a handle to a result set, can further filter/sort/aggregate without re-querying

The spec doesn't need to go all the way to symbolic/REPL access. But the principle holds: the less raw data in context, the better the LLM reasons about it. The preview pattern (section 1) is one way to achieve this. Another is ensuring that `store.find()` results can be further refined without starting over — result cursors or named result sets that persist within a task scope.

This is probably a v1+ concern. For v0, query-and-return is fine. But worth noting that the RLM results strongly favor keeping raw data out of context.

---

## 5. What the Store Adds That RLMs Don't Address

The RLM approach has no concept of:

- **Provenance** — who produced this DataFrame? The LLM doesn't know or care.
- **Trust boundaries** — all columns are equally accessible. There's no distinction between attacker-controlled content and authoritative fields.
- **Authorization** — the LLM can read and compute over anything in the sandbox.
- **Signing** — no integrity verification on the data.
- **Scope** — the DataFrame is just "there." No task/session/global scoping.

These are exactly the properties the store spec adds. The RLM pattern validates *the utility side* of structured data access — agents are smarter with it. The spec adds *the security side* — agents are also safer with it, because the store carries enough metadata to enforce trust boundaries.

The proposal here is not to adopt RLM patterns wholesale, but to notice that the utility benefits are real, measured, and worth designing for explicitly. The store should be good for security *and* good for agent capability. The RLM work shows what "good for capability" looks like concretely: schema previews, iterative exploration, typed constraints, symbolic access.

---

## Summary of Suggestions

| Pattern | Source | Store Implication | Priority |
|---|---|---|---|
| Schema/metadata preview | `rlm_preview()` | Add `store.preview()` or `store.schema()` surface | High — directly useful for agent orientation |
| Iterative query support | RLM iteration pattern | Cheap queries, count-before-fetch, scope narrowing | Medium — query API design choice |
| Typed output constraints | DSPy signatures | Optional schema hints for agent-written records | Low — v0 can skip this |
| Symbolic access | REPL variables | Keep raw data out of context; result handles | Low — v1+ concern |
