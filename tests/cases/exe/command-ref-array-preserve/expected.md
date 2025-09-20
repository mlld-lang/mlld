# Command Reference Array Preservation Test

This test verifies that command-reference executables preserve array types when passing them as arguments to other executables.

## Setup functions

## Test 1: Direct call (baseline - this works)

Direct: Array received: apple, banana, cherry
## Test 2: Command-ref (this is the bug we're fixing)

Command-ref: Array received: apple, banana, cherry
## Test 3: Nested command-ref with parameters

With param: Array received: item1, item2, item3