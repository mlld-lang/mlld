# Semantic Fork Updates for New Grammar Syntax

This document shows all parse tree updates needed for the new syntax while preserving semantic logic and the critical `[...]` = dereference operator.

## Key Syntax Changes

1. **Directive marker**: `@` → `/`
2. **Command brackets**: `[()]` → `{}`
3. **Comments**: `>>` → `//`
4. **NEW: Quoted commands**: `"command"` for single-line commands
5. **PRESERVED**: `[...]` = always dereference/load content

## Updated Parse Trees

### /run Directive

```
/run ...
├─ Command content
│  ├─ Language keyword detected (js, python, bash, etc.)?
│  │  ├─ YES: Code execution mode
│  │  │  ├─ Check for optional inline arguments?
│  │  │  │  ├─ YES: "/run js (x, y) {return x + y}"
│  │  │  │  │  └─ Inline function with parameters
│  │  │  │  │     ├─ Language specified
│  │  │  │  │     ├─ Arguments for the code
│  │  │  │  │     └─ {code content}
│  │  │  │  │        ├─ Parameters available as @x, @y
│  │  │  │  │        ├─ No other @ variable processing
│  │  │  │  │        ├─ Preserve all {braces} and [brackets]
│  │  │  │  │        └─ Preserve all quotes
│  │  │  │  │
│  │  │  │  └─ NO: "/run js {console.log('test')}"
│  │  │  │     └─ Simple code execution
│  │  │  │        └─ {code content}
│  │  │  │           ├─ No @ variable processing in code
│  │  │  │           ├─ Preserve all {braces} and [brackets]
│  │  │  │           └─ Preserve all quotes
│  │  │  │
│  ├─ "{" detected?
│  │  ├─ YES: "/run {command}"
│  │  │  └─ Command execution mode
│  │  │     └─ CommandParts with @var interpolation
│  │  │        ├─ @var → Variable reference
│  │  │        └─ text → Command text segments
│  │  │
│  ├─ '"' detected? (NEW)
│  │  ├─ YES: "/run "command with spaces""
│  │  │  └─ Quoted command execution mode
│  │  │     ├─ Double quotes: @var interpolation supported
│  │  │     │  └─ /run "echo Hello @name"
│  │  │     └─ Single quotes: No interpolation
│  │  │        └─ /run 'echo Hello @name' (literal)
│  │  │
│  ├─ "@" detected?
│  │  ├─ YES: "/run @command"
│  │  │  └─ Command reference (exec)
│  │  │
│  └─ Other patterns
│     └─ Parse error (invalid syntax)
│
└─ Tail modifier (optional)?
   ├─ trust <level>
   ├─ | @cmd @cmd → pipeline
   ├─ pipeline [...]
   └─ with { trust: <level>, pipeline: [...], needs: {...} }

Examples:
- /run {echo "Hello"}
- /run "echo Hello World"         # NEW: Quoted command
- /run 'cat file.txt'            # NEW: Single-quoted (no interpolation)
- /run js {console.log('test')}
- /run js (x, y) {return x + y}  # Inline function parameters
- /run {rm -rf temp/} trust always
- /run {curl api.com} | @validate @parse
- /run @deploy(prod) trust always
- /run {npm test} with { needs: { node: { jest: "^29.0.0" } } }
```

### /text Directive

```
/text @name = ...
├─ "[[" detected?
│  ├─ YES: Template
│  │  └─ [[TemplateContent]]
│  │     └─ {{var}} interpolation only
│  │
├─ "[" detected?
│  ├─ YES: Could be path or section (SEMANTIC FORK)
│  │  ├─ Contains " # "?
│  │  │  ├─ YES: [SectionExtraction]
│  │  │  │  └─ [path # section]
│  │  │  └─ NO: [PathContent]
│  │  │     └─ LOADS FILE CONTENTS (dereference)
│  │  │
├─ "@" detected?
│  ├─ YES: Variable or @run
│  │  ├─ @varname → Variable reference
│  │  └─ @run {...} → Direct run command
│  │
├─ "`" detected?
│  ├─ YES: BacktickTemplate
│  │  └─ `TemplateContent with @var`
│  │     └─ @var interpolation (simpler than [[{{var}}]])
│  │
└─ '"' or "'" detected?
   └─ QuotedLiteral
      └─ "simple string" (NO FILE LOADING - just literal text)

CRITICAL DISTINCTION:
- /text @content = [file.md]     # Loads file contents (dereference)
- /text @path = "file.md"        # Stores string "file.md" (literal)

