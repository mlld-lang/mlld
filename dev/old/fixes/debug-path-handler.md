# Path Directive Handling Debug

The issue in the API integration tests appears to be that the path directive validation fails. Looking at the error message "Path directive requires an 'identifier' property", it seems that the validator expects the path directive to have a specific structure.

## Possible issues:

1. **Service initialization order**: The API integration tests might be initializing services in a different order than the regular API, causing directive handlers to not be registered properly. This would explain why the validator cannot find the expected fields.

2. **TestContext registration**: The `TestContext` might not be setting up the directive service properly for path directives.

3. **Parser configuration**: There might be a configuration issue in how the parser is set up for the integration tests.

## Recommended solution approach:

1. Add debug logging to the initialization in the integration test, focusing on:
   - Order of service initialization
   - Validation of directive handlers registration
   - Parser configuration

2. Compare the AST structure produced in the failing test vs a known working example

3. For a quick fix, we can try manually registering the path directive handler in the integration test setup.