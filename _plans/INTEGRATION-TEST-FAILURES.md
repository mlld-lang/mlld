# Integration Test Failures (Post-Refactor)

This document summarizes the key failures observed in the API integration tests after refactoring them to use real services with minimal mocking (MemFS, DirectiveLogger) and a singleton StateService within a child container.

## `api/api.test.ts` Failures

1.  **`@run` Directive Execution:**
    *   **Tests:**
        *   `Format Conversion > should handle execution directives correctly`
        *   `Format Conversion > should handle complex meld content with mixed directives`
    *   **Failure:** Throws `Interpreter error (directive_client_error): ... Directive error (run): Run directive command cannot be empty`.
    *   **Indicates:** The command string within the `@run [...]` directive (e.g., `[echo test]`) is likely not being parsed or passed correctly to the `RunDirectiveHandler`.

2.  **Variable Resolution within `@run`:**
    *   **Tests:**
        *   `Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline` (Input: `@run [echo {{greeting}}]`)
        *   `Full Pipeline Integration > should preserve state and content in transformation mode` (Input: `@run [echo {{greeting}}, {{name}}!]`)
    *   **Failure:** Assertion errors (`expected 'test.meld' to contain 'Hello'`, `expected 'test.meld' to contain 'Hello, World!'`). The output contains the file path instead of the expected resolved command output.
    *   **Indicates:** Variables like `{{greeting}}` are not being resolved *within the command string* of the `@run` directive before it's executed.

3.  **Example File Output:**
    *   **Test:** `Examples > should run api-demo-simple.meld example file`
    *   **Failure:** Assertion error (`expected 'test.meld' to contain '<SimpleExample>'`). Output seems incorrect.
    *   **Indicates:** Potential issue in output formatting (`OutputService`) or how the specific example content (which includes `@run`) is processed.

## `api/integration.test.ts` Failures

1.  **Variable/Data Resolution (Regression):**
    *   **Tests:**
        *   `Variable Definitions and References > should handle text variable definitions and references`
        *   `Variable Definitions and References > should handle data variable definitions and field access`
        *   `Variable Definitions and References > should handle complex nested data structures`
        *   `Variable Definitions and References > should handle template literals in text directives`
    *   **Failure:** Assertion errors indicate that `{{variable}}` substitutions in text nodes are incorrect or missing, and data structure access (e.g., `config.app.name`) fails.
    *   **Indicates:** Despite the singleton `StateService`, variable resolution is breaking down in these specific tests. Potential issues in `ResolutionService`, `InterpreterService`, `StateService`, or `OutputService` interactions within this file's more complex tests.

2.  **Special Path Variable Resolution (`@path`):**
    *   **Tests:**
        *   `Path Handling > should handle path variables with special $PROJECTPATH syntax`
        *   `Path Handling > should handle path variables with special $. alias syntax`
        *   `Path Handling > should handle path variables with special $HOMEPATH syntax`
        *   `Path Handling > should handle path variables with special $~ alias syntax`
    *   **Failure:** Throws `Interpreter error (directive_client_error): ... Directive error (path): Path validation failed for resolved path "": Path cannot be empty`.
    *   **Indicates:** `PathService` or `ResolutionService` fails to resolve `$PROJECTPATH`, `$.`, `$HOMEPATH`, `$~/` aliases into valid, non-empty paths for validation. Basic path validation (`should allow raw absolute paths`, `should allow paths with dot segments`) passes.

3.  **`@import` Directive Processing:**
    *   **Tests:**
        *   `Import Handling > should handle simple imports`
        *   `Import Handling > should handle nested imports with proper scope inheritance`
    *   **Failure:** Assertion errors show the final output string still contains the literal `@import` directive instead of the imported content.
    *   **Indicates:** The `ImportDirectiveHandler` (via `InterpreterService`/`DirectiveService`) is not correctly processing the import, replacing the directive, or embedding the content.

4.  **Circular Import Detection:**
    *   **Test:** `Import Handling > should detect circular imports`
    *   **Failure:** The `processMeld` promise resolves successfully instead of rejecting with a circular import error.
    *   **Indicates:** The `CircularityService` (or its integration in the pipeline) is failing to detect the import loop.

## Next Steps

These failures point to potential issues within the core service implementations (`InterpreterService`, `ResolutionService`, `PathService`, `DirectiveService`, `StateService`, `CircularityService`, `OutputService`, specific directive handlers) or their interactions. Each category should be investigated systematically. 