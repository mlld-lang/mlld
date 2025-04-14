# Proposed Type Improvements for `@define` Directive in CoreDirective Service

After analyzing the current implementation of the CoreDirective service and the `@define` directive handling, I've identified several opportunities to improve type safety, code clarity, and maintainability through stronger TypeScript types.

## 1. Command Definition Type Structure

### Current Issues:
- The `@define` directive stores command definitions in a generic way without clear type distinctions between basic commands and language commands
- There's no type-level validation for command parameters or structure
- Command execution relies on runtime checks that could be caught at compile time

### Proposed Solution: Discriminated Union for Command Types

```typescript
// Base interface for all command definitions
interface BaseCommandDefinition {
  // Common properties for all commands
  identifier: string;
  parameters: string[];
  sourceLocation?: SourceLocation;
}

// For basic shell commands (@run [command])
interface BasicCommandDefinition extends BaseCommandDefinition {
  type: 'basic';
  commandTemplate: string;
  isMultiline: boolean;
}

// For language commands (@run js|python|bash)
interface LanguageCommandDefinition extends BaseCommandDefinition {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string;
  codeBlock: string;
  languageParameters?: string[];
}

// Combined type using discriminated union
type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;
```

### Benefits:
1. **Type Safety**: The discriminated union pattern with the `type` field ensures we can safely distinguish between command types
2. **Exhaustive Checking**: TypeScript will enforce handling of all command types when using switch statements
3. **Clear Intent**: Makes the difference between command types explicit in the code
4. **Self-Documenting**: The type structure itself documents the expected structure of commands

## 2. Command Parameter Validation

### Current Issues:
- Parameter validation is done at runtime with manual checks
- No compile-time guarantees about parameter counts or names
- Error messages about parameter mismatches are generic

### Proposed Solution: Parameter Metadata Type

```typescript
interface ParameterMetadata {
  name: string;
  position: number;
  // Optional validation metadata
  required?: boolean;
  defaultValue?: string;
}

// Enhanced command definition
interface EnhancedCommandDefinition extends BaseCommandDefinition {
  // Replace string[] with structured metadata
  parameters: ParameterMetadata[];
  // Track parameter count for quick validation
  parameterCount: number;
}
```

### Benefits:
1. **Validation at Definition Time**: We can validate parameter structure when the command is defined
2. **Rich Error Messages**: Generate specific error messages about which parameter is invalid
3. **Default Values**: Support for optional parameters with default values
4. **Position Tracking**: Explicit tracking of parameter positions for substitution

## 3. Command Execution Context Type

### Current Issues:
- Command execution context is loosely typed
- Arguments passed to commands are validated at runtime
- No clear connection between command definition and execution

### Proposed Solution: Execution Context Type

```typescript
interface CommandExecutionContext {
  // The command being executed
  commandDefinition: CommandDefinition;
  // Arguments provided to the command
  arguments: string[];
  // Resolved values after parameter substitution
  resolvedArguments?: Record<string, string>;
  // Execution environment
  workingDirectory: string;
  environmentVariables?: Record<string, string>;
  // Parent context for nested commands
  parentContext?: CommandExecutionContext;
}
```

### Benefits:
1. **Contextual Execution**: Captures all information needed for command execution in one place
2. **Argument Validation**: Can validate argument count against parameter count at compile time
3. **Traceability**: Maintains connection between definition and execution for debugging
4. **Environment Control**: Explicit control over execution environment

## 4. Command Registry Type

### Current Issues:
- Command definitions are stored in a generic state without type-specific validation
- Retrieval of commands requires type casting and runtime checks
- No compile-time guarantees about command existence

### Proposed Solution: Typed Command Registry

```typescript
interface CommandRegistry {
  // Store commands by identifier
  commands: Map<string, CommandDefinition>;
  
  // Type-safe registration methods
  registerBasicCommand(definition: BasicCommandDefinition): void;
  registerLanguageCommand(definition: LanguageCommandDefinition): void;
  
  // Type-safe retrieval with optional chaining support
  getCommand(identifier: string): CommandDefinition | undefined;
  getBasicCommand(identifier: string): BasicCommandDefinition | undefined;
  getLanguageCommand(identifier: string): LanguageCommandDefinition | undefined;
  
  // Validation methods
  hasCommand(identifier: string): boolean;
  validateCommand(identifier: string): boolean;
}
```

### Benefits:
1. **Type-Safe Access**: Retrieve commands with correct types without manual casting
2. **Centralized Validation**: Validate commands in one place with consistent rules
3. **Command Management**: Explicit API for adding, retrieving, and validating commands
4. **Encapsulation**: Hides implementation details of command storage

## 5. Define Directive Parser Type

### Current Issues:
- Parsing of the `@define` directive is complex with many edge cases
- Pattern matching for different command forms is done with regex and string manipulation
- Error handling is scattered throughout the parsing logic

