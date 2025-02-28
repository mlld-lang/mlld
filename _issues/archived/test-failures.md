# Test Failures Analysis

## Summary

There are 31 failing tests across multiple files in the codebase. The failures can be categorized into several root causes.

## Major Categories of Failures

### 1. Missing @api/index.js Module (15 tests)

All tests in `cli/cli.test.ts` are failing with:
```
Error: Cannot find module '@api/index.js'
```

This suggests that the compilation process is not properly generating JavaScript files from TypeScript files for the API module. The API module is imported in several places:

- In CLIService.ts: `const result = await apiMain(options.input, apiOptions);`
- In cli/index.ts: `import { main as apiMain } from '@api/index.js';`
- In cli/cli.test.ts: `const apiMainSpy = require('@api/index.js').main;`

There is a TypeScript file at `api/index.ts`, but the corresponding JavaScript file that should be generated during build is missing. This is causing the CLI tests to fail because they cannot find the module.

### 2. CLIService Implementation Changes (13 tests)

Tests in `services/cli/CLIService/CLIService.test.ts` are failing due to implementation changes in the CLIService:

- Some tests expect `mockOutputService.convert` to be called but it isn't
- Some tests expect promises to be rejected but they're resolving
- Some assertions on expected function call parameters are failing

The changes to the CLIService implementation, including removal of the watch functionality, have likely affected how these tests expect the service to behave.

### 3. API Integration Test Failures (1 test)

The test in `api/api.test.ts` is failing because of HTML encoding issues:
```
AssertionError: expected '```\n  &gt;&gt; This is a commment an…' to contain '>> This is a commment and shou
ld be i…'
```

This indicates a change in how content is processed or rendered, possibly related to HTML encoding/escaping.

### 4. Parser Debug Test Failures (1 test)

A test in `scripts/debug-parser.test.ts` is failing because it expects a property "id" in a path directive:
```
AssertionError: expected { kind: 'path', …(2) } to have property "id"
```

This suggests a schema change in path directives where the "id" property may have been renamed or removed.

### 5. Field Access Test Failures (1 test)

The test in `tests/field-access.test.js` is failing with:
```
ReferenceError: before is not defined
```

This indicates a missing test utility or setup function, possibly due to a change in testing framework or configuration.

## Root Causes

The primary root causes appear to be:

1. **Build/Compilation Issues**: The TypeScript files are not being properly compiled to JavaScript, leading to missing modules.

2. **Implementation Changes Without Test Updates**: The implementation of the CLI service has changed (including removal of watch mode), but the tests haven't been updated to match the new behavior.

3. **Framework or Configuration Changes**: Some tests are using utilities or functions that are no longer available in the current environment.

## Recommended Actions

1. **Fix Build Process**: Ensure that TypeScript files are properly compiled to JavaScript, especially for the API module.

2. **Update or Skip CLI Tests**: Update the CLI service tests to match the new implementation, or temporarily skip them until they can be properly updated.

3. **Investigate HTML Encoding**: Check why the API integration test is receiving HTML-encoded content instead of plain text.

4. **Update Schema Tests**: Update the parser tests to match the current schema for path directives.

5. **Fix Testing Utilities**: Ensure that all required testing utilities are properly imported and available to the tests. 