Below is a file-by-file punch list consolidating all corrections identified during the audit. Each action item specifies exactly what must be changed, added, or removed, with references to the approximate code lines. Where no specific line numbers are indicated in the snippet, the item references the method name or code block. Use this list to methodically fix the mismatches, ensure consistent transformations, unify type definitions, and correct test-related issues.

────────────────────────────────────────────────────────────────────────
1) IStateService.ts
────────────────────────────────────────────────────────────────────────
• Change “any” to “unknown” (or vice versa) for data-variable methods to match StateService.ts
  – Methods: getDataVar, setDataVar, getAllDataVars, getLocalDataVars
  – Lines (approx): 15–21 in IStateService.ts
  – Required fix:  
    • getDataVar(name: string): unknown  
    • setDataVar(name: string, value: unknown): void  
    • getAllDataVars(): Map<string, unknown>  
    • getLocalDataVars(): Map<string, unknown>  

────────────────────────────────────────────────────────────────────────
2) StateService.ts (General)
────────────────────────────────────────────────────────────────────────
2.1) Unify Data Variable Types
• In methods setDataVar, getDataVar, etc. confirm parameter and return types use “unknown” or “any” consistently with IStateService changes:
  – Lines (approx): 60–84

2.2) Fix Repeated Overwrites in enableTransformation
• Adjust enableTransformation so it does not overwrite an existing transformedNodes array if transformation is already enabled:  
  – Method: enableTransformation (~lines 195–211)  
  – Change:  
    if (enable && !this.currentState.transformedNodes) {
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
    }  
  – Removes the check for transformedNodes.length === 0, and only initializes if transformedNodes is not set at all.

2.3) Ensure transformNode Uses Actual Node Identity or Index
• Currently transformNode (lines ~173–188) tries to match original vs. transformed by comparing type, location, and content. This can fail if the state changes “content.”  
  – If you want a direct reference comparison: findIndex(node => node === original).  
  – Or if you must handle changed content, store some stable internal ID.  
  – Decide on a single approach to avoid partial mismatch.

2.4) Clarify hasLocalChanges() and getLocalChanges()
• Either implement real change tracking or explicitly document that they are placeholders returning (true) and [“state”].  
  – Lines ~265–272  
  – If real tracking is desired, implement a real diff or a simple “unsaved” flag.

2.5) Force Tests/Callers to Use Service .clone() Instead of currentState.clone()
• Code that does “this.currentState.clone()” outside the service is invalid.  
  – Confirm any references in DirectiveService/tests are changed to “state.clone()” on the StateService object.  
  – The actual clone() method (lines ~298–334) can remain as is (or see deeper clone improvement, item 2.6 below).

2.6) (Optional) Deep-Clone Behavior
• If tests or directives require fully copying objects in data Maps, revise the clone() method around lines 298–334 to use a true deep copy for data or command definitions. Otherwise document it as shallow.

────────────────────────────────────────────────────────────────────────
3) StateFactory.ts
────────────────────────────────────────────────────────────────────────
• No mandatory functional changes are indicated by the audit.  
• (Optional) If you want merges or createState calls to reflect deeper variable copying, add that logic here.  
• Confirm that lines 131–137 in mergeStates do not overwrite transformedNodes incorrectly if partial merges are used. (Currently merges child’s transformedNodes if present.)

────────────────────────────────────────────────────────────────────────
4) DirectiveService.ts
────────────────────────────────────────────────────────────────────────
4.1) Eliminate Any “currentState.clone()” Calls
• In processDirectives (~line 244) and createContext (~line 320), verify usage. If you see code like “parentContext?.state?.currentState.clone()”, replace with “parentContext?.state?.clone()”.  
• Confirm all new child states are done via createChildState() or .clone() on the service, not the raw data object.

4.2) Validate merges from processDirectives
• Where you do:
  currentState.mergeChildState(updatedState);  
  – Confirm updatedState is always a real StateService, not the raw node object.  
• If tests produce “result.getTextVar is not a function,” make sure the object truly implements IStateService.

────────────────────────────────────────────────────────────────────────
5) OutputService.ts
────────────────────────────────────────────────────────────────────────
5.1) Mark Leftover Directives in Transformation Mode as Replaced
• The nodeToMarkdown() method (~lines 140–185) returns empty string for certain directives if “isTransformed.” If test expects “@run [echo test]” to become “test output,” the directive handler or transformNode must do that replacement.  
  – Implementation detail: either transformNode to a “Text” node before OutputService runs or implement custom logic in nodeToMarkdown for known directives.

