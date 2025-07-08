# Test Node Shadow Environment Always Created

This test verifies that Node.js always uses shadow environment, never subprocess fallback.

## Test 1: Simple node execution creates shadow env

Basic test: Shadow env exists
## Test 2: Shadow environment persists across calls

Set result: Value set
Get result: Set in shadow env
## Test 3: VM Context is used (not subprocess)

VM context check: Running in VM context
## Test 4: Module resolution includes mlld dependencies

Module access: Can access mlld dependencies