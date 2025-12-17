# Content and Data

## tldr

Load files with `<file.txt>` "alligators", work with data structures using dot notation, transform data with built-in methods, and access environment variables through `@input` imports.

```mlld
/var @config = <config.json>             >> Load and parse JSON
/show @config.database.host              >> Access nested fields
/var @files = <docs/*.md>                >> Load multiple files
/show @files[0].mx.filename             >> Access file metadata via .mx
```

## .mx has all the metadata

Loaded files and data are objects with three key parts:

```mlld
/var @file = <package.json>

@file.text                               # String content
@file.data                               # Parsed payload (JSON object)
@file.mx                                # Metadata (filename, tokens, labels, etc.)
```

The `.mx` namespace is where all metadata lives:

```mlld
/var @file = <README.md>.keep

/show @file.mx.filename                 # "README.md"
/show @file.mx.tokens                   # Token count
/show @file.mx.labels                   # Security labels
/show @file.mx.absolute                 # Full path
```

**Auto-unwrapping**: Display and templates automatically use `.text`:

```mlld
/show @file                              # Same as @file.text
/var @msg = `Content: @file`             # Uses @file.text
```

**Explicit access** when you need metadata:

```mlld
/when @file.mx.tokest > 2000 => show "File is large"
/var @name = @file.mx.filename
```

### `.keep` alligator metadata

If you set a variable to the value of a single-file load like `<file.md>` it will lose the rich metadata like `<file.md>.mx.relative` when passing the value.

Use `<file.md>.keep` when setting as the value of a variable to preserve the structure.

```mlld
/var @file = <file.md>
/show @file.mx.relative
>> No value here

/var @file = <file.md>.keep
/show @file.mx.relative
>> Returns a path
```

### Object composition with spread

Combine objects with left-to-right overrides using spread entries inside object literals:

```mlld
/var @base = { "name": "Ada", "role": "user" }
/var @admin = { ...@base, "role": "admin", "active": true }

/show @admin.role        # admin
/show @admin.active      # true
```

Rules:
- Each `...@var` must resolve to an object (spreading arrays or primitives throws).
- Later entries override earlier spreads and pairs.
- Spreads work with field access on the reference, e.g. `{ ...@config.mx }`.

## File Loading

Load file contents with angle brackets `<>`:

```mlld
/var @readme = <README.md>               # Load file content
/var @filename = "README.md"             # Literal string

/show @readme                            # Shows file contents
/show @filename                          # Shows "README.md"
```

### Basic Loading

```mlld
>> Load different file types
/var @config = <package.json>            >> JSON file
/var @docs = <README.md>                 >> Markdown file  
/var @script = <build.sh>                >> Shell script
```

### Multiple Files with Globs

Use standard glob patterns to load multiple files:

```mlld
/var @markdown = <*.md>                  >> All .md in current dir
/var @tests = <**/*.test.js>             >> All test files recursively
/var @docs = <docs/**/*.md>              >> All markdown in docs tree
/var @source = <src/**/*.ts>             >> All TypeScript in src

>> Access individual files
/show @docs[0].text                       >> First file's content
/show @docs[0].mx.filename               >> First file's name
```

### Section Extraction

Extract specific sections from markdown files:

```mlld
>> Extract single section
/var @install = <README.md # Installation>

>> Extract from multiple files  
/var @apis = <docs/*.md # API Reference>

>> Rename sections with 'as'
/var @modules = <*.md # Overview> as "## <>.mx.filename Overview"
```

The `<>` placeholder in `as` templates represents each file's structured value; use `.mx` to read metadata.

### AST-Based Code Selection

Use curly braces after a file path to pull specific definitions or usages from source files.

#### Basic Selection

```mlld
>> Exact symbol names
/var @user = <src/service.ts { createUser }>
/var @multiple = <src/api.ts { handleRequest, processData }>

>> Usage patterns - find functions that use a symbol
/var @callers = <src/**/*.ts { (logger.info) }>
```

#### Wildcard Patterns

