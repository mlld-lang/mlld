---
name: "Synthesize Handler Audit Findings and Suggest Fixes"
thinking: true
thinking_instruction: "Review the collected handler audit results (`handler_audit_results`). Group common issues (e.g., specific interface methods missing, common test setup errors). Formulate specific, actionable suggestions for fixing the relevant interface files, mock utility files, handler files, or test files, referencing the findings."
---

**Overall Synthesis Task:**

**Goal:** Combine findings from all handler audits and generate concrete suggestions for fixing interfaces, mocks, handlers, and tests.

**Collected Handler Audit Results:**
{{ handler_audit_results }} 
*(Outputs from the 'analyze-handler-audit' task across all handlers)*

**Relevant Documentation Context:**
*DI Architecture:*
{{ diArchitectureContext }}

*Testing Standards:*
{{ testingStandardsContext }}

**Analysis and Suggestion Request:**

1.  **Consolidate:** Group the discrepancies listed above by the type of issue (e.g., Interface Definitions, Mock Definitions/Usage, Test Setup, Handler Logic). Further group by the specific interface or file affected.
2.  **Identify Patterns:** Note any recurring issues across multiple handlers or tests (e.g., `deleteFile` consistently missing, `DirectiveProcessingContext` setup errors common).
3.  **Generate Suggestions:** For each distinct issue or pattern, provide specific, actionable suggestions **including the target file path**. Examples:
    *   "**Suggestion for `services/fs/IFileSystemService.ts`:** Add method signature: `deleteFile(filePath: string): Promise<void>;` based on usage found in `RunDirectiveHandler.ts` audit."
    *   "**Suggestion for `tests/utils/mocks/serviceMocks.ts`:** Ensure `createFileSystemServiceMock` includes a default `deleteFile: vi.fn().mockResolvedValue(undefined),` entry."
    *   "**Suggestion for `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts` (and others):** Refactor `beforeEach` or add a helper function (`createMockProcessingContext`) to consistently create the full `DirectiveProcessingContext` including a properly mocked `state` object, resolving `getCurrentFilePath` errors."
    *   "**Suggestion for `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.ts`:** Review the call to `resolutionService.resolveInContext` for parameter resolution; ensure it correctly handles `VariableReferenceNode` input according to the `IResolutionService` definition."
4.  **Prioritize:** Highlight suggestions addressing interface/base mock discrepancies as likely prerequisites for fixing test failures.

Output the suggestions clearly, grouped by the **target file path** that needs modification. 