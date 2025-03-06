
## Your role
You are a senior architect skilled in assessing TypeScript codebases.
## Documentation
### Target UX
<GrammarSpecDocumentation>
IMPORTANT NOTE: We are NOT implementing @api and @call yet.
UPDATE: The syntax below for ${var} and #{var} is outdated. Text and data variables are expressed as {{variable}} and path variables remain $path style.
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
[[ ]]   Multi-line content boundaries
{ }     Function embed boundaries
[\n ]   Multi-line array 
[\n ]   Multi-line object 
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
@define command(param1, param2) = @run [content {{param1}} {{param2}}]
@run [$command]
@run [$command({{textvar1}}, {{textvar2}})]
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
Meld has three distinct types of variables: Path Variables:
- Syntax: $identifier (e.g., $path, $HOMEPATH, $~)
- Used for filesystem paths and command arguments
- Can appear anywhere within [] brackets
- No field access or formatting
- Special variables $HOMEPATH/$~ and $PROJECTPATH/$. can be used with path separators
Text and Data Variables:
- Syntax: {{identifier}} (e.g., {{message}}, {{description}}, {{config}}, {{response}})
- Store unstructured text (text variables) or structured data (data variables)
- Support field access for data variables ({{config.name}})
- Can be formatted with >>
- Environment variables ({{ENV_*}}) are a special case of text variables
### Variable Type Conversion
Text and data variables can be used interchangeably in many contexts, with automatic conversion: Data to Text Conversion:
- Simple values (strings, numbers) convert directly to text
- Objects and arrays convert to JSON string representation
- Useful in template literals and string concatenation
Examples:
```meld
@data config = { name: "test", version: 1 }
@data nested = { user: { name: "Alice" } }
@text simple = `Name: {{config.name}}`          # Outputs: Name: test
@text object = `Config: {{config}}`             # Outputs: Config: {"name":"test","version":1}
@text deep = `User: {{nested.user}}`            # Outputs: User: {"name":"Alice"}
```
Text in Data Contexts:
- Text variables can be used as values in data structures
- Text variables can be used as object keys
- Values are inserted as strings
Examples:
```meld
@text name = "Alice"
@text key = "username"
@data user = {
  {{key}}: {{name}},              # Dynamic key from text
  id: {{userId}},                # Text value in data structure
  settings: {
    displayName: {{name}}        # Nested text value
  }
}
```
### Variables
Variable references in different contexts:
```
{{variable}}                   Variable reference
{{variable>>(format)}}        Formatted variable
{{datavar.field}}            Data variable field access
{{datavar.field>>(format)}}  Formatted data field access
$command({{param1}}, {{param2}}) Command reference with parameters
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
- Variables ({{variable}}) allowed in all interpolation contexts
- Data field access ({{data.field}}) allowed in all interpolation contexts except command parameters
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
@run [$command({{textvar1}}, {{textvar2}})]
```
where:
- command_text cannot be empty
- command_text can contain spaces and quotes (', ", `)
- command_text can contain:
  - Variables ({{variable}})
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
@define command(param1, param2) = @run [content {{param1}} {{param2}}]
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
@api github = {
  baseUrl: "https://api.github.com"
}
# Full API definition with optional fields
@api github = {
  baseUrl: "https://api.github.com",
  headers: {
    Authorization: "Bearer {{ENV_TOKEN}}"
  }
}
# GET request
@data issues = @call github.issues.get
# POST request with payload
@data newIssue = @call github.issues.post {
  title: ${title},
  body: ${description}
}
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
@call identifier.method [path] {
  key: value,
  nested: {
    key: value
  }
}
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
Two distinct types of field access in meld: Command Metadata Fields:
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
$command({{param1}}, {{param2}})     Command with parameters
```
Rules:
- Must be defined via @define
- Must include parameters
- Parameters must be text variables ({{param}})
- No whitespace in command name
- Spaces allowed after commas
### Variable Interpolation
Inside [...] and {{...}} contexts only:
```
{{textvar}}                    Text variable reference
{{textvar>>(format)}}         Formatted text variable
{{datavar}}                   Data variable reference
{{datavar.field}}            Data field access
{{datavar.field>>(format)}}  Formatted data field
$path                       Path variable reference
$HOMEPATH or $~             Special path variable (equivalent)
$PROJECTPATH or $.          Special path variable (equivalent)
```
Rules:
- Path variables ($path) only allowed in path contexts
- Variables ({{variable}}) allowed in all interpolation contexts
- Data field access ({{data.field}}) allowed in all interpolation contexts except command parameters
- @path-defined variables must occur after `[` or ` ` (whitespace) and must be followed by `/`
- No nested interpolation ({{textvar{{inner}}}} or {{datavar{{inner}}}})
- No whitespace around >> operator
- Format must be last operation
- Only one format allowed per variable
- Formatting only allowed inside {{}} 
- Path variables cannot use field access or formats
Invalid patterns:
```
"text with {{textvar}}"            # No variables in regular strings
Text with {{textvar}}              # No variables in plain text
{{textvar{{inner}}}}              # No nested text variables
{{data{{inner}}}}                # No nested data variables
$path.field                     # No field access on path vars
$path>>(format)                 # No format on path vars
```
### Format Specifications
Format operators must be inside the variable braces:
```
{{textvar>>(format)}}           Text variable format
{{datavar>>(format)}}           Data variable format
{{datavar.field>>(format)}}     Data field format
```
Rules:
- Format operator must be inside {{}} braces
- No whitespace around >>
- No format chaining (only one format per variable)
- Format must be the last operation in the variable reference
- Only available for text and data variables (not path variables)
Invalid patterns:
```
$var>>(format)                     # Must be inside {{}}
{{textvar}}>>(format)               # Format must be inside braces
{{textvar>>(format1)>>(format2)}}   # No format chaining
{{datavar>>(format).field}}         # Format must be last operation
{{textvar >> (format)}}             # No whitespace around >>
```
### String Concatenation
- Uses ++ operator with required spaces on both sides
- Can concatenate:
  - String literals
  - Template literals
  - Variables ({{variable}})
  - Result of @embed directives
- Cannot concatenate:
  - Arrays or objects
  - Complex data structures (use template literals instead)
- Must be single line (use template literals for multi-line)
Examples:
```meld
@text greeting = "Hello" ++ " " ++ "World"
@text message = {{intro}} ++ {{body}}
@text doc = @embed [header.md] ++ @embed [content.md]
```
Invalid patterns:
```meld
@text bad = "no"++"spaces"        # Missing spaces around ++
@text bad = {{data}} ++ "text"     # Cannot concat complex data variables
@text bad = "multi" ++            # Cannot split across lines
  "line"
```
### API Examples
```meld
# Define base API
@api github = {
  baseUrl: "https://api.github.com",
  headers: {
    Authorization: "Bearer ${ENV_TOKEN}"
  }
}
# Define specific endpoints
@api github.issues = {
  path: "/repos/${owner}/${repo}/issues",
  methods: ["GET", "POST"]
}
# GET request
@data issues = @call github.issues.get
# POST request with payload
@data newIssue = @call github.issues.post {
  title: ${title},
  body: ${description}
}
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
### Architecture
# Meld Architecture
## IMPORTANT
Meld has an incredibly robust architecture. 
KEY PRINCIPLE: If something ideally _should_ be abstracted out in a clean way in an ideal case, it likely _already is_. So don't assume it's not and reimplement work and add complexity that might have already be handled by another part of the codebase.
## INTRODUCTION
Meld is a specialized, directive-based scripting language designed for embedding small "@directives" inside an otherwise plain text (e.g., Markdown-like) document. The code in this repository implements:
• Meld grammar rules and token types (e.g., text directives, path directives, data directives).  
• The parsing layer that converts Meld content into an AST (Abstract Syntax Tree).  
• A directive interpretation layer that processes these AST nodes and manipulates internal "states" to store variables and more.  
• A resolution layer to handle variable references, path expansions, data manipulations, etc.  
• Testing utilities and an in-memory FS (memfs) to simulate filesystems for thorough testing.  
The main idea:  
1. Meld code is parsed to an AST.  
2. Each directive node is validated and interpreted, updating a shared "state" (variables, data structures, commands, etc.).  
3. Optional transformations (e.g., output formatting) generate final representations (Markdown, LLM-friendly XML, etc.).  
Below is an overview of the directory and service-level architecture, referencing code from this codebase.
## DIRECTORY & FILE STRUCTURE
At a high level, the project is arranged as follows (select key entries included):
project-root/  
 ├─ api/                    ← High-level API and tests  
 │   ├─ api.test.ts  
 │   └─ index.ts  
 ├─ bin/                    ← CLI entry point  
 │   └─ meld.ts  
 ├─ cli/                    ← CLI implementation  
 │   ├─ cli.test.ts  
 │   └─ index.ts  
 ├─ core/                   ← Core utilities and types  
 │   ├─ config/            ← Configuration (logging, etc.)  
 │   ├─ errors/            ← Error class definitions  
 │   │   ├─ MeldError.ts
 │   │   ├─ ServiceInitializationError.ts   ← Service initialization errors
 │   │   └─ ... other errors
 │   ├─ types/             ← Core type definitions  
 │   │   ├─ dependencies.ts  ← Service dependency definitions
 │   │   └─ index.ts
 │   └─ utils/             ← Logging and utility modules  
 │       ├─ logger.ts
 │       ├─ serviceValidation.ts  ← Service validation utilities
 │       └─ simpleLogger.ts
 ├─ services/              ← Core service implementations  
 │   ├─ pipeline/          ← Main transformation pipeline  
 │   │   ├─ ParserService/     ← Initial parsing  
 │   │   ├─ InterpreterService/← Pipeline orchestration  
 │   │   ├─ DirectiveService/  ← Directive handling  
 │   │   │   ├─ handlers/  
 │   │   │   │   ├─ definition/   ← Handlers for definition directives  
 │   │   │   │   └─ execution/    ← Handlers for execution directives  
 │   │   │   └─ errors/  
 │   │   └─ OutputService/    ← Final output generation  
 │   ├─ state/             ← State management  
 │   │   ├─ StateService/      ← Core state management  
 │   │   └─ StateEventService/ ← Core event system  
 │   ├─ resolution/        ← Resolution and validation  
 │   │   ├─ ResolutionService/ ← Variable/path resolution  
 │   │   ├─ ValidationService/ ← Directive validation  
 │   │   └─ CircularityService/← Circular dependency detection  
 │   ├─ fs/                ← File system operations  
 │   │   ├─ FileSystemService/ ← File operations  
 │   │   ├─ PathService/      ← Path handling  
 │   │   └─ PathOperationsService/ ← Path utilities  
 │   └─ cli/               ← Command line interface  
 │       └─ CLIService/    ← CLI entry point  
 ├─ tests/                  ← Test infrastructure   
 │   ├─ fixtures/          ← Test fixture data  
 │   ├─ mocks/             ← Test mock implementations  
 │   └─ utils/             ← Test utilities and helpers  
 │       ├─ debug/         ← Test debug utilities  
 │       │   ├─ StateDebuggerService/  
 │       │   ├─ StateVisualizationService/  
 │       │   ├─ StateHistoryService/  
 │       │   └─ StateTrackingService/  
 │       ├─ FixtureManager.ts  
 │       ├─ MemfsTestFileSystem.ts  
 │       ├─ ProjectBuilder.ts  
 │       ├─ TestContext.ts  
 │       └─ TestSnapshot.ts  
 ├─ docs/                   ← Documentation  
 ├─ package.json  
 ├─ tsconfig.json  
 ├─ tsup.config.ts  
 └─ vitest.config.ts  
Key subfolders:  
• services/pipeline/: Core transformation pipeline services (parsing, interpretation, directives, output)  
• services/state/: State management and event services  
• services/resolution/: Resolution, validation, and circularity detection services  
• services/fs/: File system, path handling, and operations services  
• services/cli/: Command line interface services  
• core/: Central types, errors, and utilities used throughout the codebase  
• tests/utils/: Test infrastructure including debug utilities, memfs implementation, fixture management, and test helpers  
• api/: High-level public API for using Meld programmatically  
• cli/: Command line interface for Meld  
## CORE LIBRARIES & THEIR ROLE
### meld-ast 
   • parse(content: string): MeldNode[]  
   • Basic parsing that identifies directives vs. text nodes.  
   • Produces an AST which other services manipulate.  
### llmxml 
   • Converts content to an LLM-friendly XML format or can parse partially.  
   • OutputService may call it if user requests "llm" format.  
### meld-spec
   • Contains interface definitions for MeldNode, DirectiveNode, TextNode, etc.  
   • Contains directive kind enumerations.  
## HIGH-LEVEL FLOW
Below is a simplified flow of how Meld content is processed:
   ┌─────────────────────────────┐
   │   Meld Source Document      │
   └─────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────┐
   │ ParserService.parse(...)    │
   │   → uses meld-ast to parse  │
   └─────────────────────────────┘
                │ AST (MeldNode[])
                ▼
   ┌─────────────────────────────────────────────────┐
   │ InterpreterService.interpret(nodes, options)    │
   │   → For each node, pass to DirectiveService     │
   │   → Handles node transformations                │
   └─────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ DirectiveService                         │
   │   → Routes to correct directive handler  │
   │   → Handlers can provide replacements    │
   └──────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────────┐
   │ StateService + ResolutionService + Others     │
   │   → Stores variables and transformed nodes    │
   │   → Path expansions, data lookups, etc.       │
   └───────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ OutputService                            │
   │   → Uses transformed nodes for output    │
   │   → Generates clean, directive-free      │
   │     markdown, LLM XML, or other formats  │
   └──────────────────────────────────────────┘
## MAJOR SERVICES (OVERVIEW)
Below are the key "services" in the codebase. Each follows the single responsibility principle:
### CLIService
   - Provides command-line interface for running Meld
   - Handles file watching and reprocessing
   - Manages format selection and output options
   - Routes to appropriate services based on CLI flags
### ParserService  
   - Wraps the meld-ast parse(content) function  
   - Adds location information with file paths (parseWithLocations)  
   - Produces an array of MeldNode objects  
### DirectiveService  
   - Routes directives to the correct directive handler  
   - Validates directives using ValidationService  
   - Calls ResolutionService for variable resolution  
   - Updates StateService with directive execution results
   - Supports node transformation through DirectiveResult interface
   - Handlers can provide replacement nodes for transformed output
### InterpreterService  
   - Orchestrates the main interpret(nodes) pipeline  
   - For each AST node:
       a) If it's text, store it or pass it along  
       b) If it's a directive:
          - Calls DirectiveService for processing
          - Handles node transformations if provided
          - Updates state with transformed nodes
   - Maintains the top-level process flow
   - Supports transformation mode through feature flags
