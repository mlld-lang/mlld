# Test Output Directive - Quoted Path Syntax

This tests the new quoted path syntax for `/output` directive.

/var @greeting = "Hello from quoted path syntax!"
/var @data = { "status": "success", "message": "Testing new syntax" }

## Testing quoted path without 'to' keyword
/output "test-quoted.txt"
/output @greeting "greeting.txt"
/output @data "data.json"

## Testing bracket path with 'to' keyword
/output @greeting to [greeting-bracket.txt]
/output @data to [data-bracket.json]

## Mixed syntax test
/output to "entire-doc.md"
/output @greeting to "final-greeting.txt"