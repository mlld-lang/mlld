# StateService Requirements for Run Directive Type System

Based on my analysis of the StateService and the run directive, here are the detailed requirements for the type system from the StateService perspective:

## 1. Core Properties

- Property Name: `name`
- Description: Identifies the specific command to be executed
- Data Type: string
- Necessity: Essential

- Property Name: `args`
- Description: Arguments to be passed to the command
- Data Type: Record<string, any> | Array<any>
- Necessity: Essential

- Property Name: `once`
- Description: Indicates if the command should be executed only once
- Data Type: boolean
- Necessity: Essential

- Property Name: `id`
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential

- Property Name: `stateKey`
- Description: The key to store the result in state
- Data Type: string
- Necessity: Essential

- Property Name: `immediate`
- Description: Whether to execute the command immediately
- Data Type: boolean
- Necessity: Nice-to-have

- Property Name: `onError`
- Description: Error handling strategy
- Data Type: "continue" | "fail" | Function
- Necessity: Nice-to-have

## 2. Type Discriminators

- Discriminator Property: `name`
- Description: Distinguishes between different commands that can be executed
- Potential Values/Types: String values corresponding to registered commands

- Discriminator Property: `once`
- Description: Distinguishes between one-time and recurring command execution
- Potential Values/Types: boolean (true/false)

## 3. Validation Rules

- Rule 1: `name` must be a non-empty string corresponding to a registered command.
- Rationale: StateService needs to map the command name to an actual executable function.

- Rule 2: If `stateKey` is provided, it must be a valid state key that follows naming conventions.
- Rationale: StateService stores results under this key, so it must be valid for state operations.

- Rule 3: If `args` is provided, it must match the expected parameter structure for the specified command.
- Rationale: Commands expect specific argument structures; mismatches would cause execution failures.

- Rule 4: `id` must be unique within the current state context.
- Rationale: StateService uses this to track execution status and prevent duplicates for `once: true` commands.

## 4. Current Pain Points Addressed

- Pain Point 1: Ambiguity in how command results are stored in state.
- Resolution: Clear typing of `stateKey` property ensures predictable state storage locations.

- Pain Point 2: Difficulty tracking which commands have been executed when using `once: true`.
- Resolution: Proper typing of the `id` and `once` properties enables reliable execution tracking.

- Pain Point 3: Inconsistent error handling when commands fail.
- Resolution: Structured `onError` property provides clear error handling patterns.

- Pain Point 4: Type safety for command arguments.
- Resolution: Typing the `args` property according to command expectations prevents runtime errors.

## 5. Use Cases & Examples from StateService

- Use Case 1: Storing command results in state.
```typescript
// How StateService would handle a run directive with proper typing
function processRunDirective(runDirective: RunDirective) {
  const { name, args, stateKey, id, once } = runDirective;
  
  // Check if this command should run (based on once and id)
  if (once && this.hasRunBefore(id)) {
    return;
  }
  
  // Execute the command
  const result = this.executeCommand(name, args);
  
  // Store the result in state if stateKey is provided
  if (stateKey) {
    this.setState(stateKey, result);
  }
  
  // Mark as executed if once is true
  if (once) {
    this.markAsExecuted(id);
  }
}
```

- Use Case 2: Transforming state based on command execution
```typescript
// Example of how StateService would transform state after a run directive
function transformStateAfterRun(state: State, runDirective: RunDirective, result: any): State {
  const { stateKey } = runDirective;
  
  if (!stateKey) return state;
  
  // Create a new state with the command result stored at the specified key
  return {
    ...state,
    [stateKey]: result
  };
}
```

## 6. Interactions & Dependencies

- Interaction 1: Run directives interact with the state system by storing their results at specified keys.
- Interaction 2: Run directives may depend on existing state values when executing commands with dynamic arguments.
- Interaction 3: Run directives with `once: true` require persistent tracking of execution status, which interacts with the state persistence mechanism.
- Interaction 4: Error handling in run directives may trigger state transitions or updates based on the `onError` property.

## 7. Base Type/Interface Suggestions

- Suggestion 1: Implement a base `IDirective` interface that all directives extend.
- Rationale: Provides common properties like `id` and standardizes directive handling.

- Suggestion 2: Create a `CommandExecutable` interface that the run directive implements.
- Rationale: Standardizes the command execution pattern across different directive types that may execute commands.

- Suggestion 3: Implement a `StateAware` interface for directives that interact with state.
- Rationale: Provides consistent state interaction patterns for directives that read from or write to state.