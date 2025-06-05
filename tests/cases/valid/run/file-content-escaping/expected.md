# Test File Content in Commands

This tests passing file content to external commands.

# Test File

This file contains @mlld syntax that should not be interpreted.

@text example = "This should not execute"
@run [(echo "This should not run")]

It also has $SHELL_VARS and `backticks` and 'quotes'.