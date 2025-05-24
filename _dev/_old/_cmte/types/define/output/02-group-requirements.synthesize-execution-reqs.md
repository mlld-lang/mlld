# Runtime Execution Requirements for @run Commands

Based on the feedback from component leads, I've synthesized the following requirements specifically for the runtime execution when a `@run` command is encountered:

## Command Definition Retrieval Requirements

1. **Typed Command Storage and Retrieval**: StateService must provide type-safe methods to store and retrieve command definitions with proper discrimination between command types.

2. **Command Type Discrimination**: The system must distinguish between shell commands and language-specific commands (JS, Python, Bash) using a discriminated union type pattern.

3. **Command Existence Validation**: Before attempting to execute a command, the system must verify the command exists in state and provide clear error messages if not found.

## Parameter Handling Requirements

4. **Parameter Count Validation**: The system must validate that the number of provided arguments matches the number of parameters defined in the command template.

5. **Parameter Substitution**: The system must replace parameter placeholders in the command template with the corresponding argument values, using a consistent pattern (e.g., `{{paramName}}`).

6. **Parameter Type Safety**: The runtime should enforce that arguments match expected parameter types or perform appropriate conversions.

## Command Execution Context Requirements

7. **Execution Environment Context**: The runtime should provide context information including working directory, environment variables, and execution mode.

8. **Substitution Mode Configuration**: Support for configuring how parameter substitution behaves (strict vs. lenient mode) when parameters are missing or invalid.

9. **Error Context Preservation**: When command execution fails, the error should include the original command name, parameters, and execution context for debugging.

## Variable Resolution Requirements

10. **Nested Variable Resolution**: The ResolutionService must handle variables within the substituted command template (recursive resolution).

11. **Resolution Context Propagation**: Context from the original command invocation should be propagated to nested resolution processes.

12. **Consistent Error Handling**: Resolution errors should be handled consistently with appropriate error codes and severity levels.

## Language-Specific Command Requirements

13. **Language Runtime Integration**: For language-specific commands, the system must integrate with the appropriate language runtime (JS, Python, Bash).

14. **Code Block Execution**: The system must properly execute the stored code block with the provided parameters.

15. **Output Capture and Processing**: The system must capture and process the output from executed commands, handling different output formats.

## Performance and Optimization Requirements

16. **Efficient Command Lookup**: StateService needs efficient lookup for command definitions by name to minimize execution overhead.

17. **Caching of Frequently Used Commands**: Consider caching frequently used command definitions to improve performance.

18. **Lazy Evaluation of Command Templates**: Command templates should be evaluated only when needed, not at definition time.

These requirements focus specifically on the runtime execution behavior when a defined command is invoked, rather than on the static definition of the commands themselves.