```mlld
>> Prefix matching
/var @handlers = <api.ts { handle* }>           # All functions starting with "handle"

>> Suffix matching
/var @validators = <api.ts { *Validator }>      # All functions ending with "Validator"

>> Contains matching
/var @requests = <api.ts { *Request* }>         # All functions containing "Request"

>> Single character wildcard
/var @getters = <api.ts { get? }>               # getA, getB, getC (not getAllItems)
```

#### Type Filters

```mlld
>> Get all of a specific type
/var @allFunctions = <service.ts { *fn }>       # All functions and methods
/var @allVariables = <service.ts { *var }>      # All variables and constants
/var @allClasses = <service.ts { *class }>      # All classes
/var @everything = <service.ts { * }>           # All top-level definitions

>> Other supported types
{ *interface }  # All interfaces
{ *type }       # All type aliases
{ *enum }       # All enums
{ *struct }     # All structs (Go, Rust, C++)
{ *trait }      # All traits (Rust)
{ *module }     # All modules (Ruby)
```

#### Name Listing ("what's here?")

Returns string arrays instead of code:

```mlld
>> Single file - returns plain string array
/var @names = <api.ts { ?? }>
/show @names.join(", ")                         # "createUser, deleteUser, User, Status"

>> List specific types
/var @funcNames = <api.ts { fn?? }>            # Function names only
/var @classNames = <api.ts { class?? }>        # Class names only
/var @varNames = <api.ts { var?? }>            # Variable names only

>> Glob patterns - returns per-file structured results
/var @pythonClasses = <**/*.py { class?? }>
/for @file in @pythonClasses => show "@file.names.length classes in @file.relative"
# Output:
# 3 classes in ./models/user.py
# 2 classes in ./services/auth.py
```

#### Variable Interpolation

```mlld
>> Dynamic type filtering
/var @targetType = "fn"
/var @definitions = <service.ts { *@targetType }>

>> Dynamic name listing
/var @listType = "class"
/var @classNames = <service.ts { @listType?? }>
```

#### Section Listing (Markdown)

```mlld
>> Single file - returns plain string array
/var @headings = <guide.md # ??>
/show @headings.join("\n")

>> List specific heading levels
/var @h2s = <guide.md # ##??>                  # H2 headings only
/var @h3s = <guide.md # ###??>                 # H3 headings only

>> Glob patterns - returns per-file structured results
/var @docSections = <docs/**/*.md # ##??>
/for @doc in @docSections => show "**@doc.file**: @doc.names.join(', ')"
```

#### Usage Patterns

Wrap any selector in parentheses to find functions that USE the matched symbols:

```mlld
>> Find functions that use specific symbols
/var @callers = <api.ts { (validateEmail) }>

>> Find functions that use any wildcard-matched symbol
/var @serviceUsers = <api.ts { (*Service) }>

>> Find functions that use any function
/var @functionCallers = <api.ts { (*fn) }>
```

#### Rules and Limitations

- **Mixing selectors**: Cannot mix content selectors with name-list selectors: `{ createUser, fn?? }` is an error
- **Supported languages**: `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.py`, `.pyi`, `.rb`, `.go`, `.rs`, `.sol`, `.java`, `.cs`, `.c`, `.cpp`, `.h`, `.hpp`
- **Glob behavior**:
  - Single file: `<file.ts { ?? }>` → plain string array `["name1", "name2"]`
  - Glob pattern: `<**/*.ts { ?? }>` → per-file objects `[{ names: [...], file, relative, absolute }]`
  - Iterate naturally: `/for @f in @results => show "@f.names.length items in @f.relative"`
- **Null handling**: Missing patterns yield `null` to keep output aligned with request order
- **Top-level only**: `{ ?? }` and `{ * }` exclude nested definitions (methods, constructors)

## File Metadata

Every loaded file exposes metadata through its `.mx` namespace:

```mlld
/var @file = <package.json>

>> Basic metadata
/show @file.mx.filename                 >> "package.json"
/show @file.mx.relative                 >> "./package.json" 
/show @file.mx.absolute                 >> Full path

>> Token counting
/show @file.mx.tokest                   >> Estimated tokens (fast)
/show @file.mx.tokens                   >> Exact tokens

>> Content access
/show @file.content                      >> File contents (explicit)
/show @file                              >> Same as above (implicit)
```

