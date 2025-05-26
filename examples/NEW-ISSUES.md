# Additional Issues from New Example Files

## 1. Parameterized exec commands not expanding properly
**File**: plan.mld
**Error**: `/bin/sh: -c: line 0: syntax error near unexpected token '('`
**Code**: `@text code = @run @codecat(@services)`
**Issue**: When using `@run @command(params)`, the command isn't properly expanded before execution
**Impact**: High - prevents using parameterized commands

## 2. Old bracket syntax in examples
**File**: readme-embed.mld
**Code**: `@add [@./docs/ARCHITECTURE.md] as ## Architecture`
**Issue**: Uses old syntax instead of new syntax `@add @path "./docs/ARCHITECTURE.md"`
**Note**: This is a documentation issue - the example needs updating

## 3. Missing file dependencies
**Files**: 
- imports-roles.mld - tries to `@add [README.md]`
- code-review.mld - tries to import "prompts.mld"
**Issue**: Examples reference files that don't exist
**Solution**: Either include the missing files or update the paths

## 4. Non-existent commands referenced
**Files**: test-plan.mld, plan.mld
**Command**: `oneshot`
**Issue**: Multiple examples use a command called `oneshot` that doesn't exist
**Note**: This appears to be a placeholder for an LLM command-line tool

## Summary of Working vs Broken Examples

### Working (with issues):
- test-plan.mld - runs npm test successfully but fails on oneshot command
- imports-roles.mld - would work if README.md existed

### Broken:
- plan.mld - parameterized exec command syntax error
- code-review.mld - missing import file
- readme-embed.mld - old syntax for path directives

### Key New Bug:
The most significant new issue is that parameterized exec commands like `@run @codecat(@services)` don't work properly. The interpreter seems to be passing the raw command text to the shell instead of first resolving the exec command and its parameters.