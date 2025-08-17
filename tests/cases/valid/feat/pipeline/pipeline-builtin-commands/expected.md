# Test Pipeline Builtin Commands

Pipeline builtin commands are pass-through stages that perform side effects while returning their input unchanged.

## Define helper functions

## Test 1: Show passes through

hello

HELLO
## Test 2: Show with argument

Debug: 

PROCESSING
## Test 3: Log passes through

dlrow
## Test 4: Multiple builtins in pipeline

test

PREFIX:test
## Test 5: Output to stdout

DATA
## Test 6: Builtin with @input reference

{"message":"hi"}

{"message": "hi"}!