**Properties:**
- `.text` - String content (used by display/templates)
- `.data` - Parsed payload (JSON objects, arrays, etc.)
- `.mx` - Metadata namespace (filename, tokens, labels, frontmatter, etc.)

Always use `.mx` for metadata access - it's the canonical namespace.

### JSON File Metadata

JSON files are automatically parsed:

```mlld
/var @config = <settings.json>

>> Direct field access on parsed JSON
/show @config.json.apiUrl
/show @config.json.users[0].email

>> Raw content still available
/show @config.content                    >> Raw JSON string
```

### Frontmatter Access

Access YAML frontmatter from markdown files:

```mlld
/var @post = <blog/post.md>

/show @post.mx.fm.title                 >> Post title
/show @post.mx.fm.author                >> Author name
/show @post.mx.fm.tags                  >> Array of tags

>> Conditional processing
/when @post.mx.fm.published => show @post.content
```

## URL Loading

Load content directly from URLs:

```mlld
/var @page = <https://example.com/data.json>

>> URL-specific metadata
/show @page.mx.url                      >> Full URL
/show @page.mx.domain                   >> "example.com"
/show @page.mx.status                   >> HTTP status code
/show @page.mx.title                    >> Page title (if HTML)

>> HTML is converted to markdown
/show @page.content                      >> Markdown version
/show @page.mx.html                     >> Original HTML
```

## Variables and Data Structures

### Creating Variables

Use `/var` to create variables with different data types:

```mlld
>> Primitives
/var @name = "Alice"
/var @age = 30
/var @active = true

>> Arrays
/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]

>> Objects
/var @user = {"name": "Alice", "role": "admin"}
/var @config = {
  "database": {"host": "localhost", "port": 5432},
  "features": ["auth", "api"]
}
```

### Field Access

Access object properties and array elements with dot notation:

```mlld
/var @user = {"name": "Alice", "scores": [10, 20, 30]}

>> Object fields
/show @user.name                         >> "Alice"

>> Array elements by index
/show @user.scores[0]                     >> 10
/show @user.scores[1]                     >> 20

>> Nested access
/var @config = {"db": {"host": "localhost", "users": ["admin", "guest"]}}
/show @config.db.host                    >> "localhost"
/show @config.db.users[1]                 >> "guest"
```

### Array Slicing

Extract subsets of arrays using `[start:end]` syntax:

```mlld
/var @items = ["first", "second", "third", "fourth", "last"]

>> Basic slicing
/show @items[0:3]                        >> ["first", "second", "third"]
/show @items[2:]                         >> ["third", "fourth", "last"]
/show @items[:3]                         >> ["first", "second", "third"]

>> Negative indices
/show @items[-2:]                        >> ["fourth", "last"]
/show @items[:-1]                        >> ["first", "second", "third", "fourth"]
/show @items[1:-1]                       >> ["second", "third", "fourth"]
```

## Working with JSON in JavaScript Functions

Use `.data` or `.json` to parse JSON strings before passing to functions. Use `.text` or `.content` to preserve strings.

### JSON Parsing

```mlld
/var @users = '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'

>> Parse inside function
/exe @filter1(users) = js {
  const data = JSON.parse(users);
  return data.filter(u => u.age > 25);
}
/run @filter1(@users)

>> Parse before passing
/exe @filter2(users) = js {
  return users.filter(u => u.age > 25);
}
/run @filter2(@users.data)   >> .data parses JSON
/run @filter2(@users.json)   >> .json is alias
```

### String Preservation

```mlld
/var @jsonStr = '{"name": "Alice", "active": true}'

/exe @length(str) = js {
  return str.length;
}

/run @length(@jsonStr)          >> Default: string
/run @length(@jsonStr.text)     >> Explicit string
/run @length(@jsonStr.content)  >> Alias for .text
```

### Common Use Cases

```mlld
>> Filter JSON array from command
/var @json = run {./mkjson.sh}
/exe @filterHigh(entries) = js {
  return entries.filter(e => e.finding.startsWith("High"));
}
/var @result = @filterHigh(@json.data)

>> Process API response
/var @response = run {curl -s api.example.com/data}
/exe @getActive(data) = js {
  return data.users.filter(u => u.active);
}
/var @active = @getActive(@response.data)
```

