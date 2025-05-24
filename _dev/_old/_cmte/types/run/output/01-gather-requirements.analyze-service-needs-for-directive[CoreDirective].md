# Improving Type Safety for CoreDirective's Run Types

## Current Challenges in the CoreDirective Service

After analyzing the provided code, I've identified several areas where the `@run` directive handling could benefit from stronger typing. The current implementation has these key issues:

1. **No clear type discrimination between run subtypes** (BasicCommand, LanguageCommand, DefinedCommand)
2. **Inconsistent parameter handling** across different run types
3. **Type-unsafe command execution** with minimal compile-time validation
4. **Command reference resolution** that relies on runtime checks instead of type guarantees
5. **Limited error handling specificity** for different run subtypes

## Proposed Type Improvements

### 1. Discriminated Union for Run Directive Types

```typescript
// Define a discriminated union for the three run types
type RunDirectiveType = 
  | { type: 'basicCommand'; command: string; isMultiLine: boolean }
  | { type: 'languageCommand'; language: string; parameters: string[]; code: string }
  | { type: 'definedCommand'; commandName: string; args: any[] };

// Enhanced DirectiveNode type that includes run-specific properties
interface RunDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'run';
    runType: RunDirectiveType;
    // Other common properties
  }
}
```

**Justification:** This discriminated union would provide compile-time type safety when handling different run types. Instead of relying on runtime property checks (like `if (directive.isMultiLine && directive.language)`), the code could use type guards to ensure proper handling of each subtype. This would eliminate potential bugs from misclassification and make the code more maintainable.

### 2. Parameter Type Definitions for Language Commands

```typescript
// Define parameter types for language commands
interface LanguageCommandParameters {
  js: { [paramName: string]: string | number | boolean };
  python: { [paramName: string]: string | number | boolean };
  bash: string[]; // Bash uses positional parameters
}

// Enhanced language command type
interface LanguageCommandType {
  type: 'languageCommand';
  language: keyof LanguageCommandParameters;
  parameters: LanguageCommandParameters[keyof LanguageCommandParameters];
  code: string;
}
```

**Justification:** Different languages have different parameter handling needs. By creating typed parameter structures, we can ensure that parameters are passed correctly to each language runtime. This would prevent errors where parameters are passed in the wrong format or with incorrect types, which currently requires manual validation in the code.

### 3. Command Definition Interface

```typescript
// Define structure for command definitions
interface CommandDefinition {
  name: string;
  parameters: string[]; // Parameter names
  command: string; // Command template
  description?: string;
}

// Type for accessing defined commands
interface CommandRegistry {
  getCommand(name: string): CommandDefinition | undefined;
  hasCommand(name: string): boolean;
}
```

**Justification:** The current code has to manually validate command existence and parameter count. With a strongly typed command registry, we could ensure at compile time that commands exist and have the correct parameter count. This would simplify the command execution code and make it more robust.

### 4. Command Execution Result Type

```typescript
// Define the structure of command execution results
interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  formattedOutput?: string; // For transformation output
}
```

**Justification:** Currently, the command execution results are handled inconsistently, with different properties accessed in different places. A standardized result type would ensure consistent handling of command outputs and make the transformation process more predictable.

### 5. Run Directive Handler with Type Discrimination

```typescript
class TypedRunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | StateServiceLike> {
    // Determine run type and cast to specific type
    const runType = this.determineRunType(node);
    
    switch (runType.type) {
      case 'basicCommand':
        return this.handleBasicCommand(runType, context);
      case 'languageCommand':
        return this.handleLanguageCommand(runType, context);
      case 'definedCommand':
        return this.handleDefinedCommand(runType, context);
    }
  }

  private determineRunType(node: DirectiveNode): RunDirectiveType {
    // Implementation that returns properly typed run directive
  }

  private async handleBasicCommand(command: Extract<RunDirectiveType, {type: 'basicCommand'}>, context: DirectiveContext): Promise<DirectiveResult> {
    // Type-safe implementation for basic commands
  }

  // Similar methods for other command types
}
```

**Justification:** With this approach, each handler method would receive strongly typed inputs, eliminating the need for runtime type checking and property validation. This would make the code more maintainable and less error-prone, as TypeScript would catch type mismatches at compile time.

## Implementation Plan

To implement these improvements, I recommend the following steps:

1. **Define the core type structures** (discriminated unions, interfaces) in a dedicated types file
2. **Create a RunDirectiveClassifier utility** that converts the existing DirectiveNode structure to the new typed structure
3. **Refactor the RunDirectiveHandler** to use the new types
4. **Update command execution logic** to leverage the stronger typing
5. **Add runtime validation** to ensure backward compatibility with existing code

## Concrete Example of Improvement

Currently, determining the run type requires complex conditional logic:

```typescript
// Current approach (hypothetical based on provided context)
if (directive.isReference || 
    (directive.command && typeof directive.command === 'object' && directive.command.name) ||
    (typeof directive.command === 'string' && directive.command.startsWith('$'))) {
  // Handle defined command
} else if (directive.isMultiLine && directive.language) {
  // Handle language command
} else {
  // Handle basic command
}
```

With the proposed typing improvements:

```typescript
// New approach with discriminated union
const runType = this.determineRunType(node);

switch (runType.type) {
  case 'basicCommand':
    // TypeScript knows exactly what properties are available here
    const command = runType.command;
    const isMultiLine = runType.isMultiLine;
    return this.executeBasicCommand(command, isMultiLine, context);
    
  case 'languageCommand':
    // TypeScript knows these properties exist and their types
    const { language, parameters, code } = runType;
    return this.executeLanguageCommand(language, parameters, code, context);
    
  case 'definedCommand':
    // TypeScript ensures commandName and args are available
    const { commandName, args } = runType;
    return this.executeDefinedCommand(commandName, args, context);
}
```

This would make the code more readable, maintainable, and less prone to errors from misclassification or missing properties.

## Benefits Summary

1. **Type Safety**: Catch errors at compile time rather than runtime
2. **Code Clarity**: Clear distinction between different run types
3. **Maintainability**: Easier to understand and modify the code
4. **Consistency**: Standardized handling of parameters and results
5. **Documentation**: Types serve as self-documenting code

These improvements would significantly enhance the robustness of the CoreDirective service when handling the various forms of the `@run` directive, making it easier to maintain and extend in the future.