5.2) Discrepancies in “echo test” vs. “test output”
• Tests wanting “echo test” replaced with “test output” require that run directive or embed directive returns a replaced node in transformation mode.  
  – Confirm the RunDirectiveHandler (lines ~54 in RunDirectiveHandler.ts) actually sets a replacement node if transformation is on.  
  – Then OutputService will just see a “Text” node with “test output.”

5.3) Double-Check transform vs. Original in convert()
• The code chooses getTransformedNodes() if isTransformationEnabled() is true and the array is non-empty.  
  – If partial transformations exist, confirm you do not revert to the original nodes array.  
  – This is done around lines ~57–62.

────────────────────────────────────────────────────────────────────────
6) Handler-Specific Fixes (Directive Handlers)
────────────────────────────────────────────────────────────────────────

6.1) RunDirectiveHandler.ts
• In the execute() method (~line 41 in snippet):
  – If transformation is enabled, ensure it returns a DirectiveResult that sets replacement to the command output.  
  – The code example sets “replacementNode” but test collisions use “replacement.” Align the property name.  
    • Either rename replacementNode → replacement to match other handlers (e.g., EmbedDirectiveHandler).  
    • Or update your test frameworks to expect “replacementNode.”

6.2) ImportDirectiveHandler.ts
• If state.isTransformationEnabled() => returning { state, replacement } with an empty Text node is correct.  
  – Confirm the test failing “TypeError: result.getTextVar is not a function” is not from returning something else. Possibly the test is calling handleDirective incorrectly.  
• Lines ~115–125: If your test expects “import directive content replaced by text,” confirm the new directive logic can supply a replacement or an empty string.

6.3) EmbedDirectiveHandler.ts
• The execute() method (~line 58) sets { state: newState, replacement } if transformation is on.  
  – Double-check the name “replacement” is consistent with other handlers (e.g. RunDirectiveHandler uses “replacementNode” as shown—unify it).

6.4) DataDirectiveHandler.ts / PathDirectiveHandler.ts / TextDirectiveHandler.ts
• In each, after building the new state, they simply return newState. That’s correct for normal operation.  
• If you want them removed from final output in transformation mode, the directive must do transformNode or return a DirectiveResult with a replacement TextNode.  
• Ensure naming consistency if tests rely on “replacement.”

────────────────────────────────────────────────────────────────────────
7) Test Fixes (General)
────────────────────────────────────────────────────────────────────────
7.1) Banish “currentState.clone is not a function” Errors
• In any tests that do “currentState.clone()”, call the actual service: “state.clone().currentState” or just “state.clone().someMethod”.  
• If your integration tests pass a partial mock StateService that lacks clone(), fix the mock so it implements all required methods.

7.2) Transformation Tests Expecting “echo test” => “test output”
• Make sure the run directive or whichever directive is responsible does the transformNode or returns { replacement } in transformation mode.  
• Then OutputService should see a replaced “Text” node with “test output.”  
• That addresses the failing “AssertionError: expected test output but got echo test.”

7.3) “result.getTextVar is not a function” in import tests
• Ensure the object returned from ImportDirectiveHandler is indeed a real IStateService or a DirectiveResult with “state: IStateService.”  
• If a test uses “const result = handleDirective(...); result.getTextVar(...)”, ensure “result” is the state, not a partial. Possibly you must do “result.state.getTextVar(...)” if “result” is a DirectiveResult.

────────────────────────────────────────────────────────────────────────
8) Mocks and Partial Implementations
────────────────────────────────────────────────────────────────────────
• If any test stubs or mocks for IStateService are used, confirm they implement all methods (clone, createChildState, etc.).  
• For test coverage of child-state merges, ensure the mocks do not skip mergeChildState or transformNode.

────────────────────────────────────────────────────────────────────────
SUMMARY
────────────────────────────────────────────────────────────────────────
In short:

1. Standardize getDataVar/setDataVar to use “unknown” (or “any”) consistently in both IStateService.ts and StateService.ts.  
2. In StateService.enableTransformation(), only initialize transformedNodes once, preserving partial transformations if re-enabled.  
3. End any direct calls to “currentState.clone” outside StateService; always call state.clone() on the service object.  
4. Adjust transformation handlers (Import, Embed, Run, etc.) to return DirectiveResult with a “replacement” property if you want the directive text replaced in output.  
5. Align your test code and mocks so that they rely on a fully implemented IStateService, especially for clone() and child-state creation.  
6. If tests expect “echo test” → “test output,” implement the transform or replacement logic in the directive or in transformNode.  
7. Decide on how to truly identify a “node” in transformNode or store a stable ID. If the string location+content can change, an index-based or ID-based approach is safer.  
8. Document or fully implement hasLocalChanges()/getLocalChanges().  

By applying all items above, you will eliminate the failing transformations, unify data types, fix partial mock mismatches, and maintain consistent directive behavior in both normal and transformation modes.