### Accessor Reference

```mlld
>> Files
/var @config = <settings.json>
@config.json              >> Parsed JSON object
@config.data              >> Alias for .json
@config.content           >> Raw string
@config.text              >> Alias for .content

>> Variables
/var @str = '{"status": "ok"}'
@str.data                 >> Parsed JSON object
@str.json                 >> Alias for .data
@str.text                 >> Original string
@str.content              >> Alias for .text
@str                      >> Original string (default)

>> Command output
/var @result = run {curl api.com/data}
@result.data              >> Parse as JSON
@result.json              >> Alias for .data
@result.text              >> Keep as string
@result.content           >> Alias for .text
```

## Built-in Methods

Variables support built-in methods for common operations:

### Array Methods

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]

>> Check if array contains value
/show @fruits.includes("banana")         >> true
/show @fruits.includes("orange")         >> false

>> Find index of value
/show @fruits.indexOf("cherry")          >> 2
/show @fruits.indexOf("missing")         >> -1

>> Get array length
/show @fruits.length()                   >> 3

>> Join array elements
/show @fruits.join(", ")                 >> "apple, banana, cherry"
/show @numbers.join(" | ")               >> "1 | 2 | 3 | 4 | 5"
```

### String Methods

```mlld
/var @text = "Hello World"
/var @phrase = "  JavaScript rocks!  "

>> Check if string contains substring
/show @text.includes("World")            >> true
/show @text.includes("world")            >> false

>> Find substring position
/show @text.indexOf("W")                 >> 6
/show @text.indexOf("xyz")               >> -1

>> Get string length
/show @text.length()                     >> 11

>> Change case
/show @text.toLowerCase()                >> "hello world"
/show @text.toUpperCase()                >> "HELLO WORLD"

>> Trim whitespace
/show @phrase.trim()                     >> "JavaScript rocks!"

>> Check start/end
/show @text.startsWith("Hello")          >> true
/show @text.endsWith("World")            >> true

>> Split into array
/show @text.split(" ")                   >> ["Hello", "World"]
/show @text.split("")                    >> ["H", "e", "l", "l", "o", " ", "W", "o", "r", "l", "d"]
```

## Data Transformations

### Pipeline Transformations

Transform data using the pipeline operator `|`:

```mlld
>> Load and transform files
/var @config = <config.json> | @json
/var @uppercase = <readme.txt> | @upper

>> Chain transformations
/exe @first(text, n) = js { 
  return text.split('\n').slice(0, n).join('\n');
}
/var @summary = <docs.md> | @first(3) | @upper
```

### Built-in Transformers

mlld provides built-in transformers (both uppercase and lowercase work):

```mlld
>> Format JSON with indentation
/var @data = <file.csv>
/var @tojson = @data | @json
/show @tojson

>> Convert to XML (SCREAMING_SNAKE_CASE)
/var @toxml = @data | @XML
/show @toxml

>> Convert arrays to CSV
/var @users = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/var @tocsv = @users | @CSV
/show @tocsv

`@json` accepts loose JSON syntax (single quotes, trailing commas, comments). Use `@json.loose` when you want to be explicit, or `@json.strict` to require standard JSON and surface a clear error if the input is relaxed:

```mlld
/var @loose = "{'name': 'Ada', /* comment */ age: 32,}"
/var @parsedLoose = @loose | @json              >> Uses relaxed parsing
/var @parsedStrict = @loose | @json.strict      >> Fails with hint to use @json.loose
```

For extracting JSON from LLM responses that may contain markdown code fences or surrounding prose, use `@json.llm`:


````mlld
>> Extract from code fence
/var @llmResponse = ::Here's your data:
```json
{"name": "Alice", "status": "active"}
```
::

/var @data = @llmResponse | @json.llm
/show @data.name                                >> Alice

>> Extract from inline prose
/var @inline = `The result is {"count": 42} for this query.`
/var @extracted = @inline | @json.llm
/show @extracted.count                          >> 42

