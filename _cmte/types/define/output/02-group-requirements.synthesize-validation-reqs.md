# Validation Requirements for @define Directive

## Static Validation Requirements

### Command Name Validation
1. Command name must be a non-empty string
2. Command name must be a valid identifier:
   - Must start with a letter or underscore
   - Can contain alphanumeric characters and underscores
   - Cannot contain spaces or special characters except for dots (used for metadata)
3. When dots are present in the command name (for metadata), validate:
   - Format must follow `name.metadataKey.metadataValue` pattern
   - Only supported metadata keys are `risk` and `about`
   - When `risk` is specified, value must be one of: `high`, `med`, or `low`

### Parameter Validation
1. Parameter names must be valid identifiers:
   - Must start with a letter or underscore
   - Can contain alphanumeric characters and underscores
   - Cannot contain spaces or special characters
2. No duplicate parameter names allowed within the same command definition
3. Parameters should be properly formatted in the directive structure

### Command Body Validation
1. The right-hand side of a @define directive must be a valid @run directive
2. Based on command type, validate appropriate properties:
   - For shell commands: validate `command` property exists and is a string
   - For language commands: validate `language`, `code` properties exist and are valid
     - `language` must be one of supported languages: 'js', 'python', 'bash', etc.
     - `code` must be a non-empty string

### Structural Validation
1. @define directive must have the correct structure with required properties:
   - `kind` must be 'define'
   - `commandName` must be present
   - `body` must be a RunDirectiveNode

## Runtime Validation Requirements

### Collision Detection
1. Check if a command with the same name already exists in the state
   - Either prevent overwriting or implement a policy for handling collisions

### Parameter Reference Validation
1. Validate that all parameter references in the command body are defined in the parameters list
2. Validate that parameter count matches expected usage in the command

### Type Consistency
1. Ensure the command definition is consistently typed based on its kind:
   - Shell commands must have the shell command structure
   - Language commands must have the language command structure with appropriate properties

## Storage Requirements

1. Command definitions must be stored with a consistent structure:
   ```typescript
   interface CommandDefinition {
     type: 'shell' | 'language';
     parameters: string[];
     command?: string;          // For shell commands
     language?: string;         // For language commands
     code?: string;             // For language commands
     metadata?: CommandMetadata;
   }
   
   interface CommandMetadata {
     risk?: 'high' | 'med' | 'low';
     about?: string;
     meta?: Record<string, unknown>;
   }
   ```

2. Metadata from the command name must be properly extracted and stored in the command definition
3. Parameter information must be preserved for later substitution during command execution

## Error Handling Requirements

1. Provide clear error messages that indicate:
   - The specific validation rule that failed
   - The location in the source where the error occurred
   - Suggestions for correction when possible
2. For syntax errors in the command name or metadata, specify which part of the format is incorrect
3. For parameter validation failures, indicate which parameter is problematic

These validation requirements ensure that @define directives are well-formed, consistent, and can be safely executed when referenced later in the application.