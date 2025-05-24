# Type Requirements Analysis for Run Directive - ParserService Perspective

Based on my analysis of the provided context and the role of the ParserService in the Meld architecture pipeline, I'll outline the type system requirements for the run directive from the ParserService perspective.

## 1. Core Properties

- Property Name: command
- Description: The command to be executed in the run directive
- Data Type: string
- Necessity: Essential

- Property Name: args
- Description: Arguments to be passed to the command
- Data Type: string[]
- Necessity: Essential

- Property Name: stdin
- Description: Input to be piped to the command's standard input
- Data Type: string | undefined
- Necessity: Essential

- Property Name: shell
- Description: Whether to run the command in a shell
- Data Type: boolean
- Necessity: Essential

- Property Name: cwd
- Description: Working directory for the command execution
- Data Type: string | undefined
- Necessity: Essential

- Property Name: env
- Description: Environment variables for the command execution
- Data Type: Record<string, string> | undefined
- Necessity: Essential

- Property Name: nodeId
- Description: Unique identifier for the run directive node in the AST
- Data Type: string
- Necessity: Essential

- Property Name: sourceRange
- Description: Source code range information for error reporting and debugging
- Data Type: ISourceRange
- Necessity: Essential

## 2. Type Discriminators

- Discriminator Property: outputMode
- Description: Determines how the output of the run command should be processed
- Potential Values/Types: "raw" | "text" | "json" | "lines" | "none"
- This affects how the parser will handle the output expression in the AST

- Discriminator Property: captureMode
- Description: Determines what output streams should be captured
- Potential Values/Types: "stdout" | "stderr" | "both" | "none"
- This affects the structure of the AST node and how output is referenced

## 3. Validation Rules

- Rule 1: The "command" property must be a non-empty string.
- Rationale: ParserService needs to ensure a valid command exists for AST creation.

- Rule 2: If "args" is provided, it must be an array of strings.
- Rationale: Arguments must be properly structured for the AST to represent the command correctly.

- Rule 3: The "nodeId" must be unique within the AST.
- Rationale: ParserService needs to ensure each node can be uniquely identified.

- Rule 4: If "outputMode" is specified, it must be one of the allowed values.
- Rationale: The parser needs to validate that the output mode is supported.

- Rule 5: The run directive must be syntactically valid according to Meld grammar.
- Rationale: Parser must be able to convert the directive into a valid AST node.

## 4. Current Pain Points Addressed

- Pain Point 1: Lack of clear structure for run directive parameters.
- How the proposed types resolve it: By defining explicit properties and their types, the parser can more easily validate and structure the AST.

- Pain Point 2: Difficulty in determining how run output should be handled.
- How the proposed types resolve it: The outputMode and captureMode discriminators provide clear guidance on how output should be structured in the AST.

- Pain Point 3: Inconsistent error reporting for malformed run directives.
- How the proposed types resolve it: Clear type definitions allow for more specific error messages when parsing fails.

- Pain Point 4: Challenges in tracking source locations for run directives.
- How the proposed types resolve it: The sourceRange property ensures location information is preserved.

## 5. Use Cases & Examples from ParserService

- Use Case 1: Parsing a basic run directive.
- Code Snippet/Example:
  ```typescript
  // When parsing a run directive like: run `echo Hello`
  const runNode: RunDirectiveNode = {
    type: 'RunDirective',
    nodeId: generateUniqueId(),
    command: 'echo',
    args: ['Hello'],
    shell: false,
    outputMode: 'text',
    captureMode: 'stdout',
    sourceRange: {
      start: { line: 10, column: 5 },
      end: { line: 10, column: 20 }
    }
  };
  ```

- Use Case 2: Parsing a run directive with shell execution.
- Code Snippet/Example:
  ```typescript
  // When parsing: run:shell `find . -name "*.js" | grep test`
  const runShellNode: RunDirectiveNode = {
    type: 'RunDirective',
    nodeId: generateUniqueId(),
    command: 'find . -name "*.js" | grep test',
    args: [],
    shell: true,
    outputMode: 'lines',
    captureMode: 'stdout',
    sourceRange: {
      start: { line: 15, column: 1 },
      end: { line: 15, column: 40 }
    }
  };
  ```

- Use Case 3: Parsing a run directive with environment variables.
- Code Snippet/Example:
  ```typescript
  // When parsing: run:env{DEBUG=true} `node script.js`
  const runEnvNode: RunDirectiveNode = {
    type: 'RunDirective',
    nodeId: generateUniqueId(),
    command: 'node',
    args: ['script.js'],
    shell: false,
    env: { 'DEBUG': 'true' },
    outputMode: 'text',
    captureMode: 'both',
    sourceRange: {
      start: { line: 20, column: 1 },
      end: { line: 20, column: 35 }
    }
  };
  ```

## 6. Interactions & Dependencies

- Interaction 1: The run directive AST node needs to interact with variable references in the surrounding context.
- Interaction 2: The output of run directives may need to be referenced by other directives, requiring the parser to establish these relationships in the AST.
- Interaction 3: Run directives may appear within control flow structures (if/else, for loops), requiring the parser to properly nest these nodes.
- Interaction 4: Error handling for run directives needs to integrate with the overall error reporting system of the parser.
- Interaction 5: The parser needs to differentiate between run directives and other shell-like syntax in the language.

## 7. Base Type/Interface Suggestions

- Suggestion 1: RunDirectiveNode should implement INode interface.
- Rationale: Ensures the run directive node has common properties needed for all AST nodes.

- Suggestion 2: Run directive should extend BaseDirective.
- Rationale: Provides common directive functionality like source range tracking and node identification.

- Suggestion 3: Create a dedicated RunCommandOptions interface for command-specific properties.
- Rationale: Separates execution options from AST node structure concerns, making the type system more modular.

- Suggestion 4: Implement ISourceRangeProvider interface.
- Rationale: Standardizes how source location information is accessed for error reporting and debugging.