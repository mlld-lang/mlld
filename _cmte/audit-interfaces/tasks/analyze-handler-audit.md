---
name: "Audit {{ item.key }} Interface Usage and Mocks"
thinking: true
thinking_instruction: "1. Identify the handler code for {{ item.handlerName }} within the combined `item.auditBundleContent`. 2. Identify the test code for {{ item.handlerName }} within `item.auditBundleContent`. 3. Identify the interface definitions relevant to {{ item.handlerName }} within `item.auditBundleContent`. 4. Compare interface definitions, handler usage, and test mock usage, listing discrepancies."
---

**Handler Audit Task: {{ item.handlerName }}**

**Goal:** Identify discrepancies between used service interfaces, their usage in the handler code, and their mocking in the corresponding test code, all contained within the provided context bundle.

**Analysis Context:**

*The relevant content for the handler (`{{ item.handlerName }}`), its test file, the interfaces it uses, and the global mock utilities is provided below. File paths are included as headers automatically by the framework.* 

**Combined Audit Content (`item.auditBundleContent`):**
{{ item.auditBundleContent }}

**Global Mock Utility Code (`mockUtilsContent`):**
{{ mockUtilsContent }} 

**Analysis Request:**

1.  **Locate & List Interface Members:** Within the `item.auditBundleContent`, locate the definitions for the service interfaces used by the `{{ item.handlerName }}` handler. List the public methods and properties for each relevant interface.
2.  **Analyze Handler Usage:** Within the `item.auditBundleContent`, locate the code for the `{{ item.handlerName }}` handler. Identify all instances where methods or properties of the relevant interfaces are called/accessed. Note the line numbers relative to the start of the handler file content.
3.  **Analyze Test/Mock Usage:** Within the `item.auditBundleContent`, locate the code for the `{{ item.handlerName }}` test file. Analyze how mocks for the relevant interfaces are created (using factories from `mockUtilsContent` or manually) and used. Note the line numbers relative to the start of the test file content.
4.  **Compare & List Discrepancies:** Compare the interface definitions (Step 1) to the handler usage (Step 2) and the test/mock usage (Step 3). List ALL discrepancies found, including:
    *   **Interface Mismatches:** Methods/properties used in the handler but missing from the interface definition provided; methods defined but unused by the handler.
    *   **Mock Mismatches:** Methods/properties missing from mocks; mocks with incorrect signatures/types; tests dynamically adding methods to mocks.
    *   **Test Setup Issues:** Incomplete `DirectiveProcessingContext`; incorrect mock assertions.

Output the discrepancies clearly, grouped by category (Interface, Mock, Setup). If no discrepancies are found for this handler, state that explicitly.
 