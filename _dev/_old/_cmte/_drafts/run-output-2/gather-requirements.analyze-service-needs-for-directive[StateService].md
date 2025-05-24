# Type Requirements Analysis for `run` Directive: StateService Perspective

After analyzing the StateService code and the run directive documentation, I've identified the following type system requirements for the `run` directive from the StateService perspective:

## <1coreProperties>
- Property Name: `id`
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential

- Property Name: `type`
- Description: Specifies this is a run directive
- Data Type: literal "run"
- Necessity: Essential

- Property Name: `target`
- Description: The component or service to execute
- Data Type: string
- Necessity: Essential

- Property Name: `params`
- Description: Parameters to pass to the target
- Data Type: Record<string, any>
- Necessity: Essential

- Property Name: `env`
- Description: Environment variables to set during execution
- Data Type: Record<string, string>
- Necessity: Nice-to-have

- Property Name: `cwd`
- Description: Working directory for execution
- Data Type: string
- Necessity: Nice-to-have

- Property Name: `timeout`
- Description: Maximum execution time in milliseconds
- Data Type: number
- Necessity: Nice-to-have

- Property Name: `stateKey`
- Description: Key to store execution state in StateService
- Data Type: string
- Necessity: Essential

- Property Name: `outputTransform`
- Description: Transform function to apply to execution output
- Data Type: string | Function
- Necessity: Nice-to-have
</1coreProperties>

## <2typeDiscriminators>
- Discriminator Property: `target`
- Description: Differentiates between different types of run operations based on what's being executed
- Potential Values/Types: "shell", "node", "python", "service", etc.

- Discriminator Property: `async`
- Description: Distinguishes between synchronous and asynchronous execution modes
- Potential Values/Types: boolean (true/false)

- Discriminator Property: `outputMode`
- Description: Determines how output is handled and stored
- Potential Values/Types: "capture", "stream", "ignore"
</2typeDiscriminators>

## <3validationRules>
- Rule 1: `stateKey` must be a valid string identifier (no spaces, special characters limited to underscore and dot).
- Rationale: StateService uses these keys for storage and retrieval; invalid keys would cause lookup failures.

- Rule 2: If `params` contains variables referencing state, they must follow the pattern `${stateKey}` or `${stateKey.path}`.
- Rationale: StateService needs to identify and resolve these references before execution.

- Rule 3: When `target` is "service", the service name must be a registered service.
- Rationale: StateService needs to validate service existence before attempting to execute commands on it.

- Rule 4: The `id` must be unique within the current execution context.
- Rationale: StateService relies on unique identifiers to properly track and store state for each run directive.
</3validationRules>

## <4currentPainPointsAddressed>
- Pain Point 1: Lack of standardized state storage mechanism for run outputs.
- Resolution: The `stateKey` property provides a consistent way to specify where outputs should be stored in state.

- Pain Point 2: Inconsistent handling of state references in parameters.
- Resolution: Formalized validation rules for state references in params ensures StateService can reliably resolve them.

- Pain Point 3: No clear distinction between different execution modes (sync vs async).
- Resolution: The `async` discriminator property allows StateService to properly handle execution based on the expected behavior.

- Pain Point 4: Difficulty tracking relationships between run directives and their state.
- Resolution: Standardized `id` and `stateKey` properties create a clear connection between execution and state storage.
</4currentPainPointsAddressed>

## <5useCasesExamplesFromStateservice>
- Use Case 1: Storing command output in state
```typescript
// Run directive in Meld
{
  "type": "run",
  "id": "listFiles",
  "target": "shell",
  "params": { "command": "ls -la" },
  "stateKey": "fileList"
}

// How StateService would use this
stateService.set("fileList", commandOutput);
const files = stateService.get("fileList");
```

- Use Case 2: Referencing existing state in run parameters
```typescript
// Run directive in Meld
{
  "type": "run",
  "id": "processFile",
  "target": "node",
  "params": { 
    "script": "process.js",
    "args": ["${fileList.0.name}"]  // Reference to previously stored state
  },
  "stateKey": "processedData"
}

// How StateService resolves this
const params = directive.params;
const resolvedArgs = params.args.map(arg => {
  if (typeof arg === 'string' && arg.match(/\${.+}/)) {
    const stateRef = arg.match(/\${(.+)}/)[1];
    return stateService.get(stateRef);
  }
  return arg;
});
```

- Use Case 3: Transforming output before storing in state
```typescript
// Run directive in Meld
{
  "type": "run",
  "id": "fetchUserData",
  "target": "service",
  "params": { 
    "serviceName": "userService",
    "method": "getUsers" 
  },
  "outputTransform": "extractActiveUsers",
  "stateKey": "activeUsers"
}

// How StateService would handle the transformation
const output = await executeDirective(directive);
const transformFn = getTransformFunction(directive.outputTransform);
const transformedOutput = transformFn(output);
stateService.set(directive.stateKey, transformedOutput);
```
</5useCasesExamplesFromStateservice>

## <6interactionsDependencies>
- Interaction 1: The `run` directive needs to interact with the `var` directive type system to reference variables stored in state.

- Interaction 2: The `run` directive should be compatible with the `transform` directive type system to allow chaining operations (run output -> transform -> state).

- Interaction 3: The `run` directive needs to interact with the overall pipeline execution context to access environment variables and configuration.

- Interaction 4: When a `run` directive has dependencies on previous state, there needs to be a standardized way to express these dependencies for proper execution ordering.
</6interactionsDependencies>

## <7baseTypeInterfaceSuggestions>
- Suggestion 1: Implement a base `IDirective` interface with common properties like `id`, `type`, and metadata.
- Rationale: Ensures consistent handling of all directives by StateService and other services.

- Suggestion 2: Implement an `IStateful` interface for directives that interact with state.
- Rationale: Standardizes how directives declare their state requirements and outputs, making it easier for StateService to manage state interactions.

- Suggestion 3: Implement an `IAsyncExecutable` interface for directives that can be executed asynchronously.
- Rationale: Provides consistent handling of execution lifecycle events that StateService needs to track for state management.

- Suggestion 4: Create a `RunDirectiveBase` abstract type that implements the common properties and behaviors.
- Rationale: Reduces duplication and ensures consistent implementation across different run directive variants.
</7baseTypeInterfaceSuggestions>