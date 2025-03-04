# Run Directive Hangs With Complex Commands

## Issue Description

When running Meld files with `@run` directives that execute complex commands (such as `cpai` or `npm test`), the process may hang indefinitely without providing an error message or completing execution. This affects the processing of the entire Meld file, even if the file has other correctly functioning directives.

## Reproduction Steps

1. Create a Meld file with complex run directives, such as those in `examples/example.meld`:
   ```meld
   @run [cpai api cli core services --tree --stdout]
   @run [cpai api cli core services --stdout]
   @run [npm test]
   ```

2. Run the file with the Meld CLI:
   ```bash
   meld examples/example.meld
   ```

3. Observe that the process hangs indefinitely without completing or providing error output.

## Investigation

We isolated the issue through a series of tests:

1. A simple `@run` directive works correctly:
   ```meld
   @run [echo "Hello, world!"]
   ```

2. When testing each of the complex commands individually:
   - `@run [cpai api cli core services --tree --stdout]` - Executed successfully
   - `@run [cpai api cli core services --stdout]` - Failed with error
   - `@run [npm test]` - Failed with error

3. When combined in a single file, these commands may cause the process to hang.

## Root Cause Analysis

The root cause appears to be related to one or more of the following:

1. **Command Availability**: The `cpai` command may not be available in all environments, leading to unexpected behavior.

2. **Error Handling**: The error handling in the `RunDirectiveHandler` may not properly capture or propagate errors from failed commands, especially when multiple run directives are present in a file.

3. **Subprocess Management**: The way subprocesses are spawned and managed may lead to hanging processes when certain commands fail or timeout.

4. **Interactive Commands**: Commands like `npm test` may expect interactive input, causing the process to wait indefinitely for input that isn't provided.

## Proposed Solution

1. Improve error handling in the `RunDirectiveHandler` to properly capture and report errors from failed commands.

2. Implement timeouts for command execution to prevent indefinite hanging.

3. Add detection for commands that may require interactive input and either:
   - Warn users about potential issues
   - Automatically append options to make them non-interactive (e.g., `--no-interactive`)
   - Provide better error messages when such commands are used

4. Consider adding a `--safe-mode` flag to the Meld CLI that would restrict run directives to a whitelist of safe commands.

## Related Components

- `RunDirectiveHandler.ts` - The handler for `@run` directives
- `FileSystemService.ts` - Responsible for executing commands
- `NodeFileSystem.ts` - Implementation of command execution using Node.js

## Impact

This issue impacts the usability of example files and may confuse users who attempt to run Meld files with complex commands. It also makes debugging more difficult as the process hangs without providing error information.

## Additional Notes

- The issue does not affect the proper functioning of other directives like `@embed` when used in isolation.
- Simple run directives (`echo`, `ls`, etc.) appear to work correctly.
- The hanging behavior was observed on MacOS, and may behave differently on other operating systems. 