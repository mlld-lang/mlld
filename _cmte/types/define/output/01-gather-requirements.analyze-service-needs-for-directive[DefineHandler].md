# TypeScript Type Improvements for DefineDirectiveHandler

After analyzing the current implementation of the `DefineDirectiveHandler` and `validateDefineDirective` functions, I've identified several areas where stronger TypeScript types would significantly improve code safety, readability, and maintainability.

## Current Issues

1. **Loose Command Definition Structure**: The `CommandDefinition` interface doesn't explicitly distinguish between basic commands and language commands.

2. **Manual Validation**: There's excessive manual validation that could be handled by the type system.

3. **Unclear Parameter Requirements**: The relationship between parameters and their usage in commands isn't strongly typed.

4. **Metadata Handling**: The metadata parsing logic is error-prone with manual string splitting and validation.

5. **Command Type Ambiguity**: The code doesn't clearly distinguish between different types of commands (shell vs. language-specific).

## Proposed Type Improvements

### 1. Discriminated Union for Command Types

```typescript
// Base command definition
interface BaseCommandDefinition {
  parameters: string[];
  metadata?: CommandMetadata;
}

// For shell commands
interface ShellCommandDefinition extends BaseCommandDefinition {
  type: 'shell';
  command: string;
}

// For language-specific commands
interface LanguageCommandDefinition extends BaseCommandDefinition {
  type: 'language';
  language: 'js' | 'python' | 'bash';
  code: string;
}

// Union type
type CommandDefinition = ShellCommandDefinition | LanguageCommandDefinition;
```

**Justification**: This discriminated union clearly distinguishes between shell commands and language-specific commands. It eliminates the need for runtime checks of command structure and makes the code's intent clearer. The handler can use type guards to safely process each command type appropriately.

### 2. Stronger Metadata Types

```typescript
interface CommandMetadata {
  risk?: 'high' | 'med' | 'low';
  about?: string;
  meta?: Record<string, unknown>;
}

// For parsing from dot notation
type MetadataKey = 'risk' | 'about';
type RiskLevel = 'high' | 'med' | 'low';
```

**Justification**: Creating explicit types for metadata keys and risk levels eliminates string literal checks and improves autocomplete support. This reduces the chance of errors in metadata handling and makes the code more maintainable.

### 3. Define Directive Data Type

```typescript
interface BaseDefineDirectiveData {
  name: string;
  parameters?: string[];
}

interface ShellDefineData extends BaseDefineDirectiveData {
  commandType: 'shell';
  command: {
    kind: 'run';
    command: string;
  };
}

interface LanguageDefineData extends BaseDefineDirectiveData {
  commandType: 'language';
  command: {
    kind: 'run';
    language: 'js' | 'python' | 'bash';
    args?: string[];
    code: string;
  };
}

type DefineDirectiveData = ShellDefineData | LanguageDefineData;
```

**Justification**: This improved type definition for the directive data makes it clear what properties are expected and enforces the relationship between command types. It would eliminate many of the manual validation checks currently needed.

### 4. Command Name Parser Type

```typescript
interface ParsedIdentifier {
  name: string;
  metadata?: CommandMetadata;
}

// For parsing command.name.risk.high format
interface NameWithMetadata {
  baseName: string;
  metadataKey?: MetadataKey;
  metadataValue?: string;
}
```

**Justification**: Creating a structured type for parsed identifiers makes the parsing logic more explicit and less error-prone. It eliminates the need for manual string splitting and validation in the `parseIdentifier` method.

### 5. Parameter Reference Type

```typescript
interface ParameterReference {
  name: string;
  position: number;
}
```

**Justification**: This type would improve the parameter extraction logic by providing a clear structure for parameter references, including their position in the command string. This would make parameter substitution more reliable.

## Implementation Example

Here's how the improved `DefineDirectiveHandler` would look with these type improvements:

```typescript
@injectable()
@Service({
  description: 'Handler for @define directives'
})
export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract name, parameters, and command from directive
      const directive = node.directive as DefineDirectiveData;
      
      // Parse any metadata from the name
      const parsedIdentifier = this.parseIdentifier(directive.name);
      
      // 3. Create command definition based on the type
      let commandDef: CommandDefinition;
      
      if (directive.commandType === 'shell') {
        commandDef = {
          type: 'shell',
          parameters: directive.parameters || [],
          command: directive.command.command,
          ...(parsedIdentifier.metadata && { metadata: parsedIdentifier.metadata })
        };
      } else {
        // Language command
        commandDef = {
          type: 'language',
          parameters: directive.parameters || [],
          language: directive.command.language,
          code: directive.command.code,
          ...(parsedIdentifier.metadata && { metadata: parsedIdentifier.metadata })
        };
      }

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(parsedIdentifier.name, commandDef);

      return newState;
    } catch (error) {
      // Error handling (unchanged)
      // ...
    }
  }

  private parseIdentifier(identifier: string): ParsedIdentifier {
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metadataKey = parts[1] as MetadataKey;
      const metadataValue = parts[2];

      // Validate metadata key
      if (metadataKey !== 'risk' && metadataKey !== 'about') {
        throw new DirectiveError(
          'Invalid metadata field. Only risk and about are supported',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }

      // Handle risk metadata
      if (metadataKey === 'risk') {
        const riskLevel = metadataValue as RiskLevel;
        
        // Validate risk level
        if (!['high', 'med', 'low'].includes(riskLevel)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {
              severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
            }
          );
        }
        
        return { 
          name, 
          metadata: { risk: riskLevel } 
        };
      }

      // Handle about metadata
      if (metadataKey === 'about') {
        return { 
          name, 
          metadata: { about: metadataValue || 'This is a description' } 
        };
      }
    }

    return { name };
  }
}
```

## Benefits of These Changes

1. **Type Safety**: The discriminated unions ensure that we're handling the correct command types at compile time.

2. **Reduced Runtime Validation**: Many of the manual validation checks can be eliminated because the type system enforces correct structure.

3. **Better IDE Support**: Developers get better autocompletion and inline documentation when working with these types.

4. **Clearer Intent**: The code clearly distinguishes between shell commands and language commands.

5. **More Maintainable**: When changes are needed to the command structure, the type system will highlight all places that need updates.

6. **Improved Error Messages**: TypeScript will provide more specific error messages during development.

7. **Self-Documenting Code**: The types themselves serve as documentation for the expected structure of define directives.

These improvements would significantly enhance the robustness and maintainability of the DefineDirectiveHandler while reducing the likelihood of bugs related to command structure and processing.