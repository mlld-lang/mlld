# Type Requirements Analysis for Run Directive from DirectiveService Perspective

Based on my analysis of the DirectiveService codebase and the overall Meld architecture, here are the detailed type requirements for the `run` directive:

<1coreProperties>
- Property Name: `name`
- Description: The identifier for the command to be executed, which could be a basic command, language command, or defined command
- Data Type: string
- Necessity: Essential

- Property Name: `args`
- Description: Arguments to be passed to the command, which can vary based on the command type
- Data Type: array of string | object
- Necessity: Essential

- Property Name: `input`
- Description: Input content to be processed by the command
- Data Type: string
- Necessity: Essential

- Property Name: `stdin`
- Description: Optional input to be passed as standard input to the command
- Data Type: string
- Necessity: Nice-to-have

- Property Name: `env`
- Description: Environment variables to be set for the command execution
- Data Type: Record<string, string>
- Necessity: Nice-to-have

- Property Name: `cwd`
- Description: Working directory for command execution
- Data Type: string
- Necessity: Nice-to-have

- Property Name: `timeout`
- Description: Maximum execution time before termination
- Data Type: number (milliseconds)
- Necessity: Nice-to-have

- Property Name: `feedbackStrategy`
- Description: How execution feedback should be handled
- Data Type: enum ('error' | 'warning' | 'ignore')
- Necessity: Essential
</1coreProperties>

<2typeDiscriminators>
- Discriminator Property: `commandType`
- Description: Distinguishes between different types of commands the RunDirectiveHandler can process
- Potential Values/Types: 'basic' | 'language' | 'defined'

- Discriminator Property: `name`
- Description: The command name itself can act as an implicit discriminator, especially for language commands
- Potential Values/Types: For language commands, values like 'js', 'python', 'shell' indicate the language interpreter
</2typeDiscriminators>

<3validationRules>
- Rule 1: The `name` property must be a non-empty string.
- Rationale: The DirectiveService relies on this to route the command to the appropriate handler.

- Rule 2: If `commandType` is 'language', the `name` must be one of the supported language identifiers.
- Rationale: The LanguageCommandHandler needs to validate supported languages.

- Rule 3: The `args` property must be properly structured based on the command type.
- Rationale: Improperly structured arguments will cause command execution failures.

- Rule 4: The `timeout` value, if provided, must be a positive integer.
- Rationale: Negative timeouts don't make sense and could cause execution issues.

- Rule 5: The `feedbackStrategy` must be one of the allowed enum values.
- Rationale: The RunFeedbackManager requires a valid strategy to properly handle command execution results.
</3validationRules>

<4currentPainPointsAddressed>
- Pain Point 1: Lack of clear command type discrimination.
- Resolution: The proposed `commandType` property explicitly identifies the command category, eliminating the need for the current complex classification logic in RunDirectiveClassifier.

- Pain Point 2: Inconsistent handling of command arguments across different command types.
- Resolution: Type definitions that vary based on command type would enforce consistent argument structures.

- Pain Point 3: Insufficient validation before command execution.
- Resolution: Strong typing would enable early validation before the command is passed to execution services.

- Pain Point 4: Difficulty in extending the system with new command types.
- Resolution: A discriminated union type system would make it easier to add new command variants while maintaining type safety.

- Pain Point 5: Ambiguous error handling strategies.
- Resolution: The typed `feedbackStrategy` property provides clear expectations for error handling behavior.
</4currentPainPointsAddressed>

<5useCasesExamplesFromDirectiveservice>
- Use Case 1: Processing a basic shell command.
- Code Snippet/Example:
```typescript
// With proper typing:
const runDirective: RunDirective = {
  name: 'ls',
  args: ['-la'],
  input: '',
  commandType: 'basic',
  feedbackStrategy: 'error'
};
const handler = new BasicCommandHandler();
await handler.handle(runDirective, context);
```

- Use Case 2: Executing a language-specific command.
- Code Snippet/Example:
```typescript
// With proper typing:
const runDirective: LanguageRunDirective = {
  name: 'python',
  args: [],
  input: 'print("Hello, world!")',
  commandType: 'language',
  feedbackStrategy: 'warning'
};
const handler = new LanguageCommandHandler();
await handler.handle(runDirective, context);
```

- Use Case 3: Running a user-defined command.
- Code Snippet/Example:
```typescript
// With proper typing:
const runDirective: DefinedRunDirective = {
  name: 'myCustomCommand',
  args: { param1: 'value1', param2: 'value2' },
  input: 'Some input data',
  commandType: 'defined',
  feedbackStrategy: 'ignore'
};
const handler = new DefinedCommandHandler();
await handler.handle(runDirective, context);
```

- Use Case 4: Command execution with environment variables and working directory.
- Code Snippet/Example:
```typescript
// With proper typing:
const runDirective: RunDirective = {
  name: 'npm',
  args: ['install'],
  input: '',
  commandType: 'basic',
  env: { NODE_ENV: 'development' },
  cwd: './project',
  feedbackStrategy: 'error'
};
const result = await commandExecutionService.execute(runDirective);
```
</5useCasesExamplesFromDirectiveservice>

<6interactionsDependencies>
- Interaction 1: The RunDirective type needs to interact with the CommandExecutionService interface, which requires structured command information.

- Interaction 2: The RunDirective type interacts with the DirectiveResult type, as the execution results need to be properly formatted based on the directive structure.

- Interaction 3: The RunDirective interacts with the RunFeedbackManager, which uses the feedbackStrategy property to determine how to handle execution results.

- Interaction 4: The RunDirective type depends on the overall DirectiveTypes system, particularly for integration with the directive transformation pipeline.

- Interaction 5: For defined commands, the RunDirective needs to interact with the DefineDirective type to ensure command definitions are properly referenced.
</6interactionsDependencies>

<7baseTypeInterfaceSuggestions>
- Suggestion 1: Create a base `BaseRunDirective` interface with common properties.
- Rationale: All run directive variants share common properties like name, input, and feedbackStrategy.

- Suggestion 2: Implement a discriminated union type pattern using the `commandType` property.
- Rationale: This allows for type-safe handling of different command variants while maintaining a unified type system.

- Suggestion 3: Extend from a common `IDirective` interface that all directives implement.
- Rationale: This ensures consistency across all directive types and enables common handling patterns in the DirectiveService.

- Suggestion 4: Create specific interfaces for each command type (BasicRunDirective, LanguageRunDirective, DefinedRunDirective).
- Rationale: Each command type has unique properties and validation requirements that should be captured in the type system.
</7baseTypeInterfaceSuggestions>