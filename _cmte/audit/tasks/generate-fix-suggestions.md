---
name: "Synthesize Audit Findings and Suggest Fixes"
thinking: true
thinking_instruction: "Review the lists of interface vs. usage discrepancies (`interface_audit_results`) and mock vs. interface discrepancies (`mock_audit_results`). Consolidate the findings per service interface (e.g., `IFileSystemService`). For each discrepancy, formulate a specific, actionable suggestion for fixing the interface definition file (`*.ts`), the mock utility file (`*.ts`), or the specific test file (`*.test.ts`). Focus on generating precise code modification suggestions."
---

**Synthesis Task:**

**Goal:** Combine the audit findings for all services and generate concrete suggestions for fixing interfaces and mocks.

**Collected Interface vs. Usage Discrepancies:**
```
{{ interface_audit_results }} 
```
*(Outputs from the 'compare-interface-usage' task across all services)*

**Collected Mock vs. Interface Discrepancies:**
```
{{ mock_audit_results }}
```
*(Outputs from the 'compare-mock-usage' task across all services)*

**Relevant Documentation Context:**
*DI Architecture:*
```
{{ diArchitectureContext }}
```
*Testing Standards:*
```
{{ testingStandardsContext }}
```

**Analysis and Suggestion Request:**

1.  **Consolidate:** Group the discrepancies listed above by service interface (e.g., all issues related to `IFileSystemService` together).
2.  **Analyze Root Causes:** For each group, determine the likely root cause (e.g., interface missing a method used elsewhere, mock factory outdated, test using mock incorrectly, handler using interface method incorrectly).
3.  **Generate Suggestions:** For each discrepancy, provide a specific, actionable suggestion **including the target file path**. Examples:
    *   "**Suggestion for `services/fs/FileSystemService/IFileSystemService.ts`:** Add method signature: `deleteFile(filePath: string): Promise<void>;` as it is used in `RunDirectiveHandler.ts`."
    *   "**Suggestion for `tests/utils/mocks/createMockServices.ts` (verify path):** Update `createResolutionServiceMock` to include a default mock for the `resolveNodes` method: `resolveNodes: vi.fn().mockResolvedValue(''),`."
    *   "**Suggestion for `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts`:** In the `beforeEach` block, ensure the mock object assigned to `resolutionServiceMock` includes a mock implementation for the `resolveNodes` method, as required by the `IResolutionService` interface."
    *   "**Suggestion for `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.ts`:** Change the call `this.resolutionService.resolve(...)` to `this.resolutionService.resolveInContext(...)` as `resolve` is not defined on `IResolutionService`."
4.  **Prioritize (Optional):** Indicate suggestions addressing methods missing from interfaces or base mocks as potentially higher priority.

Output the suggestions clearly, grouped by the **target file path** that needs modification (e.g., `services/fs/IFileSystemService.ts`, `tests/utils/mocks/createMockServices.ts`, `services/.../RunDirectiveHandler.test.ts`). 