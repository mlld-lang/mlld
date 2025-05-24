# Consolidated Type Features for `@define` Directive

After analyzing the service leads' proposals, I've consolidated the most pragmatic and beneficial type improvements for the `@define` directive. These recommendations focus on features that will provide the greatest impact in terms of code safety, clarity, and maintainability.

## Core Type Features

### 1. Discriminated Union for Command Types

```typescript
/**
 * Discriminated union for the two types of command definitions
 */
export type CommandDefinition = BasicCommandDefinition | LanguageCommandDefinition;

/**
 * Definition for basic shell commands
 */
export interface BasicCommandDefinition {
  type: 'basic';
  /** The parameters expected by this command */
  parameters: string[];
  /** The shell command template to execute */
  commandTemplate: string;
  /** Whether this uses multiline syntax [[ ]] */
  isMultiline?: boolean;
}

/**
 * Definition for language-specific commands
 */
export interface LanguageCommandDefinition {
  type: 'language';
  /** The language interpreter to use */
  language: string;
  /** The parameters expected by this command */
  parameters: string[];
  /** The raw code block to execute */
  codeBlock: string;
  /** Parameters to pass to the language interpreter */
  languageParameters?: string[];
}
```

**Justification:** This was the most consistently requested feature across all service proposals. The discriminated union pattern provides compile-time safety, eliminates manual type checking, and enables exhaustive handling of both command types.

### 2. Enhanced DirectiveNode Interface for Define Directives

```typescript
/**
 * Extended interface for define directive nodes
 */
export interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    /** The name of the command without parameters */
    name: string;
    /** Parameter list as parsed */
    parameters: string[];
    /** Right-hand side directive (always a run directive) */
    runDirective: {
      kind: 'run';
      /** For language commands, the language specified */
      language?: string;
      /** For language commands, language parameters */
      languageParameters?: string[];
      /** Command content (template string or code block) */
      content: string;
      /** Whether the content is a code block (double brackets) */
      isCodeBlock: boolean;
    };
  };
}

/**
 * Type guard to check if a node is a define directive
 */
export function isDefineDirectiveNode(node: MeldNode): node is DefineDirectiveNode {
  return node.type === 'Directive' && 
         node.directive?.kind === 'define';
}
```

**Justification:** Specialized node types eliminate unsafe type casting and provide clear structure for the parser and directive handlers. This was requested by multiple services and aligns with the existing pattern of specialized directive nodes.

### 3. Parameter Handling Types

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
```

**Justification:** Parameter handling was identified as a common pain point across services. This provides a consistent, type-safe approach to parameter substitution that can be shared across the codebase.

### 4. Command Execution Result Type

```typescript
/**
 * Result of executing a command
 */
export interface CommandExecutionResult {
  /** Command output */
  stdout: string;
  /** Command error output */
  stderr: string;
  /** Exit code (0 means success) */
  exitCode: number;
  /** Original command that was executed */
  command: string;
}
```

**Justification:** Multiple services highlighted the need for consistent command execution results. This standardized interface improves error handling and ensures consistent behavior across the codebase.

### 5. Source Location Tracking

```typescript
/**
 * Source location information for error reporting
 */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}
```

**Justification:** Several services requested improved error reporting capabilities. Including source location information in command definitions enables more precise error messages.

## Supporting Type Features

### 1. Type Guards for Command Validation

```typescript
/**
 * Type guard for basic commands
 */
export function isBasicCommand(command: CommandDefinition): command is BasicCommandDefinition {
  return command.type === 'basic';
}

/**
 * Type guard for language commands
 */
export function isLanguageCommand(command: CommandDefinition): command is LanguageCommandDefinition {
  return command.type === 'language';
}
```

**Justification:** Type guards were requested by multiple services to simplify conditional logic and enable TypeScript's type narrowing capabilities.

### 2. Optional Metadata Support

```typescript
/**
 * Optional metadata for command definitions
 */
export interface CommandMetadata {
  /** Source file where the command was defined */
  sourceFile?: string;
  /** Line number where the command was defined */
  lineNumber?: number;
  /** Description of the command's purpose */
  description?: string;
  /** When the command was defined */
  definedAt?: Date;
}
```

**Justification:** While not critical, metadata support was requested by multiple services and provides valuable debugging information with minimal additional complexity.

## Key Decisions and Tradeoffs

1. **Simplified Parameter Model**: I've chosen a simpler parameter array approach rather than the more complex `CommandParameter` objects with default values and validation. While the detailed approach has merit, it adds significant complexity that doesn't align with current usage patterns.

2. **Consistent Property Naming**: Used `commandTemplate` for basic commands and `codeBlock` for language commands to maintain consistent naming with existing code, rather than introducing new terms like "template" or "code".

3. **Minimal Required Properties**: Kept required properties to a minimum to ease adoption. Properties like `isMultiline` are optional to avoid breaking existing code.

4. **Excluded Command Resolution Context**: The proposed `commandResolution` context enhancements were interesting but would add significant complexity across multiple services. This can be considered for a future enhancement.

5. **Omitted Factory Functions**: While factory functions for command creation are useful, they're an implementation detail rather than a core type feature and can be added separately.

## Implementation Priority

1. First implement the core discriminated union types for command definitions
2. Add the enhanced directive node interfaces
3. Implement the parameter handling utilities
4. Add the type guards for command validation
5. Finally, add the metadata and source location tracking

This phased approach allows for incremental adoption while providing immediate benefits in the most critical areas.