# Run Directive Type Requirements Analysis - ParserService Perspective

Based on the analysis of the ParserService's needs for handling the run directive in the Meld language, I've compiled the following type system requirements:

## 1. Core Properties

- Property Name: command
- Description: The shell command to be executed
- Data Type: string
- Necessity: Essential

- Property Name: args
- Description: Arguments to be passed to the command
- Data Type: string[] | undefined
- Necessity: Nice-to-have

- Property Name: cwd
- Description: Working directory for command execution
- Data Type: string | undefined
- Necessity: Nice-to-have

- Property Name: env
- Description: Environment variables for command execution
- Data Type: Record<string, string> | undefined
- Necessity: Nice-to-have

- Property Name: captureOutput
- Description: Whether to capture and return command output
- Data Type: boolean
- Necessity: Essential

- Property Name: captureError
- Description: Whether to capture stderr separately
- Data Type: boolean
- Necessity: Nice-to-have

- Property Name: range
- Description: Source location information for the directive
- Data Type: Range (with start/end positions)
- Necessity: Essential

## 2. Type Discriminators

- Discriminator Property: captureOutput
- Description: Distinguishes between run directives that need to capture output and those that don't
- Potential Values/Types: boolean (true/false)

- Discriminator Property: runMode
- Description: Distinguishes between different execution contexts (shell vs. direct)
- Potential Values/Types: "shell" | "direct" | undefined (defaults to "shell")

## 3. Validation Rules

- Rule 1: The "command" field must be a non-empty string.
- Rationale: ParserService needs to validate that a command is specified for the run directive to be valid.

- Rule 2: If "args" is provided, it must be an array of strings.
- Rationale: Ensures proper parsing of command arguments.

- Rule 3: Range information must be complete with valid start and end positions.
- Rationale: Required for proper source mapping and error reporting.

## 4. Current Pain Points Addressed

- Pain Point 1: Lack of standardized structure for run directives.
- How the proposed types resolve it: Provides a consistent schema that ParserService can expect when parsing run directives.

- Pain Point 2: Ambiguity in how command arguments are represented.
- How the proposed types resolve it: Clearly defines args as a string array, eliminating confusion between space-separated strings vs. arrays.

- Pain Point 3: Inconsistent source location tracking.
- How the proposed types resolve it: Mandates range information for all run directives, ensuring proper source mapping.

## 5. Use Cases & Examples from ParserService

- Use Case 1: Parsing a run directive in a Meld source file.
- Code Snippet/Example:
  ```typescript
  // When parsing a run directive
  const runNode: RunDirectiveNode = {
    type: 'RunDirective',
    command: 'npm',
    args: ['install', '--save-dev', 'typescript'],
    captureOutput: true,
    range: {
      start: { line: 10, column: 0 },
      end: { line: 10, column: 42 }
    }
  };
  ```

- Use Case 2: Validating run directive structure during parsing.
- Code Snippet/Example:
  ```typescript
  function validateRunDirective(node: RunDirectiveNode): ValidationResult {
    if (!node.command || typeof node.command !== 'string') {
      return {
        valid: false,
        errors: [{
          message: 'Run directive must have a valid command',
          range: node.range
        }]
      };
    }
    
    if (node.args && !Array.isArray(node.args)) {
      return {
        valid: false,
        errors: [{
          message: 'Run directive args must be an array',
          range: node.range
        }]
      };
    }
    
    return { valid: true };
  }
  ```

## 6. Interactions & Dependencies

- Interaction 1: RunDirectiveNode should be a subtype of DirectiveNode to ensure it can be properly handled in the AST.

- Interaction 2: The run directive's range property should use the same Range type used by other AST nodes for consistency.

- Interaction 3: Run directives may interact with variable directives when using template substitution in commands, requiring access to the variable resolution system.

## 7. Base Type/Interface Suggestions

- Suggestion 1: RunDirectiveNode should implement IDirectiveNode interface.
- Rationale: Ensures that run directives have the common properties expected of all directives and can be processed by the general directive handling code.

- Suggestion 2: Create a BaseRunDirective interface that can be extended for different run variants.
- Rationale: Allows for specialized run directive types while maintaining core functionality.

- Suggestion 3: Implement Positionable interface for source mapping.
- Rationale: Ensures that run directives can be properly mapped to source positions for error reporting and debugging.