>> Returns false when no JSON found
/var @text = `Just plain text, no JSON here.`
/var @result = @text | @json.llm
/show @result                                   >> false
````
```

## Templates and Interpolation

### Template Syntax and Interpolation

**Default to `::...::` for inline templates, `.att` files for external templates (5+ lines).** Switch to `:::...:::` or `.mtt` ONLY for Discord `<@userid>` mentions or heavy social media `@handle` usage.

#### Quick Reference

| Syntax | Interpolation | Pipes | Loops | Use For |
|--------|---------------|-------|-------|---------|
| `::...::` | `@var` `<file>` `@exe()` | ✓ | ✓ | **Default inline** |
| `.att` | `@var` `<file>` `@exe()` | ✓ | ✓ | **Default external (5+ lines)** |
| `` `...` `` | `@var` `<file>` `@exe()` | ✓ | ✓ | Same as `::...::` (preference) |
| `"..."` | `@var` `<file>` `@exe()` | ✓ | ✗ | Single-line only |
| `:::...:::` | `{{var}}` only | ✗ | ✗ | Discord/social escape hatch |
| `.mtt` | `{{var}}` only | ✗ | ✗ | Discord/social external |
| `'...'` | None (literal) | ✗ | ✗ | Literal text |
| `{...}` | `@var` `<file>` | ✗ | ✗ | Commands/code |

#### Inline Templates

```mlld
>> Double-colon (default)
/var @msg = ::Hello @name!::
/var @doc = ::Use `npm test` before @env::
/var @report = ::
Status: @status
Config: <@base/config.json>
Data: @data|@json
::

>> Backticks (alternative)
/var @msg = `Hello @name!`
/var @multi = `
Line 1: @var
Line 2: @other
`

>> Double quotes (single-line only)
/var @path = "@base/files/@filename"
/run cmd {echo "Processing @file"}

>> Triple-colon (Discord/social only)
/var @alert = :::Alert <@{{adminId}}>! Issue from <@{{userId}}>:::
/var @tweet = :::Hey @{{user}}, check this! cc: @{{team1}} @{{team2}}:::

>> Single quotes (literal)
/var @literal = '@name stays literal'
```

#### External Templates (.att, .mtt)

Keep reusable templates in standalone files and execute them as functions:

```mlld
>> .att files (default for 5+ lines)
>> file: templates/deploy.att
# Deployment: @env
Status: @status
Config: <@base/config/@env.json>

>> usage
/exe @deploy(env, status) = template "./templates/deploy.att"
/show @deploy("prod", "success")

>> .mtt files (Discord/social only)
>> file: templates/discord.mtt
🚨 Alert <@{{adminId}}>!
Reporter: <@{{reporterId}}>
Severity: {{severity}}

>> usage
/exe @alert(adminId, reporterId, severity) = template "./templates/discord.mtt"
```

**Rules:**
- `.att` uses `@var` and supports `<file.md>` references, pipes, and loops inside the template
- `.mtt` uses `{{var}}` (simple mustache-style) - use ONLY for Discord/social scenarios
- These files are not imported as modules. Use the `/exe ... = template "path"` form

#### Template Loops

Loops with `/for` and `/end` are supported in `::...::`, backticks, and `.att` files only:

```mlld
/var @list = ::
/for @item in @items
- @item.name: @item.value
/end
::

>> Requirements: /for and /end at line start
>> NOT supported in :::...:::, .mtt, or "..."
```

#### Trade-offs When Using Discord/Social Escape Hatch

| Feature | `::...::` / `.att` | `:::...:::` / `.mtt` |
|---------|-------------------|----------------------|
| `@var` interpolation | ✓ | ✗ Use `{{var}}` |
| `<file.md>` loading | ✓ | ✗ |
| `@exe()` calls | ✓ | ✗ |
| Pipes `\|` | ✓ | ✗ |
| Loops | ✓ | ✗ |
| Discord `<@id>` | Escape `\<@id\>` | ✓ Natural |
| Many `@handles` | Works | ✓ Cleaner |

#### Common Mistakes

```mlld
>> ✗ Using {{}} in ::...::
/var @msg = ::Hello {{name}}::        >> {{name}} is literal
/var @msg = ::Hello @name::           >> ✓

>> ✗ Using @var in :::...:::
/var @msg = :::Hello @name:::         >> @name is literal
/var @msg = :::Hello {{name}}:::      >> ✓

