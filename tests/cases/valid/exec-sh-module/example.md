# Test sh executables from module imports

This tests importing and using sh executables from a module.

/import { simple_sh, multiline_sh, parameterized_sh, error_handling_sh } from "./test-sh-module.mld"

## Simple sh execution
/var @result1 = @simple_sh()
/show `Simple: @result1`

## Multi-line sh execution
/var @result2 = @multiline_sh()
/show `Multi-line: @result2`

## Parameterized sh execution
/var @result3 = @parameterized_sh("Alice")
/show `Parameterized: @result3`

## Error handling sh execution
/var @result4 = @error_handling_sh("echo")
/show `Command exists: @result4`

/var @result5 = @error_handling_sh("nonexistent")
/show `Command missing: @result5`