Examples:
- /text @greeting = "Hello, world!"          # String literal
- /text @content = [[Welcome {{user}}!]]     # Template
- /text @fileData = [./config.json]          # LOADS file contents
- /text @filePath = "./config.json"          # String value "./config.json"
- /text @link = `[@url.path](@url.name)`     # Backtick template
- /text @data = @run {curl api.com} | @parse # Direct run command
```

### /data Directive

```
/data @obj = ...
├─ "{" detected?
│  ├─ YES: ObjectLiteral
│  │  └─ { key: DataValue, ... }
│  │     └─ DataValue can be:
│  │        ├─ Primitive: "string", 123, true
│  │        ├─ @variable reference
│  │        ├─ [path] → LOADS contents
│  │        └─ Nested object/array
│  │
├─ "[" detected?
│  ├─ YES: Could be array OR path (CONTEXT MATTERS)
│  │  ├─ First element suggests array? ([1, 2, 3])
│  │  │  └─ ArrayLiteral
│  │  └─ Looks like path? ([./file.md])
│  │     └─ LOADS FILE CONTENTS
│  │
├─ "foreach" detected?
│  ├─ YES: Foreach expression
│  │  └─ foreach @command(@arrays)
│  │
├─ "@" detected?
│  ├─ YES: Variable or @run
│  │  ├─ @varname → Variable reference
│  │  └─ @run {...} → Direct run command
│  │
└─ Other: PrimitiveValue
   └─ String, number, boolean, null

Examples:
- /data @config = { "path": "./data.json", "content": [./data.json] }
  # "path" is string, "content" is loaded file contents
- /data @users = [./users.json]    # Loads JSON file
- /data @list = [1, 2, 3]          # Array literal
- /data @result = @run {cat data.csv} | @csv
```

### /path Directive

```
/path @var = ...
├─ Path value (NO BRACKETS - paths are references, not content)
│  ├─ '"' detected?
│  │  ├─ YES: DoubleQuotedPath
│  │  │  └─ "path with @var/interpolation"
│  │  │     └─ @var expanded in double quotes
│  │  │
│  │  ├─ "'" detected?
│  │  │  ├─ YES: SingleQuotedPath
│  │  │  │  └─ 'literal path no @var'
│  │  │  │     └─ No interpolation in single quotes
│  │  │
│  │  └─ No delimiter?
│  │     └─ UnquotedPath
│  │        └─ @var/path/segments
│  │
│  NOTE: NO BRACKET SYNTAX for /path
│  Paths are references, not dereferenced content
│
├─ TTL (optional)?
│  └─ "(" duration ")"
│
└─ Tail modifier (optional)?
   ├─ trust <level>
   └─ with { trust: <level>, ... }

