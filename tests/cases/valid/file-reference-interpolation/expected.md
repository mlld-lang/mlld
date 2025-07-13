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

Dynamic file: Hello from test content file!

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
JSON to XML: <root>
  <name>Test User</name>
  <users>
    <item>
      <email>alice@example.com</email>
      <address>
        <city>New York</city>
        <state>NY</state>
      </address>
    </item>
    <item>
      <email>bob@example.com</email>
      <address>
        <city>Boston</city>
        <state>MA</state>
      </address>
    </item>
  </users>
</root>

### Pipes with field access
User data formatted: {
  "email": "alice@example.com",
  "address": {
    "city": "New York",
    "state": "NY"
  }
}

## Variable Pipes

Variable to XML: <root>
  <message>hello world</message>
</root>

Object formatted: {
  "name": "alice",
  "age": 30
}

## Glob Patterns

Markdown files: # Markdown File 1

Content of first markdown file.

---

# Markdown File 2

Content of second markdown file.

Text files in dir: Content of file 1.
Content of file 2.

## Complex Scenarios

### Nested templates
User Bob from Test User lives in New York

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

### Circular reference attempt
Circular test: 

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

## As Template Context

### Using <> placeholder
Content of file1.txt
Content of file2.txt