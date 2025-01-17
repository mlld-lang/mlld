# Meld Directives Documentation

## Overview
Meld directives are special commands that control the interpreter's behavior and manage state. Each directive type serves a specific purpose, from managing variables to executing commands and handling file operations.

## Directive Types

### @data Directive
Stores arbitrary JSON-like data into the interpreter's state.

#### Architecture
```
   +----------------------+
   |   DataDirective      |
   |   kind: 'data'       |
   |   name: 'user'       |
   |   value: {...}       |
   +--------+-------------+
            |
            v
   [ DataDirectiveHandler.handle(...) ]
            |
            v
  state.setDataVar(name, value)
```

#### Syntax
```
@data variableName = { "key": "value" }
```

#### Implementation
```typescript
class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean;
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void;
}
```

#### Examples
```
// Basic Usage
@data user = { "name": "Alice", "age": 30 }

// Nested Data
@data config = {
  "server": {
    "port": 8080,
    "host": "localhost"
  },
  "timeout": 5000
}

// Array Data
@data items = ["one", "two", "three"]
```

### @define Directive
Creates reusable text variables for reference elsewhere in the document.

#### Architecture
```
   +----------------------+
   |   DefineDirective    |
   |   kind: 'define'     |
   |   name: 'var'        |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ DefineDirectiveHandler.handle(...) ]
            |
            v
  state.setTextVar(name, value)
```

#### Syntax
```
// Single-line
@define variableName = value

// Multi-line
@define variableName = """
Multi-line
content here
"""
```

#### Examples
```
// Basic Usage
@define greeting = Hello, world!

// Multi-line Definition
@define template = """
Dear {name},

Thank you for your message.

Best regards,
{sender}
"""

// Variable Reference
@define name = Alice
@define message = Hello, {name}!
```

### @embed Directive
Includes external file contents directly in the Meld document.

#### Architecture
```
   +----------------------+
   |   EmbedDirective     |
   |   kind: 'embed'      |
   |   path: string       |
   +--------+-------------+
            |
            v
   [ EmbedDirectiveHandler.handle(...) ]
            |
            +---> Read file contents
            |
            +---> Process content if .meld
            |
            v
   [Content added to output]
```

#### Syntax
```
// Basic File Embedding
@embed path/to/file.txt

// With Variable Path
@embed {filePath}
```

#### Examples
```
// Basic Text File
@embed README.md

// Meld File with Processing
@embed template.meld

// Variable Path
@define docPath = docs/intro.md
@embed {docPath}

// Nested Content
@embed outer.meld  # which might contain @embed inner.meld
```

### @import Directive
Imports and processes Meld files, merging their state into the current interpreter state.

#### Architecture
```
   +----------------------+
   |   ImportDirective    |
   |   kind: 'import'     |
   |   path: string       |
   +--------+-------------+
            |
            v
   [ ImportDirectiveHandler.handle(...) ]
            |
            +---> Read Meld file
            |
            +---> Create subInterpreter
            |
            +---> Process file
            |
            v
   [Merge state changes]
```

#### Syntax
```
// Basic Import
@import path/to/file.meld

// With Variable Path
@import {filePath}
```

#### Examples
```
// Basic Import
@import common.meld

// Variable Path Import
@define templatePath = templates/base.meld
@import {templatePath}

// Chained Imports
@import config.meld    # which might import settings.meld

// State Usage
@import utils.meld     # defines helper variables
@define message = Using {helperVar}  # uses imported variable
```

### @path Directive
Manages file system paths and directory locations.

#### Architecture
```
   +----------------------+
   |   PathDirective      |
   |   kind: 'path'       |
   |   name: string       |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ PathDirectiveHandler.handle(...) ]
            |
            v
  state.setPathVar(name, value)
```

#### Syntax
```
// Basic Path Definition
@path basePath = /path/to/directory

// With Variable Reference
@path outputPath = {basePath}/output
```

#### Examples
```
// Basic Usage
@path srcDir = ./src
@path buildDir = ../build

// Variable References
@path baseDir = /project
@path configDir = {baseDir}/config
@path outputDir = {baseDir}/output

// Environment Variables
@path homeConfig = $HOME/.config/meld

// Complex Paths
@path templateDir = {baseDir}/templates
@path userTemplate = {templateDir}/{userName}
```

### @run Directive
Executes shell commands with optional output capture.

#### Architecture
```
   +----------------------+
   |   RunDirective       |
   |   kind: 'run'        |
   |   command: string    |
   |   capture?: string   |
   +--------+-------------+
            |
            v
   [ RunDirectiveHandler.handle(...) ]
            |
            +---> Execute command
            |
            +---> Capture output (optional)
            |
            v
   [Update state if output captured]
```

