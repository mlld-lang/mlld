I've analyzed the service lead requirements for the `run` directive type system in Meld. Here's a consolidated synthesis of the requirements:

<ConsolidatedRequirementsForRunDirectiveTypeSystem>
  <1synthesizedCoreProperties>
- Property Name: id
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential
- Rationale/Sources: Required by InterpreterService, ParserService, and StateService for tracking directive instances

- Property Name: directiveType
- Description: Identifies this as a run directive
- Data Type: literal "run"
- Necessity: Essential
- Rationale/Sources: Required by InterpreterService and StateService for directive type discrimination

- Property Name: command
- Description: The command to be executed in the run directive
- Data Type: string
- Necessity: Essential
- Rationale/Sources: Consistently required across all services (ParserService, InterpreterService, DirectiveService, ResolutionService)

- Property Name: args
- Description: Arguments to be passed to the command
- Data Type: string[]
- Necessity: Essential
- Rationale/Sources: Required by all services; DirectiveService noted it could be an array of strings or objects depending on command type

- Property Name: stdin
- Description: Input to be piped to the command's standard input
- Data Type: string | undefined
- Necessity: Nice-to-have
- Rationale/Sources: Mentioned by ParserService and DirectiveService as optional input

- Property Name: cwd
- Description: Working directory for the command execution
- Data Type: string | undefined
- Necessity: Essential
- Rationale/Sources: Required by InterpreterService, ResolutionService, and DirectiveService for proper command execution context

- Property Name: env
- Description: Environment variables for the command execution
- Data Type: Record<string, string> | undefined
- Necessity: Essential
- Rationale/Sources: Identified by all services as necessary for command execution context

- Property Name: shell
- Description: Whether to run the command in a shell
- Data Type: boolean | string
- Necessity: Essential
- Rationale/Sources: ParserService and ResolutionService identified it as essential; can be boolean or string for specific shell path

- Property Name: timeout
- Description: Maximum execution time in milliseconds
- Data Type: number | undefined
- Necessity: Nice-to-have
- Rationale/Sources: Mentioned by InterpreterService, ResolutionService, and StateService as a useful constraint

- Property Name: sourceRange
- Description: Source code range information for error reporting and debugging
- Data Type: ISourceRange
- Necessity: Essential
- Rationale/Sources: Required by ParserService for error reporting and debugging

- Property Name: executionResult
- Description: Result of the command execution
- Data Type: Object containing stdout, stderr, exitCode
- Necessity: Essential
- Rationale/Sources: InterpreterService requires this to store execution results

- Property Name: stateKey
- Description: Key to store execution state in StateService
- Data Type: string | undefined
- Necessity: Essential
- Rationale/Sources: StateService requires this to properly store and retrieve command outputs
  </1synthesizedCoreProperties>

  <2synthesizedTypeDiscriminators>
- Discriminator Property: commandType
- Description: Distinguishes between different types of commands that can be executed
- Potential Values/Types: "basic" | "language" | "defined" | "service" | "shell" | "node" | "python"
- Rationale/Sources: DirectiveService and StateService both identified the need to discriminate between command types

- Discriminator Property: outputMode
- Description: Determines how the output of the run command should be processed
- Potential Values/Types: "raw" | "text" | "json" | "lines" | "none"
- Rationale/Sources: ParserService, ResolutionService, and StateService all identified the need for different output processing modes

- Discriminator Property: captureMode
- Description: Determines what output streams should be captured
- Potential Values/Types: "stdout" | "stderr" | "both" | "none"
- Rationale/Sources: ParserService identified this need; complements the outputMode discriminator

- Discriminator Property: executionMode
- Description: Determines how the command should be executed
- Potential Values/Types: "sync" | "async" | "stream"
- Rationale/Sources: InterpreterService and StateService both identified the need to distinguish between execution modes

- Discriminator Property: errorHandling
- Description: Determines behavior when command fails
- Potential Values/Types: "ignore" | "warn" | "error"
- Rationale/Sources: DirectiveService and ResolutionService identified this need for error handling strategy
  </2synthesizedTypeDiscriminators>

  <3synthesizedValidationRules>
- Rule 1: The "command" property must be a non-empty string.
- Rationale/Sources: Consistently required by all services; empty commands would fail execution

- Rule 2: If "args" is provided, it must be an array of strings or properly structured objects based on commandType.
- Rationale/Sources: ParserService, InterpreterService, and DirectiveService all require properly structured arguments

- Rule 3: The "id" must be unique within the current execution context.
- Rationale/Sources: Required by InterpreterService and StateService for proper tracking of directive instances

- Rule 4: If "outputMode" is specified, it must be one of the allowed values.
- Rationale/Sources: ParserService and ResolutionService require valid output mode for processing

- Rule 5: If "cwd" is provided, it must be a valid directory path or resolvable to one.
- Rationale/Sources: InterpreterService and ResolutionService require valid working directory

- Rule 6: If "env" is provided, all values must be strings or resolvable to strings.
- Rationale/Sources: ResolutionService requirement for environment variable resolution

- Rule 7: If "timeout" is provided, it must be a positive number.
- Rationale/Sources: InterpreterService and ResolutionService validation requirement

- Rule 8: If "stateKey" is provided, it must be a valid string identifier (no spaces, special characters limited to underscore and dot).
- Rationale/Sources: StateService requirement for storage and retrieval

- Rule 9: Variable references in command, args, cwd, and env must be valid and resolvable.
- Rationale/Sources: ResolutionService's core responsibility for resolving these references
  </3synthesizedValidationRules>

  <4keyPainPointsAddressed>
- Pain Point 1: Lack of standardized structure for run directive parameters.
- Resolution: Clearly defined core properties with specific types provide a consistent structure across all services.

- Pain Point 2: Inconsistent handling of command types and arguments.
- Resolution: The commandType discriminator and validation rules for args structure based on command type ensure consistent handling.

- Pain Point 3: Unclear output and error handling expectations.
- Resolution: The outputMode, captureMode, and errorHandling discriminators provide explicit guidance on how output and errors should be processed.

- Pain Point 4: Difficulty in tracking relationships between run directives and their state.
- Resolution: The stateKey property creates a clear connection between execution and state storage.

- Pain Point 5: Insufficient validation before command execution.
- Resolution: Comprehensive validation rules ensure commands are properly structured before execution.

- Pain Point 6: Ambiguity in how variable references should be processed.
- Resolution: Explicit typing of fields that can contain variable references and validation rules for their resolution.
  </4keyPainPointsAddressed>

  <5consolidatedInteractionDependencyNotes>
- Note 1: The run directive needs to interact with the variable resolution system for resolving references in command, args, cwd, and env properties.

- Note 2: The run directive depends on execution services for actual command execution, requiring a well-defined interface between the directive and these services.

- Note 3: The run directive results can be used by subsequent directives in the pipeline through the interpretation context or state system.

- Note 4: For defined commands, the run directive needs to interact with command definition directives to ensure commands are properly referenced.

- Note 5: The run directive AST node needs to interact with variable references in the surrounding context and may appear within control flow structures.

- Note 6: The run directive needs to