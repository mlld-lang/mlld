Below is an evidence‐based analysis of why variables are not being resolved in the “@text combined = '${first} ${second}'” scenario and how to fix it. The short answer is that the child‐state merging strategy (in StateFactory.mergeStates) is not bringing over all needed variable data into the parent, so later directives do not see earlier “first” or “second” assignments.

────────────────────────────────────────────────────────────────────────────────────────
1. EXACT FLOW OF STATE AND WHY IT FAILS
────────────────────────────────────────────────────────────────────────────────────────

• InterpreterService.interpret(n):  
  1) Starts with a parent state (initialState), creates an interpreter “currentState.”  
  2) For each node, interpretNode(node, currentState) returns an updated child state.  
  3) If mergeState is true, parentState.mergeChildState(childState) is called so that the parent picks up changes from the child.  
  4) currentState is then set to that updated child.  

• InterpreterService.interpretNode(node, state):  
  1) Clones the passed‐in state (directiveState = state.clone()).  
  2) directiveState.addNode(node).  
  3) Calls directiveService.processDirective(node, { state: directiveState, ... }) for @text, @data, etc., which sets or resolves variables.  
  4) Returns that updated directiveState.  

Hence after each directive, a child clone is updated, returned, and merged back into the parent, then used for the next directive. That is correct if the merges are truly “complete merges.”

────────────────────────────────────────────────────────────────────────────────────────
2. MERGING STRATEGY AND THE PROBLEM
────────────────────────────────────────────────────────────────────────────────────────

• StateFactory.mergeStates(parent, child) is called by parent.mergeChildState(child).  
• Recent code changes apparently “only append new nodes” but do not fully merge variable data. This can break variable resolution.  

For example, when @text first = "First" is processed, it sets "first" in the child’s text variables. But if mergeStates only appends nodes and neglects text variables (or overwrites incorrectly), the parent will not actually contain "first" afterward. On the next directive @text combined = "${first} ${second}", resolution sees an empty or stale parent—thus “Undefined variable: first” or a raw unexpanded string.

────────────────────────────────────────────────────────────────────────────────────────
3. RESOLUTION CONTEXT HAS THE WRONG STATE
────────────────────────────────────────────────────────────────────────────────────────

When TextDirectiveHandler (or any directive handler) attempts to resolve something like "${first}", it uses the state object provided in processDirective, which is the child clone. If that clone did not inherit variables from a fully merged parent, resolution fails. Or if the child sets a variable but it never gets merged upward, the next directive has no knowledge of the new variable.

────────────────────────────────────────────────────────────────────────────────────────
4. THE SPECIFIC FIX
────────────────────────────────────────────────────────────────────────────────────────

The core fix is to ensure that StateFactory.mergeStates does a proper merge of:
• Text variables  
• Data variables  
• Path variables  
• Commands  
• Nodes  
• Imports  
…not only “appending new nodes.”  

Concretely, inside mergeStates, you must map over both parent and child variables and produce a union of old + new. For example (pseudo‐code):

function mergeStates(parent, child) {
  return {
    filePath: child.filePath ?? parent.filePath,
    nodes: combineNodes(parent.nodes, child.nodes),    // or append
    imports: combineImports(parent.imports, child.imports),
    variables: {
      text: mergeMap(parent.variables.text, child.variables.text),
      data: mergeMap(parent.variables.data, child.variables.data),
      path: mergeMap(parent.variables.path, child.variables.path),
    },
    commands: mergeMap(parent.commands, child.commands),
    // etc.
  };
}

Where mergeMap merges all child entries into the parent’s map (last write wins, or whichever policy you need). That way, once the first directive sets “first” in the child, a subsequent mergeChildState call writes “first” to the parent’s text map. Next directive’s child clone sees “first” in its state, so the resolution of ${first} ${second} succeeds.

────────────────────────────────────────────────────────────────────────────────────────
CONCLUSION
────────────────────────────────────────────────────────────────────────────────────────

The root cause is incomplete merging of child variables back into the parent. At directive time, the resolution code does actually look at the state passed in, but that state does not contain prior variables because StateFactory.mergeStates omits them. By fixing mergeStates to properly union all variable maps (text, data, path, etc.), the interpreter will preserve variables across directives, and “@text combined = '${first} ${second}'” will correctly resolve to “First Second.”
