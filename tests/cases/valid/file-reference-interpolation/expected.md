# File Reference Interpolation Tests

This comprehensive test suite verifies all aspects of file reference interpolation functionality.

## Basic File References

### Simple file reference

Hello from test content file!
### JSON file with field access

Name from JSON: Test User
### Array access

First user email: alice@example.com
### Nested field access

Second user city: Boston
## Variable Substitution in Paths

Dynamic file: placeholder for dynamic file loading
## Pipe Transformations

### Single pipe

Formatted JSON: {
  "name": "Test User",
  "users": [
    {
      "email": "alice@example.com",
      "address": {
        "city": "New York",
        "state": "NY"
      }
    },
    {
      "email": "bob@example.com",
      "address": {
        "city": "Boston",
        "state": "MA"
      }
    }
  ]
}
### Multiple pipes

JSON to XML: <NAME>Test User</NAME>
<USERS>
  <ITEM>
    <EMAIL>alice@example.com</EMAIL>
    <ADDRESS>
      <CITY>New York</CITY>
      <STATE>NY</STATE>
    </ADDRESS>
  </ITEM>
  <ITEM>
    <EMAIL>bob@example.com</EMAIL>
    <ADDRESS>
      <CITY>Boston</CITY>
      <STATE>MA</STATE>
    </ADDRESS>
  </ITEM>
</USERS>
### Pipes with field access

User data formatted: {
  "email": "alice@example.com",
  "address": {
    "city": "New York",
    "state": "NY"
  }
}
## Variable Pipes

Variable to XML: <MESSAGE>hello world</MESSAGE>

Object formatted: {
  "name": "alice",
  "age": 30
}
## Complex Scenarios

### Nested templates

User Test User from Test User lives in New York
### In double quotes

File content: Hello from test content file!
### In command braces
Content: Hello from test content file!

### Multiple references

First file content. and Second file content. combined
## Error Cases

### Missing file

Missing file: 
### Invalid field

Invalid field: 
## Special Characters

### File with spaces

Spaced filename: Content with spaces.
### Special characters in path

Special chars: Special content!
## Template Contexts

### Double colon templates

Hello from test content file! interpolated
### Mixed with variables

Hello Bob, content: Hello from test content file!