### StateService  
   - Stores variables in maps:
       • textVars (for @text)  
       • dataVars (for @data)  
       • pathVars (for @path)  
       • commands (for @define)  
   - Tracks both original and transformed MeldNodes
   - Provides transformation capabilities for directive processing
   - Maintains transformation state during cloning
   - Provides child states for nested imports  
   - Supports immutability toggles  
### ResolutionService  
   - Handles all variable interpolation:
       • Variables ("{{var}}", "{{data.field}}")
       • Path expansions ("$HOMEPATH/path")  
       • Command references  
   - Context-aware resolution  
   - Circular reference detection  
   - Sub-fragment parsing support  
### CircularityService  
   - Prevents infinite import loops  
   - Detects circular variable references  
   - Maintains dependency graphs  
### PathService  
   - Validates and normalizes paths  
   - Enforces path security constraints  
   - Handles path joining and manipulation  
   - Supports test mode for path operations  
### ValidationService  
   - Validates directive syntax and constraints  
   - Provides extensible validator registration  
   - Throws MeldDirectiveError on validation failures  
   - Tracks available directive kinds  
###  FileSystemService  
    - Abstracts file operations (read, write)  
    - Supports both real and test filesystems  
    - Handles path resolution and validation  
### OutputService  
    - Converts final AST and state to desired format
    - Uses transformed nodes when available
    - Supports markdown and LLM XML output  
    - Integrates with llmxml for LLM-friendly formatting  
    - Handles format-specific transformations
    - Provides clean output without directive definitions
