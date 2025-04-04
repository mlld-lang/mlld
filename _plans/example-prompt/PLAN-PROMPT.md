## Context:
- Overall Architecture: @docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: @docs/dev/PIPELINE.md
- Current AST Structure: @docs/dev/AST.md 
- High-Level Refactoring Plan: @_plans/PLAN-TYPES.md
- Relevant Type Specifications: [Specify relevant _spec/*.md files here, e.g., @_spec/variables-spec.md, @_spec/import-spec.md]

## Background:
We have recently completed grammar refactors (PLAN.md, PLAN-RHS.md) resulting in a more consistent and expressive AST (documented in AST.md). The next major step is to refactor the pipeline services to leverage this improved AST and implement the stricter TypeScript types defined in the specifications (`_spec/`).

We are working through the high-level plan in @_plans/PLAN-TYPES.md phase by phase.

## Your Task: Plan Implementation Details for Phase [Phase Number]: [Phase Name]

Focus *only* on **Phase [Phase Number]: [Phase Name from PLAN-TYPES.md]** (Objective: [Copy Objective from PLAN-TYPES.md]).

1.  **Review:**
    *   Carefully review the type definitions in the specified relevant `_spec/*.md` file(s) for this phase.
    *   Carefully review the current implementation code for the primary service(s) and interfaces targeted in this phase: [Specify relevant file(s)/directories here, e.g., services/state/StateService/*, core/types/variables.ts, services/state/IStateService.ts].
    *   Consider the overall architecture (`DI-ARCHITECTURE.md`), pipeline flow (`PIPELINE.md`), and the specific AST structures (`AST.md`) relevant to this phase.

2.  **Assess & Refine Types:**
    *   Based on your review, identify any potential inconsistencies or areas where the draft type specifications relevant to *this phase* could be refined or clarified for better alignment with the AST, implementation needs, or overall type system consistency. **Pay special attention to the alignment between AST path structures (`PathValueObject`) and the stricter Path types in the specs if relevant to this phase.**
    *   Propose specific, concrete changes or additions to the relevant type definitions if needed. Document your reasoning clearly. *If no changes are needed, state that.*

3.  **Detail the Implementation Plan:**
    *   Take the high-level "punch list" for Phase [Phase Number] from `_plans/PLAN-TYPES.md` and expand it into a detailed, step-by-step implementation plan.
    *   For each major step in the punch list, break it down into concrete actions:
        *   **Action:** What needs to be done (e.g., "Modify `StateService.getTextVar` method signature", "Update internal `textVars` map type", "Add type guard `isTextVariable`").
        *   **Files:** List the specific file(s) to modify.
        *   **Details/Considerations:** Note any specific logic changes, potential challenges, dependencies on other steps, or points needing careful attention. **Crucially, consider and detail the strategy for:**
            *   **Non-destructive transformations:** How will state updates or value replacements avoid mutating existing typed objects in ways that lose original information or context? (Especially relevant for Phases 1, 4, 5).
            *   **`SourceLocation` Tracking:** How will accurate `SourceLocation` metadata be assigned, maintained, and propagated, especially through transformations? (Especially relevant for Phases 1, 4, 5).
            *   **RHS Handling (if Phase 1 or 4 for @data/@text):** Confirm how the enhanced RHS AST information will be used by handlers and how the final resolved value/type will be stored in `StateService`.
        *   **Testing:** Outline necessary updates to existing unit tests or requirements for new tests (e.g., "Update `StateService.test.ts` cases for `getTextVar`", "Add test for `isTextVariable` type guard", "Add test for non-destructive cloning").
    *   Structure this detailed plan logically. You can organize it under the original punch list items.

**Output:**

Create a **new markdown file** named `_plans/PLAN-PHASE-[Phase Number].md` containing:
A.  **Type Refinement Proposals:** (Section) Any proposed changes to the type specifications for this phase, with clear reasoning. If none, state "No type refinements proposed for this phase."
B.  **Detailed Implementation Plan:** (Section) The step-by-step plan, organized logically, detailing the actions, files, considerations (including transformation/location/RHS specifics), and testing requirements for completing this phase.

---

**Example Usage (for Phase 1):**

You would replace the bracketed parts like this:

*   `[Specify relevant _spec/*.md files here...]` -> `@_spec/variables-spec.md`
*   `[Phase Number]` -> `1`
*   `[Phase Name]` -> `Foundational Types - Variables & StateService`
*   `[Copy Objective from PLAN-TYPES.md]` -> `Introduce strict types for Meld variables and refactor StateService to manage them.`
*   `[Specify relevant file(s)/directories here...]` -> `services/state/StateService/*`, `services/state/IStateService.ts`, `core/types/variables.ts` (or wherever types will be defined)

---