### Proposed Solution: Structured Parser with Result Type

```typescript
interface DefineDirectiveParseResult {
  // Success or failure
  success: boolean;
  // The parsed command definition if successful
  commandDefinition?: CommandDefinition;
  // Error information if parsing failed
  error?: {
    message: string;
    code: string;
    location?: SourceLocation;
  };
}

interface DefineDirectiveParser {
  // Parse a define directive node
  parse(node: DirectiveNode): DefineDirectiveParseResult;
  
  // Specialized parsers for different command types
  parseBasicCommand(node: DirectiveNode): DefineDirectiveParseResult;
  parseLanguageCommand(node: DirectiveNode): DefineDirectiveParseResult;
  
  // Helper methods for parameter extraction
  extractParameters(parameterString: string): string[];
  validateParameters(parameters: string[]): boolean;
}
```

### Benefits:
1. **Structured Error Handling**: Clear pattern for handling and reporting parse errors
2. **Separation of Concerns**: Split parsing logic by command type for better maintainability
3. **Result Pattern**: Consistent return type that includes both success and error states
4. **Testability**: Easier to test individual parsing functions in isolation

## 6. Command Substitution Type

### Current Issues:
- Parameter substitution in command templates is done with string manipulation
- No type safety around substitution patterns
- Difficult to track which parameters have been substituted

### Proposed Solution: Substitution Context Type

```typescript
interface SubstitutionPattern {
  // The full pattern to replace (e.g., "{{param}}")
  pattern: string;
  // The parameter name (e.g., "param")
  parameterName: string;
  // The position in the parameter list
  position: number;
  // Whether this is a required parameter
  required: boolean;
}

interface SubstitutionContext {
  // The command template with patterns
  template: string;
  // Detected substitution patterns
  patterns: SubstitutionPattern[];
  // Arguments to substitute
  arguments: string[];
  // Result after substitution
  result?: string;
  // Tracking of which patterns were substituted
  substituted: Set<string>;
}
```

### Benefits:
1. **Pattern Tracking**: Explicit tracking of substitution patterns in the template
2. **Validation**: Can validate that all required parameters are substituted
3. **Debugging**: Clear context for debugging substitution issues
4. **Consistency**: Ensures consistent handling of parameter substitution

## Implementation Example: Enhanced DefineDirectiveHandler

Here's how these types could be used to enhance the DefineDirectiveHandler:

```typescript
class DefineDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'define';
  
  private commandRegistry: CommandRegistry;
  private parser: DefineDirectiveParser;
  
  constructor(
    @inject('IValidationService') private validationService: ValidationServiceLike,
    @inject('IStateService') private stateService: StateServiceLike,
    @inject('IResolutionService') private resolutionService: ResolutionServiceLike
  ) {
    this.commandRegistry = new CommandRegistryImpl();
    this.parser = new DefineDirectiveParserImpl();
  }
  
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | StateServiceLike> {
    try {
      // Parse the define directive
      const parseResult = this.parser.parse(node);
      
      if (!parseResult.success) {
        throw new MeldDirectiveError(
          parseResult.error!.message,
          'define',
          { location: parseResult.error!.location }
        );
      }
      
      // Register the command in the registry
      if (parseResult.commandDefinition!.type === 'basic') {
        this.commandRegistry.registerBasicCommand(parseResult.commandDefinition as BasicCommandDefinition);
      } else {
        this.commandRegistry.registerLanguageCommand(parseResult.commandDefinition as LanguageCommandDefinition);
      }
      
      // Store the command in state
      await this.stateService.setCommand(
        parseResult.commandDefinition!.identifier,
        parseResult.commandDefinition!
      );
      
      return {
        state: context.state,
        formattingContext: {
          contextType: 'block'
        }
      };
    } catch (error) {
      // Enhanced error handling with specific error types
      if (error instanceof CommandDefinitionError) {
        throw new MeldDirectiveError(
          error.message,
          'define',
          { location: node.location?.start, details: error.details }
        );
      }
      
      throw error;
    }
  }
}
```

## Why These Improvements Matter

1. **Reduced Runtime Errors**: By catching more issues at compile time, we reduce the potential for runtime errors that are harder to debug

2. **Self-Documenting Code**: The type structure itself documents the expected structure and relationships between different parts of the command system

3. **Maintainability**: Clear type boundaries make it easier to refactor and extend the code without breaking existing functionality

4. **Developer Experience**: Improved autocompletion and type checking make it easier for developers to work with the code

5. **Testing**: More explicit types make it easier to write comprehensive tests with proper mocking

6. **Error Messages**: Structured error types allow for more specific and helpful error messages

These improvements would significantly enhance the CoreDirective service's handling of the `@define` directive, making it more robust, maintainable, and developer-friendly.