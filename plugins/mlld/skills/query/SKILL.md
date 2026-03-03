---
name: mlld:query
description: LLM-driven data exploration with mlld. The LLM writes SQL or code to query structured data, code executes it (zero LLM tokens), then parallel research dives deep on the filtered results. Use when the question involves complex cross-tabulation, filtering, or slicing across data sources.
---

## When to use this

The question can't be answered by a single lookup. It requires **cross-tabulation** — slicing and filtering across multiple criteria, potentially spanning structured data (databases, CSVs) and unstructured data (files, articles, logs).

Examples:
- "Pre-debut SPs with high K:BB and low HR:FB ratios who are available and have callup buzz"
- "Users with high activity but declining engagement who signed up in Q3"
- "API endpoints that handle auth, have no rate limiting, and were modified in the last 30 days"
- "Dependencies with known CVEs that are imported in more than 3 files"

No pre-built tool handles these. An LLM can express them as SQL in ~200 tokens.

For simple parallel processing (same operation on many items), see `/mlld:fanout`.

## The pattern

```
Schema → LLM writes query → code executes → parallel deep research → synthesis
```

Each step has a different cost profile:

| Step | Who | Token cost |
|------|-----|-----------|
| Read schema | code | 0 |
| Write query | LLM (cheap model) | ~500 |
| Execute query | code | 0 |
| Research each result | LLM (parallel) | N × ~800 |
| Synthesize | LLM | ~1500 |

The database does the heavy filtering. The LLM only sees the matches.

## Basic: single-source query

LLM writes SQL against a database, code executes, parallel research on results.

```mlld
var @schema = cmd { sqlite3 app.db ".schema" }
exe @claude(prompt) = cmd { claude -p "@prompt" }
exe @haiku(prompt) = cmd { claude -p "@prompt" --model haiku }

>> LLM writes the query — cheap model, ~200 output tokens
var @q = @haiku(`You have a SQLite database.

<schema>
@schema
</schema>

Write a query for: users with high activity but declining engagement scores

Requirements:
- Return id, name, and any columns useful for further analysis
- LIMIT 25
- Explain your reasoning

Return JSON: { "sql": "SELECT ...", "rationale": "..." }`) | @parse.llm

log `Query: @q.sql`
log `Rationale: @q.rationale`

>> Execute — zero LLM tokens
var @hits = cmd { sqlite3 -json app.db "@q.sql" } | @parse

log `Found @hits.length results`

>> Parallel deep research on each result
var @results = for parallel(4) @row in @hits [
  => @claude(`Analyze this user's behavior and recommend interventions:
  <user>@row</user>
  JSON: { user_id, risk_factors, recommendation }`) | @parse.llm
]

>> Synthesize
var @report = @claude(`Synthesize these analyses into a prioritized report:
@results
JSON: { summary, priority_actions[], patterns_found[] }`) | @parse.llm

show @report
```

## Multi-source: structured data + unstructured context

Combine DB results with file searches, news, logs, or other unstructured data for richer research.

```mlld
var @schema = cmd { sqlite3 app.db ".schema" }
exe @claude(prompt) = cmd { claude -p "@prompt" }
exe @haiku(prompt) = cmd { claude -p "@prompt" --model haiku }

var @q = @haiku(`<schema>@schema</schema>
Query for: @question
JSON: { sql, rationale }`) | @parse.llm

var @hits = cmd { sqlite3 -json app.db "@q.sql" } | @parse

>> Enrich each result with unstructured context
var @results = for parallel(4) @row in @hits [
  let @logs = cmd { grep -l "@row.name" logs/*.log | head -3 }
  let @logContent = when @logs [
    "" => "No logs found."
    *  => <@logs>
  ]
  let @docs = cmd { grep -rl "@row.name" docs/ | head -3 }
  let @docContent = when @docs [
    "" => "No docs found."
    *  => <@docs>
  ]
  => @claude(`Analyze based on structured data and context:
  <data>@row</data>
  <logs>@logContent</logs>
  <docs>@docContent</docs>
  JSON: { id, assessment, evidence[], recommendation }`) | @parse.llm
]

show @results
```

## Iterative refinement: query → check → refine → research

When the first query might miss, add a refinement step.

```mlld
var @schema = cmd { sqlite3 app.db ".schema" }
exe @claude(prompt) = cmd { claude -p "@prompt" }
exe @haiku(prompt) = cmd { claude -p "@prompt" --model haiku }

>> First attempt
var @q1 = @haiku(`<schema>@schema</schema>
Query: @question
JSON: { sql, rationale }`) | @parse.llm

var @hits1 = cmd { sqlite3 -json app.db "@q1.sql" } | @parse
log `First query: @hits1.length results`

>> LLM reviews results and decides if refinement is needed
var @review = @haiku(`You queried: @q1.sql
Got @hits1.length results. Sample: @hits1.slice(0, 3)
Original question: @question

Are these results good, or should the query be refined?
JSON: { "good": true/false, "refined_sql": "..." if not good, "reason": "..." }`) | @parse.llm

var @hits = when @review.good [
  true => @hits1
  *    => cmd { sqlite3 -json app.db "@review.refined_sql" } | @parse
]

log `Final result set: @hits.length rows`

>> Research phase on final results
var @results = for parallel(4) @row in @hits [
  => @claude(`Analyze: @row
  JSON: { id, assessment, recommendation }`) | @parse.llm
]

show @results
```

## Safety

- **Read-only**: Always query with read-only intent. If the database supports it, use `PRAGMA query_only = ON` or a read-only connection.
- **Row limits**: Always include `LIMIT` in the prompt instructions. Enforce a cap in code if the LLM omits it.
- **Schema, not data**: Give the LLM the schema (`.schema`), not a data dump. Column names and types are enough to write queries.
- **Log the query**: Always `log` the generated SQL before executing. The user should see what's running.
- **Validate SQL**: For production use, consider a validation step — check for write keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`) before executing.

## Gotchas

- `cmd { sqlite3 -json ... }` returns JSON text — pipe through `| @parse` to get objects.
- `@parse.llm` for LLM responses (handles markdown fences). `@parse` for clean JSON.
- Use `sh { }` instead of `cmd { }` if your SQL contains characters that cmd rejects (`>`, `&&`, `;`).
- Quote interpolated SQL carefully: `"@q.sql"` in cmd blocks. If the SQL itself contains double quotes, write it to a temp file and use `sqlite3 app.db < tmp/query.sql`.
- Column names with dots need escaping in mlld templates: `@row.user_id` works, but `@row.some.nested.field` chains field access. Use `js { }` for complex field access.
- Start with `@haiku` for query generation (cheap, fast, good enough for SQL). Use `@claude` (sonnet) for research and synthesis.
