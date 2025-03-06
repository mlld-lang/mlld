# Shell Command Syntax Errors and Multi-line Text Processing Issues

## Overview

When running commands inside meld files using `@run` directives or `@text` directives with `run` options, syntax error messages from the shell are sometimes displayed in the output:

```
/bin/sh: -c: line 1: syntax error near unexpected token `('
/bin/sh: -c: line 1: `   
```

While the command output itself generally works correctly, these error messages are scattered throughout the stdout output, creating a confusing and unprofessional user experience.

Additionally, when passing multi-line content to commands (particularly the `oneshot` command), the text is not properly handled, causing LLM responses to only see partial content.

## Current Behavior

1. Command execution using `exec` in `NodeFileSystem.executeCommand` passes commands directly to the shell
2. Commands containing certain shell special characters (like parentheses) trigger syntax errors
3. These error messages are included in the output and displayed to the user
4. Multi-line text is not properly escaped or quoted when passed to shell commands
5. When using variable interpolation with multi-line content in `oneshot` commands, the LLM only receives the first line or partial content

## Expected Behavior

1. Shell commands should be properly escaped or handled to prevent syntax errors
2. Error messages from the shell should be filtered or suppressed where appropriate
3. If a command is invalid, a meaningful error message should be displayed instead of raw shell errors
4. Multi-line content should be properly passed to commands, particularly when using `oneshot`
5. The output should be clean and free of shell-specific syntax error messages

## Investigation Notes

The issue appears to be in how commands are passed to Node.js's `exec` function in `NodeFileSystem.ts`:

```typescript
// For all other commands, use exec with Promise
try {
  const { promisify } = require('util');
  const { exec } = require('child_process');
  const execAsync = promisify(exec);

  const { stdout, stderr } = await execAsync(command, {
    cwd: options?.cwd || process.cwd(),
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer to handle large outputs
  });

  // Log the output to console
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  return { stdout, stderr };
} catch (error) {
  // Handle command execution errors
  const err = error as any;
  console.error(`Command failed with exit code ${err.code}`);
  
  if (err.stdout) console.log(err.stdout);
  if (err.stderr) console.error(err.stderr);
  
  return {
    stdout: err.stdout || '',
    stderr: (err.stderr || '') + `\nCommand exited with code ${err.code}`
  };
}
```

While the code already has special handling for "oneshot" commands, there are issues with how multi-line content is passed to these commands:

1. Commands being passed directly to the shell without proper escaping
2. Complex shell constructs like parentheses, pipe symbols, or redirections causing syntax issues
3. Raw shell error output being included in the command output
4. Multi-line content not being properly preserved when passed to shell commands

### Multi-line Content Issue

The issue is particularly visible with the `examples/jokes.mld` file. This file defines multiple joke variables and then tries to ask an LLM to evaluate which joke is the funniest:

```
@text evaluation = [[
    Which joke is the funniest?
    {{joke_1}}
    {{joke_2}}
    {{joke_3}}
    {{joke_4}}
]]

@run [oneshot {{evaluation}}]
```

When this runs, the LLM only receives the first line "Which joke is the funniest?" or even just "Which", and responds with a message indicating the prompt is incomplete. The multi-line content with joke interpolation is not properly passed to the `oneshot` command.

## Reproduction Steps

### Issue 1: Syntax errors with special characters

1. Create a simple meld file (example.mld):
```
@run [echo some text with (parentheses)]
```

2. Process the file with the meld CLI:
```bash
meld example.mld
```

3. Observe shell syntax errors in the output

### Issue 2: Multi-line content not properly passed to commands

1. Run the jokes example:
```bash
meld examples/jokes.mld
```

2. Observe that the LLM only receives partial content and responds with:
```
I notice your message contains only the word "Which." This seems to be an incomplete question...
```

## Fix Proposal

1. Improve command preprocessing before execution:
   - Add a sanitize/escape function for shell commands
   - Detect potentially problematic shell characters and escape them
   - Consider using shell-escape npm package for reliable escaping
   - Properly handle multi-line content with appropriate quoting

2. Enhanced error handling:
   - Filter out common shell syntax errors from the output
   - Provide more user-friendly error messages
   - Capture and sanitize stderr before including in output

3. Consider alternative execution methods:
   - For complex commands, use `child_process.spawn` with shell option instead of `exec`
   - Expand the special handling currently used for "oneshot" commands
   - Use a shell parser to identify and handle complex syntax
   - For multi-line content, consider using temporary files or other mechanisms to avoid shell escaping issues

4. Improve testing:
   - Add test cases for commands with special characters
   - Test multi-line content in commands
   - Test on different shells (bash, zsh, cmd) to ensure cross-platform compatibility

## Related Issues

None identified yet.

## Implementation Priority

High - This issue impacts user experience and prevents core functionality (multi-line LLM prompts) from working correctly. 