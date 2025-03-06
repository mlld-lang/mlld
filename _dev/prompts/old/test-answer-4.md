Below are three underlying problems that the failing tests expose, along with the minimal, specific code edits needed to fix each one. The first two fixes address the “currentState.clone is not a function” errors in the SDK integration tests. The third fix addresses the “expected 'echo test…' to be 'test output…'” failures by ensuring we actually use the replaced (transformed) node output.

────────────────────────────────────────────────────────────────────────
1) MISSING STATE CLONE METHOD
────────────────────────────────────────────────────────────────────────
• Symptom: “MeldInterpreterError: currentState.clone is not a function…” in multiple “api/api.test.ts” integration tests.
• Root Cause: The new StateService does not implement clone(), but the interpreter (and possibly child-context code) still calls currentState.clone().

────────────────────────────────────────────────────────────────────────
EXACT CODE CHANGE:

In “services/StateService/StateService.ts” (or wherever StateService is implemented), add a clone() method that replicates internal arrays/fields. For example:

--------------------------------------------------------------------------------
// Before: No clone() method
export class StateService implements IStateService {
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];
  // ...existing methods...
}

// After: Add a minimal clone() method:
export class StateService implements IStateService {
  private originalNodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];
  // ...existing methods...

  public clone(): IStateService {
    const newState = new StateService();
    // Copy arrays or any other properties you need
    newState.originalNodes = [...this.originalNodes];
    newState.transformedNodes = [...this.transformedNodes];
    // Include any other relevant fields so child contexts can function:
    // e.g. newState.someSetting = this.someSetting;

    return newState;
  }
}
--------------------------------------------------------------------------------

This ensures code calling currentState.clone() will succeed and preserve necessary state.

────────────────────────────────────────────────────────────────────────
2) RUN DIRECTIVE RETURNING RAW COMMAND INSTEAD OF ACTUAL OUTPUT
────────────────────────────────────────────────────────────────────────
• Symptom: The transformation-mode tests want “test output” but get “echo test…”.  
• Root Cause: In transformation mode, the RunDirectiveHandler (or its command execution call) is returning the literal command string instead of the command’s output. The tests explicitly expect something like "test output".

────────────────────────────────────────────────────────────────────────
EXACT CODE CHANGE:

Check “services/DirectiveService/handlers/execution/RunDirectiveHandler.ts” (or similar). Make sure the execute() method sets replacement.content to the actual command result, not the raw command. For example:

--------------------------------------------------------------------------------
// Before: mistakenly returning the `command` itself
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  const command = node.directive.command;  // e.g. "echo test"
  const output = await this.executeCommand(command);
  // BUG: returning the original command, not the actual `output`
// return {
//   state: context.state,
//   replacement: { type: 'Text', content: command } 
// };

  // ...
}

// After: return the executed output properly
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  const command = node.directive.command;                      // "echo test"
  const output = await this.executeCommand(command);           // "test output\n", etc.
  return {
    state: context.state,
    replacement: {
      type: 'Text',
      content: output,     // <-- Must use the real command output
      location: node.location
    }
  };
}
--------------------------------------------------------------------------------

If a test uses a mock, ensure that mock returns “test output” (not the original command). Then the transformed node actually has “test output”.

────────────────────────────────────────────────────────────────────────
3) OUTPUTSERVICE NOT USING TRANSFORMED NODES IN TESTS
────────────────────────────────────────────────────────────────────────
• Symptom: OutputService tests fail with “expected 'echo test' to be 'test output'”, indicating we never saw the replaced node.  
• Root Cause: By default, OutputService may be calling state.getNodes() instead of state.getTransformedNodes(), or the test never enables “useNewTransformation.”

────────────────────────────────────────────────────────────────────────
EXACT CODE CHANGE:

In “services/OutputService/OutputService.test.ts” (or wherever these three failures occur), ensure you enable the transformation mode for the tests that expect replaced node content:

--------------------------------------------------------------------------------
// Before: transformation mode is never enabled
const service = new OutputService(); // this.useNewTransformation defaults to false

// After: explicitly set transformation mode
const service = new OutputService();
service.useNewTransformation = true; // or set via constructor if supported
--------------------------------------------------------------------------------

Likewise, verify that convert() is using transformed nodes when this.useNewTransformation is true:

--------------------------------------------------------------------------------
// Inside OutputService:
async convert(state: IStateService, format: OutputFormat): Promise<string> {
  const nodes = this.useNewTransformation
    ? state.getTransformedNodes()    // Must fetch replaced directive nodes
    : state.getNodes();
  return this.nodesToFormat(nodes, format);
}
--------------------------------------------------------------------------------

This ensures the code path actually outputs “test output” (the replaced node) instead of “echo test” (the original directive).

────────────────────────────────────────────────────────────────────────
SUMMARY
────────────────────────────────────────────────────────────────────────
Implementing clone() in StateService fixes four integration-test errors. Correcting RunDirectiveHandler to return the real command result (instead of the raw command) fixes the mismatch between “echo test” vs. “test output.” Finally, enabling (and verifying) transformation mode in OutputService tests ensures we actually render transformed directive results in the final output. Once these three fixes are in place, the seven failing tests should pass.
