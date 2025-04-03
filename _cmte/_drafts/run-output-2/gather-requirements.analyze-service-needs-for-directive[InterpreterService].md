# Type Requirements Analysis for Run Directive - InterpreterService Perspective

As the lead developer for the InterpreterService, which orchestrates the main interpretation pipeline, I've analyzed the requirements for the `run` directive type system based on how our service processes this directive.

## 1. Core Properties

<1coreProperties>
- Property Name: id
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential

- Property Name: directiveType
- Description: Identifies this as a run directive
- Data Type: literal "run"
- Necessity: Essential

- Property Name: command
- Description: The command to be executed
- Data Type: string
- Necessity: Essential

- Property Name: args
- Description: Arguments to be passed to the command
- Data Type: string[]
- Necessity: Essential

- Property Name: cwd
- Description: Current working directory for command execution
- Data Type: string
- Necessity: Essential

- Property Name: env
- Description: Environment variables for the command execution
- Data Type: Record<string, string>
- Necessity: Nice-to-have

- Property Name: shell
- Description: Whether to run the command in a shell
- Data Type: boolean
- Necessity: Nice-to-have

- Property Name: timeout
- Description: Maximum execution time in milliseconds
- Data Type: number
- Necessity: Nice-to-have

- Property Name: executionResult
- Description: Result of the command execution
- Data Type: Object containing stdout, stderr, exitCode
- Necessity: Essential
</1coreProperties>

## 2. Type Discriminators

<2typeDiscriminators>
- Discriminator Property: directiveType
- Description: Distinguishes this directive as a "run" directive
- Potential Values/Types: "run"

- Discriminator Property: executionMode
- Description: Determines how the command should be executed and how results are processed
- Potential Values/Types: "sync" | "async" | "stream"
</2typeDiscriminators>

## 3. Validation Rules

<3validationRules>
- Rule 1: "command" must be a non-empty string
- Rationale: InterpreterService needs a valid command to execute; empty commands would fail execution

- Rule 2: "args" must be an array of strings (can be empty)
- Rationale: Command arguments must be properly formatted for the execution engine

- Rule 3: "cwd" must be a valid directory path
- Rationale: InterpreterService needs a valid working directory to execute the command

- Rule 4: "timeout" must be a positive number if provided
- Rationale: Negative timeouts don't make sense and could cause unexpected behavior

- Rule 5: "env" must contain string values only
- Rationale: Environment variables must be properly formatted as strings for the execution engine
</3validationRules>

## 4. Current Pain Points Addressed

<4currentPainPointsAddressed>
- Pain Point 1: Inconsistent structure for run directive parameters
- How the proposed types resolve it: By defining a clear structure with required and optional fields, we ensure consistent handling across the pipeline

- Pain Point 2: Lack of validation for command execution parameters
- How the proposed types resolve it: Type-level validation ensures that commands and arguments are properly formatted before reaching execution

- Pain Point 3: Unclear handling of execution results
- How the proposed types resolve it: Defining a structured executionResult property ensures consistent result handling

- Pain Point 4: Missing context for command execution
- How the proposed types resolve it: Properties like cwd and env provide necessary context for command execution
</4currentPainPointsAddressed>

## 5. Use Cases & Examples from InterpreterService

<5useCasesExamplesFromInterpreterservice>
- Use Case 1: Processing a run directive in the interpretation pipeline
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
private async processRunDirective(directive: RunDirective): Promise<InterpretationResult> {
  const { command, args, cwd, env, timeout, executionMode } = directive;
  
  // Validate required properties
  if (!command) {
    return {
      success: false,
      error: new Error('Run directive requires a command')
    };
  }
  
  try {
    const result = await this.executionService.execute({
      command,
      args: args || [],
      cwd: cwd || process.cwd(),
      env: env || {},
      timeout: timeout || DEFAULT_TIMEOUT,
      mode: executionMode || 'sync'
    });
    
    // Update directive with execution results
    directive.executionResult = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
    
    return {
      success: result.exitCode === 0,
      result: directive
    };
  } catch (error) {
    return {
      success: false,
      error
    };
  }
}
```

- Use Case 2: Handling different execution modes
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
private async executeCommand(runDirective: RunDirective): Promise<ExecutionResult> {
  switch (runDirective.executionMode) {
    case 'stream':
      return this.streamCommandExecution(runDirective);
    case 'async':
      return this.executeCommandAsync(runDirective);
    case 'sync':
    default:
      return this.executeCommandSync(runDirective);
  }
}
```

- Use Case 3: Integrating run directive results into the interpretation context
- Code Snippet/Example:
```typescript
// In InterpreterService.ts
private async interpretDirectives(directives: Directive[], context: InterpretationContext): Promise<InterpretationContext> {
  for (const directive of directives) {
    if (directive.directiveType === 'run') {
      const result = await this.processRunDirective(directive as RunDirective);
      if (result.success) {
        const runResult = (result.result as RunDirective).executionResult;
        // Add command output to context for potential use by subsequent directives
        context.variables[`${directive.id}_stdout`] = runResult.stdout;
        context.variables[`${directive.id}_exitCode`] = runResult.exitCode;
      } else {
        // Handle execution error
        context.errors.push(result.error);
      }
    }
    // Handle other directive types...
  }
  return context;
}
```
</5useCasesExamplesFromInterpreterservice>

## 6. Interactions & Dependencies

<6interactionsDependencies>
- Interaction 1: Run directive depends on the ExecutionService for actual command execution
- Interaction 2: Run directive results can be used by subsequent directives in the pipeline through the interpretation context
- Interaction 3: Run directive may interact with file directives when processing file paths or working with file content
- Interaction 4: Run directive execution may be affected by environment directives that modify the execution environment
</6interactionsDependencies>

## 7. Base Type/Interface Suggestions

<7baseTypeInterfaceSuggestions>
- Suggestion 1: Extend a common BaseDirective interface
- Rationale: All directives should share common properties like id and directiveType for consistent processing in the pipeline

- Suggestion 2: Implement an ExecutableDirective interface
- Rationale: Creates a common interface for directives that execute external processes, potentially allowing for shared execution logic and result handling

- Suggestion 3: Create a CommandExecutionResult interface for standardizing execution results
- Rationale: Standardizes the structure of command execution results across different execution modes and contexts
</7baseTypeInterfaceSuggestions>