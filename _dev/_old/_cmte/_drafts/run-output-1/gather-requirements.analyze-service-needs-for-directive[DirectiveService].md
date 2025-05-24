# Run Directive Type Requirements Analysis - DirectiveService Perspective

As the lead developer for the DirectiveService, I've analyzed the requirements for the run directive type system based on how our service processes and routes these directives.

<1coreProperties>
- Property Name: command
- Description: The command string to be executed, which may include a language prefix, command name, or defined command reference
- Data Type: string
- Necessity: Essential

- Property Name: args
- Description: Arguments to be passed to the command
- Data Type: string[] | Record<string, any>
- Necessity: Essential

- Property Name: input
- Description: Input content to be processed by the command
- Data Type: string
- Necessity: Essential

- Property Name: options
- Description: Configuration options for command execution
- Data Type: Record<string, any>
- Necessity: Nice-to-have

- Property Name: quiet
- Description: Flag to suppress command output
- Data Type: boolean
- Necessity: Nice-to-have

- Property Name: commandType
- Description: The classified type of command (basic, language, defined)
- Data Type: string (enum: "basic" | "language" | "defined")
- Necessity: Essential

- Property Name: language
- Description: Programming language for language commands
- Data Type: string
- Necessity: Essential (for language commands)

- Property Name: definedCommandName
- Description: Reference to a defined command
- Data Type: string
- Necessity: Essential (for defined commands)
</1coreProperties>

<2typeDiscriminators>
- Discriminator Property: commandType
- Description: Determines the type of command being executed and routes to appropriate handler
- Potential Values/Types: 
  - "basic": System commands like "list" or "help"
  - "language": Commands with language prefix like "js:" or "python:"
  - "defined": References to user-defined commands

- Discriminator Property: command
- Description: The raw command string can be parsed to determine command type
- Potential Values/Types:
  - Contains ":" with language prefix (language command)
  - Matches defined command name (defined command)
  - Standard system command (basic command)
</2typeDiscriminators>

<3validationRules>
- Rule 1: The "command" property must be a non-empty string.
- Rationale: Empty commands cannot be routed to handlers and would cause execution failures.

- Rule 2: When commandType is "language", the "language" property must be a non-empty string.
- Rationale: Language commands require a valid language identifier to be executed by the appropriate language handler.

- Rule 3: When commandType is "defined", the "definedCommandName" property must be a non-empty string.
- Rationale: Defined commands need to reference an existing command definition.

- Rule 4: Args must be either an array of strings or a record object.
- Rationale: The command execution service expects arguments in a consistent format for proper parameter passing.

- Rule 5: If "quiet" is present, it must be a boolean value.
- Rationale: The quiet flag determines output behavior and must be clearly defined.
</3validationRules>

<4currentPainPointsAddressed>
- Pain Point 1: Inconsistent command type classification.
- Resolution: The explicit commandType property with validation ensures consistent routing to the appropriate handler without relying on parsing logic in multiple places.

- Pain Point 2: Difficulty tracking the relationship between raw command strings and their parsed components.
- Resolution: By storing both the original command string and its parsed components (language, definedCommandName), debugging and error reporting become clearer.

- Pain Point 3: Ambiguity in argument handling between different command types.
- Resolution: Standardized args type that accommodates both positional (array) and named (object) parameters.

- Pain Point 4: Lack of clear structure for command execution options.
- Resolution: Dedicated options object with defined schema for configuration parameters.

- Pain Point 5: Redundant command parsing across different handlers.
- Resolution: Centralized parsing and classification through type discriminators reduces code duplication.
</4currentPainPointsAddressed>

<5useCasesExamplesFromDirectiveservice>
- Use Case 1: Classifying and routing a run directive to the appropriate handler.
```typescript
// With proper typing:
function routeRunDirective(runDirective: RunDirective) {
  switch(runDirective.commandType) {
    case "basic":
      return this.basicCommandHandler.handle(runDirective);
    case "language":
      return this.languageCommandHandler.handle(runDirective);
    case "defined":
      return this.definedCommandHandler.handle(runDirective);
    default:
      throw new DirectiveError(`Unknown command type: ${runDirective.commandType}`);
  }
}
```

- Use Case 2: Parsing a raw command string into structured components.
```typescript
// Leveraging the type system:
function parseRunDirective(directive: RunDirective): ParsedRunDirective {
  const { command } = directive;
  
  // Language command detection
  if (command.includes(':')) {
    const [language, commandPart] = command.split(':', 2);
    return {
      ...directive,
      commandType: "language",
      language,
      command: commandPart.trim()
    };
  }
  
  // Defined command detection
  if (this.definedCommandRegistry.has(command)) {
    return {
      ...directive,
      commandType: "defined",
      definedCommandName: command
    };
  }
  
  // Basic command
  return {
    ...directive,
    commandType: "basic"
  };
}
```

- Use Case 3: Executing a command with appropriate arguments and input.
```typescript
// Type-safe execution:
async function executeCommand(runDirective: RunDirective): Promise<CommandResult> {
  const { command, args, input, options = {}, quiet = false } = runDirective;
  
  // Type safety ensures all required properties exist
  const result = await this.commandExecutionService.execute({
    command,
    args: Array.isArray(args) ? args : Object.entries(args).map(([k, v]) => `${k}=${v}`),
    input,
    options,
    suppressOutput: quiet
  });
  
  return result;
}
```
</5useCasesExamplesFromDirectiveservice>

<6interactionsDependencies>
- Interaction 1: The RunDirective type needs to integrate with the DirectiveResult type to properly handle command execution results.

- Interaction 2: The RunDirective must interact with the DefineDirective type for resolving defined command references.

- Interaction 3: The RunDirective should be compatible with the broader Directive interface used throughout the DirectiveService.

- Interaction 4: The RunDirective type should accommodate integration with the CommandExecutionService which processes the actual command execution.

- Interaction 5: The classification and validation logic should be compatible with the RunDirectiveClassifier utility class.
</6interactionsDependencies>

<7baseTypeInterfaceSuggestions>
- Suggestion 1: RunDirective should extend a base ExecutionDirective interface.
- Rationale: This provides common structure for directives that execute code (run, embed, etc.).

- Suggestion 2: Implement a BaseCommand interface for the core command properties.
- Rationale: Creates consistency across all command-executing features in the system.

- Suggestion 3: Create specialized interfaces for each command type (BasicRunCommand, LanguageRunCommand, DefinedRunCommand).
- Rationale: Enables type-safe access to properties specific to each command variant.

- Suggestion 4: Implement a CommandResult interface for standardized output handling.
- Rationale: Ensures consistent structure for command execution results across all handlers.

- Suggestion 5: Create a discriminated union type for RunDirective based on commandType.
- Rationale: Provides type safety when working with different command variants.
</7baseTypeInterfaceSuggestions>