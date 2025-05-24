# Type Requirements Analysis for Run Directive - InterpreterService Perspective

## 1. Core Properties

<1coreProperties>
- Property Name: code
- Description: The code/script to be executed by the run directive
- Data Type: string
- Necessity: Essential

- Property Name: language
- Description: The programming language of the code to be executed
- Data Type: string (enum of supported languages)
- Necessity: Essential

- Property Name: args
- Description: Arguments to be passed to the code execution
- Data Type: Record<string, any> | Array<any>
- Necessity: Essential

- Property Name: env
- Description: Environment variables for the execution context
- Data Type: Record<string, string>
- Necessity: Nice-to-have

- Property Name: timeout
- Description: Maximum execution time in milliseconds
- Data Type: number
- Necessity: Nice-to-have

- Property Name: outputs
- Description: Specification of expected outputs from the execution
- Data Type: Array<string> | Record<string, string>
- Necessity: Essential

- Property Name: outputFormat
- Description: Format specification for the output
- Data Type: string (enum of supported formats)
- Necessity: Nice-to-have

- Property Name: memoize
- Description: Whether to cache the result of this run directive
- Data Type: boolean
- Necessity: Nice-to-have

- Property Name: id
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential
</1coreProperties>

## 2. Type Discriminators

<2typeDiscriminators>
- Discriminator Property: language
- Description: Distinguishes between different language execution environments
- Potential Values/Types: "javascript", "typescript", "python", "shell", etc.

- Discriminator Property: executionContext
- Description: Distinguishes between different execution contexts (local, remote, etc.)
- Potential Values/Types: "local", "remote", "sandbox", "container"

- Discriminator Property: outputType
- Description: Indicates the type of output expected from the run directive
- Potential Values/Types: "json", "string", "binary", "stream"
</2typeDiscriminators>

## 3. Validation Rules

<3validationRules>
- Rule 1: The "code" property must be a non-empty string.
- Rationale: Empty code blocks would cause the interpreter to fail or do nothing, which is likely not the intended behavior.

- Rule 2: The "language" property must be one of the supported languages.
- Rationale: The InterpreterService needs to know which language interpreter to invoke.

- Rule 3: If "timeout" is provided, it must be a positive integer.
- Rationale: Negative timeouts are meaningless, and the interpreter needs a valid timeout value.

- Rule 4: The "id" property must be unique within a session/document.
- Rationale: The InterpreterService uses ids to track execution state and memoization.

- Rule 5: If "memoize" is true, the directive must have deterministic inputs.
- Rationale: Non-deterministic inputs would make memoization unreliable.

- Rule 6: "args" must match the expected input format for the specified language.
- Rationale: Different language runtimes expect arguments in different formats.
</3validationRules>

## 4. Current Pain Points Addressed

<4currentPainPointsAddressed>
- Pain Point 1: Inconsistent handling of execution results across different language runtimes.
- How the proposed types resolve it: By standardizing the output format and structure, the InterpreterService can provide consistent result handling regardless of the language.

- Pain Point 2: Difficulty in tracking execution state for long-running or memoized executions.
- How the proposed types resolve it: The required "id" property and optional "memoize" flag provide clear mechanisms for state tracking.

- Pain Point 3: Ambiguity in error handling when code execution fails.
- How the proposed types resolve it: With well-defined types, the InterpreterService can distinguish between type errors (invalid directive structure) and runtime errors (execution failures).

- Pain Point 4: Lack of standardization in how environment variables and arguments are passed.
- How the proposed types resolve it: Clear typing of "args" and "env" properties ensures consistent handling.

- Pain Point 5: No clear mechanism for limiting resource usage in code execution.
- How the proposed types resolve it: The "timeout" property provides a standard way to limit execution time.
</4currentPainPointsAddressed>

## 5. Use Cases & Examples from InterpreterService

<5useCasesExamplesFromInterpreterservice>
- Use Case 1: Basic code execution and result handling
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
async interpret(directive: RunDirective): Promise<InterpretResult> {
  const { code, language, args, id } = directive;
  
  // Validate required properties
  if (!code || !language || !id) {
    return {
      success: false,
      error: new Error('Missing required properties in run directive')
    };
  }
  
  // Execute code based on language
  const executor = this.executorRegistry.getExecutor(language);
  const result = await executor.execute(code, args);
  
  return {
    success: true,
    output: result,
    directiveId: id
  };
}
```

- Use Case 2: Memoization of execution results
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
async interpret(directive: RunDirective): Promise<InterpretResult> {
  const { code, language, args, id, memoize = false } = directive;
  
  // Check cache if memoization is enabled
  if (memoize) {
    const cacheKey = this.generateCacheKey(id, code, args);
    const cachedResult = this.resultCache.get(cacheKey);
    
    if (cachedResult) {
      return {
        success: true,
        output: cachedResult,
        directiveId: id,
        fromCache: true
      };
    }
    
    // Execute and store in cache
    const result = await this.executeCode(directive);
    this.resultCache.set(cacheKey, result);
    return {
      success: true,
      output: result,
      directiveId: id
    };
  }
  
  // Regular execution without caching
  return this.executeCode(directive);
}
```

- Use Case 3: Handling timeout constraints
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
private async executeWithTimeout(directive: RunDirective): Promise<any> {
  const { code, timeout } = directive;
  
  if (!timeout) {
    return this.executeCode(directive);
  }
  
  return Promise.race([
    this.executeCode(directive),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution timed out')), timeout);
    })
  ]);
}
```
</5useCasesExamplesFromInterpreterservice>

## 6. Interactions & Dependencies

<6interactionsDependencies>
- Interaction 1: The run directive needs to interact with the variable scope system to access variables in the execution context and potentially modify them.

- Interaction 2: The run directive should be able to reference and use the output of other directives, particularly for code that processes results from previous operations.

- Interaction 3: The run directive may need to interact with the file system service for operations that read or write files.

- Interaction 4: The run directive should be able to interface with the session state to maintain execution context across multiple runs.

- Interaction 5: The run directive needs to interact with the security service to ensure code execution happens within appropriate security boundaries.

- Interaction 6: The run directive should be able to access the output of previous run directives, enabling pipeline-style operations.
</6interactionsDependencies>

## 7. Base Type/Interface Suggestions

<7baseTypeInterfaceSuggestions>
- Suggestion 1: Implement a common IDirective interface
- Rationale: All directives should share common properties like id and type, allowing for consistent handling in the pipeline.

- Suggestion 2: Exten