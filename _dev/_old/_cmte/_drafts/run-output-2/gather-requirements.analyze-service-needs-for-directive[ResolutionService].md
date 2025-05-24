# Type Requirements Analysis for Run Directive from ResolutionService Perspective

Based on analyzing the ResolutionService's role in handling variable interpolation and path expansion, here are the detailed type requirements for the `run` directive:

<1coreProperties>
- Property Name: command
- Description: The shell command to be executed
- Data Type: string (potentially with variable interpolation)
- Necessity: Essential

- Property Name: args
- Description: Arguments to pass to the command
- Data Type: string[] (array of strings that may contain variable references)
- Necessity: Essential

- Property Name: cwd
- Description: Current working directory for command execution
- Data Type: string (path that may require resolution)
- Necessity: Essential

- Property Name: env
- Description: Environment variables for the command execution
- Data Type: Record<string, string> (dictionary of name-value pairs that may contain variable references)
- Necessity: Essential

- Property Name: timeout
- Description: Maximum execution time in milliseconds
- Data Type: number
- Necessity: Nice-to-have

- Property Name: shell
- Description: Specifies the shell to use for command execution
- Data Type: boolean | string (true/false or specific shell path)
- Necessity: Nice-to-have

- Property Name: encoding
- Description: Character encoding for command output
- Data Type: string
- Necessity: Nice-to-have
</1coreProperties>

<2typeDiscriminators>
- Discriminator Property: outputHandling
- Description: Distinguishes how the output of the command should be processed
- Potential Values/Types: "raw" | "text" | "json" | "lines" | undefined
- Determines how ResolutionService should interpret and resolve the command output

- Discriminator Property: errorHandling
- Description: Determines behavior when command fails
- Potential Values/Types: "ignore" | "warn" | "error" | undefined
- Affects how ResolutionService should process execution failures
</2typeDiscriminators>

<3validationRules>
- Rule 1: Either "command" or both "command" and "args" must be provided
- Rationale: ResolutionService needs a valid command to resolve and execute

- Rule 2: If "env" is provided, all values must be strings or resolvable to strings
- Rationale: Environment variables must be string values after resolution

- Rule 3: "cwd" must be a valid path string or resolvable to a valid path
- Rationale: ResolutionService needs to resolve the working directory path correctly

- Rule 4: Variable references in command, args, cwd, and env must be valid and resolvable
- Rationale: ResolutionService's core responsibility is resolving these references

- Rule 5: If "timeout" is provided, it must be a positive number
- Rationale: Prevents invalid timeout values that could cause unexpected behavior
</3validationRules>

<4currentPainPointsAddressed>
- Pain Point 1: Lack of standardized structure for command execution properties
- Resolution: Clearly defined properties with specific types provide consistent structure for resolution

- Pain Point 2: Ambiguity in how variable references should be processed in different fields
- Resolution: Explicit typing of fields that can contain variable references helps ResolutionService identify where resolution is needed

- Pain Point 3: Unclear error handling expectations when resolution fails
- Resolution: The errorHandling discriminator provides explicit guidance on how to handle failures

- Pain Point 4: Inconsistent handling of command output in downstream processing
- Resolution: The outputHandling discriminator standardizes how command output should be interpreted
</4currentPainPointsAddressed>

<5useCasesExamplesFromResolutionservice>
- Use Case 1: Resolving variable references in a run command
```typescript
// Example showing how ResolutionService would handle a run directive
async resolveRunDirective(runDirective: RunDirective, context: ResolutionContext): Promise<ResolvedRunDirective> {
  const resolvedCommand = await this.variableReferenceResolver.resolve(runDirective.command, context);
  
  const resolvedArgs = runDirective.args 
    ? await Promise.all(runDirective.args.map(arg => 
        this.variableReferenceResolver.resolve(arg, context)))
    : [];
    
  const resolvedCwd = runDirective.cwd 
    ? await this.pathResolver.resolve(runDirective.cwd, context)
    : process.cwd();
    
  const resolvedEnv: Record<string, string> = {};
  if (runDirective.env) {
    for (const [key, value] of Object.entries(runDirective.env)) {
      resolvedEnv[key] = await this.variableReferenceResolver.resolve(value, context);
    }
  }
  
  return {
    command: resolvedCommand,
    args: resolvedArgs,
    cwd: resolvedCwd,
    env: resolvedEnv,
    outputHandling: runDirective.outputHandling,
    errorHandling: runDirective.errorHandling,
    timeout: runDirective.timeout,
    shell: runDirective.shell,
    encoding: runDirective.encoding
  };
}
```

- Use Case 2: Processing command output based on outputHandling type
```typescript
// Example showing how ResolutionService would handle command output
async processCommandOutput(output: string, outputHandling: RunDirective['outputHandling']): Promise<any> {
  switch (outputHandling) {
    case 'raw':
      return output;
    case 'text':
      return output.trim();
    case 'json':
      try {
        return JSON.parse(output);
      } catch (error) {
        throw new ResolutionError('Failed to parse command output as JSON', {
          output,
          error
        });
      }
    case 'lines':
      return output.split('\n').filter(line => line.trim() !== '');
    default:
      return output.trim(); // Default to text handling
  }
}
```
</5useCasesExamplesFromResolutionservice>

<6interactionsDependencies>
- Interaction 1: The run directive's resolved output may be used as input to variable resolution in other directives
- The ResolutionService needs to maintain the output format based on outputHandling for proper variable referencing

- Interaction 2: Path variables in cwd may need to be resolved using the PathResolver component
- This requires coordination between variable resolution and path resolution capabilities

- Interaction 3: Environment variables in env may reference other variables that need resolution
- The resolution needs to happen recursively but safely to prevent circular references

- Interaction 4: The run directive may be embedded within other directives that require resolution
- The ResolutionService needs to handle nested resolution contexts appropriately
</6interactionsDependencies>

<7baseTypeInterfaceSuggestions>
- Suggestion 1: Implement IResolvableDirective interface
- Rationale: The run directive contains multiple fields that need variable resolution, making it a prime candidate for implementing a common resolution interface

- Suggestion 2: Extend BaseExecutableDirective
- Rationale: If other directives like exec or similar execution-related directives exist, they could share common properties with run through a base type

- Suggestion 3: Implement IPathAwareDirective interface
- Rationale: The run directive contains path information (cwd) that requires special resolution handling, making it appropriate to implement a path-aware interface
</7baseTypeInterfaceSuggestions>