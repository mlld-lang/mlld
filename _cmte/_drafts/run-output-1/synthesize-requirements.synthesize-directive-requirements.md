# Consolidated Requirements for Run Directive Type System

<ConsolidatedRequirementsForRunDirectiveTypeSystem>
  <1synthesizedCoreProperties>
- Property Name: command
- Description: The shell command or code to be executed by the run directive
- Data Type: string
- Necessity: Essential
- Rationale/Sources: Universally required across ParserService, InterpreterService, DirectiveService, and ResolutionService as the core instruction

- Property Name: args
- Description: Arguments to be passed to the command execution
- Data Type: string[] | Record<string, any>
- Necessity: Essential
- Rationale/Sources: Required by all services, with ParserService preferring string[] and InterpreterService/DirectiveService supporting both array and record formats

- Property Name: cwd / workingDir
- Description: Working directory for command execution
- Data Type: string
- Necessity: Essential
- Rationale/Sources: Required by ParserService and ResolutionService for path resolution and execution context

- Property Name: env
- Description: Environment variables for command execution
- Data Type: Record<string, string>
- Necessity: Essential
- Rationale/Sources: Required by ParserService, InterpreterService, and ResolutionService for configuring execution environment

- Property Name: captureOutput
- Description: Whether to capture and return command output
- Data Type: boolean
- Necessity: Essential
- Rationale/Sources: Critical functionality identified by ParserService and ResolutionService for determining output handling

- Property Name: outputVariable
- Description: Variable name where captured output will be stored
- Data Type: string
- Necessity: Essential (when captureOutput is true)
- Rationale/Sources: Required by ResolutionService and StateService for variable registration

- Property Name: captureError
- Description: Whether to capture stderr separately
- Data Type: boolean
- Necessity: Nice-to-have
- Rationale/Sources: Mentioned by ParserService as optional but useful capability

- Property Name: errorOutputVariable
- Description: Variable name where error output will be stored
- Data Type: string
- Necessity: Nice-to-have
- Rationale/Sources: Requested by ResolutionService for error handling

- Property Name: id
- Description: Unique identifier for the run directive instance
- Data Type: string
- Necessity: Essential
- Rationale/Sources: Required by InterpreterService and StateService for tracking execution state

- Property Name: language
- Description: Programming language of the code to be executed (for language-specific execution)
- Data Type: string
- Necessity: Essential (for language commands)
- Rationale/Sources: Critical for InterpreterService and DirectiveService to determine execution environment

- Property Name: timeout
- Description: Maximum execution time in milliseconds
- Data Type: number
- Necessity: Nice-to-have
- Rationale/Sources: Requested by InterpreterService for resource control

- Property Name: memoize / once
- Description: Whether to cache/execute the result of this run directive only once
- Data Type: boolean
- Necessity: Nice-to-have
- Rationale/Sources: Requested by InterpreterService and StateService for optimization

- Property Name: shell
- Description: The shell to use for execution
- Data Type: string | boolean
- Necessity: Nice-to-have
- Rationale/Sources: Requested by ResolutionService for execution environment customization

- Property Name: range
- Description: Source location information for the directive
- Data Type: Range (with start/end positions)
- Necessity: Essential
- Rationale/Sources: Required by ParserService for source mapping

- Property Name: stateKey
- Description: The key to store the result in state
- Data Type: string
- Necessity: Nice-to-have
- Rationale/Sources: Requested by StateService for state management

- Property Name: errorHandling
- Description: Error handling strategy
- Data Type: "continue" | "fail" | Function
- Necessity: Nice-to-have
- Rationale/Sources: Requested by StateService for flow control
  </1synthesizedCoreProperties>

  <2synthesizedTypeDiscriminators>
- Discriminator Property: commandType
- Description: Distinguishes between different types of commands (basic system commands, language-specific code, defined commands)
- Potential Values/Types: "basic" | "language" | "defined"
- Rationale/Sources: DirectiveService requires this to route commands to appropriate handlers

- Discriminator Property: captureOutput
- Description: Distinguishes between run directives that capture output and those that don't
- Potential Values/Types: boolean (true/false)
- Rationale/Sources: Required by ParserService and ResolutionService to determine output handling

- Discriminator Property: language
- Description: Distinguishes between different language execution environments
- Potential Values/Types: "javascript" | "typescript" | "python" | "shell" | etc.
- Rationale/Sources: InterpreterService and DirectiveService need this for language-specific execution

- Discriminator Property: executionContext
- Description: Distinguishes between different execution contexts
- Potential Values/Types: "local" | "remote" | "sandbox" | "container" | "shell" | "direct"
- Rationale/Sources: InterpreterService and ParserService request this for execution environment control
  </2synthesizedTypeDiscriminators>

  <3synthesizedValidationRules>
- Rule 1: The "command" field must be a non-empty string.
- Rationale/Sources: Universal requirement across all services to have a valid command to execute

- Rule 2: If "args" is provided, it must be either an array of strings or a record object with valid values.
- Rationale/Sources: ParserService and DirectiveService require consistent argument formats for proper parameter passing

- Rule 3: If "captureOutput" is true, "outputVariable" must be a valid variable name string.
- Rationale/Sources: ResolutionService needs this for variable registration and future resolution

- Rule 4: If "language" is specified for language commands, it must be one of the supported languages.
- Rationale/Sources: InterpreterService and DirectiveService need valid language identifiers

- Rule 5: If "timeout" is provided, it must be a positive integer.
- Rationale/Sources: InterpreterService requires valid timeout values for execution control

- Rule 6: The "id" property must be unique within a session/document.
- Rationale/Sources: InterpreterService and StateService need this for execution tracking

- Rule 7: If "memoize"/"once" is true, the directive must have deterministic inputs.
- Rationale/Sources: InterpreterService requires this for reliable caching

- Rule 8: Range information must be complete with valid start and end positions.
- Rationale/Sources: ParserService requires this for source mapping

- Rule 9: If "stateKey" is provided, it must be a valid state key that follows naming conventions.
- Rationale/Sources: StateService needs valid keys for state operations

- Rule 10: Environment variable values in "env" must be strings or valid variable references.
- Rationale/Sources: ResolutionService requires this for proper variable resolution
  </3synthesizedValidationRules>

  <4keyPainPointsAddressed>
- Pain Point 1: Inconsistent command type classification and routing
- Resolution: Standardized commandType discriminator with clear validation rules ensures consistent routing to appropriate handlers

- Pain Point 2: Ambiguity in variable reference detection and resolution
- Resolution: Clear typing of fields that may contain variables (command, workingDir, env) enables consistent resolution

- Pain Point 3: Lack of standardized structure for run directives
- Resolution: Comprehensive core property set with clear types provides a consistent schema for all services

- Pain Point 4: Inconsistent handling of execution results
- Resolution: Standardized captureOutput, outputVariable, and stateKey properties create a clear pattern for result handling

- Pain Point 5: Difficulty tracking execution state for memoized/once-only executions
- Resolution: Required id property and optional memoize/once flags provide clear mechanisms for state tracking

- Pain Point 6: Ambiguity in error handling
- Resolution: Structured errorHandling property and errorOutputVariable provide clear error handling patterns

- Pain Point 7: Inconsistent source location tracking
- Resolution: Mandatory range information ensures proper source mapping for all run directives
  </4keyPainPointsAddressed>

  