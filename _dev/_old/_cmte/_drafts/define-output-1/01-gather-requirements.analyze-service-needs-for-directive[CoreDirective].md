# Improving TypeScript Types for the `@define` Directive

After analyzing the codebase, I've identified several opportunities to improve the type system for the `@define` directive. The current implementation lacks strong typing for the different forms of define directives, which leads to complex validation logic, potential runtime errors, and maintenance challenges.

## Current Implementation Challenges

The `@define` directive has two distinct forms:
1. **Basic Commands**: `@define commandName(param1, param2) = @run [command template with {{param1}} and {{param2}}]`
2. **Language Commands**: `@define jsCommand(name) = @run js(name) [[// JavaScript code]]`

However, the current type system doesn't distinguish between these forms, forcing handlers to perform extensive runtime validation and type checking.

## Proposed Type Improvements

### 1. Create a Discriminated Union for Define Directive Types

```typescript
/**
 * Represents the two types of define directives
 */
export type DefineDirectiveType = 
  | 'basic'    // For shell command templates
  | 'language' // For language-specific code blocks
;

/**
 * Base interface for define directive data
 */
export interface BaseDefineDirectiveData {
  /** The command identifier without parentheses */
  identifier: string;
  /** Array of parameter names expected by the command */
  parameters: string[];
  /** The type of define directive */
  type: DefineDirectiveType;
}

/**
 * Data for basic shell command define directives
 */
export interface BasicDefineDirectiveData extends BaseDefineDirectiveData {
  type: 'basic';
  /** The shell command template string */
  commandTemplate: string;
}

/**
 * Data for language-specific define directives
 */
export interface LanguageDefineDirectiveData extends BaseDefineDirectiveData {
  type: 'language';
  /** The language to use (js, python, etc.) */
  language: string;
  /** The raw code block to execute */
  codeBlock: string;
  /** Optional language-specific parameters */
  languageParameters?: string[];
}

/**
 * Union type for all define directive data
 */
export type DefineDirectiveData = 
  | BasicDefineDirectiveData 
  | LanguageDefineDirectiveData;
```

**Benefits:**
1. **Type Safety**: The handler can use TypeScript's type narrowing to handle each type differently.
2. **Self-Documenting Code**: The type structure clearly communicates the two different forms.
3. **Compile-Time Validation**: Prevents accessing properties that don't exist for a specific type.
4. **Simplified Validation Logic**: Reduces complex if/else chains for type detection.

### 2. Enhance the DirectiveNode Interface for Define Directives

```typescript
/**
 * Extended interface for define directive nodes
 */
export interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    /** The raw identifier with parameters, e.g., "commandName(param1, param2)" */
    rawIdentifier: string;
    /** The parsed define directive data */
    defineData: DefineDirectiveData;
    /** The right-hand side directive (always a run directive) */
    runDirective: {
      kind: 'run';
      /** For language commands: the language identifier */
      language?: string;
      /** For language commands: language parameters */
      languageParameters?: string[];
      /** The command template or code block */
      content: string;
      /** Whether the content is a code block (double brackets) */
      isCodeBlock: boolean;
    };
  };
}
```

**Benefits:**
1. **Structured Data Access**: Clearly defines the structure of define directive nodes.
2. **Eliminates Type Casting**: Reduces the need for type assertions and casting.
3. **Improved IDE Support**: Better autocompletion and type hints when working with define directives.
4. **Validation at Parse Time**: Enables validation during the parsing phase rather than execution.

### 3. Create Command Definition Type for State Storage

```typescript
/**
 * Represents a stored command definition in the state
 */
export interface CommandDefinition {
  /** The command name without parameters */
  name: string;
  /** The parameter names expected by the command */
  parameters: string[];
  /** The type of command definition */
  type: DefineDirectiveType;
  /** For basic commands: the command template */
  commandTemplate?: string;
  /** For language commands: the language identifier */
  language?: string;
  /** For language commands: the code block */
  codeBlock?: string;
  /** For language commands: language-specific parameters */
  languageParameters?: string[];
  /** Source location for error reporting */
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
}
```

**Benefits:**
1. **Clear State Structure**: Provides a consistent structure for storing command definitions.
2. **Type Checking for Command Execution**: Ensures commands are executed with the correct parameters.
3. **Improved Error Reporting**: Includes source location for better error messages.
4. **Documentation**: Self-documents the expected structure of command definitions.

### 4. Type-Safe Parameter Substitution Utilities

```typescript
/**
 * Options for parameter substitution
 */
export interface ParameterSubstitutionOptions {
  /** Whether to throw on missing parameters */
  strict?: boolean;
  /** Default value for missing parameters */
  defaultValue?: string;
}

/**
 * Function to substitute parameters in a command template
 */
export function substituteParameters(
  template: string,
  parameters: string[],
  args: string[],
  options?: ParameterSubstitutionOptions
): string;

/**
 * Function to validate parameter count
 */
export function validateParameterCount(
  expected: number,
  actual: number,
  commandName: string
): void;
```

**Benefits:**
1. **Consistent Parameter Handling**: Ensures parameters are substituted consistently.
2. **Clear Error Handling**: Defines how parameter errors should be handled.
3. **Reusable Logic**: Centralizes parameter substitution logic for both define and run directives.
4. **Type Safety**: Prevents passing incorrect types to parameter substitution functions.

## Implementation Impact

### DefineDirectiveHandler Simplification

With these type improvements, the `DefineDirectiveHandler` could be significantly simplified:

```typescript
export class DefineDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'define';

  async execute(
    node: DefineDirectiveNode,
    context: DirectiveContext
  ): Promise<DirectiveResult | StateServiceLike> {
    // Type is already validated by the parser
    const { defineData } = node.directive;
    
    // Create the command definition based on the type
    const commandDef: CommandDefinition = {
      name: defineData.identifier,
      parameters: defineData.parameters,
      type: defineData.type,
      sourceLocation: node.location ? {
        filePath: context.currentFilePath || '',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined
    };

    // Add type-specific properties
    if (defineData.type === 'basic') {
      commandDef.commandTemplate = defineData.commandTemplate;
    } else {
      commandDef.language = defineData.language;
      commandDef.codeBlock = defineData.codeBlock;
      commandDef.languageParameters = defineData.languageParameters;
    }

    // Store the command definition
    await context.state.setCommand(commandDef.name, commandDef);
    
    return context.state;
  }
}
```

### RunDirectiveHandler Simplification

The `RunDirectiveHandler` would also benefit:

```typescript
async executeCommand(commandName: string, args: string[], context: DirectiveContext): Promise<any> {
  const commandDef = await context.state.getCommand(commandName);
  
  if (!commandDef) {
    throw new Error(`Command not found: ${commandName}`);
  }
  
  // Validate parameter count
  validateParameterCount(commandDef.parameters.length, args.length, commandName);
  
  // Execute based on