Below is a concise set of corrections that should be applied to the “First Draft Punch List” to ensure it is both accurate and complete. Each correction refers to a specific item/heading in the draft list and states exactly how to adjust or extend it.

────────────────────────────────────────────────────────────────────────
1) Under “1) IStateService.ts”
────────────────────────────────────────────────────────────────────────
• Clarify that ALL data-var methods in the interface must now use "unknown" instead of "any," matching the current implementation in StateService. Concretely:  
  - getDataVar(name: string): unknown  
  - setDataVar(name: string, value: unknown): void  
  - getAllDataVars(): Map<string, unknown>  
  - getLocalDataVars(): Map<string, unknown>  

(In the draft, it was correct to say “or vice versa,” but since the implementation is using unknown, the correct resolution is “use unknown” in the interface.)

────────────────────────────────────────────────────────────────────────
2) Under “2) StateService.ts (General)”
────────────────────────────────────────────────────────────────────────
2.1) Unify Data Variable Types  
• You can remove the parenthetical “or any” from the text, since the code uses “unknown.” The action should explicitly read: “Confirm setDataVar, getDataVar, etc. all use unknown in both interface and implementation.”

2.2) In “Fix Repeated Overwrites in enableTransformation”  
• Change the example snippet to remove any check of “this.currentState.transformedNodes.length === 0.” Instead, do a simple null/undefined check:  
  if (enable && !this.currentState.transformedNodes) {  
    this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');  
  }

2.3) In “Ensure transformNode Uses Actual Node Identity or Index”  
• Add a sentence clarifying that the current code compares (type + location + content). If the project needs a truly stable reference, the code should store or generate a unique node ID (rather than relying on changing content). Otherwise, note that the current matching approach may fail if content/location changes.

2.5) In “Force Tests/Callers to Use Service .clone() Instead of currentState.clone()”  
• Emphasize that any references to currentState.clone() in tests or directive code must be replaced with stateService.clone(). The punch list is correct here, but add that “If a test relies on a partial IStateService mock that lacks .clone(), fix the mock to implement clone().”

────────────────────────────────────────────────────────────────────────
3) Under “5) OutputService.ts”
────────────────────────────────────────────────────────────────────────
3.1) Where the draft states “If test expects '@run [echo test]' → 'test output,' the directive logic must do that transformation,” add a note that RunDirectiveHandler currently uses { replacementNode: … }. The code in OutputService does not look for “replacementNode.” To stay consistent with other handlers (e.g., EmbedDirectiveHandler, ImportDirectiveHandler), rename that property to “replacement.” This ensures the same DirectiveResult shape.

────────────────────────────────────────────────────────────────────────
4) Under “6) Handler-Specific Fixes (Directive Handlers)”
────────────────────────────────────────────────────────────────────────
In item “6.1) RunDirectiveHandler,” explicitly say:  
• “Rename returned property from replacementNode to replacement for consistency with other handlers like ImportDirectiveHandler and EmbedDirectiveHandler.”

(This is already implied, but the final punch list should call it out as a specific code change.)

────────────────────────────────────────────────────────────────────────
5) Under “7) Test Fixes (General)”
────────────────────────────────────────────────────────────────────────
7.3) “result.getTextVar is not a function” in import tests:  
• The punch list already mentions returning either IStateService or { state: IStateService } in DirectiveResult. Clarify that if a test expects direct calls like result.getTextVar(...), then the handler must return an actual state (IStateService). If returning a DirectiveResult, the test needs to call result.state.getTextVar(...). This ensures the fix is unambiguous.

────────────────────────────────────────────────────────────────────────
6) No Other Sections Require Edits
────────────────────────────────────────────────────────────────────────
Everything else in the draft list remains valid. By making the above clarifications or adjustments, the punch list becomes fully accurate and self-consistent with the current codebase.
