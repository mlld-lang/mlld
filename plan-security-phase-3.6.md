# Phase 3.6 – Structured Value & Taint Convergence

## Context Preface

Phase 3.5 pushed taint propagation into hooks and standardized `/var`/pipeline plumbing, but the work exposed a deeper constraint we can’t ignore: mlld’s structured-data model (StructuredValue wrappers) must remain intact end-to-end. Issue 435 and its follow-on docs (`issue-435.md`, `issue-435-investigation.md`, `issue-435-boundary-audit.md`) catalogued dozens of places where we unwrap those wrappers too early (templates, shell commands, foreach, JS executors), dropping both `.text` and `.metadata` in the process. `docs/dev/DATA.md` lays out the intended contract: pipelines, variables, loaders, and executors all operate on StructuredValue wrappers; we only call `asData()` at computation boundaries and `asText()` at display boundaries. When we violate that contract, not only do we get double-stringified JSON, we also lose the taint descriptors we just spent Phase 3.5 wiring up.

Therefore Phase 3.6 is about convergence: auditing every StructuredValue boundary, aligning the implementation with the DATA.md rules, and folding taint propagation into the same wrapper lifecycle so `.ctx` metadata is predictable. Until we finish that sweep, taint hooks will keep fighting downstream code that unravels their work.

---

## Phase 3.6A – Complete Audit Plan

**Objective:** Finish the structured-value + taint propagation audit, tying Issue 435 lessons to the current taint lifecycle.

- Consolidate findings from `issue-435-boundary-audit.md`, `issue-435-investigation.md`, `docs/dev/DATA.md`, and `audit-taint.md` into a single authoritative checklist of boundary sites (templates, shell commands, `/show`, `/output`, foreach, JS executors, logging, etc.).
- Map each boundary to its responsibility: when to call `asText()` vs `asData()`, when to preserve wrappers, when to rewrap results.
- Document how taint descriptors should flow through the same wrappers (e.g., `processPipeline` attaches descriptors to StructuredValue metadata, `/var` reuses that metadata, `.ctx` reads the same object).
- Identify remaining unknowns (e.g., `/var` input extraction, `.ctx` formatting expectations) so Phase B can scope them.

Deliverable: Expanded audit doc (update `audit-taint.md`) with a prioritized checklist of boundary fixes tied to specific files/functions.

## Phase 3.6B – Refine Phases Based on Audit

**Objective:** Translate the audit output into actionable subprojects and adjust the remaining phases accordingly.

- Break the audit checklist into concrete workstreams with owners/estimates (e.g., “Interpolation/string interpolation normalization,” “Shell command argument normalization,” “JS executor rewrap,” “/show output conformity,” etc.).
- Decide sequencing: which boundary fixes unblock others (e.g., fix `resolveVariable(StringInterpolation)` before touching templates).
- Update the Phase 3.6C/D/E scopes below (or add new phases) with the precise tasks surfaced by the audit.
- Ensure each workstream references the relevant integration tests (Issue 435 fixtures, taint tests) so we have regression coverage ready.

Deliverable: Updated plan with refined task lists, plus linked tickets (if applicable) for each workstream.

## Phase 3.6C – StructuredValue Boundary Remediation

*(Initial outline; to be refined after 3.6B.)*

Goal: Enforce the DATA.md contract everywhere.

- Normalize `resolveVariable(..., StringInterpolation)` to return `.text` for StructuredValues; ensure templates/shell commands never hit raw objects.
- Sweep the boundary sites identified in the audit, replacing raw `String()` / `JSON.stringify()` usage with `isStructuredValue ? asText/asData`.
- Ensure JS/Node executors wrap object returns back into StructuredValue (with `.text` + `.data`) so downstream stages preserve metadata.
- Update `/show`, `/output`, logging, and shell command helpers to honor the wrappers and document `.ctx` array formatting (`["secret","untrusted"]`).

## Phase 3.6D – Taint Lifecycle Integration

*(Initial outline; to be refined after 3.6B.)*

Goal: Make taint propagation piggyback on the same wrappers without custom hacks.

- Update evaluators (`processPipeline`, `/run`, `/show`, `/output`, `/exe` invocation) to return descriptor hints alongside values so the taint post-hook doesn't have to scavenge.
- Ensure `/var` assignments simply reuse the StructuredValue metadata (no more ad-hoc snapshot merges) and `.ctx` sees the merged descriptor immediately.
- Add conformance tests covering `/var`, pipelines, `/run`, `/show`, and `.ctx` output, verifying both `.text` and `.metadata.security`.

## Phase 3.6E – Conformance & Documentation

*(Initial outline; to be refined after 3.6B.)*

Goal: lock the behavior and codify it for future work.

- Expand the Issue 435 integration fixtures with taint assertions (`@ctx.labels`, `@ctx.taint`) covering both direct pipeline expressions and stored variables.
- Add a “taint lifecycle” test suite that executes representative scripts and snapshots the environment to ensure descriptors survive through variables, templates, shell commands, etc.
- Update docs (`docs/dev/DATA.md`, new taint section) to explain the wrapper + taint contract, `.ctx` formatting expectations, and the “assign before inspect” nuance.
- Provide a troubleshooting guide linking common symptoms (double-stringified JSON, `.ctx` missing labels) to the relevant helper misuse.

---

*Note: Phases C–E are placeholders until Phase 3.6B refines them based on the completed audit.*
