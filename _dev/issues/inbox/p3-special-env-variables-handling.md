# Special Handling for Environment Variables

## Workaround Location and Code

In `services/resolution/ResolutionService/resolvers/TextResolver.ts`, there's special handling for environment variables:

```typescript
// Get variable value
const value = this.stateService.getTextVar(identifier);

if (value === undefined) {
  // Special handling for ENV variables
  if (identifier.startsWith('ENV_')) {
    throw new MeldResolutionError(
      `Environment variable not set: ${identifier}`,
      {
        code: ResolutionErrorCode.UNDEFINED_VARIABLE,
        severity: ErrorSeverity.Recoverable,
        details: { 
          variableName: identifier,
          variableType: 'text',
          context: 'environment variable'
        }
      }
    );
  }
  // ... other error handling
}
```

## Purpose of the Workaround

This workaround provides special error handling for environment variables (those with names starting with `ENV_`). Instead of treating them like regular undefined variables, the system provides a more specific error message indicating that an environment variable is not set.

The special handling appears to serve several purposes:

1. **Improved Error Messages**: Providing more context-specific error messages for environment variables
2. **Error Distinction**: Distinguishing between regular undefined variables and missing environment variables
3. **User Experience**: Helping users understand that they need to set an environment variable rather than define a text variable

## Affected Functionality

### 1. Variable Resolution

This special handling affects how the system reports errors during variable resolution, particularly for:
- Variables with names starting with `ENV_`
- Error messages for undefined environment variables
- Error recovery and handling

### 2. Error Reporting

The workaround changes the error information provided when an environment variable is missing:
- Customizes the error message text
- Sets a specific error code
- Adds contextual details to the error object

## Root Cause Analysis

This doesn't appear to be a workaround for a bug, but rather intentional special handling to improve the user experience. Environment variables are a special case in the system, as indicated in documentation:

From `docs/variables.md`:
```
- Environment variables ({{ENV_*}}) are a special case of text variables
```

The fundamental design choice here is to treat environment variables as a special category of variables with their own error handling logic, rather than implementing them as a separate variable type.

## Current Status

This appears to be intentional special handling rather than a temporary workaround:

1. Environment variables are documented as a "special case" of text variables
2. The code explicitly labels this as "special handling"
3. The implementation is focused on improving error messages rather than fixing a bug

## Recommendations

1. **Document ENV Variable Behavior**: Ensure the special handling of environment variables is well-documented in the user documentation

2. **Consider Standardization**: Evaluate if environment variables should be a separate variable type instead of a special case of text variables

3. **Add Test Coverage**: Create tests that verify error messages for undefined environment variables

4. **Enhance Error Handling**: Consider adding suggestions for how to set the environment variable in the error message

## Implementation Concerns

The special handling is fairly minimal and focused, but there are a few considerations:

1. **Naming Convention Enforcement**: The system only recognizes variables with the `ENV_` prefix as environment variables
2. **Documentation Clarity**: Users need to understand the distinction between regular variables and environment variables
3. **Consistency**: Other resolvers might need similar special handling for environment variables

## Next Steps

1. Review documentation to ensure environment variable behavior is clearly explained
2. Consider adding examples of proper environment variable usage to the documentation
3. Evaluate if other resolvers need similar special handling for environment variables
4. Ensure test coverage for environment variable error cases 