Examples:
- /path @config = ./config.json
- /path @api = https://api.com/data (5m)
- /path @secure = @baseUrl/endpoint (1h) trust always
- /path @file = "path with spaces.txt"
- /path @literal = 'no @interpolation here'
```

### /import Directive

```
/import ...
├─ Import pattern?
│  ├─ { imports } from source → Selective import
│  │  ├─ { var1, var2 } → Named imports
│  │  ├─ { var1 as alias1 } → Aliased imports
│  │  └─ { * } → Import all (explicit)
│  │
│  └─ source (no braces) → Import all (implicit)
│
├─ Source types (ALL LOAD CONTENT):
│  ├─ @INPUT → Special stdin/pipe input
│  ├─ @author/module → Registry module (implicit dereference)
│  ├─ [path/to/file.mld] → Local file (explicit dereference)
│  ├─ [https://url.com/file] → Remote URL (explicit dereference)
│  └─ "path/to/file.mld" → Local file (traditional syntax)
│
└─ TTL and modifiers supported

Examples:
- /import { x, y } from [path/to/file.mld]
- /import { x as X } from @author/module
- /import [file.mld] (10d) trust always
- /import { data } from @INPUT
- /import { utils } from "./utils.mld"    # Traditional
```

### /add Directive

```
/add ...
├─ "foreach" detected?
│  ├─ YES: ForeachExpression
│  │  └─ foreach @command(@arrays)
│  │
├─ "[" detected?
│  ├─ YES: Path or Section (ALWAYS LOADS CONTENT)
│  │  ├─ Contains " # "?
│  │  │  └─ [path # section] → Extract section from file
│  │  └─ No " # "
│  │     └─ [path] → Include entire file contents
│  │
├─ "[[" detected?
│  ├─ YES: TemplateContent
│  │  └─ [[text with {{vars}}]]
│  │
├─ '"' detected?
│  ├─ YES: Literal text output
│  │  └─ "This exact text will be added"
│  │     └─ NO FILE LOADING - just outputs the string
│  │
├─ "@" detected?
│  ├─ YES: Variable or invocation
│  │  ├─ @varname → Variable value
│  │  └─ @command(args) → Exec invocation
│  │
└─ Other patterns
   └─ Parse error

CRITICAL: 
- /add [README.md]        # Includes file contents
- /add "README.md"        # Outputs text "README.md"

Examples:
- /add [file.md # Introduction]
- /add [[Welcome {{user}}!]]
- /add "This is literal text"     # Just outputs this text
- /add @greeting
- /add foreach @process(@items)
```

### /exec Directive

```
/exec @name(params) = ...
├─ RHS patterns (no /run prefix needed):
│  │
│  ├─ Language keyword detected (js, python, bash, etc.)?
│  │  ├─ YES: "/exec @fn(x) = js {code}"
│  │  │  └─ Code execution mode
│  │  │
│  ├─ "{" detected?
│  │  ├─ YES: "/exec @cmd(p) = {command}"
│  │  │  └─ Command execution mode
│  │  │
│  ├─ '"' detected? (NEW)
│  │  ├─ YES: "/exec @cmd(p) = "command @p""
│  │  │  └─ Quoted command mode
│  │  │
│  ├─ "[[" detected?
│  │  ├─ YES: "/exec @greeting(name) = [[template]]"
│  │  │  └─ Template executable
│  │  │
│  ├─ "`" detected?
│  │  ├─ YES: "/exec @msg(name) = `template`"
│  │  │  └─ Backtick template executable
│  │  │
│  ├─ "[" with " # " pattern?
│  │  ├─ YES: "/exec @getSection(file) = [@file # Introduction]"
│  │  │  └─ Section executable (LOADS AND EXTRACTS)
│  │  │
│  ├─ "@" detected?
│  │  ├─ YES: "/exec @alias() = @other"
│  │  │  └─ Command reference
│  │  │
│  └─ "{" for environment?
│     └─ "/exec @js = { helperA, helperB }"
│        └─ Environment declaration

Examples:
- /exec @deploy(env) = {./deploy.sh @env}
- /exec @deploy(env) = "./deploy.sh @env"      # NEW: quoted command
- /exec @greet(name) = [[Hello {{name}}!]]
- /exec @greet2(name) = `Hello @name!`
- /exec @getIntro(file) = [@file # Introduction]  # Loads & extracts
- /exec @js = { formatDate, parseJSON }
```

### /output Directive

```
/output ...
├─ Source content
│  ├─ "@" detected?
│  │  ├─ @var → Output variable content
│  │  └─ @cmd() → Output command result
│  │
│  └─ '"' detected?
│     └─ "text" → Output literal text
│
└─ Target path (optional)
   ├─ [path] → Path to write to (bracket = path reference)
   └─ "path" → Path to write to (quote = path string)

Examples:
- /output [report.md]                  # Output doc to file
- /output @result [output.txt]         # Variable to file
- /output "Static text" [static.txt]   # Literal to file
```

### /when Directive

```
/when ...
├─ Condition patterns
│  ├─ Simple: /when @condition => action
│  └─ Multi: /when @var mode: [conditions]
│
└─ Actions use full directive syntax
   └─ Any directive with proper syntax

Examples:
- /when @isProduction => /deploy() trust always
- /when @hasData => /output @report [report.md]
```

## Critical Semantic Preservation

### The Bracket Rule

**NEVER CHANGE THIS**: `[...]` always means dereference/load content

```
Context         Brackets Mean           Quotes Mean
-------         -------------           -----------
/text =         Load file contents      String literal
/data =         Load file/Array literal String literal  
/add            Include file contents   Output text
/import from    Load module/file        File path (loads too)
/path =         NOT ALLOWED             Path reference
```

### Examples Showing Distinction

```mlld
# Store path vs load contents
/text @configPath = "./config.json"      # Stores: "./config.json"
/text @configData = [./config.json]      # Loads file contents

# Output text vs include file
/add "See README.md for details"         # Outputs: "See README.md..."
/add [README.md]                         # Includes README contents

# Path references (never load)
/path @docs = "./documentation"          # Path reference
/path @docs = [./documentation]          # ERROR - paths don't load
```

## Implementation Notes

1. **Directive Marker**: Simple find/replace `"@` → `"/`
2. **Command Brackets**: Update `"[("` → `"{"` and `")]"` → `"}"`
3. **Comments**: Update `">>"` → `"//"`
4. **Quoted Commands**: Add new patterns to /run and /exec
5. **Preserve Brackets**: Keep all `[...]` patterns unchanged

The key is that brackets remain a semantic operator meaning "get the value at this location" while quotes always mean "this literal text".