## TESTING INFRASTRUCTURE
All tests are heavily reliant on a memory-based filesystem (memfs) for isolation and speed. The major testing utilities include:
### MemfsTestFileSystem  
   – Thin wrapper around memfs  
   – Offers readFile, writeFile, mkdir, etc. with in-memory data  
   – Provides an ephemeral environment for all test IO  
### TestContext  
   – Central test harness that creates a new MemfsTestFileSystem  
   – Provides references to all major services (ParserService, DirectiveService, etc.)  
   – Allows writing files, snapshotting the FS, and comparing  
### TestSnapshot  
   – Takes "snapshots" of the current Memfs FS, storing a Map<filePath, content>  
   – Compares snapshots to detect added/removed/modified files  
### ProjectBuilder  
   – Creates mock "projects" in the in-memory FS from JSON structure  
   – Useful for complex, multi-file tests or large fixture-based testing  
### Node Factories  
   – Provides helper functions for creating AST nodes in tests  
   – Supports creating directive, text, and code fence nodes  
   – Includes location utilities for source mapping  
Testing Organization:
• tests/utils/: Core test infrastructure (MemFS, snapshots, contexts)  
• tests/mocks/: Minimal mocks and test doubles  
• tests/fixtures/: JSON-based test data  
• tests/services/: Service-specific integration tests  
Testing Approach:
• Each test uses a fresh TestContext or recreates MemfsTestFileSystem  
• Direct imports from core packages (meld-ast, meld-spec) for types  
• Factory functions for creating test nodes and data  
• Snapshots for tracking filesystem changes  
## DEBUGGING INFRASTRUCTURE
The codebase includes specialized debugging services located in `tests/utils/debug/` that help diagnose and troubleshoot state-related issues:
### StateDebuggerService
   - Provides debug session management and diagnostics
   - Tracks state operations and transformations
   - Offers operation tracing and analysis
   - Helps identify state manipulation issues
### StateVisualizationService
   - Generates visual representations of state
   - Creates Mermaid/DOT graphs of state relationships
   - Visualizes state metrics and transformations
   - Aids in understanding complex state changes
### StateHistoryService
   - Records chronological state changes
   - Maintains operation history
   - Tracks transformation chains
   - Enables state change replay and analysis
### StateTrackingService
   - Monitors state relationships and dependencies
   - Tracks state lineage and inheritance
   - Records metadata about state changes
   - Helps debug scope and inheritance issues
Debugging Approach:
• Services can be enabled selectively in tests
• Debug output includes detailed state snapshots
• Visual representations help understand complex states
• History tracking enables step-by-step analysis
These debugging services are particularly useful for:
• Troubleshooting complex state transformations
• Understanding directive processing chains
• Analyzing variable resolution paths
• Debugging scope inheritance issues
• Visualizing state relationships
## SERVICE RELATIONSHIPS
Services in Meld follow a strict initialization order and dependency graph: 1. Base Services:
   - FileSystemService (no dependencies)
   - PathService (depends on FS)
2. State Management:
   - StateEventService (no dependencies)
   - StateService (depends on events)
3. Core Pipeline:
   - ParserService (independent)
   - ResolutionService (depends on State, FS)
   - ValidationService (depends on Resolution)
   - CircularityService (depends on Resolution)
