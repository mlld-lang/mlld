# Synthesized Requirements for @define Directive Structure

After analyzing the feedback from multiple component leads, I've consolidated the following requirements for the TypeScript type definitions needed for the `@define` directive:

## 1. Command Definition Base Structure

- Create a `BaseCommandDefinition` interface with common properties:
  - `identifier`/`name`: string (command name)
  - `parameters`: Array of parameter information
  - `sourceLocation`/`location`: Optional source location for error reporting

## 2. Command Type Discrimination

- Implement a discriminated union pattern with a `type` field:
  - `type: 'basic' | 'language'` to distinguish between command types
  - Each type has its own extended interface with specific properties

## 3. Basic Command Definition

- Extend `BaseCommandDefinition` for shell commands:
  - `type: 'basic'`
  - `commandTemplate`: string (the shell command with parameter placeholders)
  - `isMultiline`: boolean (whether the command spans multiple lines)

## 4. Language Command Definition

- Extend `BaseCommandDefinition` for language-specific commands:
  - `type: 'language'`
  - `language`: string or union of supported languages ('js' | 'python' | 'bash' | string)
  - `codeBlock`: string (the actual code to execute)
  - `languageParameters`: Optional array of strings for language-specific parameters

## 5. Parameter Representation

- Enhanced parameter type instead of simple string array:
  ```typescript
  interface ParameterMetadata {
    name: string;
    position: number;
    required?: boolean;
    defaultValue?: string;
  }
  ```
- Support for parameter validation at definition time

## 6. Metadata Support

- Command metadata structure:
  ```typescript
  interface CommandMetadata {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  }
  ```
- Ability to attach metadata to command definitions

## 7. Type Guards and Utilities

- Include type guards for safe type narrowing:
  ```typescript
  function isBasicCommand(cmd: CommandDefinition): cmd is BasicCommandDefinition
  function isLanguageCommand(cmd: CommandDefinition): cmd is LanguageCommandDefinition
  ```

## 8. Command Registry Interface

- Define an interface for command storage:
  ```typescript
  interface CommandRegistry {
    getCommand(name: string): CommandDefinition | undefined;
    setCommand(name: string, definition: CommandDefinition): void;
    hasCommand(name: string): boolean;
    validateCommand(name: string): boolean;
  }
  ```

## 9. Parsing Support

- Include types to support directive parsing:
  ```typescript
  interface DefineDirectiveParseResult {
    success: boolean;
    commandDefinition?: CommandDefinition;
    error?: { message: string, code: string, location?: SourceLocation };
  }
  ```

## 10. Substitution Context

- Support for parameter substitution with pattern tracking:
  ```typescript
  interface SubstitutionPattern {
    pattern: string;
    parameterName: string;
    position: number;
    required: boolean;
  }
  ```

This structure provides a comprehensive, type-safe framework for defining, storing, and working with commands created via the `@define` directive, addressing the needs identified across all component feedback.