>> ✗ Using ::: without Discord/social need
/var @msg = :::Status: {{status}}:::  >> Loses all features
/var @msg = ::Status: @status::       >> ✓ Full features

>> ✗ Importing template files
/import { @tpl } from "./file.att"    >> Error
/exe @tpl(x) = template "./file.att"  >> ✓
/import templates from "./templates" as @tpl(x, y)  >> Use this for template directories
```

### Template Collections

Load entire directories of templates that share a parameter signature. Currently supports local directories only (not registry modules).

```mlld
/import templates from "@base/agents" as @agents(message, context)

>> All templates accept (message, context)
/show @agents["alice"](@msg, @mx)
/show @agents["bob"](@msg, @mx)

>> Dynamic selection in loops
/for @name in ["alice", "bob", "charlie"] [
  show @agents[@name](@msg, @mx)
]
```

For registry modules, use individual template exports:

```mlld
>> In the published module
/exe @alice(msg, mx) = template "alice.att"
/exe @bob(msg, mx) = template "bob.att"
/export { @alice, @bob }

>> Import and use
/import { @alice, @bob } from @author/templates
/show @alice(@msg, @mx)
```

**Directory structure:**

```
agents/
├── alice.att         → @agents["alice"] or @agents.alice
├── bob.att           → @agents["bob"] or @agents.bob
├── json-pretty.att   → @agents["json_pretty"] (sanitized)
└── support/
    └── helper.att    → @agents.support["helper"]
```

**Access patterns:**
- Directories: dot notation (`@agents.support`)
- Templates: brackets (`@agents["alice"]`) or dots if valid identifier (`@agents.alice`)
- Filenames sanitized: hyphens and special chars become underscores (`json-pretty.att` → `json_pretty`)
- Full bracket notation also works: `@agents["support"]["helper"]`

**Shared parameter contract:**

All templates in a collection must use only the declared parameters:

```
>> agents/alice.att - ✓ valid
Hello @message! I'm Alice.
Context: @context

>> agents/invalid.att - ✗ error at parse time
Hello @message!
Extra: @undeclared
```

Error: `Template 'invalid.att' references @undeclared but signature only declares (message, context)`

Templates don't have to use all parameters, but can't reference any undeclared ones.

**Different parameter needs = different collections:**

```mlld
/import templates from "@base/agents" as @agents(message, context)
/import templates from "@base/formatters" as @fmt(data)

/show @agents["alice"](@msg, @mx)    >> (message, context)
/show @fmt["json"](@result)           >> (data)
```

#### Interpolation Contexts

Variable interpolation works in specific contexts:

```mlld
>> In directives
/show @name

>> In double quotes
/var @greeting = "Hello @name"

>> In command braces
/run cmd {echo "Welcome @name"}

>> NOT in single quotes (literal)
/var @literal = 'Hello @name'               >> Outputs: Hello @name

>> NOT in plain markdown lines
Hello @name                                 >> Plain text, no interpolation
```

## Environment Variables and Input

### Environment Variable Access

Access environment variables through `@input` imports:

```bash
# Shell
API_KEY=secret123 NODE_ENV=production mlld deploy.mld
```

```mlld
>> Import specific variables
/import { API_KEY, NODE_ENV } from @input
/show `Deploying to @NODE_ENV with key @API_KEY`

>> Import and use in objects
/var @config = {
  "apiKey": @API_KEY,
  "environment": @NODE_ENV,
  "timestamp": @now
}
```

### Stdin Input

Pipe data to mlld via stdin:

```bash
# JSON input
echo '{"version": "1.0.0", "author": "Alice"}' | mlld release.mld

# Text input  
echo "Hello World" | mlld process.mld
```

```mlld
>> Access piped JSON data
/import { version, author } from @input
/show `Release @version by @author`

>> Access piped text (becomes 'content' field)
/import { content } from @input
/show `Received: @content`
```

### Combined Input

Environment variables and stdin are merged:

```bash
echo '{"config": "production"}' | API_KEY=secret mlld deploy.mld
```

```mlld
/import { API_KEY, config } from @input
/show `Deploying @config with key @API_KEY`
```

## Practical Examples

### Documentation Builder

```mlld
>> Collect all module documentation
/var @modules = <modules/**/*.md>

