# Type Requirements Analysis for Run Directive - ResolutionService Perspective

<1coreProperties>
- Property Name: command
- Description: The command string to be executed by the shell. This is the core property that ResolutionService needs to resolve variables within.
- Data Type: string
- Necessity: Essential

- Property Name: workingDir
- Description: The directory context in which the command should run. ResolutionService needs to resolve this path and possibly resolve variables within it.
- Data Type: string
- Necessity: Essential

- Property Name: env
- Description: Environment variables to be passed to the command. ResolutionService must resolve variable references within these values.
- Data Type: Record<string, string>
- Necessity: Essential

- Property Name: shell
- Description: The shell to use for execution. May contain variable references that need resolution.
- Data Type: string | boolean
- Necessity: Nice-to-have

- Property Name: captureOutput
- Description: Whether command output should be captured. Important for determining if output needs to be made available for variable resolution.
- Data Type: boolean
- Necessity: Essential

- Property Name: outputVariable
- Description: Variable name where captured output will be stored, making it available for future resolution.
- Data Type: string
- Necessity: Essential (when captureOutput is true)

- Property Name: errorOutputVariable
- Description: Variable name where error output will be stored, making it available for future resolution.
- Data Type: string
- Necessity: Nice-to-have
</1coreProperties>

<2typeDiscriminators>
- Discriminator Property: captureOutput
- Description: Distinguishes between run directives that capture output (making it available for variable resolution) and those that don't.
- Potential Values/Types: boolean (true/false)

- Discriminator Property: outputVariable
- Description: Presence indicates the run directive will store output in a variable for later resolution.
- Potential Values/Types: string | undefined
</2typeDiscriminators>

<3validationRules>
- Rule 1: The "command" field must be a non-empty string or contain valid variable references.
- Rationale: Empty commands would cause resolution errors and execution failures; ResolutionService needs valid content to resolve.

- Rule 2: If "captureOutput" is true, "outputVariable" must be a valid variable name string.
- Rationale: ResolutionService will need to register this variable for future resolution requests.

- Rule 3: Environment variable values in "env" must be strings or valid variable references.
- Rationale: ResolutionService needs to properly resolve any variable references within environment variables.

- Rule 4: "workingDir" must be a valid path string or contain valid variable references.
- Rationale: ResolutionService needs to properly resolve the working directory path.

- Rule 5: If specified, "errorOutputVariable" must be a valid variable name string.
- Rationale: Similar to outputVariable, this needs to be registered for future resolution.
</3validationRules>

<4currentPainPointsAddressed>
- Pain Point 1: Ambiguity in variable reference detection within command strings.
- How the proposed types resolve it: By explicitly typing the command as a string, ResolutionService can better identify and handle variable references consistently.

- Pain Point 2: Lack of clarity around which properties need variable resolution.
- How the proposed types resolve it: The type system clearly indicates which fields (command, workingDir, env) require variable resolution processing.

- Pain Point 3: Difficulty tracking output variables for later resolution.
- How the proposed types resolve it: Explicit typing of outputVariable and errorOutputVariable properties makes it clear when variables are being defined for future resolution.

- Pain Point 4: Inconsistent handling of nested variable references.
- How the proposed types resolve it: Clear typing of all string fields that may contain variables allows for consistent recursive resolution.
</4currentPainPointsAddressed>

<5useCasesExamplesFromResolutionservice>
- Use Case 1: Resolving variable references in a run command.
- Code Snippet/Example:
```typescript
// Current approach in ResolutionService
async resolveRunDirective(directive: any): Promise<ResolvedRunDirective> {
  const resolvedCommand = await this.textResolver.resolve(directive.command);
  const resolvedWorkingDir = directive.workingDir 
    ? await this.pathResolver.resolve(directive.workingDir) 
    : process.cwd();
  
  // With proper typing:
  // async resolveRunDirective(directive: RunDirective): Promise<ResolvedRunDirective> {
  //   const resolvedCommand = await this.textResolver.resolve(directive.command);
  //   const resolvedWorkingDir = directive.workingDir 
  //     ? await this.pathResolver.resolve(directive.workingDir) 
  //     : process.cwd();
  
  return {
    ...directive,
    command: resolvedCommand,
    workingDir: resolvedWorkingDir,
    env: await this.resolveEnvironmentVariables(directive.env || {})
  };
}
```

- Use Case 2: Registering captured output as a variable for future resolution.
- Code Snippet/Example:
```typescript
// After command execution in ExecutionService, ResolutionService would handle:
// With proper typing:
registerCommandOutput(directive: RunDirective, output: string, errorOutput: string): void {
  if (directive.captureOutput && directive.outputVariable) {
    this.variableRegistry.set(directive.outputVariable, output);
  }
  
  if (directive.errorOutputVariable) {
    this.variableRegistry.set(directive.errorOutputVariable, errorOutput);
  }
}
```

- Use Case 3: Resolving environment variables that may contain nested references.
- Code Snippet/Example:
```typescript
// Current approach needs type safety:
async resolveEnvironmentVariables(env: Record<string, any>): Promise<Record<string, string>> {
  const resolvedEnv: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(env)) {
    // Type safety would ensure value is string or has toString()
    resolvedEnv[key] = await this.textResolver.resolve(String(value));
  }
  
  return resolvedEnv;
}
```
</5useCasesExamplesFromResolutionservice>

<6interactionsDependencies>
- Interaction 1: The run directive's resolved output becomes available as variables for the variable reference resolution system.
- Interaction 2: Path resolution for workingDir interacts with the filesystem context and path resolution subsystem.
- Interaction 3: Variable references within the command, workingDir, and env properties interact with the VariableReferenceResolver.
- Interaction 4: The resolution of run directives depends on previously defined variables and may define new variables that affect subsequent resolution operations.
- Interaction 5: The run directive may reference files using path expressions that need to be resolved using the PathResolver.
</6interactionsDependencies>

<7baseTypeInterfaceSuggestions>
- Suggestion 1: Implement a common IResolvableDirective interface.
- Rationale: Run directives share common resolution needs with other directives; a base interface would standardize resolution handling.

- Suggestion 2: Extend a BaseCommandDirective type.
- Rationale: Run shares properties with other command execution directives (like exec); a common base type would promote consistency.

- Suggestion 3: Implement IVariableProvider interface for output capture.
- Rationale: Run directives that capture output act as variable providers, similar to let directives or other variable-defining constructs.

- Suggestion 4: Implement IPathAware interface for working directory handling.
- Rationale: Several directives (run, copy, etc.) need path-aware behavior; a common interface would standardize path resolution.
</7baseTypeInterfaceSuggestions>