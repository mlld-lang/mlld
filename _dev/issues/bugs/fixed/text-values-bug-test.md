# Test file for @text directive with @embed and @run values

## Test content for embed
This is some test content that will be used for embedding.

## Instructions
These are the instructions section.

## Test examples

@text instructions = @embed [$./text-values-bug-test.md # Instructions]
@text res = @run [echo "This is a test result"]

## Result
The instructions are: {{instructions}}
The result is: {{res}} 