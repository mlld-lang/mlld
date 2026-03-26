      1 -# Plan: Data Layer Phase 1 - Rich Records, `=> record`, Schema-Aware Guard Retries, and Fact-Based Authorization
      2 -
      3 -## Overview
      4 -
      5 -This plan updates phase 1 from a narrow subset into a coherent first release of the record system described in [spec-data-layer-v2.md](./spec-data-layer-v2.md). The release ta
         rget is not just “records exist”; it is:
      6 -
      7 -1. a rich but pure `record` DSL for shaping and classifying structured data
      8 -2. `exe ... => record` as the primary runtime boundary
      9 -3. schema validation metadata on record outputs so guards can deny or retry bad agent output
     10 -4. field-level `fact:` labels that replace the current exact-value attestation registry for this use-case
     11 -5. fact-aware built-in policy and guard checks
     12 -6. normalized `mx.factsources` metadata on record-derived values, with raw read access preferred in phase 1
     13 -
     14 -This still is not the full data layer. Stores, persistence, signing, shelf, `@fyi`, boxes, and store-addressed fact labels are deferred. The goal of phase 1 is to make records
          useful enough that they become the obvious trust and shaping primitive for MCP/API/LLM outputs, and to remove the current exact-value attestation registry rather than preserv
         ing it as a compatibility anchor.
     15 -
     16 -## Must-Read References
     17 -
     18 -- [spec-data-layer-v2.md](./spec-data-layer-v2.md)
     19 -- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
     20 -- [docs/dev/DOCS.md](./docs/dev/DOCS.md)
     21 -- [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md)
     22 -- [docs/dev/DATA.md](./docs/dev/DATA.md)
     23 -- [core/policy/label-flow.ts](./core/policy/label-flow.ts)
     24 -- [core/policy/guards.ts](./core/policy/guards.ts)
     25 -- [core/types/security.ts](./core/types/security.ts)
     26 -- [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts)
     27 -- [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts)
     28 -- [interpreter/hooks/guard-post-orchestrator.ts](./interpreter/hooks/guard-post-orchestrator.ts)
     29 -- [interpreter/hooks/guard-post-retry.ts](./interpreter/hooks/guard-post-retry.ts)
     30 -- [interpreter/guards/GuardRegistry.ts](./interpreter/guards/GuardRegistry.ts)
     31 -- [interpreter/eval/exe.ts](./interpreter/eval/exe.ts)
     32 -- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
     33 -- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
     34 -- [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
     35 -- [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts)
     36 -- [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md)
     37 -- [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md)
     38 -
     39 -## Current State
     40 -
     41 -### The Current Registry Is A Stopgap
     42 -
     43 -- Runtime trust for positive checks still has an execution-wide exact-value rebinding path.
     44 -- [Environment.recordAttestedValues()](./interpreter/env/Environment.ts#L1216) and [Environment.lookupRecordedAttestations()](./interpreter/env/Environment.ts#L1221) wrap an e
         xecution-wide attestation index.
     45 -- Every executable invocation records its raw result into that index in [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts#L1980).
     46 -- Planner authorization still falls back to that exact-value lookup in [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts#L138).
     47 -- The index implementation in [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts) is intentionally value-equality based. It does not model field-lev
         el structured trust and it should not be extended to do so.
     48 -
     49 -Phase 1 should treat this registry as removable debt, not as an API contract to preserve.
     50 -
     51 -### Guard And Policy Plumbing Already Exists
     52 -
     53 -- Named-arg descriptors already exist and are exposed through `@mx.args.*`; see [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md).
     54 -- Policy runtime snapshots already preserve arg labels, taint, attestations, and sources in [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-ev
         aluator.ts#L135).
     55 -- After-guards already support retry signaling and enforcement through:
     56 -  - [interpreter/hooks/guard-post-orchestrator.ts](./interpreter/hooks/guard-post-orchestrator.ts)
     57 -  - [interpreter/hooks/guard-post-retry.ts](./interpreter/hooks/guard-post-retry.ts)
     58 -- The missing piece is record-specific schema metadata on outputs, not retry infrastructure.
     59 -
     60 -### Field-Level Metadata Plumbing Already Exists
     61 -
     62 -- Field access already looks up per-field metadata from `namespaceMetadata` in [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts#L292).
     63 -- Field access already merges parent provenance with field-specific metadata in [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts#L1068).
     64 -- Similar namespace metadata maps already exist for state and imported namespaces in:
     65 -  - [interpreter/env/Environment.ts](./interpreter/env/Environment.ts#L3352)
     66 -  - [interpreter/index.ts](./interpreter/index.ts#L317)
     67 -  - [interpreter/eval/import/variable-importer/VariableImportUtilities.ts](./interpreter/eval/import/variable-importer/VariableImportUtilities.ts#L130)
     68 -
     69 -This means phase 1 can reuse the existing metadata transport rather than inventing a new field-label system.
     70 -
     71 -### Records And Output Coercion Do Not Exist Yet
     72 -
     73 -- `record` is not a directive kind in [grammar/deps/grammar-core.ts](./grammar/deps/grammar-core.ts#L32) or [core/types/primitives.ts](./core/types/primitives.ts#L247).
     74 -- Executables do not carry output record metadata today; [core/types/executable.ts](./core/types/executable.ts#L18) and [interpreter/eval/exe.ts](./interpreter/eval/exe.ts#L90
         ) only materialize params, control args, and description.
     75 -- The exe grammar in [grammar/directives/exe.peggy](./grammar/directives/exe.peggy#L25) has no output coercion annotation.
     76 -- There is no schema metadata surface like `@output.mx.schema.valid` or `@output.mx.schema.errors` today.
     77 -
     78 -### The Current Label Matcher Is Too Weak For Facts
     79 -
     80 -- Both [core/policy/label-flow.ts](./core/policy/label-flow.ts#L62) and [core/policy/guards.ts](./core/policy/guards.ts#L1006) use a simple prefix matcher.
     81 -- That works for `known` and `known:internal`.
     82 -- It does not work for record facts such as `fact:internal:@contact.email` when the rule wants to match `fact:@contact.email`, `fact:*.email`, or `fact:internal:*.email`.
     83 -
     84 -## Goals
     85 -
     86 -1. Ship a rich record DSL for shaping and classifying data at trust boundaries.
     87 -2. Make `exe ... => record` part of the first shippable slice, not a follow-on feature.
     88 -3. Support record field remapping, computed/composable fields, conditional trust via `when`, and validation behavior in phase 1.
     89 -4. Surface validation results on outputs so guards can `deny` or `retry` on schema mismatch.
     90 -5. Mint field-level `fact:` labels and propagate them through normal metadata flow.
     91 -6. Make built-in policy checks and user guards fact-aware.
     92 -7. Remove the exact-value attestation registry and the fallback behaviors that depend on it.
     93 -
     94 -## Non-Goals
     95 -
     96 -- Implementing stores, event logs, state snapshots, signing, or persistence from later sections of the spec.
     97 -- Implementing store-addressed facts such as `fact:@contacts.email`.
     98 -- Implementing `@fyi`, shelf, box integration, or storage architecture from sections 6-8.
     99 -- Implementing universal `=> record` everywhere a value is produced. Phase 1 keeps the operator scoped to executable output.
    100 -- Using records as a side-effectful mini-language. Record evaluation must remain pure and deterministic.
    101 -- Implementing persistence/identity features such as `key` and dedup semantics before stores exist.
    102 -
    103 -## First-Release Contract
    104 -
    105 -Phase 1 should ship a full record shaping/classification feature, with explicit boundaries.
    106 -
    107 -### In Scope
    108 -
    109 -- `record @name = { ... }` as a first-class directive
    110 -- `facts: [...]` and `data: [...]`
    111 -- scalar field types: `string`, `number`, `boolean`, plus optional `?`
    112 -- field remapping from `@input.foo as bar`
    113 -- computed/composable fields such as `{ name: \`...\` }`
    114 -- record-level `when` classification, including `=> data`
    115 -- validation modes from the spec:
    116 -  - `demote`
    117 -  - `strict`
    118 -  - `drop`
    119 -- `exe ... = ... => recordName`
    120 -- object results, top-level arrays of objects, and string outputs intended to contain structured data
    121 -- minimal LLM-output parsing:
    122 -  - strip prose and markdown fences
    123 -  - parse JSON
    124 -  - parse YAML if practical within the same implementation pass
    125 -- record output schema metadata:
    126 -  - `@output.mx.schema.valid`
    127 -  - `@output.mx.schema.errors`
    128 -- after-guard deny/retry based on schema results
    129 -- record-addressed fact labels in the form `fact[:tier...]:@record.field`
    130 -- normalized `@value.mx.factsources` metadata on record-derived values
    131 -- fact-aware built-in positive checks for recipient/target rules
    132 -- a fact-aware guard helper such as `@mx.args.to.mx.has_label("fact:*.email")`
    133 -- removal of the exact-value attestation registry and its planner/runtime fallbacks
    134 -
    135 -### Explicitly Deferred
    136 -
    137 -- `key`
    138 -- store integration and store-addressed facts
    139 -- signing and persistence
    140 -- post-import shorthand like `exe @tool => contact` unless it falls out cheaply from the same parser work
    141 -- recursive or nested record references
    142 -- records calling tools, mutating env, or depending on non-deterministic runtime state
    143 -- public `@value.mx.samesource(@other)` helper unless a concrete first-release guard requires it
    144 -
    145 -## Design Decisions
    146 -
    147 -### 1. Records Are Pure, Deterministic Data-Shaping Definitions
    148 -
    149 -Phase 1 should support the rich record surface from section 2 of the spec, but only as a pure classification/shaping DSL.
    150 -
    151 -Allowed inside records:
    152 -
    153 -- `@input` field reads
    154 -- type annotations
    155 -- templates and pure expressions for computed fields
    156 -- `when` conditions over raw input values
    157 -
    158 -Not allowed inside records:
    159 -
    160 -- tool calls
    161 -- env mutation
    162 -- filesystem/network access
    163 -- non-deterministic helpers
    164 -
    165 -This keeps records predictable, testable, and security-reviewable.
    166 -
    167 -### 2. `=> record` Is Part Of The First Delivery Slice
    168 -
    169 -`record` without `=> record` is not useful enough to replace the registry or to improve LLM output handling. Phase 1 should therefore treat these as one product feature:
    170 -
    171 -- record definition
    172 -- executable output coercion
    173 -- validation metadata
    174 -- fact labeling
    175 -
    176 -They may be implemented in sequence, but they should not be scoped as separate releases.
    177 -
    178 -### 3. Remove The Exact-Value Attestation Registry
    179 -
    180 -The execution-wide exact-value attestation registry should be removed in phase 1.
    181 -
    182 -Implications:
    183 -
    184 -- delete or retire the code paths in:
    185 -  - [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts)
    186 -  - [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
    187 -  - [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
    188 -  - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
    189 -- keep the direct attestation channel only for values that already explicitly carry `known` in their live descriptor
    190 -- do not try to map `fact:` into `attestations`
    191 -
    192 -After this change:
    193 -
    194 -- record-backed trust comes from `fact:` labels
    195 -- explicit manual/trusted approvals, if still needed, remain direct `known` attestations
    196 -- there is no ambient same-execution string registry fallback
    197 -
    198 -### 4. Schema Status Must Be First-Class Output Metadata
    199 -
    200 -Record coercion should attach a stable schema status contract to outputs, for example:
    201 -
    202 -- `@output.mx.schema.valid`
    203 -- `@output.mx.schema.errors`
    204 -- `@output.mx.schema.mode`
    205 -
    206 -This should be available to:
    207 -
    208 -- after guards
    209 -- denied handlers
    210 -- tests
    211 -- docs/examples
    212 -
    213 -The repo already has retry plumbing. The missing work is attaching schema results early enough that post guards can use them.
    214 -
    215 -### 5. Reuse `namespaceMetadata` For Field Facts
    216 -
    217 -The existing field-access pipeline is already the right transport. Record coercion should decorate the materialized object with:
    218 -
    219 -- top-level labels for whole-record provenance if useful
    220 -- `namespaceMetadata[field]` entries for fact-bearing fields
    221 -
    222 -That lets field access, interpolation, and expression provenance do most of the propagation work automatically.
    223 -
    224 -### 6. Phase 1 Carries Normalized `factsources` Metadata
    225 -
    226 -Phase 1 should carry structured provenance handles alongside `fact:` labels. The purpose is not to replace fact-label policy matching in phase 1; it is to preserve a stronger
         lineage model that later features can build on.
    227 -
    228 -Recommended phase-1 shape:
    229 -
    230 -- internal normalized `factsources` on record-derived values
    231 -- raw read access via `@value.mx.factsources`
    232 -- no requirement yet to ship `@value.mx.samesource(@other)`
    233 -
    234 -Each handle should be order-independent and normalized enough for future set-based comparison. A minimal phase-1 handle can be record-addressed and field-oriented. Future vers
         ions can strengthen it with store/entity identity.
    235 -
    236 -### 7. Phase 1 Uses Record-Addressed Facts
    237 -
    238 -Because stores are deferred, phase 1 should emit `fact:@contact.email` and `fact:internal:@contact.email`, not store-addressed labels.
    239 -
    240 -Implications:
    241 -
    242 -- user-authored guards/policies in phase 1 should reference record-addressed facts
    243 -- built-in generic rules should match by fact shape and field suffix, not by a specific store name
    244 -
    245 -### 8. Introduce A Real Fact Matcher
    246 -
    247 -Phase 1 needs a structured matcher that can reason about fact labels as:
    248 -
    249 -- namespace prefix: `fact`
    250 -- optional classification segments: `internal`, `external`, `customer`, and similar
    251 -- terminal field address: `@record.field`
    252 -
    253 -Required match capabilities:
    254 -
    255 -- exact fact label: `fact:internal:@contact.email`
    256 -- exact record field ignoring tier: `fact:@contact.email`
    257 -- field suffix wildcard: `fact:*.email`
    258 -- tier + field wildcard: `fact:internal:*.email`
    259 -
    260 -This matcher should be implemented once and reused by:
    261 -
    262 -- built-in positive policy checks
    263 -- policy `allow/deny when [...]` evaluation
    264 -- guard helper APIs
    265 -
    266 -### 9. Built-In Positive Checks Use Direct Proofs Only
    267 -
    268 -After registry removal, built-in rules should use only:
    269 -
    270 -- direct `known` / `known:*` attestations on live values
    271 -- direct `fact:` labels on live values
    272 -
    273 -Recommended rule behavior:
    274 -
    275 -- `no-send-to-unknown`: allow when destination arg carries `known` or a fact matching `fact:*.email`
    276 -- `no-send-to-external`: allow when destination arg carries `known:internal` or a fact matching `fact:internal:*.email`
    277 -- `no-destroy-unknown`: allow when target arg carries `known` or a fact matching `fact:*.id`
    278 -
    279 -There should be no exact-value fallback.
    280 -
    281 -## Fact Source Variants
    282 -
    283 -Phase 1 should explicitly distinguish the variants so implementation does not drift:
    284 -
    285 -1. **Baseline**: internal `factsources` only
    286 -   - Runtime and provenance plumbing carry normalized source handles.
    287 -   - No user-visible surface required beyond tests/debugging.
    288 -
    289 -2. **Recommended phase-1 surface**: internal `factsources` plus raw `@value.mx.factsources`
    290 -   - This is the preferred target.
    291 -   - It gives introspection and future-proofing without committing to a higher-level matching API too early.
    292 -
    293 -3. **Optional follow-on**: `@value.mx.samesource(@other)`
    294 -   - Sugar over set intersection on normalized source handles.
    295 -   - Useful if a concrete first-release guard needs same-source integrity.
    296 -   - Not a blocker for shipping records, `=> record`, schema retry, and fact-based policy.
    297 -
    298 -## Implementation Phases
    299 -
    300 -## Phase 0 - Shared Primitives And Registry Removal (≈0.75 day)
    301 -
    302 -**Goal**: remove the stopgap registry and establish the shared fact/schema contracts before parser/runtime work fans out.
    303 -
    304 -### Tasks
    305 -
    306 -1. **Delete the exact-value registry path**
    307 -   - Remove result recording from [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts#L1980)
    308 -   - Remove environment helpers from [interpreter/env/Environment.ts](./interpreter/env/Environment.ts#L1216)
    309 -   - Remove planner fallback lookup from [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts#L138)
    310 -   - Delete [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts) if no remaining caller needs it
    311 -
    312 -2. **Add shared record/fact types**
    313 -   - Add `core/types/record.ts`
    314 -   - Define:
    315 -     - record definition
    316 -     - field entry kinds
    317 -     - validation result shape
    318 -     - schema metadata payload shape
    319 -     - normalized `factsources` handle shape
    320 -
    321 -3. **Add a fact label helper module**
    322 -   - New file recommended: `core/policy/fact-labels.ts`
    323 -   - Implement:
    324 -     - `parseFactLabel(label)`
    325 -     - `matchesFactPattern(pattern, label)`
    326 -     - `collectFactLabels(values)`
    327 -     - helper(s) for positive proof checks
    328 -
    329 -4. **Define the schema metadata contract**
    330 -   - Decide the exact shape exposed under `.mx.schema`
    331 -   - Keep it serializable, stable, and simple enough for docs/examples
    332 -
    333 -5. **Define the `factsources` metadata contract**
    334 -   - Decide the normalized handle shape exposed under `.mx.factsources`
    335 -   - Keep it order-independent and suitable for set-based comparison later
    336 -   - Prefer a shape that can later grow store/entity identity without breaking the raw surface
    337 -
    338 -### Tests To Add
    339 -
    340 -1. `core/policy/fact-labels.test.ts`
    341 -   - exact match
    342 -   - tier-insensitive field match
    343 -   - wildcard field suffix match
    344 -   - non-match across unrelated fields and records
    345 -
    346 -2. `interpreter/eval/exec/policy-fragment.test.ts` or equivalent
    347 -   - confirm planner compilation now uses only direct live descriptors
    348 -   - confirm there is no exact-value fallback
    349 -
    350 -3. Add a focused metadata-shape test
    351 -   - assert `.mx.factsources` is serializable and stable
    352 -
    353 -4. Remove or rewrite tests that depended on exact-value registry rebinding
    354 -
    355 -### Testing
    356 -
    357 -- Run `core/policy/fact-labels.test.ts`
    358 -- Run [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts)
    359 -- Run the suites previously covering same-session registry behavior and update them as needed
    360 -
    361 -### Exit Criteria
    362 -
    363 -- [ ] The exact-value attestation registry is removed.
    364 -- [ ] Shared fact matching semantics are implemented once.
    365 -- [ ] Schema metadata shape is defined before record runtime work begins.
    366 -
    367 -**Deliverable**: phase 1 starts from a clean trust model, not from registry compatibility.
    368 -
    369 -## Phase 1 - Rich Record DSL Parsing, Types, And Registration (≈1.5 days)
    370 -
    371 -**Goal**: parse and register the full pure record shaping/classification DSL needed for the first release.
    372 -
    373 -### Tasks
    374 -
    375 -1. **Add `record` to grammar and directive kinds**
    376 -   - Update [grammar/deps/grammar-core.ts](./grammar/deps/grammar-core.ts#L32)
    377 -   - Update [core/types/primitives.ts](./core/types/primitives.ts#L247)
    378 -   - Add `grammar/directives/record.peggy`
    379 -   - Ensure grammar build/test infrastructure includes it
    380 -
    381 -2. **Support the full phase-1 record surface**
    382 -   - facts/data field declarations
    383 -   - typed scalar fields and optional fields
    384 -   - `@input.foo as alias`
    385 -   - computed/composable fields such as `{ alias: template }`
    386 -   - record-level `when`
    387 -   - validation mode declaration
    388 -
    389 -3. **Add record AST/runtime types**
    390 -   - Use [core/types/record.ts](./core/types/record.ts)
    391 -   - Keep field definitions explicit enough that runtime coercion is straightforward
    392 -
    393 -4. **Teach directive evaluation to register records**
    394 -   - Update [interpreter/eval/directive.ts](./interpreter/eval/directive.ts)
    395 -   - Add `interpreter/eval/record.ts`
    396 -   - Add environment storage and lookup methods in [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
    397 -
    398 -5. **Reject out-of-phase syntax explicitly**
    399 -   - `key`
    400 -   - nested/recursive record references
    401 -   - side-effectful expressions
    402 -
    403 -### Tests To Add
    404 -
    405 -1. Grammar tests
    406 -   - update `tests/grammar/expected-ast-structure.test.ts`
    407 -   - add invalid fixtures under `tests/cases/invalid/records/`
    408 -
    409 -2. Runtime tests
    410 -   - add `interpreter/eval/record.test.ts`
    411 -   - cover record definition registration and lookup
    412 -
    413 -3. Feature fixtures
    414 -   - `tests/cases/feat/records/records-basics/`
    415 -   - `tests/cases/feat/records/records-remap/`
    416 -   - `tests/cases/feat/records/records-computed/`
    417 -   - `tests/cases/feat/records/records-when-basic/`
    418 -
    419 -### Testing
    420 -
    421 -- Run grammar tests for new directive coverage
    422 -- Run `interpreter/eval/record.test.ts`
    423 -- Run the new `tests/cases/feat/records/*` fixtures
    424 -
    425 -### Exit Criteria
    426 -
    427 -- [ ] `record` parses and registers as a first-class directive.
    428 -- [ ] The full phase-1 record DSL is represented in runtime types.
    429 -- [ ] Out-of-phase record features fail explicitly.
    430 -
    431 -**Deliverable**: the runtime can store and resolve rich record definitions safely.
    432 -
    433 -## Phase 2 - `exe ... => record`, Coercion, Validation, And Guard Retry Integration (≈2 days)
    434 -
    435 -**Goal**: make executable output classification the primary boundary, including schema-aware retries for bad agent output.
    436 -
    437 -### Tasks
    438 -
    439 -1. **Extend executable syntax and metadata**
    440 -   - Update [grammar/directives/exe.peggy](./grammar/directives/exe.peggy#L25) to parse a trailing output record annotation
    441 -   - Extend [core/types/executable.ts](./core/types/executable.ts#L18) with `outputRecord` or equivalent
    442 -   - Materialize it in [interpreter/eval/exe.ts](./interpreter/eval/exe.ts#L90) and related builders in [interpreter/eval/exe/core-definition-builders.ts](./interpreter/eval/e
         xe/core-definition-builders.ts)
    443 -
    444 -2. **Implement record coercion**
    445 -   - Add a focused runtime helper, recommended `interpreter/eval/records/coerce-record.ts`
    446 -   - Support:
    447 -     - object input
    448 -     - top-level array input
    449 -     - string input containing structured data
    450 -     - field remapping
    451 -     - computed/composable fields
    452 -     - scalar coercion for `string`, `number`, `boolean`
    453 -     - optional fields
    454 -     - validation modes
    455 -     - record-level `when`
    456 -
    457 -3. **Implement minimal LLM-output parsing**
    458 -   - strip markdown fences and common prose wrappers
    459 -   - parse JSON first
    460 -   - add YAML parsing if it can be done in the same pass without destabilizing the implementation
    461 -
    462 -4. **Attach schema metadata to outputs**
    463 -   - expose `.mx.schema.valid`
    464 -   - expose `.mx.schema.errors`
    465 -   - expose mode/status details if useful
    466 -   - ensure the metadata survives post-guard materialization cleanly
    467 -
    468 -5. **Attach normalized `factsources` metadata to outputs**
    469 -   - record-derived fields should carry normalized source handles as well as `fact:` labels
    470 -   - raw `@value.mx.factsources` should be readable in phase 1 if it falls out cleanly from the same metadata work
    471 -
    472 -6. **Integrate with after-guard retry**
    473 -   - run coercion/validation before post-guards so after-guards see schema status
    474 -   - ensure retryable exe contexts can honor `retry` when schema validation fails on agent output
    475 -   - add examples/tests for:
    476 -     - `deny` on invalid schema
    477 -     - `retry` on invalid schema with corrective hint
    478 -
    479 -### Tests To Add
    480 -
    481 -1. Extend [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
    482 -   - executable definition stores output record metadata
    483 -
    484 -2. New coercion/validation tests
    485 -   - object coercion
    486 -   - array coercion
    487 -   - JSON string parsing
    488 -   - remap
    489 -   - computed/composable field evaluation
    490 -   - `when` classification
    491 -   - `validate: demote`
    492 -   - `validate: strict`
    493 -   - `validate: drop`
    494 -   - `.mx.factsources` emitted on record-derived values
    495 -
    496 -3. Extend post-guard tests
    497 -   - [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
    498 -   - add after-guard `retry` on schema failure
    499 -   - add after-guard `deny` on schema failure
    500 -
    501 -4. Feature fixtures
    502 -   - `tests/cases/feat/records/exe-output-record-object/`
    503 -   - `tests/cases/feat/records/exe-output-record-array/`
    504 -   - `tests/cases/feat/records/exe-output-record-remap-computed/`
    505 -   - `tests/cases/feat/records/exe-output-record-schema-retry/`
    506 -
    507 -### Testing
    508 -
    509 -- Run the new coercion/validation tests
    510 -- Run [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
    511 -- Run [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
    512 -- Run the new record feature fixtures
    513 -
    514 -### Exit Criteria
    515 -
    516 -- [ ] Executables can declare an output record.
    517 -- [ ] Structured outputs are parsed, coerced, validated, and classified at execution time.
    518 -- [ ] Schema results are visible on `.mx.schema`.
    519 -- [ ] After guards can deny or retry based on schema results.
    520 -
    521 -**Deliverable**: `=> record` is a real runtime boundary for MCP/API/LLM outputs.
    522 -
    523 -## Phase 3 - Fact Label Emission, Propagation, And Fact-Aware Policy Checks (≈1.5 days)
    524 -
    525 -**Goal**: mint field-level facts from record outputs and make policy/guard checks use them directly.
    526 -
    527 -### Tasks
    528 -
    529 -1. **Emit field-level fact metadata**
    530 -   - Reuse the `namespaceMetadata` pattern already used in:
    531 -     - [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts#L292)
    532 -     - [interpreter/env/Environment.ts](./interpreter/env/Environment.ts#L3352)
    533 -     - [interpreter/index.ts](./interpreter/index.ts#L317)
    534 -   - Fact-bearing fields should carry labels such as:
    535 -     - `fact:@contact.email`
    536 -     - `fact:internal:@contact.email`
    537 -   - `when => data` must mint no fact labels
    538 -
    539 -2. **Propagate normalized `factsources` metadata**
    540 -   - Ensure record-derived scalar descendants carry `factsources` alongside `fact:` labels
    541 -   - Keep propagation lineage-based and fail closed when provenance is genuinely broken
    542 -
    543 -3. **Ensure propagation through field access and common transforms**
    544 -   - Extend [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts)
    545 -   - Make sure field-specific facts and `factsources` remain attached after access and ordinary value flow
    546 -
    547 -4. **Make built-in policy checks fact-aware**
    548 -   - Update [core/policy/label-flow.ts](./core/policy/label-flow.ts#L258)
    549 -   - Update [core/policy/guards.ts](./core/policy/guards.ts#L231)
    550 -   - Use the shared proof matcher for:
    551 -     - direct `known`
    552 -     - direct `known:internal`
    553 -     - fact selectors
    554 -
    555 -5. **Expose raw `@value.mx.factsources`**
    556 -   - Make the metadata readable in guard/runtime contexts if phase-2 metadata work did not already do so
    557 -   - Keep the surface raw and inspectable rather than over-designing a full matching API
    558 -
    559 -6. **Add a guard helper for fact matching**
    560 -   - Expose something like:
    561 -     - `@mx.args.to.mx.has_label("fact:*.email")`
    562 -     - `@mx.args.id.mx.has_label("fact:*.id")`
    563 -   - Keep raw `.mx.labels` and `.mx.attestations` intact
    564 -
    565 -7. **Optional: add `@value.mx.samesource(@other)`**
    566 -   - Only if a concrete first-release guard needs same-source integrity
    567 -   - Implement as set intersection over normalized `factsources`, not array-position comparison
    568 -
    569 -### Tests To Add
    570 -
    571 -1. Extend [interpreter/utils/field-access.test.ts](./interpreter/utils/field-access.test.ts)
    572 -   - field access preserves fact labels
    573 -   - field access preserves `factsources`
    574 -   - transformed values preserve fact labels and `factsources`
    575 -
    576 -2. Extend [core/policy/label-flow.test.ts](./core/policy/label-flow.test.ts)
    577 -   - send to record-backed email fact passes
    578 -   - send to internal record-backed email fact satisfies the stronger rule
    579 -   - destructive target with fact-backed `id` passes
    580 -   - unrelated fact field does not satisfy `.email` or `.id`
    581 -
    582 -3. Extend [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts)
    583 -   - named-arg guards honor facts on `recipient` and `id`
    584 -
    585 -4. Extend [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
    586 -   - the new helper works on named args
    587 -   - raw `@value.mx.factsources` is readable in guard/runtime context
    588 -
    589 -5. Optional helper tests
    590 -   - if `mx.samesource(@other)` lands, add focused tests for set-based matching
    591 -
    592 -6. Integration tests
    593 -   - add or extend [tests/integration/policy-label-flow.test.ts](./tests/integration/policy-label-flow.test.ts)
    594 -   - add feature/exception fixtures under `tests/cases/feat/policy/` and `tests/cases/exceptions/security/`
    595 -
    596 -### Testing
    597 -
    598 -- Run [interpreter/utils/field-access.test.ts](./interpreter/utils/field-access.test.ts)
    599 -- Run [core/policy/label-flow.test.ts](./core/policy/label-flow.test.ts)
    600 -- Run [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts)
    601 -- Run [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
    602 -- Run [tests/integration/policy-label-flow.test.ts](./tests/integration/policy-label-flow.test.ts)
    603 -
    604 -### Exit Criteria
    605 -
    606 -- [ ] Fact-bearing record fields carry stable field-level labels.
    607 -- [ ] Facts survive field access and ordinary transformations.
    608 -- [ ] Built-in positive checks pass on fact-backed recipient/target values.
    609 -- [ ] There is no registry fallback anywhere in the positive-check path.
    610 -
    611 -**Deliverable**: default policy rules and user guards can reason about record-backed facts directly.
    612 -
    613 -## Phase 4 - Docs, Fixtures, And Cleanup (≈1 day)
    614 -
    615 -**Goal**: document the new mental model clearly and remove stale registry-era descriptions.
    616 -
    617 -### Tasks
    618 -
    619 -1. **Update user docs**
    620 -   - Add a new atom, recommended `docs/src/atoms/core/31-records--basics.md`
    621 -   - Add a new atom, recommended `docs/src/atoms/effects/07c-labels--facts.md`
    622 -   - Update [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md) to remove registry-first explanations
    623 -   - Update [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md) with schema retry and fact-query examples
    624 -
    625 -2. **Update dev docs**
    626 -   - Update [docs/dev/DATA.md](./docs/dev/DATA.md) with record coercion, schema metadata, and field fact propagation
    627 -   - Update [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md) with fact-query examples and helper semantics
    628 -
    629 -3. **Update changelog**
    630 -   - Update [CHANGELOG.md](./CHANGELOG.md)
    631 -
    632 -4. **Regenerate documentation-derived fixtures**
    633 -   - Run `npm run build:fixtures`
    634 -   - Fix any extracted doc tests that break because of syntax or output changes
    635 -
    636 -### Tests To Add
    637 -
    638 -1. Documentation-derived tests from the new and updated atoms
    639 -2. Any remaining migration tests needed to ensure stale registry docs/examples are gone
    640 -
    641 -### Testing
    642 -
    643 -- Run `npm run build:fixtures`
    644 -- Run `npm test`
    645 -- Run `npm run build`
    646 -
    647 -### Exit Criteria
    648 -
    649 -- [ ] User docs describe records as the primary shaping/trust primitive.
    650 -- [ ] Dev docs explain schema metadata and fact propagation accurately.
    651 -- [ ] Registry-era attestation docs are updated or removed.
    652 -- [ ] Docs, tests, and build all pass.
    653 -
    654 -**Deliverable**: the feature is documented as a coherent system, not a collection of internals.
    655 -
    656 -## Testing Requirements
    657 -
    658 -Per [docs/dev/TESTS.md](./docs/dev/TESTS.md), this work needs all three layers of coverage:
    659 -
    660 -1. **Unit tests**
    661 -   - `core/policy/fact-labels.test.ts`
    662 -   - `core/policy/label-flow.test.ts`
    663 -   - `core/policy/guards-defaults.test.ts`
    664 -   - record parsing/coercion/validation unit tests
    665 -
    666 -2. **Interpreter/runtime tests**
    667 -   - [interpreter/eval/record.test.ts](./interpreter/eval/record.test.ts) or equivalent
    668 -   - [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
    669 -   - [interpreter/utils/field-access.test.ts](./interpreter/utils/field-access.test.ts)
    670 -   - [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
    671 -   - [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
    672 -
    673 -3. **Fixture coverage**
    674 -   - `tests/cases/feat/records/...`
    675 -   - `tests/cases/feat/policy/...`
    676 -   - `tests/cases/exceptions/security/...`
    677 -   - `tests/cases/invalid/records/...`
    678 -
    679 -Required manual validation scenarios:
    680 -
    681 -- a contact record with `when [ internal => :internal ]` yields `fact:internal:@contact.email`
    682 -- a record-derived scalar exposes stable `@value.mx.factsources`
    683 -- a record demoted via `=> data` mints no facts
    684 -- a computed field still carries its declared fact/data classification correctly
    685 -- an invalid LLM response surfaces `.mx.schema.errors`
    686 -- an after guard can retry an LLM exe based on `.mx.schema.errors`
    687 -- a data field from the same record does not satisfy send policy
    688 -- a record-backed email or id satisfies positive checks without any exact-value rebinding
    689 -
    690 -## Documentation Requirements
    691 -
    692 -Per [docs/dev/DOCS.md](./docs/dev/DOCS.md), this change is both an architecture change and a user-facing feature.
    693 -
    694 -### Dev Docs
    695 -
    696 -- [docs/dev/DATA.md](./docs/dev/DATA.md)
    697 -- [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md)
    698 -
    699 -### User Docs
    700 -
    701 -- new records atom under `docs/src/atoms/core/`
    702 -- new facts atom under `docs/src/atoms/effects/`
    703 -- updates to guard and attestation atoms
    704 -
    705 -### LLM / Generated Docs
    706 -
    707 -- run `npm run build:fixtures`
    708 -- rebuild any generated doc outputs required by the repo’s normal doc flow
    709 -
    710 -## Sequencing And Dependencies
    711 -
    712 -- Phase 0 should land first so the rest of the work is not forced to preserve the registry.
    713 -- Phase 1 must land before Phase 2.
    714 -- Phase 2 must land before Phase 3 because fact checks depend on labeled record outputs existing.
    715 -- Phase 3 should stabilize before the final docs/examples are written.
    716 -
    717 -Recommended implementation order:
    718 -
    719 -1. Phase 0
    720 -2. Phase 1
    721 -3. Phase 2
    722 -4. Phase 3
    723 -5. Phase 4
    724 -
    725 -## Overall Exit Criteria
    726 -
    727 -**Test Status**:
    728 -
    729 -- [ ] New unit coverage exists for fact parsing/matching, record coercion, and validation
    730 -- [ ] New runtime coverage exists for `=> record`, schema metadata, post-guard retry, and fact propagation
    731 -- [ ] New fixture coverage exists for valid, invalid, denied, and retry record scenarios
    732 -- [ ] Full test suite passes: `npm test`
    733 -
    734 -**Documentation**:
    735 -
    736 -- [ ] Dev docs updated
    737 -- [ ] User docs updated
    738 -- [ ] Documentation fixtures rebuilt
    739 -- [ ] `CHANGELOG.md` updated
    740 -
    741 -**Code Quality**:
    742 -
    743 -- [ ] Build succeeds: `npm run build`
    744 -- [ ] Record evaluation remains pure and deterministic
    745 -- [ ] The exact-value attestation registry and its fallbacks are gone
    746 -
    747 -**Validation**:
    748 -
    749 -- [ ] `exe ... => record` is the primary boundary for structured trust and shaping
    750 -- [ ] Schema-invalid agent output can be denied or retried by guards
    751 -- [ ] Fact labels survive field access and common transformations
    752 -- [ ] Record-backed send and destroy flows work without registry rebinding
    753 -- [ ] `when => data` prevents authorization-grade facts from being minted
    754 -
    755 -**Deliverable**: mlld ships a rich pure record system that can shape executable output, validate it, expose schema status to guards, mint field-level facts, and authorize reci
         pient/target flows without the current exact-value attestation registry.
