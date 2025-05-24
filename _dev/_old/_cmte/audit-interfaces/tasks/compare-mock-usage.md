---
name: "Compare Mocks vs Interface for {{ item.key }}"
thinking: true
thinking_instruction: "First, identify all methods/properties in the {{ item.key }} interface defined in `{{ item.value.interfacePath }}`. Then, examine the mock utility code (`allMockUtilsContent`, specifically checking the likely file `{{ item.value.relatedMocksPathGlob }}`) and handler test code (`allHandlerTestsContent`) to find mock definitions and usages related to {{ item.key }}. Finally, list discrepancies between the interface and the mocks/tests, noting specific file paths and line numbers where possible."
---

**Mock Analysis Task:**

**Goal:** Identify discrepancies between the definition of the `{{ item.key }}` interface and the mock implementations/usage in mock utilities and tests.

**Interface Definition File Path:** `{{ item.value.interfacePath }}`
*Note: Full interface content available in `allInterfacesContent`.* 

**Potential Mock Utility File Path(s):** `{{ item.value.relatedMocksPathGlob }}`
*Note: Full combined mock utility content available in `allMockUtilsContent`.* 

**Handler Test Code Files:** `services/pipeline/DirectiveService/**/*.test.ts`
*Note: Full combined handler test content available in `allHandlerTestsContent`.* 

**Analysis Request:**

1.  List all public methods and properties defined in the `{{ item.key }}` interface (from `{{ item.value.interfacePath }}`).
2.  Examine the mock utility code (focusing on `{{ item.value.relatedMocksPathGlob }}` within `allMockUtilsContent`) for functions that create mocks for `{{ item.key }}` (e.g., `createXServiceMock`). Does the created mock object include implementations (even basic `vi.fn()`) for *all* members listed in step 1? List any missing members.
3.  Examine the handler test code (`allHandlerTestsContent`) for instances where mocks for `{{ item.key }}` are created manually (e.g., using `mock<IInterface>()`, `mockDeep<IInterface>()`, or manual objects). Are all required interface methods mocked correctly in these instances? List any missing members and the test file/line number.
4.  Identify any tests that attempt to dynamically add methods to a mock object *after* its creation (e.g., `mockService.newMethod = vi.fn()`). List the test file/line number.
5.  Explicitly list **all discrepancies**, including:
    *   Methods/properties defined in the interface but **missing** from the mock factory function output or manual mock definitions (include file/line if possible).
    *   Methods/properties mocked with potentially **incorrect return types** compared to the interface (e.g., mock returns `void` where interface specifies `Promise<string>`). Note file/line.
    *   Tests attempting to **dynamically add methods** to mocks (note file/line).

Output the discrepancies as a clear, structured list. If no discrepancies are found, state that explicitly. 