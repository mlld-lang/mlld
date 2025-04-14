# Draft Initial Type Specification Proposal for '@{{ directiveName }}'

## Context

You are the **System Architect**. You have consolidated pragmatic feature requests for the `@{{ directiveName }}` directive's TypeScript types.

**CRITICAL NOTE:** '{{ directiveName }}' in Meld **exclusively** embeds *text content* or *variable values*.

1.  **Overall Architecture:** {{ overallArchitecture }}
2.  **`@{{ directiveName }}` Documentation:** {{ directiveClarityContent }}
3.  **Feature Consolidation Notes:** {{ synthesized_requirements }}

---

## Task: Draft TypeScript Type Proposal for Service Leads

Based *only* on the Feature Consolidation Notes, draft the initial TypeScript type definitions (interfaces, types, enums) for the `@{{ directiveName }}` directive as a proposal for the service leads.

*   Implement the consolidated features.
*   Use clear naming (e.g., `MeldEmbedParams`).
*   Include TSDoc comments explaining the types.
*   **Crucially, where you made a decision based on the consolidation notes (e.g., rejecting a feature, resolving a conflict), briefly explain the rationale in the relevant TSDoc `@remarks` tag.**
*   Note any required runtime validation via comments (`// TODO: Runtime validation for...`).

**Output Format:** Provide the proposal as *only* the TypeScript code block.

```typescript
// Proposal: Initial types for the {{ directiveName }} directive

/**
 * Proposed core structure for {{ directiveName }}.
 * @remarks [Optional: Add remark justifying a decision, e.g., Why Feature X was included/excluded]
 */
export interface MeldEmbedParams { // Example
  // ... Implement features from synthesized_requirements ...

  /** Property added based on Service Y justification for code safety. */
  // someProperty: string;

  // TODO: Runtime validation for ...
}

// ... other proposed types ...
```