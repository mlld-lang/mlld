---
name: "Compare Interface vs Usage for {{ item.key }}"
thinking: true # Enable pre-computation/analysis
thinking_instruction: "First, identify all methods and properties defined in the {{ item.key }} interface using the content from `{{ item.value.interfacePath }}`. Then, scan the handler code (`allHandlersContent`) to find all places where methods/properties of a variable typed as {{ item.key }} (or a related mock/subtype) are accessed. Finally, list the discrepancies found, including specific line numbers or code snippets from the handler code where the discrepancy occurs."
---

**Interface Analysis Task:**

**Goal:** Identify discrepancies between the definition of the `{{ item.key }}` interface and its usage within directive handler code.

**Interface Definition File Path:** `{{ item.value.interfacePath }}`
*Note: The full interface content is available in the global context variable `allInterfacesContent` if needed for deeper analysis, but focus the comparison on the named file.* 

**Directive Handler Code Files:** `services/pipeline/DirectiveService/handlers/**/*.ts`
*Note: Full combined handler content available in the global context variable `allHandlersContent`.* 

**Analysis Request:**

1.  List all **public methods and properties** defined in the `{{ item.key }}` interface located at `{{ item.value.interfacePath }}`.
2.  Scan the directive handler code (`allHandlersContent`) and identify all instances where methods or properties of an object typed or assumed to be of type `{{ item.key }}` are called or accessed. **Include the specific handler file path and line number for each usage found.**
3.  Compare the defined interface members (from step 1) with the actual usage found (from step 2).
4.  Explicitly list **all discrepancies**, including:
    *   Methods/properties **used in handlers but NOT defined** in the interface. For each, list the handler file path(s) and line number(s) where it's used.
    *   Methods/properties **defined in the interface but seemingly unused** in the handlers. List these for potential removal/deprecation review.
    *   Any apparent **type mismatches** in arguments or return types between the interface definition and handler usage (if determinable from context). Note the handler file path and line number.

Output the discrepancies as a clear, structured list (e.g., Markdown bullet points under clear headings like "Missing in Interface", "Unused in Handlers", "Type Mismatches"). If no discrepancies are found, state that explicitly. 