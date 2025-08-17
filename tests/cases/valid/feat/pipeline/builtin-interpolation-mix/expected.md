# Pipeline Builtin Mixed Interpolation Tests

This test verifies that builtin commands can mix literal text with @input references and field access in their arguments.

## Test 1: Mixed literal and @input reference

This is the input: Alice

## Test 2: Mixed literal with field access

Employee Charlie is a Developer on the Backend team

## Test 3: Complex mixed patterns

Task TASK-123: 'Fix bug' assigned to Bob (bob@example.com) - Priority: high

## Test 4: Mixed with full object reference

Status 200: OK (full response: {"code":200,"message":"OK","data":{"count":42}})

## Test 5: Backtick templates with mixed content

System metrics - CPU: 45.2%, Memory: 78.5%, Disk: 62%

Mixed interpolation tests completed!