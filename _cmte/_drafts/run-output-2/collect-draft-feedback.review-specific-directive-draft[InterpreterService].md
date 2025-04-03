# Feedback on Run Draft Specification (from InterpreterService)

## 1. Accuracy Assessment

The draft specification for the `run` directive generally aligns with the InterpreterService's requirements. The core properties needed for command execution are present, and the type structure allows for flexible execution modes that our service would need to orchestrate. The enums for different execution modes, output handling, and error handling are particularly useful for our orchestration responsibilities.

## 2. Completeness Assessment

* **Missing Property**: `resolvedCommand` (string) - As the orchestrator of the interpretation pipeline, InterpreterService often needs to track both the original command and the resolved command after variable substitution or path resolution.

* **Missing Property**: `dependsOn` (string[] | string) - We need to handle dependencies between directives, especially for asynchronous execution. This would allow specifying directives that must complete before this one executes.

* **Missing Type**: There's no clear way to represent streamed outputs for the `STREAM` execution mode. We need a mechanism to handle ongoing output during execution.

* **Missing Property**: `priority` (number) - For managing execution order in the pipeline, especially when multiple directives could be executed in parallel.

## 3. Clarity & Usability Assessment

* The naming conventions are clear and consistent with our service's existing code.

* The TSDoc comments are helpful but could be more specific about the responsibilities of the InterpreterService versus other services.

* Suggested Renaming: `executionResult` → `result` - This is more concise and we already know we're dealing with execution.

* The enum values are well-named and align with our execution patterns.

## 4. Potential Issues / Edge Cases

* **Issue 1**: There's no explicit handling for nested command execution or command composition, which we sometimes need to support.

* **Issue 2**: The current specification doesn't address how to handle long-running commands that may outlive the request lifecycle, which is important for our service's orchestration responsibilities.

* **Issue 3**: No mechanism is defined for cancellation of running commands, which is essential for our service to manage resource utilization.

* **Issue 4**: The specification doesn't address how InterpreterService should handle environment isolation between different run directives, which is crucial for security and predictability.

## 5. Validation Concerns

* **Concern 1**: The `shell` property is marked as required, but should be optional with a default value (typically `false`). This would better align with how our service handles command execution.

* **Concern 2**: There's no validation rule for `commandType` to ensure it's compatible with the actual command being executed, which could lead to runtime errors in our service.

* **Concern 3**: The `timeout` validation only ensures it's positive, but we should also have an upper bound to prevent resource exhaustion.

## 6. Specific Improvement Suggestions

* **Suggestion 1**: Add a `signal` property of type `AbortSignal` to allow for command cancellation, which is essential for our orchestration responsibilities.

* **Suggestion 2**: Modify the `RunExecutionResult` interface to include a `startTime` and `endTime` property to help with performance monitoring and timeout enforcement.

* **Suggestion 3**: Add a `retryOptions` property to specify retry behavior for failed commands, including max attempts and backoff strategy.

* **Suggestion 4**: Consider adding a `onProgress` callback property for streaming execution modes to notify about ongoing execution status.

* **Suggestion 5**: The `args` property should support both string arrays and object structures, depending on `commandType`. Consider using a union type or generic to better represent this:
```typescript
args: string[] | Record<string, any>;
```

* **Suggestion 6**: Add a `parseOptions` property to provide more control over how command output is parsed, especially for complex JSON or structured text outputs that our service needs to interpret.