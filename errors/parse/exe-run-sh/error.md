Invalid 'run' keyword in exe definition

mlld has two different shell command syntaxes:

1. Bare shell commands (single-line, @variable interpolation works):
   ✓ exe @${FUNCNAME}(name) = {echo "Hello @name"}
   ✗ exe @${FUNCNAME}(name) = run {echo "Hello @name"}

2. Shell scripts (multiline, parameters as $1, $2, etc):
   ✓ exe @${FUNCNAME}(name) = sh {echo "Hello $1"}
   ✗ exe @${FUNCNAME}(name) = run sh {echo "Hello $1"}

The 'run' keyword is only for standalone directives like run sh {...}, not within exe definitions.

Key difference:
- Bare commands: Limited to single-line, but @variable interpolation works
- Shell scripts (sh/bash/zsh): Multiline with && and ;, but use $1, $2 for parameters