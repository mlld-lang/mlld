<GrammarSpecDocumentation>

IMPORTANT NOTE: We are NOT implementing @api and @call yet.

# Meld Grammar Specification

Meld is a very simple and constrained scripting language for use in the middle of markdown-like docs. We only interpret @directive lines. All other lines are treated as literal text, including lines inside backtick fences.

## Core Tokens

### Directives
Must appear at start of line (no indentation):
```
@embed
@run
@import
@define
@text
@path
@data
@api
@call
```

### Comments
Lines that begin with `>> ` (two greater-than signs followed by a space) are treated as comments:
```meld
>> This is a comment
>> Comments must start at beginning of line (no indentation)
@text message = "Hello"  >> Invalid - comments must be on their own line
```
- Must appear at start of line (no indentation)
- Everything after `>> ` on that line is ignored
- Cannot be added to the end of directive lines
- Preserves comments exactly as written (no interpretation of directives, variables, or special characters)

### Delimiters
```
[ ]     Command/path boundaries
[[ ]]   Multi-line command boundaries
{ }     Function embed boundaries
{{ }}   Multi-line object boundaries
#       Section marker
=       Assignment (requires spaces on both sides)
.       Metadata/field accessor
,       List separator
>>      Format operator
()      Command parameter list
:       Schema reference operator (optional)
++      String concatenation operator (requires spaces on both sides)
```

### String Values
- Must be quoted with ', ", or `
- Quotes must match (no mixing)
- Backslashes and quotes within strings are treated as literal characters
- Must be single line (no newlines allowed)
- Can contain any characters except newlines

### Command Definitions
```
@define command = @run [content]
@define command(param1, param2) = @run [content ${param1} ${param2}]
@run [$command]
@run [$command(${textvar1}, ${textvar2})]
```
- Command names must be valid identifiers
- Parameters are optional
- When parameters are used:
  - Must be valid identifiers
  - Must be referenced in command body
- The right-hand side of @define must be an @run directive
- Cannot use other directives (@embed, @text, etc.) as the command body

Invalid examples:
```
@define cmd = "hello"              # Not an @run directive
@define cmd = @embed [file.md]     # Must be @run, not @embed
```

### Variable Types
Meld has three distinct types of variables:

Path Variables:
- Syntax: $identifier (e.g., $path, $HOMEPATH, $~)
- Used for filesystem paths and command arguments
- Can appear anywhere within [] brackets
- No field access or formatting
- Special variables $HOMEPATH/$~ and $PROJECTPATH/$. can be used with path separators

Text Variables:
- Syntax: ${identifier} (e.g., ${message}, ${description})
- Store unstructured text
- No field access (text is atomic)
- Can be formatted with >>
- Environment variables (${ENV_*}) are a special case of text variables

