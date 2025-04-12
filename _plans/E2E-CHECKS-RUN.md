# @run Directive Checks for E2E Tests

This document lists the essential functionalities of the `@run` directive that should be verified via end-to-end (E2E) tests once the test suite is operational post-refactoring. These checks aim to cover the core scenarios previously challenging to test reliably with isolated integration/unit tests due to mock complexity.

**Target E2E Test Scenarios:**

1.  **Simple Command (`subtype: 'runCommand'`):**
    *   **Input:** `@run [echo "Hello Basic"]`
    *   **Verification:** Ensure the command executes and its `stdout` ("Hello Basic") is captured, likely in the default `stdout` state variable.

2.  **Variable Resolution in Command:**
    *   **Input:**
        ```mld
        @text name = "World"
        @run [echo "Hello {{name}}"]
        ```
    *   **Verification:** Ensure the command executes as `echo "Hello World"` and the output is captured.

3.  **Inline Shell Script (`subtype: 'runCode'`):**
    *   **Input:** `@run [[ echo "Inline Shell" ]]`
    *   **Verification:** Ensure the inline shell script executes and its output ("Inline Shell") is captured.

4.  **Inline Language Script (`subtype: 'runCode'`, e.g., Python):**
    *   **Input:** `@run python [[ print("Inline Python") ]]`
    *   **Verification:** Ensure the Python script executes (via the temporary file mechanism) and its output ("Inline Python") is captured.

5.  **Script with Parameters (`subtype: 'runCodeParams'`):**
    *   **Input:**
        ```mld
        @text input = "ParameterValue"
        @run python ({{input}}) [[ import sys; print(f"Param: {sys.argv[1]}") ]]
        ```
    *   **Verification:** Ensure the `{{input}}` variable is resolved, passed as an argument to the Python script, and the script's output ("Param: ParameterValue") is captured.

6.  **Defined Command (`subtype: 'runDefined'`):**
    *   **Input:**
        ```mld
        @define testcmd = @run [echo "Defined Command Ran"]
        @run $testcmd
        ```
    *   **Verification:** Ensure the defined command (`$testcmd`) is looked up and executed, capturing its output ("Defined Command Ran").

7.  **Output Variable Handling:**
    *   **Input:** `@run [echo "Capture Me"] output=captured_output`
    *   **Verification:** Ensure the `stdout` ("Capture Me") is stored in the `captured_output` text variable in the state.
    *   **Input:** `@run [>&2 echo "Error Message"] output=out stderr=err`
    *   **Verification:** Ensure the `stderr` ("Error Message") is stored in the `err` text variable.

8.  **Working Directory:** (May require specific test setup)
    *   **Input:** `@run [pwd]` (executed within a specific subdirectory context if possible in the test)
    *   **Verification:** Ensure the captured `stdout` reflects the expected working directory.

9.  **Error Handling:**
    *   **Input:** `@run [exit 1]` or `@run [invalid_command_does_not_exist]`
    *   **Verification:** Ensure the execution failure is handled gracefully – either a specific `stderr` value is captured, or the Meld process reports an appropriate error without crashing.

10. **Transformation Mode:**
    *   **Input:** `@run [echo "Transformed Output"]` (when Meld is run with transformation enabled, e.g., `--format markdown`)
    *   **Verification:** Ensure the final output document contains the text "Transformed Output" directly, replacing the original `@run` directive line. 