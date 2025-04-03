# Improving TypeScript Types for the `@define` Directive in Meld

## Current Implementation Analysis

After reviewing the ParserService code and the broader Meld architecture, I've identified several areas where stronger typing for the `@define` directive would significantly improve code clarity, safety, and maintainability.

The current implementation has these key challenges:

1. **Lack of Specialized Types**: The ParserService currently handles `@define` directives like any other directive, without specialized type definitions.

2. **Manual Validation Requirements**: The code must validate directive structures at runtime without compile-time guarantees.

3. **Unclear Data Structure Boundaries**: The relationship between command definitions and their execution is not well-defined in the type system.

## Proposed Type Improvements

### 1. Create a Dedicated `DefineDirective` Interface

```typescript
/**
 * Represents a @define directive in Meld, which creates reusable command templates.
 */
export interface DefineDirective extends DirectiveNode {
  directive: {
    kind: 'define';
    name: string;                  // The name of the command (without parameters)
    parameters: string[];          // Parameter names for the command template
    commandType: 'basic' | 'language'; // Discriminator for command type
    // Union type based on commandType
    command: BasicCommand | LanguageCommand;
  }
}

interface BasicCommand {
  type: 'basic';
  template: string;   // The shell command template with parameter placeholders
  isMultiline: boolean; // Whether this uses the [[ ]] syntax
}

interface LanguageCommand {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string; // The language for the script
  codeBlock: string;  // The raw code block content
  languageParameters: string[]; // Parameters passed to the language runtime
}
```

**Justification**: 
- **Eliminates Type Casting**: The current code uses `as any` in multiple places when handling directives. A specialized type would eliminate this unsafe practice.
- **Self-Documenting**: The type structure documents the expected format, making it easier for new developers to understand.
- **Compile-Time Validation**: Ensures the directive handler receives correctly structured data.

### 2. Create a Discriminated Union for Command Types

```typescript
/**
 * Discriminated union for command types in @define directives
 */
export type DefineCommandType = 
  | { type: 'basic'; template: string; isMultiline: boolean }
  | { type: 'language'; language: string; codeBlock: string; languageParameters: string[] };
```

**Justification**:
- **Exhaustive Checking**: TypeScript can enforce handling of all possible command types.
- **Prevents Runtime Errors**: Currently, the code must check command types at runtime; with this union, TypeScript can validate at compile time.
- **Simplifies Conditional Logic**: Makes command-type-specific code clearer and safer.

### 3. Add Stronger Types for Command Storage in StateService

```typescript
/**
 * Represents a stored command definition in the state
 */
export interface CommandDefinition {
  name: string;
  parameters: string[];
  commandType: 'basic' | 'language';
  command: DefineCommandType;
  sourceLocation?: SourceLocation;
  metadata?: {
    definedAt: string; // File path where defined
    usageCount?: number; // Optional tracking of usage
  };
}

/**
 * Type for the commands map in StateService
 */
export type CommandsMap = Map<string, CommandDefinition>;
```

**Justification**:
- **State Consistency**: Ensures commands are stored with consistent structure in StateService.
- **Enhanced Debugging**: The metadata fields make debugging easier when commands don't work as expected.
- **Prevents State Corruption**: Strong typing prevents accidental state corruption when storing commands.

### 4. Add Parameter Validation Types

```typescript
/**
 * Type for validating parameter usage in command templates
 */
export interface ParameterValidation {
  parameters: string[];
  template: string;
  validateParameterUsage(): string[]; // Returns unused parameters
  validateTemplateParameters(): string[]; // Returns undefined parameters
}
```

**Justification**:
- **Early Error Detection**: Can detect mismatches between defined parameters and their usage in templates.
- **Improved Error Messages**: Can generate specific error messages about which parameters are missing or unused.
- **Consistency Checking**: Ensures command definitions are internally consistent.

### 5. Create Specialized Run Command Type

```typescript
/**
 * Represents a @run directive that executes a defined command
 */
export interface RunCommandDirective extends DirectiveNode {
  directive: {
    kind: 'run';
    commandName: string;
    arguments: string[]; // Arguments passed to the command
    isCommandReference: true; // Flag indicating this runs a defined command
  }
}
```

**Justification**:
- **Linking Define and Run**: Creates a clear type relationship between command definitions and their execution.
- **Argument Validation**: Enables validation that the correct number of arguments are provided.
- **Type Safety**: Ensures the run directive handler receives properly structured data.

## Implementation Plan

To implement these improvements:

1. **Add Type Definitions**: Create the interfaces and types in a dedicated file like `core/syntax/types/directives/DefineDirectiveTypes.ts`.

2. **Update Parser Transformations**: Modify `transformVariableNode` in ParserService to recognize and properly type `@define` directives.

3. **Add Type Guards**: Create type guards like `isDefineDirective` to safely work with these types.

4. **Enhance Validation**: Use the new types to implement stronger validation in the directive handler.

5. **Update StateService**: Modify the state service to use the `CommandsMap` type for storing commands.

## Example Implementation for ParserService

Here's how the ParserService could be updated to leverage these new types:

```typescript
import { DefineDirective, isDefineDirective } from '@core/syntax/types/directives/DefineDirectiveTypes';

// In transformVariableNode method, add special handling for define directives
if (anyNode.type === 'Directive' && anyNode.directive?.kind === 'define') {
  // Extract the necessary information for a proper DefineDirective
  const directiveData = anyNode.directive;
  const name = directiveData.name || '';
  const parameters = directiveData.parameters || [];
  
  // Determine if this is a basic or language command
  let commandType: 'basic' | 'language' = 'basic';
  let command: any = { template: '', isMultiline: false };
  
  if (directiveData.runDirective?.language) {
    commandType = 'language';
    command = {
      type: 'language',
      language: directiveData.runDirective.language,
      codeBlock: directiveData.runDirective.codeBlock || '',
      languageParameters: directiveData.runDirective.parameters || []
    };
  } else {
    command = {
      type: 'basic',
      template: directiveData.runDirective?.command || '',
      isMultiline: directiveData.runDirective?.isMultiline || false
    };
  }
  
  // Create a properly typed DefineDirective
  return {
    ...anyNode,
    directive: {
      kind: 'define',
      name,
      parameters,
      commandType,
      command
    }
  } as DefineDirective;
}
```

## Benefits Summary

Implementing these type improvements will:

1. **Reduce Runtime Errors**: By catching type mismatches at compile time.

2. **Improve Code Readability**: By making the structure of `@define` directives explicit.

3. **Enhance Maintainability**: By documenting the expected structure and relationships.

4. **Enable Better Tooling**: IDE features like autocomplete and hover information will be more accurate.

5. **Facilitate Testing**: Clear types make it easier to create valid test fixtures.

These improvements align with Meld's architecture principles of clear service boundaries and interface-first design, while making the code more robust and easier to maintain.