# Final Consolidated Requirements for @run Directive

## Core Structure

- **Implement discriminated union pattern** for run directive subtypes:
  ```typescript
  type RunDirectiveSubtype = 
    | { type: 'basicCommand'; command: string; isMultiLine?: boolean }
    | { type: 'languageCommand'; language: string; command: string; parameters: Parameter[] }
    | { type: 'definedCommand'; commandRef: CommandReference; args: CommandArg[] };
  ```

- **Define CommandReference type** to handle different reference formats:
  ```typescript
  type CommandReference = 
    | { type: 'name'; name: string }
    | { type: 'path'; path: string[] };
  ```

- **Unified parameter type system** with discriminated union:
  ```typescript
  type Parameter = 
    | { type: 'string'; value: string }
    | { type: 'number'; value: number }
    | { type: 'boolean'; value: boolean }
    | { type: 'variableReference'; name: string; fields?: string[] }
    | { type: 'object'; properties: Record<string, Parameter> };
  ```

## Command Execution

- **Unified execution interface** with single entry point that routes based on command type
- **Execution context management** for environment variables, working directory, and security controls
- **Temporary file management** for language scripts with proper cleanup
- **Structured execution results** capturing stdout, stderr, exit code, and metadata

## Variable Resolution

- **Runtime variable resolution** for text, data, and path variables within commands
- **Parameter substitution** for defined commands with proper escaping
- **Type conversion** when substituting variables into command strings

## Validation

- **Static validation** for directive structure and subtype-specific requirements
- **Runtime validation** for command existence, variable resolution, and execution constraints
- **Parameter validation** for type checking, format rules, and constraints

## Implementation Priority

1. **Core subtype classification** - Ensure proper identification of command types
2. **Execution context management** - Environment variables, working directory, security
3. **Parameter resolution** - Consistent handling across command types
4. **Command execution** - Proper handling for each subtype
5. **Result transformation** - Converting command output to nodes

## Key Decisions

- **Adopted discriminated union pattern** for clearer type safety and better IDE support
- **Standardized parameter handling** across all command types for consistency
- **Unified temporary file management** for all script-based execution
- **Consolidated validation approach** that handles both static and runtime checks
- **Prioritized security controls** to prevent command injection and resource exhaustion

## Rejected/Deferred Features

- **Complex caching system** - Deferred until performance needs are better understood
- **Custom language support beyond js/python/bash** - Will be added as needed
- **Nested command execution tracking** - Simplified to prevent circular references only

This specification provides a comprehensive foundation for implementing the @run directive with clear type definitions, consistent execution behavior, and robust validation.