4. Pipeline Orchestration:
   - DirectiveService (depends on multiple services)
   - InterpreterService (orchestrates others)
5. Output Generation:
   - OutputService (depends on State)
6. Debug Support:
   - DebuggerService (optional, depends on all)
Service initialization and validation is handled through the core/types/dependencies.ts system, which ensures services are created in the correct order and all dependencies are satisfied.
## EXAMPLE USAGE SCENARIO
1) Input: A .meld file with lines like:  
   @text greeting = "Hello"  
   @data config = { "value": 123 }  
   @import [ path = "other.meld" ]  
2) We load the file from disk.  
3) ParserService → parse the content → AST.  
4) InterpreterService → interpret(AST).  
   a) For each directive, DirectiveService → validation → resolution → update StateService.  
   b) If an import is encountered, CircularityService ensures no infinite loops.  
5) Once done, the final StateService has textVars.greeting = "Hello", dataVars.config = { value: 123 }, etc.  
6) OutputService can generate the final text or an LLM-XML representation.  
## ERROR HANDLING
• MeldDirectiveError thrown if a directive fails validation or interpretation.  
• MeldParseError if the parser cannot parse content.  
• PathValidationError for invalid paths.  
• ResolutionError for variable resolution issues.  
• MeldError as a base class for other specialized errors.  
These errors typically bubble up to the caller or test.  
## CONCLUSION
This codebase implements the entire Meld language pipeline:  
• Parsing Meld documents into an AST.  
• Validating & interpreting directives.  
• Storing data in a hierarchical state.  
• Resolving references (text, data, paths, commands).  
• (Optionally) generating final formatted output.  
Plus, it has a robust test environment with an in-memory FS, snapshots, and a test harness (TestContext) for integration and unit tests. Everything is layered to keep parsing, state management, directive logic, and resolution separate, adhering to SOLID design principles.  
The ASCII diagrams, modules, and file references in this overview represent the CURRENT code as it is: multiple specialized services collaborating to parse and interpret Meld scripts thoroughly—test coverage is facilitated by the in-memory mocking and snapshot-based verification.
 
### Meld Processing Pipeline
# Meld Pipeline Flow
## Overview
The Meld pipeline processes `.meld` files through several stages to produce either `.xml` or `.md` output. Here's a detailed look at how it works:
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Service    │     │   Service   │     │   Pipeline   │     │    Final     │
│Initialization├────►│ Validation  ├────►│  Execution   ├────►│   Output     │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│Dependencies │     │Validate All │     │Process Input │     │Generate Clean│
│  Resolved   │     │ Services    │     │   Content    │     │   Output    │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```
## Service Organization
The pipeline is organized into logical service groups, with strict initialization order and dependency validation:
### Pipeline Services (services/pipeline/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Parser    │     │  Directive  │     │ Interpreter  │     │   Output     │
│   Service   ├────►│   Service   ├────►│   Service    ├────►│   Service    │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │                    │
      ▼                    ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│Initialize & │     │Validate &   │     │Transform &   │     │Format &     │
│  Validate   │     │Process Dirs │     │Update State  │     │Generate Out │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```
### State Services (services/state/)
```ascii
┌─────────────┐     ┌─────────────┐
│    State    │     │    State    │
│   Service   ├────►│    Event    │
└─────────────┘     │   Service   │
                    └─────────────┘
```
### Resolution Services (services/resolution/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Resolution  │     │ Validation  │     │ Circularity  │
│   Service   ├────►│   Service   ├────►│   Service    │
└─────────────┘     └─────────────┘     └──────────────┘
```
### File System Services (services/fs/)
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│    File     │     │    Path     │     │     Path     │
│   System    ├────►│   Service   ├────►│  Operations  │
│   Service   │     │             │     │   Service    │
└─────────────┘     └─────────────┘     └──────────────┘
```
## Detailed Flow
1. **Service Initialization** (`core/types/dependencies.ts`)
   ```ascii
   ┌─────────────┐
   │Load Service │
   │Dependencies │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │Initialize in│
   │   Order    │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  Validate   │
   │  Services   │
   └─────────────┘
   ```
   - Resolves service dependencies
   - Initializes in correct order
   - Validates service configuration
   - Enables transformation if requested
2. **Input Processing** (`CLIService`)
   - User runs `meld prompt.meld`
   - `CLIService` handles command line options
   - Default output is `.xml` format
   - Can specify `--format markdown` for `.md` output
   - Supports `--stdout` for direct console output
3. **Parsing** (`ParserService`)
   ```ascii
   ┌─────────────┐
   │  Raw Text   │
   │   Input     │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │  meld-ast   │
   │   Parser    │
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │ MeldNode[]  │
   │    AST      │
   └─────────────┘
   ```
   - Reads the input file content
   - Parses into AST using `meld-ast`
   - Identifies directives and text nodes
   - Adds source location information
