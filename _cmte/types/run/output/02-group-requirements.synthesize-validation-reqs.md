# Synthesized Validation Requirements for Run Directive

Based on the feedback provided, I've consolidated the following validation requirements for the `run` directive:

## Static Validation Requirements

1. **Base Structure Validation**
   - Ensure the directive has a `kind` property with value "run"
   - Validate that a command is specified (either `command` property exists or `isReference` is true)

2. **Subtype Classification**
   - Validate the directive conforms to exactly one of the expected subtypes (basicCommand, languageCommand, definedCommand)
   - Ensure required properties exist for each subtype:
     - `basicCommand`: Must have `command` as string
     - `languageCommand`: Must have `language` and `command` properties
     - `definedCommand`: Must have `commandName` property

3. **Command String Validation**
   - For `basicCommand`: Validate command string is non-empty
   - For `languageCommand`: Validate command string is valid for the specified language
   - For multiline commands: Validate proper line termination

4. **Parameter Validation**
   - Validate parameter syntax (proper quoting, escaping)
   - Check parameter count matches expected count for defined commands
   - Validate parameter format for variable references (proper variable name syntax)
   - Ensure variable path references use valid dot notation

## Runtime Validation Requirements

1. **Command Existence**
   - For `definedCommand`: Verify the referenced command exists in the state
   - Validate all required parameters for defined commands are provided

2. **Language Support**
   - For `languageCommand`: Verify the specified language is supported in the current environment
   - Check compatibility of language-specific parameters

3. **Variable Resolution**
   - Validate that referenced variables exist at runtime
   - Verify variable paths point to valid properties
   - Check that variable values are compatible with their usage context

4. **Command Execution Validation**
   - Validate command can be executed in the current environment
   - Check permissions for command execution
   - Verify execution time constraints

## Parameter Type Validation

1. **Parameter Type Checking**
   - Validate string parameters have proper quoting and escaping
   - Verify variable parameters reference existing variables
   - Ensure numeric parameters contain valid numbers
   - Check boolean parameters have valid boolean values

2. **Parameter Format Rules**
   - String parameters: Validate proper quoting and escaping
   - Variable references: Check for proper `${}` syntax
   - Path references: Ensure valid dot notation for nested properties
   - Array indices: Validate numeric indices for array access

3. **Parameter Constraints**
   - Check that required parameters are provided
   - Validate parameter count matches command definition
   - Verify parameters meet any type-specific constraints

This validation framework ensures that `run` directives are properly structured, have valid commands and parameters, and can be executed safely at runtime.