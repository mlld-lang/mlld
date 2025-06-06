# Parameter Interpolation Test

This test verifies that @param syntax works consistently in exec functions across:
1. Direct exec calls
2. Foreach with exec
3. Command templates vs code templates
4. Special characters and escaping

## Command Template Tests

Direct calls:
Hello, Alice!
Greetings, 'Bob's Place'
Welcome Charlie & Co. (special: $@name)

## Code Template Tests

Direct calls:
JS says hello to David!
Bash says hi to Eve!

## Foreach Tests

[
  "Hello, Frank!",
  "Hello, Grace's Shop!",
  "Hello, Henry & Sons!"
]

[
  "JS says hello to Frank!",
  "JS says hello to Grace's Shop!",
  "JS says hello to Henry & Sons!"
]
## Multiple Parameters

[
  "Ian Smith",
  "Ian O'Brien",
  "Jane Smith",
  "Jane O'Brien"
]
## Nested Variable References

Hello Kate!