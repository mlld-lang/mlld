# Refine Final '@{{ directiveName }}' Specification for Code Simplification

## Context

You are the **System Architect**. You have the initial draft spec proposal for `@{{ directiveName }}` and the collected feedback from all service component leads.

**CRITICAL NOTE:** The '@{{ directiveName }}' directive handles command execution (Basic, Language, Defined). Ensure the final spec covers all relevant subtypes and parameters.

1.  **Overall Architecture:** {{ overallArchitecture }}
2.  **`@{{ directiveName }}` Documentation:** {{ directiveClarityContent }}
3.  **Initial Draft Proposal:**

{{ draft_spec }}

4.  **Collected Service Lead Responses (All Components):**

{{ service_feedback }} 


---

## Task: Produce Final TypeScript Specification

Review the initial draft proposal and the full collection of feedback (`{{ service_feedback }}`). Synthesize the feedback to identify consensus, conflicts, and necessary adjustments.

**Produce the final, refined TypeScript type definitions for `@{{ directiveName }}` that best address the collective feedback and enable the code simplifications identified by the service leads.**

*   Incorporate necessary changes based on the feedback.
*   Make final decisions on any outstanding conflicts or requests.
*   Ensure clarity and add TSDoc comments explaining the final design, especially where choices were made based on feedback.

**Output Format:** Provide *only* the final TypeScript code block.

```typescript
// Final types for {{ directiveName }}...

/**
 * FINAL: Core structure for {{ directiveName }}.
 * @remarks [Justify final decisions based on feedback, e.g., Final structure for RunParams based on...]
 */
export interface MeldRunParams { // Example
  // ... Final implementation ...
}

// ... other final types ...
```