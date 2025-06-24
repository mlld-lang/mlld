# Complex Test 5: Mixed Operations and Error Handling

# Setup various data types
/text @string_var = "Hello, World!"
/data @number_var = 42
/data @boolean_var = true
/data @null_var = null
/data @array_var = ["first", "second", "third"]
/data @object_var = {"key": "value", "nested": {"deep": "data"}}

# Path variables with special characters
/path @home = @~
/path @project = @./
/path @parent = @../

# Test various operations
/text @operations_test = [[
# Mixed Operations Test

## Variable Types
- String: {{string_var}}
- Number: {{number_var}}
- Boolean: {{boolean_var}}
- Null: {{null_var}}
- Array: {{array_var}}
- Object: {{object_var}}

## Array Operations
- First element: {{array_var.0}}
- Second element: {{array_var.1}}
- Last element: {{array_var.2}}

## Object Operations
- Direct access: {{object_var.key}}
- Nested access: {{object_var.nested.deep}}

## Path Operations
- Home: {{home}}
- Project: {{project}}
- Parent: {{parent}}

## Mixed Template
The answer is {{number_var}} and the message is "{{string_var}}"
Array has {{array_var}} items
Object keys: {{object_var}}
]]

# Test exec with complex parameters
/exec @process_data(arr, obj) = {echo "Array: @arr, Object: @obj" | wc -l}

# Test add with various sources
/add @operations_test

## Command with Variables
/run {echo "String: @string_var, Number: @number_var"}

# Test command execution
/text @command_result = run @process_data(@array_var, @object_var)

## Command Result
Lines counted: @add @command_result

# Test inline operations
Final thought: The value {{number_var}} with {{string_var}} makes {{boolean_var}}