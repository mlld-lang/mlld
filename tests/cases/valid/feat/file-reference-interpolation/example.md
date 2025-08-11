# File Reference Interpolation Tests

This comprehensive test suite verifies all aspects of file reference interpolation functionality.

## Basic File References

### Simple file reference
/var @content = `<test-content.txt>`
/show @content

### JSON file with field access
/var @name = `<test-data.json>.name`
/show `Name from JSON: @name`

### Array access
/var @firstEmail = <test-data.json>.users[0].email
/show `First user email: @firstEmail`

### Nested field access
/var @city = <test-data.json>.users[1].address.city
/show `Second user city: @city`

## Variable Substitution in Paths

/var @extension = "txt"
/var @filename = "test-content"
>> Note: Variable interpolation in file paths not yet implemented
>> /var @dynamicContent = <@filename.@extension>
/var @dynamicContent = "placeholder for dynamic file loading"
/show `Dynamic file: @dynamicContent`

## Pipe Transformations

### Single pipe
/var @formatted = <test-data.json>|@json
/show `Formatted JSON: @formatted`

### Multiple pipes
/var @xmlData = <test-data.json>|@json|@xml
/show `JSON to XML: @xmlData`

### Pipes with field access
/var @userData = <test-data.json>.users[0]|@json
/show `User data formatted: @userData`

## Variable Pipes

/var @testData = {"message": "hello world"}
/var @dataXml = @testData|@xml
/show `Variable to XML: @dataXml`

/var @userData2 = {"name": "alice", "age": 30}
/var @userDataJson = @userData2|@json
/show `Object formatted: @userDataJson`

## Complex Scenarios

### Nested templates
/var @location = <test-data.json>.users[0].address.city
/var @template = `User @name from <test-data.json>.name lives in @location`
/show @template

### In double quotes
/var @quoted = "File content: <test-content.txt>"
/show @quoted

### In command braces
/run {echo "Content: <test-content.txt>"}

### Multiple references
/var @combined = `<file1.txt> and <file2.txt> combined`
/show @combined

## Error Cases

### Missing file
/var @missing = <nonexistent.txt>
/show `Missing file: @missing`

### Invalid field
/var @invalidField = <test-data.json>.nonexistent.field
/show `Invalid field: @invalidField`

## Special Characters

### File with spaces
/var @spaced = <file with spaces.txt>
/show `Spaced filename: @spaced`

### Special characters in path
/var @special = <data/special-@chars!.txt>
/show `Special chars: @special`

## Template Contexts

### Double colon templates
/var @dblColon = ::<test-content.txt> interpolated::
/show @dblColon

### Mixed with variables
/var @userName = "Bob"
/var @mixed = `Hello @userName, content: <test-content.txt>`
/show @mixed