#### Syntax
```
// Basic Command
@run echo "Hello, world!"

// With Output Capture
@run command = ls -la

// With Variable Reference
@run echo {message}
```

#### Examples
```
// Basic Commands
@run echo "Building project..."
@run npm install

// Output Capture
@run result = git status
@run version = node --version

// Variable Usage
@define script = build.sh
@run ./{script} --release

// Complex Commands
@run find . -name "*.js" | xargs grep "TODO"
```

### @text Directive
Manages text variables and content with support for variable substitution.

#### Architecture
```
   +----------------------+
   |   TextDirective      |
   |   kind: 'text'       |
   |   name: string       |
   |   value: string      |
   +--------+-------------+
            |
            v
   [ TextDirectiveHandler.handle(...) ]
            |
            v
  state.setTextVar(name, value)
```

#### Syntax
```
// Single-line Text
@text message = Hello, world!

// Multi-line Text
@text content = """
This is a
multi-line
text block.
"""

// With Variable Reference
@text greeting = Hello, {name}!
```

#### Examples
```
// Basic Usage
@text title = My Document
@text description = A detailed explanation

// Multi-line Content
@text template = """
Dear {recipient},

Thank you for your {topic} submission.

Best regards,
{sender}
"""

// Variable References
@text name = Alice
@text greeting = Hello, {name}!
@text message = {greeting} Welcome to our service.

// Special Characters
@text escaped = This includes \"quoted\" text
@text path = C:\\Program Files\\App
```

## Implementation Details

### Directive Handler Interface
All directives implement this common interface:
```typescript
interface DirectiveHandler {
  canHandle(kind: string, mode: string): boolean;
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void;
}
```

### State Interaction
- All directives interact with `InterpreterState`
- State modifications check immutability
- Variable name validation
- Collision detection
- Change tracking

### Error Handling
Each directive handles specific error cases:

#### Data Directive Errors
- Invalid JSON syntax
- Missing required fields
- Name validation errors
- State modification errors

#### Define/Text Directive Errors
- Invalid variable names
- Name collisions
- Multi-line syntax errors
- Variable resolution errors

#### Embed/Import Directive Errors
- File not found
- Permission errors
- Circular references
- Invalid paths
- Processing errors

#### Path Directive Errors
- Invalid path syntax
- Name collisions
- Path resolution errors
- Variable substitution errors

#### Run Directive Errors
- Command execution errors
- Permission errors
- Timeout errors
- Output capture errors

### Logging
All directives use the `directiveLogger` for:
- Execution progress
- Error reporting
- Debug information
- State changes

## Security Considerations

### File System Access
- Path validation
- Permission checks
- Working directory restrictions
- Circular reference prevention

### Command Execution
- Command injection prevention
- Permission requirements
- Environment variable exposure
- Output sanitization

### State Protection
- Immutability enforcement
- Variable name validation
- Type checking
- Collision prevention

## Best Practices

### Variable Naming
1. Use descriptive names
2. Follow consistent conventions
3. Avoid reserved words
4. Consider scope and visibility

### File Operations
1. Use relative paths when possible
2. Check file existence
3. Handle permissions appropriately
4. Prevent circular references

### Command Execution
1. Validate commands
2. Handle errors gracefully
3. Capture output when needed
4. Consider security implications

### State Management
1. Check immutability
2. Validate inputs
3. Handle collisions
4. Track changes

## Troubleshooting

### Common Issues

#### Data/Define/Text Issues
- **"Invalid variable name"**
  - Solution: Use alphanumeric names with underscores
- **"Variable already defined"**
  - Solution: Choose unique names
- **"Invalid JSON syntax"**
  - Solution: Verify JSON format
- **"Unclosed multi-line string"**
  - Solution: Check triple quote closure

#### File Operation Issues
- **"File not found"**
  - Solution: Check paths and working directory
- **"Permission denied"**
  - Solution: Verify file access rights
- **"Circular reference"**
  - Solution: Review import/embed chain
- **"Invalid path"**
  - Solution: Check path format and variables

#### Command Execution Issues
- **"Command not found"**
  - Solution: Verify command exists in PATH
- **"Permission denied"**
  - Solution: Check execution permissions
- **"Output capture failed"**
  - Solution: Verify command produces output
- **"Variable not resolved"**
  - Solution: Check variable definitions

### Debugging Tips
1. Enable debug logging
2. Check variable definitions
3. Verify file paths
4. Review error messages
5. Inspect state changes
6. Test commands separately
7. Check permissions
8. Review documentation

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [State Management](../../state/__docs__/README.md)
- [File System Utils](../../../utils/__docs__/fs.md)
- [Security Guidelines](../../../docs/security.md) 