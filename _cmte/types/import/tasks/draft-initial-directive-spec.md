# Draft Initial Type Specification Proposal for File/Import Handling

## Context

You are the **System Architect**. You have consolidated pragmatic feature requests for Meld's internal types related to file handling, path resolution, and imports.

**CRITICAL NOTE:** This proposal focuses on internal types used for managing file system interactions, paths, and imported data, potentially involving directives like `@text` and `@path`.

1.  **Overall Architecture:** {{ overallArchitecture }}
2.  **Import/File Handling Documentation:** {{ directiveClarityContent }}
3.  **Feature Consolidation Notes:** {{ synthesized_requirements }}

---

## Task: Draft TypeScript Type Proposal for Service Leads

Based *only* on the Feature Consolidation Notes, draft the initial TypeScript type definitions (interfaces, types, enums) for internal file/import handling as a proposal for the service leads.

*   Implement the consolidated features for path types, file content representation, import results, etc.
*   Use clear naming (e.g., `MeldFilePath`, `FileContentResult`, `ImportData`).
*   Include TSDoc comments explaining the types.
*   **Crucially, where you made a decision based on the consolidation notes (e.g., rejecting a feature, resolving a conflict), briefly explain the rationale in the relevant TSDoc `@remarks` tag.**
*   Note any required runtime validation via comments (`// TODO: Runtime validation for path existence...`).

**Output Format:** Provide the proposal as *only* the TypeScript code block.

```typescript
// Proposal: Initial types for internal file/import handling

/**
 * Proposed type for representing resolved file paths.
 * @remarks [Optional: Add remark justifying a decision, e.g., using nominal typing for safety]
 */
export type MeldFilePath = string & { readonly __brand: 'MeldFilePath' }; // Example

/**
 * Proposed structure for results of file reading operations.
 */
export interface FileContentResult { // Example
  // ... Implement features from synthesized_requirements ...
  content: string | Buffer;
  encoding: string;
  // TODO: Runtime validation for file size limits...
}

/**
 * Proposed structure for data resulting from an import operation.
 */
export interface ImportData { // Example
  // ...
}

// ... other proposed types ...
```