Data Variables:
- Syntax: #{identifier} (e.g., #{config}, #{response})
- Store structured data
- Support field access (#{config.name})
- Can be formatted with >>

### Variable Type Conversion

Text and data variables can be used interchangeably in many contexts, with automatic conversion:

Data to Text Conversion:
- Simple values (strings, numbers) convert directly to text
- Objects and arrays convert to JSON string representation
- Useful in template literals and string concatenation

Examples:
```meld
@data config = {{ name: "test", version: 1 }}
@data nested = {{ user: { name: "Alice" } }}

@text simple = `Name: #{config.name}`          # Outputs: Name: test
@text object = `Config: #{config}`             # Outputs: Config: {"name":"test","version":1}
@text deep = `User: #{nested.user}`            # Outputs: User: {"name":"Alice"}
```

Text in Data Contexts:
- Text variables can be used as values in data structures
- Text variables can be used as object keys
- Values are inserted as strings

Examples:
```meld
@text name = "Alice"
@text key = "username"

@data user = {{
  ${key}: ${name},              # Dynamic key from text
  id: ${userId},                # Text value in data structure
  settings: {
    displayName: ${name}        # Nested text value
  }
}}
```

### Variables

Variable references in different contexts:
```
${textvar}                     Text variable reference
${textvar>>(format)}          Formatted text variable
#{datavar}                    Data variable reference
#{datavar.field}             Data variable field access
#{datavar.field>>(format)}   Formatted data field access
$command(${param1}, ${param2}) Command reference with parameters
$path                         Path variable reference
$HOMEPATH or $~               Special path variable (equivalent)
$PROJECTPATH or $.            Special path variable (equivalent)
```

Variable references are allowed in:
- Inside square brackets [...] for paths and commands
- Inside object literals {{...}} and single-line objects
- Inside template literals (backtick strings) for string interpolation
- Inside directive values after = (including object literals and template literals)

They are NOT allowed in:
- Plain text lines
- Regular string literals (use template literals instead)
- Outside of the contexts listed above

Rules for specific variable types:
- Path variables ($path) only allowed in path contexts
- Text variables (${text}) allowed in all interpolation contexts
- Data variables (#{data}) allowed in all interpolation contexts except command parameters

### Code Fences

Triple or more backticks that:
- Must appear at start of line
- Can optionally be followed by a language identifier
- Must be closed with exactly the same number of backticks
- Can contain any content (including directives, variables, etc.) which is treated as literal text
- Support nesting with different numbers of backticks
- Preserve all whitespace and newlines exactly as written
- Note: Code fences (3 or more backticks) are distinct from backtick string literals (single backticks). See "String Values" section for details on string literals.

Examples: 

​```python 
@text x = 1  # treated as literal text 
​```

​```` 
nested fence with 
``` incomplete nest inside ​
````

​```` 
nested fence with 
``` 
complete nested code fence inside
```
````

​```javascript 
const x = ${textvar}  
# variables not interpolated 
​```

All content within code fences is preserved exactly as written with no interpretation of:
- Directives
- Variables
- Special characters
- Delimiters

## Directive Patterns

### @embed
```
@embed [path]
@embed [path # section_text]
@embed [path] as ###                    # ### parsed as count of # chars
@embed [path # section_text] as ###
@embed [path] under header_text
```
where:
- section_text is non-empty text after # until closing bracket
- name is a valid identifier
- path cannot be empty
- whitespace is optional inside {} and around ,
- Value must be quoted with ', ", or `
- Quotes must match (no mixing)

### @run
```
@run [command_text]
@run [command_text] under header_text
@run [$command(${textvar1}, ${textvar2})]
```
where:
- command_text cannot be empty
- command_text can contain spaces and quotes (', ", `)
- command_text can contain:
  - Standard variables (${textvar})
  - Path variables ($path)
  - Special path variables ($HOMEPATH/$~, $PROJECTPATH/$.)
- command_text can contain nested brackets (treated as text)
- command references must include parameters

### @import
```
@import [path]
```
where:
- path cannot be empty
- path can contain nested brackets (treated as text)

### @define
```
@define identifier = @run [content]
@define command(param1, param2) = @run [content ${param1} ${param2}]
```
where:
- content follows @run patterns
- field is limited to ONLY .risk, .risk.high, .risk.med, .risk.low, .about, .meta
- identifier cannot be empty
- field cannot be empty
- command parameters must be valid identifiers
- at least one parameter required for commands

### @text
```meld
@text identifier = "value"
@text identifier = @embed [content]
@text identifier = @run [command]
@text identifier = @call api.method [path]
```
where:
- value must be either:
  - A quoted string, or
  - String result of @embed directive, or
  - String result of @run directive, or
  - String result of @call directive
- identifier cannot be empty

### @path
```meld
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
```
where:
- Must start with special path variable
- Path segments follow normal path rules
- Cannot start with raw path
- Path segments separated by /
- identifier cannot be empty
- path cannot be empty
- In quotes of any kind as long as they match

### @data 
```meld
@data identifier = value
@data identifier : schema = value
```
where:
- value can be:
  - Object literal {...}
  - Array literal [...]
  - String literal
  - Result of @embed directive
  - Result of @run directive
  - Result of @call directive
- schema is optional identifier reference
- Objects can nest
- Arrays can contain any valid value type

### @api
```meld
@api identifier = value
@api identifier.endpoint = value
```
where:
- value must be an API configuration object
- Base API configuration requires:
  - baseUrl: string (required)
  - All other fields are optional (headers, etc.)
- Endpoint definitions are optional and can include:
  - path: string
  - methods: array of HTTP methods
- identifier must be valid identifier
- endpoint must be valid identifier
- Can define base APIs and specific endpoints

Examples:
```meld
# Minimal API definition
@api github = {{
  baseUrl: "https://api.github.com"
}}

# Full API definition with optional fields
@api github = {{
  baseUrl: "https://api.github.com",
  headers: {
    Authorization: "Bearer ${ENV_TOKEN}"
  }
}}

# GET request
@data issues = @call github.issues.get

# POST request with payload
@data newIssue = @call github.issues.post {{
  title: ${title},
  body: ${description}
}}

# Direct path usage
@data repo = @call github.get [/repos/${owner}/${repo}]

# Get response as text
@text response = @call github.issues.get

# Using data variables with response
@data responseData = @call github.issues.get
@text summary = `Found #{responseData.total} issues`
```

### @call
```meld
@call identifier.method [path]
@call identifier.method [path] {{
  key: value,
  nested: {
    key: value
  }
}}
@call identifier.endpoint.method
```
where:
- identifier must reference defined @api
- method must be valid HTTP method (GET, POST, PUT, PATCH, DELETE)
- path is optional if endpoint is defined
- payload object is optional

## Syntax Elements

### Identifiers
- Must start with letter or underscore
- Can contain letters, numbers, underscore
- Case-sensitive
- Cannot be empty

### Paths
- Special path variables $~ (aliased $HOMEPATH), $. (aliased $PROJECTPATH) must be followed by / when used for paths
- Can contain any characters used in paths
- Forward slashes as separators when used in paths
- Cannot be empty

Examples:
```meld
@embed [$docs]             # Path vars without separators
@run [cpai $docs --stdout]     # Path var in command args
@path mypath = "$HOMEPATH/path"  # Special path var with separator
```

### Field Access

Two distinct types of field access in meld:

Command Metadata Fields:
- Special case for @define directives only
- Used for documentation and security
- Restricted to specific fields:
  - .risk, .risk.high, .risk.med, .risk.low
  - .about
  - .meta

Data Variable Fields:
- Only available on data variables (#{data.field})
- No restrictions on field names (must be valid identifiers)
- Not available on text or path variables

Valid examples:
```
#{datavar.field}
#{datavar.nested.field}
#{datavar.deeply.nested.field}
@define cmd.risk = "string"
@define cmd.risk.high = "string"
@define cmd.risk.med = "string"
@define cmd.risk.low = "string"
@define cmd.about = "string"
@define cmd.meta = "string"
```
Invalid examples:
```
${textvar.field1} # textvars do not have fields
#{var.}
#{var.field1.field2.field3.field4}
#{.field}
@define cmd.invalid = @run [value]
@define cmd.risk = @run [value]
```

### Command References
Inside [] brackets ONLY:
```
$command(${param1}, ${param2})     Command with parameters
```
Rules:
- Must be defined via @define
- Must include parameters
- Parameters must be text variables (${param})
- No whitespace in command name
- Spaces allowed after commas

### Variable Interpolation
Inside [...] and {{...}} contexts only:
```
${textvar}                    Text variable reference
${textvar>>(format)}         Formatted text variable
#{datavar}                   Data variable reference
#{datavar.field}            Data field access
#{datavar.field>>(format)}  Formatted data field
$path                       Path variable reference
$HOMEPATH or $~             Special path variable (equivalent)
$PROJECTPATH or $.          Special path variable (equivalent)
```
Rules:
- Path variables ($path) only allowed in path contexts
- Text variables (${text}) allowed in all interpolation contexts
- Data variables (#{data}) allowed in all interpolation contexts except command parameters
- @path-defined variables must occur after `[` or ` ` (whitespace) and must be followed by `/`
- No nested interpolation (${textvar${inner}} or #{datavar#{inner}})
- No whitespace around >> operator
- Format must be last operation
- Only one format allowed per variable
- Formatting only allowed inside ${} and #{} 
- Path variables cannot use field access or formats

Invalid patterns:
```
"text with ${textvar}"            # No variables in regular strings
Text with ${textvar}              # No variables in plain text
${textvar${inner}}               # No nested text variables
#{data#{inner}}                 # No nested data variables
$path.field                     # No field access on path vars
$path>>(format)                 # No format on path vars
```

### Format Specifications
Format operators must be inside the variable braces:
```
${textvar>>(format)}           Text variable format
#{datavar>>(format)}           Data variable format
#{datavar.field>>(format)}     Data field format
```

Rules:
- Format operator must be inside ${} or #{} braces
- No whitespace around >>
- No format chaining (only one format per variable)
- Format must be the last operation in the variable reference
- Only available for text and data variables (not path variables)

Invalid patterns:
```
$var>>(format)                     # Must be inside ${} or #{}
${textvar}>>(format)               # Format must be inside braces
${textvar>>(format1)>>(format2)}   # No format chaining
#{datavar>>(format).field}         # Format must be last operation
${textvar >> (format)}             # No whitespace around >>
```

### String Concatenation
- Uses ++ operator with required spaces on both sides
- Can concatenate:
  - String literals
  - Template literals
  - Text variables (${text})
  - Result of @embed directives
- Cannot concatenate:
  - Arrays or objects
  - Data variables (use template literals instead)
- Must be single line (use template literals for multi-line)

Examples:
```meld
@text greeting = "Hello" ++ " " ++ "World"
@text message = ${intro} ++ ${body}
@text doc = @embed [header.md] ++ @embed [content.md]
```

Invalid patterns:
```meld
@text bad = "no"++"spaces"        # Missing spaces around ++
@text bad = #{data} ++ "text"     # Cannot concat data variables
@text bad = "multi" ++            # Cannot split across lines
  "line"
```

### API Examples
```meld
# Define base API
@api github = {{
  baseUrl: "https://api.github.com",
  headers: {
    Authorization: "Bearer ${ENV_TOKEN}"
  }
}}

# Define specific endpoints
@api github.issues = {{
  path: "/repos/${owner}/${repo}/issues",
  methods: ["GET", "POST"]
}}

# GET request
@data issues = @call github.issues.get

# POST request with payload
@data newIssue = @call github.issues.post {{
  title: ${title},
  body: ${description}
}}

# Direct path usage
@data repo = @call github.get [/repos/${owner}/${repo}]

# Get response as text
@text response = @call github.issues.get

# Using data variables with response
@data responseData = @call github.issues.get
@text summary = `Found #{responseData.total} issues`
```

Template Literals:
- Delimited by backticks (`)
- Can contain ${var} interpolation
- Can be multi-line when wrapped in [[` and `]]
- Can contain both text and data variables
- Can contain any quotes without escaping

Examples:
```meld
# Single-line template literals
`Hello ${name}!`                           # Text variable
`Config: #{config.name}`                   # Data variable with field
`${greeting}, your ID is #{user.id}`       # Mixed variables

# Multi-line template literal
@text prompt = [[`
  System: ${role}
  
  Context:
  #{context.data}
  
  User: ${username}
  Settings: #{user.preferences}
`]]
```

<Clarifications>
## UX Decisions Augmenting GRAMMAR SPEC

### Imports
- Must appear at top of file
- Support both explicit imports and * import
- Pattern: `import [x,y,z] from [file.md]` or `import [x as y] from [file.md]`
- `import [file.md]` is shorthand for `import [*] from [file.md]`

### Error Handling Philosophy
Meld has three categories of error handling:

#### Fatal Errors (Halt Execution)
- Missing or inaccessible referenced files
- Invalid syntax in meld files
- Invalid file extensions
- Circular imports
- Type mismatches (using wrong variable type)
- Missing required command parameters
- Invalid path references (not using $HOMEPATH/$PROJECTPATH)

#### Warning Errors (Continue with Warning)
- Missing optional fields in data structures (return empty string)
- Missing environment variables (when referenced)
- Command execution that produces stderr but exits with code 0
- Fields accessed on non-existent data paths (return empty string)

#### Silent Operation (No Error/Warning)
- Expected stderr output from successfully running commands
- Empty or partial results from valid operations
- Type coercion in string concatenation
- Normal command output to stderr

### Variables & Environment
- No restrictions on ENV var names
- ENV vars generate errors only when referenced and missing
- Field access on non-existent fields/primitives returns empty string
- Non-string values coerced in string concatenation

### Paths & Files
- All paths must be absolute (via $HOMEPATH/$PROJECTPATH)
- Working directory only affects initial $PROJECTPATH
- Relative paths not allowed for security
- Circular imports detected and errored pre-execution

### Command Parameters
- All parameters required for v1
- Header text supports variable interpolation

### Style Handling
- Common indentation removal handled by grammar
- Delimiter escaping handled by grammar
- Markdown header interpretation handled by grammar
</Clarifications>
</GrammarSpecDocumentation>