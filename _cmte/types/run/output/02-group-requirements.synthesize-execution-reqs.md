# Synthesized Requirements for @run Directive Execution Runtime

## Command Type-Specific Execution Requirements

1. **Discriminated Command Type Handling**:
   - Runtime must distinguish between three command types (basic, language, defined)
   - Each command type requires specialized execution logic
   - Type information should be preserved throughout execution lifecycle

2. **Unified Execution Interface**:
   - Single entry point method that routes based on command type
   - Type-safe parameter passing appropriate to each command type
   - Consistent return structure regardless of command type

## Execution Context Requirements

3. **Environment Variable Management**:
   - Support for custom environment variables during command execution
   - Inheritance of parent process environment variables when appropriate
   - Variable isolation between different command executions

4. **Working Directory Control**:
   - Configurable working directory for command execution
   - Default to current working directory when not specified
   - Support for relative path resolution within commands

5. **Execution Security Controls**:
   - Command allowlist/blocklist capability
   - Configurable execution timeouts to prevent infinite processes
   - Output size limits to prevent memory issues

## Variable Resolution Requirements

6. **Runtime Variable Resolution**:
   - Support for resolving `$text`, `$data`, and `$path` variables within commands
   - Proper type conversion when substituting variables into command strings
   - Handling of complex data structures when used as parameters

7. **Parameter Type Handling**:
   - Structured type system for command parameters
   - Proper serialization of different parameter types (string, number, boolean, object)
   - Preservation of parameter type information for validation

## Temporary File Management

8. **Language Script File Handling**:
   - Creation of temporary script files with appropriate permissions
   - Automatic cleanup after execution completes
   - Language-specific file extensions and execution approaches
   - Error handling for file system operations

9. **Script Execution Environment**:
   - Detection of appropriate language runtime (node, python, etc.)
   - Parameter passing to language scripts in the correct format
   - Capturing both stdout and stderr from script execution

## Command Definition Access

10. **Defined Command Resolution**:
    - Efficient lookup of command definitions from StateService
    - Support for nested command definitions (commands that call other commands)
    - Detection and prevention of circular command references

11. **Command Parameter Substitution**:
    - Replacement of parameter placeholders in command templates
    - Validation of parameter counts against command definition
    - Proper escaping of special characters in parameters

## Result Handling Requirements

12. **Structured Execution Results**:
    - Capture of stdout, stderr, and exit code
    - Execution metadata (duration, command type, timestamp)
    - Success/failure determination based on exit code

13. **Error Management**:
    - Type-specific error handling for each command type
    - Detailed error context for debugging
    - Consistent error format across all execution paths

## Performance Considerations

14. **Execution Efficiency**:
    - Minimize process creation overhead when possible
    - Efficient handling of large output streams
    - Proper resource cleanup after execution

15. **Caching Support**:
    - Optional caching of command results for repeated executions
    - Cache invalidation strategies for changing inputs
    - Performance metrics to identify slow commands