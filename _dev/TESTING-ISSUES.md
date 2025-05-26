# Meld Examples Testing Issues

When running the updated examples with current syntax, we found several interpreter bugs:

## 1. Comment Handling
**File**: simple.mld, example.mld
**Error**: `Unknown node type: Comment`
**Issue**: The interpreter doesn't handle Comment nodes in the evaluate() function

## 2. Import Resolution
**File**: chain.mld, example.mld, simple.mld  
**Error**: `Variable 'role' not found in imported file`
**Issue**: Import resolution might have path issues or the interpreter isn't loading the imported variables correctly

## 3. Shell Command Execution
**File**: math.mld
**Error**: `/bin/sh: {{items.0.value}} + {{items.1.value}} + {{items.2.value}}: command not found`
**Issue**: Template interpolation happens at the wrong time - the shell sees the template syntax instead of interpolated values

## 4. Glob Pattern Expansion
**File**: test-commands.mld
**Error**: `ls: examples/*.mld: No such file or directory`
**Issue**: Shell glob patterns aren't being expanded properly in @run commands

## 5. Inline Variable References
**File**: test-simple.mld, test-commands.mld
**Issue**: `@add @variable` only works at the start of a line, not inline within text

## 6. Array Indexing in Templates
**File**: working-demo.mld
**Issue**: `{{config.features.0}}` shows the entire array instead of the indexed element

## 7. Missing Commands
**File**: jokes.mld, chain.mld
**Error**: `/bin/sh: oneshot: command not found`
**Issue**: Examples reference a `oneshot` command that doesn't exist

## Examples Status:
- ✅ demo.mld - Works, produces output
- ❌ chain.mld - Import error: "Variable 'role' not found in imported file"
- ❌ example.mld - Error with path directive (missing ARCHITECTURE.md file)
- ✅ simple.mld - Works, produces output (comments are included though)
- ✅ math.mld - Works, but bc command returns 0 (shell interpolation issue)
- ❌ jokes.mld - oneshot command missing
- ✅ imports.mld - Works as a library file
- ❌ section-demo.mld - Error with path directive (missing docs files)
- ✅ url-demo.mld - Works, produces output (but would need URL support enabled)
- ✅ test-commands.mld - Works but glob patterns fail
- ✅ test-simple.mld - Works correctly
- ✅ working-demo.mld - Works correctly

## Next Steps:
These are legitimate bugs in the interpreter that need to be fixed, not issues with the example syntax.