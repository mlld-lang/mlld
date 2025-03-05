=== CODE AND TESTS ===

@cmd[cpai ../services/InterpreterService/InterpreterService.ts ../services/StateService/StateService.ts ../services/StateService/IStateService.ts services/StateService/types.ts ../tests/integration/api.test.ts --stdout]

==== END CODE AND TESTS ===

=== TEST STATUS ===

@cmd[npm test]

=== END TEST STATUS ===

YOUR TASK:

We have a failing test in tests/integration/api.test.ts that indicates a state preservation issue. Our investigation has revealed some key insights:

1. The test verifies variable resolution across directives:
   ```
   @text first = "First"
   @text second = "Second"
   @text combined = "${first} ${second}"
   ```

2. Current behavior:
   - The test fails with: "Undefined variable: first"
   - The output shows raw template `${first} ${second}` instead of resolved values
   - State merging appears to work for variables but variable resolution fails

3. Key implementation details:
   - InterpreterService creates a child state for each node interpretation
   - After each node, it attempts to merge back to parent state
   - StateFactory.mergeStates handles merging variables and nodes
   - TextDirectiveHandler uses ResolutionService to resolve variables

4. Recent changes:
   - Modified StateFactory.mergeStates to only append new nodes
   - This fixed node duplication but may have affected state inheritance

The core issue appears to be in the interaction between state merging and variable resolution. The variables are being merged but not properly inherited/accessible during resolution.

Please analyze:
1. The exact flow of state between InterpreterService, StateFactory, and TextDirectiveHandler during variable resolution
2. Whether the current state merging strategy maintains proper variable scope and inheritance
3. If the resolution context in TextDirectiveHandler has access to the correct state
4. A specific fix that ensures variables are both preserved and accessible during resolution

Focus on the variable resolution pathway and state inheritance chain. DO NOT GUESS. BE EVIDENCE-BASED AND EXPLICIT. 