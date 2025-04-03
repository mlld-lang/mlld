# Feedback on Run Directive Draft Specification (from DirectiveService)

## 1. Accuracy Assessment

The draft specification generally captures the core functionality needed for the `RunDirectiveHandler` but has several inconsistencies with our current implementation and requirements:

- The `shell` property is marked as required, but in our implementation it's optional with a default value.
- Some enum values in `RunCommandType` don't align with our current implementation, which uses a more flexible approach based on our classifier system.
- The `executionResult` property exists but should be treated as internal/output only, not as input to the directive.

## 2. Completeness Assessment

- **Missing Property**: `representation` - Our handler uses this for backward compatibility and migration warnings.
- **Missing Property**: `cleanupCommand` - Used in our implementation to specify cleanup commands that should run after the main command.
- **Missing Property**: `description` - Used for documentation and feedback purposes.
- **Missing Property**: `ignoreCache` - Flag to force re-execution even when cached results exist.
- **Missing Type**: We need to define the structure for language-specific arguments (like in our `LanguageCommandHandler`).
- **Missing Type**: We need to define the structure for service-specific command configurations.
- **Missing Handling**: The specification doesn't address how defined commands are resolved or referenced.

## 3. Clarity & Usability Assessment

- The TSDoc comments are clear and helpful, especially the validation notes.
- Suggested Renaming: `stateKey` → `resultKey` to align with our current implementation and be more descriptive of its purpose (it's specifically for storing execution results).
- `RunOutputMode` should include `MARKDOWN` as we support markdown output formatting.
- The distinction between `commandType` and different execution modes could be clearer.

## 4. Potential Issues / Edge Cases

- **Issue 1**: The specification doesn't address caching behavior for command results, which is critical for performance in our service.
- **Issue 2**: There's no mechanism for handling interactive commands or commands that require user input beyond the initial stdin.
- **Issue 3**: The specification doesn't address how to handle commands that generate very large outputs that might exceed memory limits.
- **Issue 4**: No consideration for command dependencies or execution order when multiple run directives are present.
- **Issue 5**: No mechanism for handling sensitive information in commands (like credentials or tokens) that shouldn't be logged or cached.

## 5. Validation Concerns

- **Concern 1**: Runtime validation for `cwd` should verify not just that it's a valid path but that it exists and is accessible.
- **Concern 2**: The `env` validation should handle environment variable expansion (e.g., `$PATH`).
- **Concern 3**: Command validation should consider security implications and potential command injection vectors.
- **Concern 4**: Timeout validation should include a reasonable maximum to prevent resource exhaustion.
- **Concern 5**: We need validation for circular references in defined commands to prevent infinite loops.

## 6. Specific Improvement Suggestions

- **Suggestion 1**: Add a `cache` property with options like `{ enabled: boolean, ttl?: number }` to give fine-grained control over caching behavior.
- **Suggestion 2**: Make `shell` optional with a default value of `true` to match our current implementation.
- **Suggestion 3**: Add a `feedback` property to control whether and how execution feedback is displayed to the user.
- **Suggestion 4**: Include a `securityContext` property to define execution permissions and restrictions.
- **Suggestion 5**: Add support for command templates with variable substitution, which our service already implements.
- **Suggestion 6**: Consider adding a `retryStrategy` for handling transient failures in command execution.
- **Suggestion 7**: Include a `version` field to support backward compatibility as the directive evolves.
- **Suggestion 8**: Add a `dryRun` option to validate commands without executing them.
- **Suggestion 9**: Consider splitting this into a base interface with specialized interfaces for different command types to improve type safety and developer experience.

Overall, the draft is a good starting point but needs refinement to fully support our service's current capabilities and future needs.