>> Build README with metadata
/var @readme = `# Project Modules

Total modules: @modules.length
Last updated: @now

@modules

`

/output @readme to "README.md"
```

### Token-Aware Processing

```mlld
>> Load files and check context limits
/var @files = <src/**/*.ts>

>> Define filter for large files (over 2000 tokens)
/exe @filterLarge(files) = js {
  return files.filter(f => f.tokest > 2000)
}
/var @large = @filterLarge(@files)

>> Calculate total tokens
/exe @sumTokens(files) = js {
  return files.reduce((sum, f) => sum + (f.tokest || 0), 0)
}
/var @totalTokens = @sumTokens(@files)

/show `Found @large.length files over 2000 tokens`
/show `Total estimated tokens: @totalTokens`
```

### Data Pipeline

```mlld
>> Process API data
/var @users = run {curl -s api.example.com/users}
/var @parsed = @users | @json

>> Define filter function for active users
/exe @filterActive(users) = js {
  return users.filter(u => u.status === "active")
}
/var @active = @filterActive(@parsed)

>> Generate report
/var @report = `# User Report

Active users: @active.length
Generated: @now

## Users
@active

`

/output @report to "user-report.md"
```

### Configuration Management

```mlld
>> Load environment-specific config
/import { NODE_ENV } from @input
/var @env = @NODE_ENV || "development"

>> Load base config and environment overrides
/var @baseConfig = <config/base.json>
/var @envConfig = <config/@env.json>

>> Merge configurations using JS
/var @config = js {
  return Object.assign(
    {},
    @baseConfig.json,
    @envConfig.json,
    {
      environment: @env,
      timestamp: @now
    }
  )
}

/output @config to "runtime-config.json" as json
```

### Incremental JSONL Logging

Capture long-running results without rewriting the full file:

```mlld
/var @checks = for @service in ["auth", "payments", "search"] =>
  {"service": @service, "status": "ok", "timestamp": @now}

/for @entry in @checks => append @entry to "health.jsonl"

/show <health.jsonl>
```

Each append writes one compact JSON object followed by a newline. Use `.jsonl` when you want structured JSONL output. Any other extension (e.g., `.log`, `.txt`, `'.md`) is treated as plain text. `.json` files are blocked to prevent producing invalid JSON.

## Gotchas

### Metadata Access in Loops

Auto-unwrapping in iterations drops direct `.mx` access:

```mlld
/var @files = <docs/*.md>

# ✗ This won't work - loop variable is unwrapped text
/for @file in @files => show @file.mx.filename   # Error: .mx on string

# ✓ Access via array index
/for @i in [0, 1, 2] => show @files[@i].mx.filename

# ✓ Or use @keep helper to preserve structure
/for @file in @files.keep => show @file.mx.filename
```

### Metadata in Pipelines

Pipeline stages receive string input by default:

```mlld
/var @file = <config.json>

# ✗ This loses metadata
/var @result = @file | @process          # @process gets string, no .mx

# ✓ Keep structured form
/exe @process(file) = `Name: @file.mx.filename, Tokens: @file.mx.tokens`
/var @result = @file.keep | @process
```

## Best Practices

**File Loading:**
- Use globs for multiple files: `<docs/*.md>`
- Check existence: `/when @config => show "Found config"`
- Access metadata via `.mx`: `@file.mx.tokest`

**Data Access:**
- Prefer dot notation: `@user.name` over complex expressions
- Use slicing for arrays: `@items[0:5]` for first 5 elements
- Check array contents: `@list.includes("item")`

**Templates:**
- Default to `::...::` for inline (< 5 lines), `.att` files for external (5+ lines)
- Switch to `:::...:::` or `.mtt` ONLY for Discord mentions or heavy social `@handle` usage
- Loops (`/for`...`/end`) work in `::...::`, backticks, and `.att` only
- Never import template files; use `/exe @name(...) = template "path.att"` form

**Environment Variables:**
- Import explicitly: `/import { API_KEY } from @input`
- Provide defaults: `@NODE_ENV || "development"`
- Document required variables in comments