4. **Interpretation** (`InterpreterService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │  MeldNode[] │     │  Directive  │
   │     AST     ├────►│   Service   │
   └─────────────┘     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │ Resolution  │◄────┤   Handler   │
   │   Service   │     │(with node   │
   └──────┬──────┘     │replacements)│
          │            └─────────────┘
          ▼
   ┌─────────────┐
   │    State    │
   │   Service   │
   │(Original &  │
   │Transformed) │
   └─────────────┘
   ```
   - Processes each AST node sequentially
   - Routes directives to appropriate handlers
   - Handlers can provide replacement nodes
   - Maintains both original and transformed states
   - Resolves variables and references
   - Handles file imports and embedding
5. **Output Generation** (`OutputService`)
   ```ascii
   ┌─────────────┐     ┌─────────────┐
   │Transformed  │     │   Format    │
   │  Nodes &    ├────►│  Converter  │
   │   State     │     └──────┬──────┘
                              │
                              ▼
   ┌─────────────┐     ┌─────────────┐
   │Clean Output │◄────┤  Formatted  │
   │(No Directive│     │   Output    │
   │Definitions) │     └─────────────┘
   └─────────────┘
   ```
   - Takes transformed nodes and state
   - Converts to requested format:
     - `llm`: Uses `llmxml` library for LLM-friendly XML
     - `markdown`: Clean markdown without directive definitions
   - Writes output to file or stdout
## Transformation Mode and Variable Resolution
When transformation mode is enabled, the pipeline handles directives and variables in a special way. Understanding this flow is critical for debugging and enhancing directive handlers:
```ascii
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Directive  │     │Interpretation│     │   State      │     │   Output     │
│  Handlers   ├────►│  & Node     ├────►│  Variable    ├────►│  Generation  │
│(with replace│     │Transformation│     │  Resolution  │     │              │
│  nodes)     │     │              │     │              │     │              │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```
### Key Transformation Pipeline Concepts
1. **Directive Handler Replacement Nodes**
   - Directive handlers can return replacement nodes when in transformation mode
   - The InterpreterService must properly apply these replacements in the transformed nodes array
   - For import directives, the replacement is typically an empty text node
   - For embed directives, the replacement node contains the embedded content
2. **State Propagation Across Boundaries**
   - Variables must be explicitly copied between parent and child states
   - When importing files, variables must be copied from imported state to parent state
   - The ImportDirectiveHandler must ensure all variable types (text, data, path, commands) are copied
3. **Variable Resolution Process**
   - Variables can be resolved at multiple stages:
     - During directive processing
     - During node transformation
     - During final output generation
     - During post-processing in the main function
   - The OutputService's nodeToMarkdown method handles variable reference resolution in text nodes
   - A final variable resolution pass in the main function ensures any remaining references are resolved
4. **State Management for Transformation**
   - The StateService maintains both original and transformed node arrays
   - Transformed nodes must be explicitly initialized 
   - The transformNode method is used to replace directive nodes with their outputs
   - State must keep track of transformation options to determine which directives to transform
## Service Responsibilities
### Pipeline Services
1. **ParserService** (`services/pipeline/ParserService/`)
   - Wraps meld-ast parser
   - Produces AST nodes
   - Adds file location information
2. **InterpreterService** (`services/pipeline/InterpreterService/`)
   - Orchestrates directive processing
   - Handles node transformations
   - Maintains interpretation state
   - Handles imports and embedding
   - **Critical for transformation:** Applies directive handler replacement nodes to transformed node array
   - **State propagation:** Ensures proper variable inheritance between parent and child states
3. **DirectiveService** (`services/pipeline/DirectiveService/`)
   - Routes directives to handlers
   - Validates directive syntax
   - Supports node transformation
   - Updates state based on directive results
   - **Directive handlers:** Can return replacement nodes in transformation mode
   - **Handler context:** Includes parent state for proper variable propagation
4. **OutputService** (`services/pipeline/OutputService/`)
   - Uses transformed nodes for clean output
   - Supports markdown and LLM XML
   - Generates directive-free output
   - Handles formatting options
   - **Variable resolution:** Resolves variable references in text nodes during output generation
   - **Transformation handling:** Uses special processing for variable references in transformation mode
### State Services
1. **StateService** (`services/state/StateService/`)
   - Stores variables and commands
   - Maintains original and transformed nodes
   - Manages scope and inheritance
   - Tracks file dependencies
   - **Transformation support:** Keeps track of both original and transformed node arrays
   - **Variable copying:** Must explicitly copy variables between parent and child states
   - **Transformation options:** Supports selective transformation of different directive types
2. **StateEventService** (`services/state/StateEventService/`)
   - Handles state change events
   - Manages state updates
   - Provides event hooks
   - Supports state tracking
### Resolution Services
1. **ResolutionService** (`services/resolution/ResolutionService/`)
   - Resolves variables and references
   - Handles path expansions
   - Manages circular dependencies
2. **ValidationService** (`services/resolution/ValidationService/`)
   - Validates directive syntax and constraints
   - Provides extensible validator registration
   - Throws MeldDirectiveError on validation failures
   - Tracks available directive kinds
3. **CircularityService** (`services/resolution/CircularityService/`)
   - Prevents infinite import loops
   - Detects circular variable references
   - Maintains dependency graphs
### File System Services
1. **FileSystemService** (`services/fs/FileSystemService/`)
   - Abstracts file operations (read, write)
   - Supports both real and test filesystems
   - Handles path resolution and validation
2. **PathService** (`services/fs/PathService/`)
   - Validates and normalizes paths
   - Enforces path security constraints
   - Handles path joining and manipulation
   - Supports test mode for path operations
3. **PathOperationsService** (`services/fs/PathOperationsService/`)
   - Handles complex path operations
   - Provides path utilities
   - Manages path transformations
## Test Results
> meld@10.0.1 test
> vitest run
 RUN  v2.1.9 /Users/adam/dev/meld
 ✓ tests/utils/debug/StateVisualizationService/StateVisualizationService.test.ts (26 tests) 16ms
stdout | services/state/StateService/StateService.test.ts > StateService > State Tracking > should track state lineage
Initial State: graph TD;
After Creating Child: graph TD;
    736c3842-1086-4f7c-b558-3e1c25769104 -->|parent-child| parent-child style="solid,#000000";
After Creating Grandchild: graph TD;
    736c3842-1086-4f7c-b558-3e1c25769104 -->|parent-child| parent-child style="solid,#000000";
    4adaeab0-bf86-4b77-8862-22d3fd9d5633 -->|parent-child| parent-child style="solid,#000000";
State Lineage: [
  'eb64eb11-6c88-49b7-8247-fe1c42e6a4af',
  '736c3842-1086-4f7c-b558-3e1c25769104',
  '4adaeab0-bf86-4b77-8862-22d3fd9d5633'
]
State Transitions: Complete Debug Report: Debug Session Report (74706113-09c5-45f6-8d1d-cb4f58109af8)
Duration: 0.003s
Diagnostics: Metrics:
Snapshots:
 ✓ services/state/StateService/StateService.test.ts (39 tests) 19ms
 ✓ services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts (20 tests) 51ms
 ✓ services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (16 tests | 2 skipped) 68ms
 ✓ services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts (14 tests) 88ms
 ✓ services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (14 tests) 99ms
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve text content
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.006Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve code fence content
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.013Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should handle directives according to type
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.030Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should handle directives according to type
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.035Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > XML Output > should preserve state variables when requested
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.038Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle XML output in both modes
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.054Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle XML output in both modes
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.057Z"}
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should throw MeldOutputError for unknown node types
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should wrap errors from format converters
stdout | services/pipeline/OutputService/OutputService.test.ts > OutputService > Error Handling > should preserve MeldOutputError when thrown from converters
 ✓ services/pipeline/OutputService/OutputService.test.ts (24 tests) 179ms
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > State management > handles state rollback on merge errors
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle text variable definitions and references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.056Z"}
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle data variable definitions and field access
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.092Z"}
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > provides location information in errors
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle complex nested data structures
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.119Z"}
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle template literals in text directives
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > maintains state consistency after errors
stdout | api/integration.test.ts > API Integration Tests > Variable Definitions and References > should handle template literals in text directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.140Z"}
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > includes state context in interpreter errors
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.177Z"}
stdout | services/pipeline/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > rolls back state on directive errors
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.183Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.197Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $PROJECTPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.227Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $. alias syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.247Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $HOMEPATH syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.257Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should handle path variables with special $~ alias syntax
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.273Z"}
 ✓ services/pipeline/InterpreterService/InterpreterService.integration.test.ts (24 tests | 3 skipped) 405ms
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should reject invalid path formats (raw absolute paths)
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.286Z"}
stdout | api/integration.test.ts > API Integration Tests > Path Handling > should reject invalid path formats (relative paths with dot segments)
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.297Z"}
stdout | api/integration.test.ts > API Integration Tests > Import Handling > should handle simple imports
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.316Z"}
stdout | api/integration.test.ts > API Integration Tests > Import Handling > should handle nested imports with proper scope inheritance
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.339Z"}
 ✓ api/integration.test.ts (14 tests) 441ms
stdout | tests/debug/import-debug.test.ts > Import Directive Debug > should transform import directive and resolve variables
 ✓ services/resolution/ValidationService/ValidationService.test.ts (38 tests) 13ms
stdout | tests/utils/debug/StateTrackingService/StateTrackingService.test.ts > StateTrackingService > Merge Operations > should handle merge target relationships
Created source state: 046f4b7f-af34-43e4-be6d-77f54dadde17
Created target state: 16f72723-7195-4496-b996-36d4700696a0
Created parent state: 40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a
Initial States: graph TD;
Added parent-child relationship: {
  parent: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
  child: '16f72723-7195-4496-b996-36d4700696a0',
  parentMetadata: {
    id: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  childMetadata: {
    id: '16f72723-7195-4496-b996-36d4700696a0',
    source: 'new',
    parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  parentRelationships: [
    {
      targetId: '16f72723-7195-4496-b996-36d4700696a0',
      type: 'parent-child'
    }
  ],
  childRelationships: []
}
After Parent-Child Relationship: graph TD;
    16f72723-7195-4496-b996-36d4700696a0 -->|parent-child| parent-child style="solid,#000000";
Added merge-target relationship: {
  source: '046f4b7f-af34-43e4-be6d-77f54dadde17',
  target: '16f72723-7195-4496-b996-36d4700696a0',
  sourceMetadata: {
    id: '046f4b7f-af34-43e4-be6d-77f54dadde17',
    source: 'new',
    parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  targetMetadata: {
    id: '16f72723-7195-4496-b996-36d4700696a0',
    source: 'new',
    parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  sourceRelationships: [
    {
      targetId: '16f72723-7195-4496-b996-36d4700696a0',
      type: 'merge-target'
    }
  ],
  targetRelationships: []
}
After Merge-Target Relationship: graph TD;
    16f72723-7195-4496-b996-36d4700696a0 -->|parent-child| parent-child style="solid,#000000";
    046f4b7f-af34-43e4-be6d-77f54dadde17 -->|parent-child| parent-child style="solid,#000000";
State Transitions: State Lineage: {
  sourceId: '046f4b7f-af34-43e4-be6d-77f54dadde17',
  targetId: '16f72723-7195-4496-b996-36d4700696a0',
  parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
  lineage: [
    '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    '16f72723-7195-4496-b996-36d4700696a0',
    '046f4b7f-af34-43e4-be6d-77f54dadde17'
  ],
  sourceMetadata: {
    id: '046f4b7f-af34-43e4-be6d-77f54dadde17',
    source: 'new',
    parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  targetMetadata: {
    id: '16f72723-7195-4496-b996-36d4700696a0',
    source: 'new',
    parentId: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  parentMetadata: {
    id: '40130c1b-3ae6-4ee2-a4f7-3d53714ccc3a',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1741239850452
  },
  sourceRelationships: [
    {
      targetId: '16f72723-7195-4496-b996-36d4700696a0',
      type: 'merge-target'
    }
  ],
  targetRelationships: [],
  parentRelationships: [
    {
      targetId: '16f72723-7195-4496-b996-36d4700696a0',
      type: 'parent-child'
    }
  ]
}
Complete Debug Report: Debug Session Report (fb2123a0-12f1-476a-8aeb-e6e0ecd591db)
Duration: 0.004s
Diagnostics: Metrics:
Snapshots:
 ✓ tests/utils/debug/StateTrackingService/StateTrackingService.test.ts (14 tests) 15ms
stdout | tests/debug/import-debug.test.ts > Import Directive Debug > should transform import directive and resolve variables
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:10.465Z"}
 ✓ tests/debug/import-debug.test.ts (1 test) 116ms
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
 ✓ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 16ms
 ✓ services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (9 tests) 70ms
stdout | cli/cli.test.ts > CLI Tests > Argument Parsing Tests > should handle invalid argument combinations
stdout | cli/cli.test.ts > CLI Tests > Argument Parsing Tests > should handle missing required arguments
stdout | cli/cli.test.ts > CLI Tests > File I/O Tests > should handle error for file not found
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should extract section by heading
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-06T05:44:10.637Z"}
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should include content until next heading of same or higher level
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-06T05:44:10.662Z"}
stdout | cli/cli.test.ts > CLI Tests > File I/O Tests > should handle permission issues for reading files
stdout | services/resolution/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should throw when section is not found
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-06T05:44:10.684Z"}
 ✓ services/resolution/ResolutionService/ResolutionService.test.ts (19 tests) 166ms
stdout | cli/cli.test.ts > CLI Tests > Error Handling Tests > should format error messages clearly
 ✓ cli/cli.test.ts (14 tests | 4 skipped) 133ms
stdout | services/pipeline/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > child context creation > handles errors in child context creation
 ✓ services/pipeline/InterpreterService/InterpreterService.unit.test.ts (22 tests) 36ms
 ✓ services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts (9 tests) 23ms
 ✓ services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts (4 tests) 39ms
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should output xml format by default
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should handle format aliases correctly
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Format Conversion > should preserve markdown with markdown format
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should respect --stdout option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should use default output path when not specified
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle project path option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle home path option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle verbose option
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle missing input files
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle write errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Handling > should handle read errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle parser errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle interpreter errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > Error Handling > should handle output conversion errors
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should prompt for overwrite when file exists
stdout | services/cli/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should handle explicit output paths appropriately
 ✓ services/cli/CLIService/CLIService.test.ts (18 tests) 114ms
 ✓ services/resolution/ResolutionService/resolvers/PathResolver.test.ts (20 tests) 11ms
 ✓ services/fs/PathService/PathService.test.ts (17 tests) 72ms
 ✓ tests/utils/debug/StateVisualizationService/TestVisualizationManager.test.ts (17 tests) 58ms
 ✓ tests/utils/debug/TestOutputFilterService/TestOutputFilterService.test.ts (17 tests) 8ms
 ✓ services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts (13 tests) 9ms
stdout | api/api.test.ts > SDK Integration Tests > Service Management > should create services in correct initialization order
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.331Z"}
stdout | api/api.test.ts > SDK Integration Tests > Service Management > should allow service injection through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.371Z"}
 ✓ services/fs/PathService/PathService.tmp.test.ts (14 tests) 40ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should enable transformation through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.390Z"}
 ✓ services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.command.test.ts (5 tests) 7ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should respect existing transformation state
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.403Z"}
 ✓ tests/embed-directive-fixes.test.ts (5 tests) 7ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should handle execution directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.412Z"}
 ✓ services/resolution/ResolutionService/resolvers/DataResolver.test.ts (12 tests) 9ms
stdout | api/api.test.ts > SDK Integration Tests > Transformation Mode > should handle complex meld content with mixed directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.440Z"}
stdout | api/api.test.ts > SDK Integration Tests > Debug Mode > should enable debug mode through options
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.458Z"}
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle definition directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.466Z"}
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.480Z"}
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.494Z"}
stdout | api/api.test.ts > SDK Integration Tests > Error Handling > should handle missing files correctly
stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.513Z"}
stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.524Z"}
stdout | api/api.test.ts > SDK Integration Tests > Examples > should run api-demo-simple.meld example file
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:11.598Z"}
 ✓ api/api.test.ts (18 tests | 2 skipped) 364ms
 ✓ tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts (15 tests) 16ms
 ✓ cli/commands/debug-context.test.ts (3 tests) 5ms
 ✓ services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts (17 tests) 16ms
 ✓ tests/output-service-embed-transformation.test.ts (5 tests) 6ms
 ✓ tests/pipeline/pipelineValidation.test.ts (8 tests) 18ms
 ✓ services/state/utilities/StateVariableCopier.test.ts (8 tests) 15ms
 ✓ services/pipeline/ParserService/ParserService.test.ts (16 tests) 59ms
 ✓ services/resolution/ResolutionService/resolvers/CommandResolver.test.ts (12 tests) 68ms
 ✓ services/state/StateService/StateFactory.test.ts (10 tests) 7ms
stdout | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > resolve > should handle environment variables
stdout | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > resolve > should throw for undefined variables
 ✓ services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts (15 tests) 38ms
 ✓ services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts (8 tests | 3 skipped) 7ms
 ✓ services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts (6 tests) 65ms
 ✓ tests/embed-directive-transformation-fixes.test.ts (4 tests) 7ms
 ✓ services/resolution/ResolutionService/resolvers/TextResolver.test.ts (11 tests) 10ms
 ✓ tests/utils/tests/ErrorTestUtils.test.ts (12 tests) 9ms
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > directory-specific snapshots > returns empty snapshot for non-existent directory
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects added files
Added files: [ '/new.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects removed files
Removed files: [ '/remove.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects modified files
Modified files: [ '/modify.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > snapshot comparison > detects multiple changes
Multiple changes - added: [ '/new.txt' ]
Multiple changes - removed: [ '/remove.txt' ]
Multiple changes - modified: [ '/modify.txt' ]
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > error handling > handles comparison with empty snapshots
Empty snapshot diff1 added: [ '/file.txt' ]
Empty snapshot diff2 removed: [ '/file.txt' ]
 ✓ cli/commands/debug-transform.test.ts (3 tests) 8ms
 ✓ tests/utils/tests/TestSnapshot.test.ts (13 tests) 63ms
stdout | services/state/StateEventService/StateInstrumentation.test.ts > State Instrumentation > Error Handling > should handle errors in event handlers without affecting others
 ✓ services/state/StateEventService/StateInstrumentation.test.ts (7 tests) 24ms
stdout | services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
 ✓ services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 11ms
stdout | cli/commands/init.test.ts > initCommand > should create a meld.json file with custom project root
Meld project initialized successfully.
Project root set to: undefined
 ✓ cli/commands/init.test.ts (4 tests | 1 skipped) 5ms
stdout | services/pipeline/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should detect circular imports
 ✓ services/pipeline/DirectiveService/DirectiveService.test.ts (9 tests) 113ms
 ✓ tests/utils/debug/StateHistoryService/StateHistoryService.test.ts (9 tests) 9ms
 ✓ services/sourcemap/SourceMapService.test.ts (10 tests) 6ms
stdout | tests/utils/tests/TestContext.test.ts > TestContext > xml conversion > converts content to xml
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:12.808Z"}
stdout | tests/utils/tests/TestContext.test.ts > TestContext > cleanup > cleans up resources properly
Cleanup completed
Re-initialized file system
File exists after cleanup: false
 ✓ tests/utils/tests/TestContext.test.ts (11 tests) 140ms
stdout | services/fs/FileSystemService/FileSystemService.test.ts > FileSystemService > File operations > throws MeldError when reading non-existent file
 ✓ tests/variable-index-debug.test.ts (3 tests) 5ms
stdout | services/fs/FileSystemService/FileSystemService.test.ts > FileSystemService > Directory operations > throws MeldError when reading non-existent directory
 ✓ services/fs/FileSystemService/FileSystemService.test.ts (17 tests) 189ms
stdout | services/state/StateService/migration.test.ts > State Migration > error handling > should handle migration errors gracefully
 ✓ services/state/StateService/migration.test.ts (8 tests) 8ms
 ✓ services/fs/ProjectPathResolver.test.ts (5 tests) 8ms
stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when reading non-existent file
stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when getting stats of non-existent path
 ✓ tests/utils/tests/FixtureManager.test.ts (9 tests) 8ms
 ✓ tests/utils/tests/MemfsTestFileSystem.test.ts (14 tests) 21ms
 ✓ tests/utils/tests/ProjectBuilder.test.ts (10 tests) 21ms
 ✓ tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.test.ts (14 tests) 7ms
 ✓ tests/utils/fs/MockCommandExecutor.test.ts (7 tests) 6ms
 ✓ services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts (6 tests | 3 skipped) 4ms
 ✓ services/resolution/ResolutionService/resolvers/ContentResolver.test.ts (5 tests) 11ms
 ✓ services/state/StateService/StateService.transformation.test.ts (8 tests) 5ms
stdout | services/state/StateEventService/StateEventService.test.ts > StateEventService > should continue processing handlers after error
 ✓ services/state/StateEventService/StateEventService.test.ts (8 tests) 28ms
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using standalone utilities > should handle permissive mode for missing variables
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using standalone utilities > should throw errors in strict mode
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using TestContext > should handle multiple errors in permissive mode
stdout | tests/cli/cli-error-handling.test.ts > CLI Error Handling > Using TestContext > should handle multiple errors in permissive mode
 ✓ tests/cli/cli-error-handling.test.ts (3 tests) 64ms
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should handle nested object data structures with variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.829Z"}
 ✓ tests/comment-handling-fix.test.ts (3 tests) 58ms
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should handle array access in variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.845Z"}
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle simple text variables
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.848Z"}
stdout | tests/specific-variable-resolution.test.ts > Variable Resolution Specific Tests > should format output with variable references
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.868Z"}
 ✓ tests/specific-variable-resolution.test.ts (3 tests) 163ms
stdout | tests/embed-line-number-fix.test.ts > Embed Directive Line Number Mismatch Fix > should replace embed directive with content even if line numbers shift
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-06T05:44:13.864Z"}
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect direct circular imports
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect indirect circular imports
stdout | services/resolution/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should include import chain in error
 ✓ services/resolution/CircularityService/CircularityService.test.ts (10 tests) 10ms
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle basic array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.882Z"}
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle object array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.911Z"}
 ✓ tests/embed-line-number-fix.test.ts (2 tests) 195ms
stdout | api/resolution-debug.test.ts > Variable Resolution Debug Tests > should handle complex nested arrays
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:13.939Z"}
 ✓ api/resolution-debug.test.ts (4 tests) 202ms
stdout | tests/sourcemap/sourcemap-integration.test.ts > Source Mapping Integration > Errors in imported files are reported with correct source location
Error type: MeldParseError
Error properties: [
  'name',
  'code',
  'errorCause',
  'filePath',
  'severity',
  'context',
  'location'
]
Error message: Parse error: Parse error: Expected "$", "[", "{{", or whitespace but "p" found. at line 4, column 9
Got expected error when processing invalid file: Parse error: Parse error: Expected "$", "[", "{{", or whitespace but "p" found. at line 4, column 9
 ✓ tests/sourcemap/sourcemap-integration.test.ts (2 tests) 47ms
 ↓ tests/utils/examples/RunDirectiveCommandMock.test.ts (3 tests | 3 skipped)
 ✓ services/fs/FileSystemService/PathOperationsService.test.ts (8 tests) 5ms
 ✓ tests/embed-transformation-variable-fix.test.ts (1 test) 48ms
stdout | tests/embed-transformation-e2e.test.ts > Embed Directive Transformation E2E > should replace embed directive with section content in transformation mode
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-03-06T05:44:14.359Z"}
 ✓ tests/embed-transformation-e2e.test.ts (3 tests) 146ms
 ✓ _dev/scripts/debug/debug-parser.test.ts (1 test) 31ms
stdout | tests/transformation-debug.test.ts > Transformation Debug Tests > should transform simple text variables without newlines
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:14.447Z"}
stdout | tests/transformation-debug.test.ts > Transformation Debug Tests > should transform array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:14.491Z"}
 ✓ tests/transformation-debug.test.ts (2 tests) 168ms
stdout | api/nested-array.test.ts > Nested Array Access Tests > should handle nested array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:14.492Z"}
 ✓ api/nested-array.test.ts (1 test) 141ms
stdout | tests/specific-nested-array.test.ts > Nested Arrays Specific Test > should handle nested array access correctly
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:14.515Z"}
 ✓ tests/specific-nested-array.test.ts (1 test) 160ms
stdout | api/array-access.test.ts > Array Access Tests > should handle direct array access with dot notation
[32minfo[39m: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-03-06T05:44:14.527Z"}
 ✓ api/array-access.test.ts (1 test) 123ms
 Test Files  82 passed | 1 skipped (83)
      Tests  849 passed | 13 skipped | 8 todo (870)
   Start at  21:44:08
   Duration  5.69s (transform 1.71s, setup 22.04s, collect 3.20s, tests 5.30s, environment 10ms, prepare 5.57s)
(node:74318) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 warning listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > hasConcatenation > should fall back to regex detection when AST parsing fails
Failed to check concatenation with AST, falling back to regex: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:54:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to check concatenation with AST, falling back to regex: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:54:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > resolveConcatenation > should fall back to regex-based splitting when AST parsing fails
Failed to parse concatenation with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:103:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts > StringConcatenationHandler > resolveConcatenation > should reject empty parts
Failed to parse concatenation with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts:212:60
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
(node:74374) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 warning listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > isStringLiteral > should fall back to regex when AST parsing fails
Failed to check string literal with AST, falling back to manual check: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:35:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > isStringLiteral > should reject unmatched quotes
Failed to check string literal with AST, falling back to manual check: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:94:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should fall back to manual validation when AST parsing fails
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:121:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should reject empty strings with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:131:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > validateLiteral > should reject strings without quotes with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:141:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should parse string literals using AST when available
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:161:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:161:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should fall back to manual parsing when AST parsing fails
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:168:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to parse string literal with AST, falling back to manual parsing: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:168:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching single quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:187:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:187:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching double quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:204:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:204:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should remove matching backticks with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:221:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:221:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: 'hello world' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should preserve internal quotes with AST
Failed to validate string literal with AST, falling back to manual validation: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:131:21)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:238:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: "It's a test" },
  details: undefined
}
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.parseLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:261:10)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:242:23)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:238:22
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15) {
  code: { value: "It's a test" },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts > StringLiteralHandler > parseLiteral > should throw on invalid input with AST
Failed to validate string literal with AST, falling back to manual validation: Error: Parse error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts:247:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
Failed to parse string literal with AST, falling back to manual parsing: ResolutionError: Resolution error ([object Object]): String literal must start with a quote (', ", or `)
    at StringLiteralHandler.validateLiteral (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:162:13)
    at StringLiteralHandler.validateLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:141:19)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at StringLiteralHandler.parseLiteralWithAst (/Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/StringLiteralHandler.ts:217:7) {
  code: { value: 'invalid' },
  details: undefined
}
stderr | services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts > VariableReferenceResolver > extractReferencesAsync > should fall back to regex when parser fails
*** Error during variable reference extraction: Error: Parser error
    at /Users/adam/dev/meld/services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts:185:56
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14
    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11
    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)
    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)
stderr | cli/commands/init.test.ts > initCommand > should reject invalid project root paths
Error: Project root must be "." or a valid subdirectory.
## Your task
Carefully review the code and test results and advise on the quality of the code and areas of improvement.
