Below are three specific underlying problems—each tied to the failing tests—and the minimal, concrete fixes required to resolve them. These fixes come directly from the evidence in the logs and snippets you provided, and they align with the existing architecture (feature flags, transformation mode, etc.). Apply these three changes exactly as shown.

────────────────────────────────────────────────────────
1) Missing “clone()” in the IStateService Interface
────────────────────────────────────────────────────────
• Symptom: “currentState.clone is not a function” in the API integration tests.
• Root Cause: The code calls state.clone() internally, but IStateService does not declare clone()—so mocks or DI containers do not see it.
• Atomic Fix: In IStateService, add the clone() signature to match the real StateService implementation.

FILE: IStateService.ts (or wherever IStateService is declared)

  export interface IStateService {
    // Existing methods...
    addNode(node: MeldNode): void;
    transformNode(original: MeldNode, transformed: MeldNode): void;
    getOriginalNodes(): MeldNode[];
    getTransformedNodes(): MeldNode[];

+   // Fix #1: add this method so mocks/tests conform
+   clone(): IStateService;
  }

That one-line addition ensures callers that rely on clone() (including the interpreter and integration tests) no longer throw “clone is not a function.”

────────────────────────────────────────────────────────
2) RunDirectiveHandler Returning Original Command Instead of Transformed Output
────────────────────────────────────────────────────────
• Symptom: OutputService transformation tests expect "test output" but see "echo test" (the raw command).
• Root Cause: The RunDirectiveHandler (or its mock) is returning the literal string "echo test" instead of the actual command’s stdout (e.g., "test output").  
• Atomic Fix: Replace the hard-coded or mock “echo test…” return with the actual executed command’s output. In other words, ensure the directive handler sets replacement.content to the real stdout. For example:

FILE: RunDirectiveHandler.ts (inside execute())

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // ...
    // Old line (or similar):
-   const output = `echo ${command}`;   // <= returns "echo test" so the final text is "echo test"

+   // Fix #2: capture real stdout so the final text is "test output"
+   const output = await this.commandResolver.execute(command);

    const replacement: MeldNode = {
      type: 'Text',         // or 'text' if your code expects lowercase
      content: output,
      location: node.location
    };
    return { state: context.state, replacement };
  }

Also ensure the relevant test or mock (if you stub out execute(command)) is returning "test output" rather than "echo test." This guarantees the transformed node is “test output” in the output step.

────────────────────────────────────────────────────────
3) OutputService Ignoring Transformed Nodes in Transformation Mode
────────────────────────────────────────────────────────
• Symptom: The OutputService tests still see directives or raw run commands instead of the replaced text nodes, even though the handlers produce replacements.
• Root Cause: OutputService is not actually using getTransformedNodes() in transformation mode. Either it always calls state.getNodes() or it’s gated on a different flag than the code that sets transformation.
• Atomic Fix: In the OutputService convert() method, switch to isTransformationEnabled() (or the real transformation flag) so the service picks up transformed nodes. For example:

FILE: OutputService.ts (inside convert())

  class OutputService {
    async convert(state: IStateService, format: OutputFormat): Promise<string> {
-     // Old code might ignore transformation or use the wrong flag
-     const nodes = state.getNodes();  

+     // Fix #3: ensure it uses the transformed list
+     const nodes = state.isTransformationEnabled()
+       ? state.getTransformedNodes()
+       : state.getNodes();

      return this.nodesToFormat(nodes, format);
    }
  }

Be sure that anywhere else you were using something like this.useNewTransformation is replaced by state.isTransformationEnabled(), so you consistently respect the same “transformation on/off” state.

────────────────────────────────────────────────────────
Summary of Required Code Changes
────────────────────────────────────────────────────────
1) Add clone(): IStateService; to the IStateService interface.  
2) In RunDirectiveHandler’s execute(), use the actual command stdout instead of a hard-coded "echo test."  
3) In OutputService.convert(), select state.getTransformedNodes() if transformation is enabled, not the original nodes.

Together, these three small but precise changes address:
 • The “clone()” function not found error in API integration tests.  
 • Output still showing “echo test” instead of “test output.”  
 • OutputService ignoring replacements and showing raw directives.

Make exactly those edits (no extra flags or scaffolding) and the failing tests requiring transformation output (seven failures in your logs) should pass.
