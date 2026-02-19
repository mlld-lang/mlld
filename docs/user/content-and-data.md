# Content and Data

## tldr

Load files with `<file.txt>` "alligators", work with data structures using dot notation, transform data with built-in methods, and access environment variables through `@input` imports.

```mlld
var @config = <config.json>             >> Load and parse JSON
show @config.database.host              >> Access nested fields
var @files = <docs/*.md>                >> Load multiple files
show @files[0].mx.filename             >> Access file metadata via .mx
```

## .mx has all the metadata

The `.mx` namespace ("metadata") holds information about values—where they came from, how large they are, security labels, and more.

Loaded files and data are objects with three key parts:

```mlld
var @file = <package.json>

show @file.name  >> Parsed payload field (data-first access)
show @file.mx  >> Metadata (filename, tokens, labels, etc.)
show @file.mx.text  >> Wrapper text accessor
show @file.mx.data  >> Wrapper data accessor (parsed payload)
```

The `.mx` namespace is where all metadata lives:

```mlld
var @file = <README.md>.keep

show @file.mx.filename  >> "README.md"
show @file.mx.tokens  >> Token count
show @file.mx.labels  >> Security labels
show @file.mx.absolute  >> Full path
show @file.mx.path  >> Path alias (same as .mx.absolute)
```

Plain dotted field access resolves through parsed data, so `@file.version` matches `@file.mx.data.version`.
If user data includes an `mx` field, access it through `@file.mx.data.mx`.

**Auto-unwrapping**: Display and templates automatically use `.text`:

```mlld
show @file  >> Same as @file.mx.text
var @msg = `Content: @file`  >> Uses @file.mx.text
```

**Explicit access** when you need metadata:

```mlld
when @file.mx.tokest > 2000 => show "File is large"
var @name = @file.mx.filename
```

### `.keep` for JS/Node boundaries

Loaded files are StructuredValues with full metadata access. The `.keep` modifier is only needed when passing to JavaScript/Node stages where you need metadata access inside the JS code:

```mlld
>> Metadata works directly - no .keep needed
var @file = <config.json>
show @file.mx.relative                 >> Works
show @file.apiKey                      >> Works

>> Use .keep when passing to JS and you need .mx inside JS
exe @process(file) = js {
  return file.mx.filename + ": " + file.mx.tokens + " tokens";
}
run @process(@file.keep)               >> .keep preserves metadata for JS
```

### Object composition with spread

Combine objects with left-to-right overrides using spread entries inside object literals:

```mlld
var @baseUser = { "name": "Ada", "role": "user" }
var @admin = { ...@baseUser, "role": "admin", "active": true }

show @admin.role  >> admin
show @admin.active  >> true
```

Rules:
- Each `...@var` must resolve to an object (spreading arrays or primitives throws).
- Later entries override earlier spreads and pairs.
- Spreads work with field access on the reference, e.g. `{ ...@config.mx }`.

## File Loading

Load file contents with angle brackets `<>`:

```mlld
var @readme = <README.md>  >> Load file content
var @filename = "README.md"  >> Literal string

show @readme  >> Shows file contents
show @filename  >> Shows "README.md"
```

### Basic Loading

```mlld
>> Load different file types
var @config = <package.json>            >> JSON file
var @docs = <README.md>                 >> Markdown file
var @script = <build.sh>                >> Shell script
```

### Multiple Files with Globs

Use standard glob patterns to load multiple files:

```mlld
var @markdown = <*.md>                  >> All .md in current dir
var @tests = <**/*.test.js>             >> All test files recursively
var @docs = <docs/**/*.md>              >> All markdown in docs tree
var @source = <src/**/*.ts>             >> All TypeScript in src

>> Access individual files
show @docs[0].mx.text                    >> First file's content
show @docs[0].mx.filename               >> First file's name
```

### Section Extraction

Extract specific sections from markdown files:

```mlld
>> Extract single section
var @install = <README.md # Installation>

>> Extract from multiple files
var @apis = <docs/*.md # API Reference>

>> Rename sections with 'as'
var @modules = <*.md # Overview> as "## <>.mx.filename Overview"
```

The `<>` placeholder in `as` templates represents each file's structured value; use `.mx` to read metadata.

### AST-Based Code Selection

Use curly braces after a file path to pull specific definitions or usages from source files.

#### Basic Selection

```mlld
>> Exact symbol names
var @user = <src/service.ts { createUser }>
var @multiple = <src/api.ts { handleRequest, processData }>

>> Usage patterns - find functions that use a symbol
var @callers = <src/**/*.ts { (logger.info) }>
```

#### Wildcard Patterns

```mlld
>> Prefix matching
var @handlers = <api.ts { handle* }>  >> All functions starting with "handle"

>> Suffix matching
var @validators = <api.ts { *Validator }>  >> All functions ending with "Validator"

>> Contains matching
var @requests = <api.ts { *Request* }>  >> All functions containing "Request"

>> Single character wildcard
var @getters = <api.ts { get? }>  >> getA, getB, getC (not getAllItems)
```

#### Type Filters

```mlld
>> Get all of a specific type
var @allFunctions = <service.ts { *fn }>  >> All functions and methods
var @allVariables = <service.ts { *var }>  >> All variables and constants
var @allClasses = <service.ts { *class }>  >> All classes
var @everything = <service.ts { * }>  >> All top-level definitions
```

Other supported type filters:

| Pattern | Matches |
|---------|---------|
| `{ *interface }` | All interfaces |
| `{ *type }` | All type aliases |
| `{ *enum }` | All enums |
| `{ *struct }` | All structs (Go, Rust, C++) |
| `{ *trait }` | All traits (Rust) |
| `{ *module }` | All modules (Ruby) |

#### Name Listing ("what's here?")

Returns string arrays instead of code:

```mlld
>> Single file - returns plain string array
var @names = <api.ts { ?? }>
show @names.join(", ")  >> "createUser, deleteUser, User, Status"

>> List specific types
var @funcNames = <api.ts { fn?? }>  >> Function names only
var @classNames = <api.ts { class?? }>  >> Class names only
var @varNames = <api.ts { var?? }>  >> Variable names only

>> Glob patterns - returns per-file structured results
var @pythonClasses = <**/*.py { class?? }>
for @file in @pythonClasses => show "@file.names.length classes in @file.relative"
>> Output:
>> 3 classes in ./models/user.py
>> 2 classes in ./services/auth.py
```

#### Variable Interpolation

```mlld
>> Dynamic type filtering
var @targetType = "fn"
var @definitions = <service.ts { *@targetType }>

>> Dynamic name listing
var @listType = "class"
var @classNames = <service.ts { @listType?? }>
```

#### Section Listing (Markdown)

```mlld
>> Single file - returns plain string array
var @headings = <guide.md # ??>
show @headings.join("\n")

>> List specific heading levels
var @h2s = <guide.md # ##??>  >> H2 headings only
var @h3s = <guide.md # ###??>  >> H3 headings only

>> Glob patterns - returns per-file structured results
var @docSections = <docs/**/*.md # ##??>
for @doc in @docSections => show "**@doc.file**: @doc.names.join(', ')"
```

#### Usage Patterns

Wrap any selector in parentheses to find functions that USE the matched symbols:

```mlld
>> Find functions that use specific symbols
var @callers = <api.ts { (validateEmail) }>

>> Find functions that use any wildcard-matched symbol
var @serviceUsers = <api.ts { (*Service) }>

>> Find functions that use any function
var @functionCallers = <api.ts { (*fn) }>
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
var @file = <package.json>

>> Path metadata
show @file.mx.filename                 >> "package.json"
show @file.mx.relative                 >> "./package.json"
show @file.mx.absolute                 >> Full path
show @file.mx.path                     >> Path alias (same as .mx.absolute)

>> Directory metadata
show @file.mx.dirname                  >> Parent directory name
show @file.mx.relativeDir              >> Relative path to directory
show @file.mx.absoluteDir              >> Absolute path to directory

>> Token counting
show @file.mx.tokest                   >> Estimated tokens (fast)
show @file.mx.tokens                   >> Exact tokens

>> Content access
show @file.mx.text                      >> File contents (explicit)
show @file                              >> Same as above (implicit)
```

**Properties:**
- Direct dotted fields (for example `@file.name`) resolve through parsed payload
- `.mx` - Metadata namespace (filename, tokens, labels, frontmatter, etc.)
- `.mx.text` - Explicit wrapper text accessor
- `.mx.data` - Explicit wrapper data accessor

Always use `.mx` for metadata access - it's the canonical namespace.

Missing fields return null by default. The optional suffix `?` is accepted for explicit optional access (for example, `@config.apiUrl?`).

### JSON File Metadata

JSON files are automatically parsed:

```mlld
var @config = <settings.json>

>> Direct field access on parsed JSON
show @config.apiUrl
show @config.users[0].email

>> Raw content still available
show @config.mx.text                    >> Raw JSON string
```

Glob-loaded JSON files are also auto-parsed - each item behaves like a single file load:

```mlld
var @configs = <configs/*.json>
var @first = @configs[0]

>> Access parsed JSON directly
show @first.apiUrl
show @first.users[0].email

>> File metadata still available via .mx
show @first.mx.filename
show @first.mx.relative
```

### Frontmatter Access

Access YAML frontmatter from markdown files:

```mlld
var @post = <blog/post.md>

show @post.mx.fm.title                 >> Post title
show @post.mx.fm.author                >> Author name
show @post.mx.fm.tags                  >> Array of tags

>> Conditional processing
when @post.mx.fm.published => show @post.mx.text
```

## URL Loading

Load content directly from URLs:

```mlld
var @page = <https://example.com/data.json>

>> URL-specific metadata
show @page.mx.url                      >> Full URL
show @page.mx.domain                   >> "example.com"
show @page.mx.status                   >> HTTP status code
show @page.mx.title                    >> Page title (if HTML)

>> HTML is converted to markdown
show @page.mx.text                      >> Markdown version
show @page.mx.html                     >> Original HTML
```

## Variables and Data Structures

### Creating Variables

Use `var` to create variables with different data types:

```mlld
>> Primitives
var @name = "Alice"
var @age = 30
var @active = true

>> Arrays
var @fruits = ["apple", "banana", "cherry"]
var @numbers = [1, 2, 3, 4, 5]

>> Objects
var @user = {"name": "Alice", "role": "admin"}
var @config = {
  "database": {"host": "localhost", "port": 5432},
  "features": ["auth", "api"]
}
```

### Field Access

Access object properties and array elements with dot notation:

```mlld
var @user = {"name": "Alice", "scores": [10, 20, 30]}

>> Object fields
show @user.name                         >> "Alice"

>> Array elements by index
show @user.scores[0]                     >> 10
show @user.scores[1]                     >> 20

>> Nested access
var @config = {"db": {"host": "localhost", "users": ["admin", "guest"]}}
show @config.db.host                    >> "localhost"
show @config.db.users[1]                 >> "guest"
```

### Conditional Inclusion (`@var?`)

Include content only when a variable is truthy. The `?` suffix checks the variable and omits the following content if falsy.

**Truthiness rules** (same as `when`): Falsy values are `null`, `undefined`, `""`, `"false"`, `"0"`, `0`, `NaN`, `[]`, `{}`.

#### Variable Declaration with `?`

Declare an optional variable that omits itself when falsy:

```mlld
var @subtitle? = @item.subtitle      >> omit if falsy
show `Title: @item.title @subtitle?` >> subtitle only if present
```

#### In Commands and Templates

Use `@var?`...`` to conditionally include a backtick template:

```mlld
var @tools = "json"
var @model = ""

>> @tools is truthy, so --tools is included
>> @model is falsy (empty string), so --model is omitted
run cmd { echo @tools?`--tools "@tools"` @model?`--model "@model"` done }
>> Output: --tools "json" done
```

Use `@var?` to omit the variable itself in templates:

```mlld
var @title = "MyTitle"
var @empty = ""

var @msg1 = `DEBUG:@title?`
var @msg2 = `DEBUG:@empty?`
show @msg1
show @msg2
>> "DEBUG:MyTitle"
>> "DEBUG:"
```

#### In Strings

Use `@var?"..."` to conditionally include a quoted fragment:

```mlld
var @title = "Dr."
var @nickname = ""

var @greeting = "Hello @title?\"@title \"@name@nickname?\" (@nickname)\""
show @greeting
>> With @title="Dr." and @name="Ada": "Hello Dr. Ada"
>> With @nickname="Ace": "Hello Ada (Ace)"
```

#### Null Coalescing

Use `@var??"default"` (or single-quoted) for tight template interpolation fallback.
In expression contexts (`var`, `let`, and conditions), use spaced nullish coalescing: `@a ?? @b`.
Chaining works in expressions: `@a ?? @b ?? "fallback"`.

```mlld
var @title = ""
var @primary = null
var @secondary = "pal"
var @fallback = @primary ?? @secondary ?? "fallback"

show `Hello,@title??"friend"`
show @fallback
show `Hello,@missing??"friend"`
>> "Hello,"
>> "Hello,pal"
>> "Hello,friend"
```

#### In Arrays

Use `@var?` to omit falsy elements:

```mlld
var @a = "first"
var @b = ""
var @c = "third"

var @list = [@a, @b?, @c]
show @list
>> ["first", "third"] - @b was omitted because it's falsy
```

#### In Objects

Use `key?:` to omit pairs when the value is falsy:

```mlld
var @name = "Ada"
var @title = ""

var @person = {
  "name": @name,
  "title"?: @title
}
show @person
>> {"name": "Ada"} - title was omitted because @title is falsy
```

#### With Field Access

The entire field path is evaluated before the truthiness check:

```mlld
var @config = {"tools": "json", "model": ""}

run cmd { echo @config.tools?`--tools` @config.model?`--model` }
>> Output: --tools
```

### Array Slicing

Extract subsets of arrays using `[start:end]` syntax:

```mlld
var @items = ["first", "second", "third", "fourth", "last"]

>> Basic slicing
show @items[0:3]                        >> ["first", "second", "third"]
show @items[2:]                         >> ["third", "fourth", "last"]
show @items[:3]                         >> ["first", "second", "third"]

>> Negative indices
show @items[-2:]                        >> ["fourth", "last"]
show @items[:-1]                        >> ["first", "second", "third", "fourth"]
show @items[1:-1]                       >> ["second", "third", "fourth"]
```

## Working with JSON in JavaScript Functions

Parse JSON strings with a pipeline transform before passing them to JS functions. Use the bare variable for raw strings.

### JSON Parsing

```mlld
var @users = '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'

>> Parse inside function
exe @filter1(users) = js {
  const data = JSON.parse(users);
  return data.filter(u => u.age > 25);
}
run @filter1(@users)

>> Parse before passing
exe @filter2(users) = js {
  return users.filter(u => u.age > 25);
}
run @filter2(@users | @parse)
```

### String Preservation

```mlld
var @jsonStr = '{"name": "Alice", "active": true}'

exe @length(str) = js {
  return str.length;
}

run @length(@jsonStr)          >> Default: string
run @length(@jsonStr)          >> Raw JSON string
```

### Common Use Cases

```mlld
>> Filter JSON array from command
var @payload = run {./mkjson.sh}
exe @filterHigh(entries) = js {
  return entries.filter(e => e.finding.startsWith("High"));
}
var @result = @filterHigh(@payload | @parse)

>> Process API response
var @response = run {curl -s api.example.com/data}
exe @getActive(data) = js {
  return data.users.filter(u => u.active);
}
var @active = @getActive(@response | @parse)
```

### Accessor Reference

**Files** (e.g., `var @config = <settings.json>`):

| Accessor | Returns |
|----------|---------|
| Direct fields (for example `.apiUrl`) | Parsed JSON fields |
| `.mx.data` | Parsed payload object/array |
| `.mx.text` | Raw string |

**Variables** (e.g., `var @str = '{"status": "ok"}'`):

| Accessor | Returns |
|----------|---------|
| `| @parse` | Parsed JSON object/array |
| (bare) | Original string (default) |

**Command output** (e.g., `var @result = cmd {curl api.com/data}`):

| Accessor | Returns |
|----------|---------|
| `| @parse` | Parsed JSON when stdout is valid JSON |
| `.mx.text` | Raw stdout string |
| `.mx` | Command metadata (`source`, `command`, `exitCode`, `duration`, `stderr`) |

## Built-in Methods

Variables support built-in methods for common operations:

### Array Methods

```mlld
var @fruits = ["apple", "banana", "cherry"]
var @numbers = [1, 2, 3, 4, 5]

>> Check if array contains value
show @fruits.includes("banana")         >> true
show @fruits.includes("orange")         >> false

>> Find index of value
show @fruits.indexOf("cherry")          >> 2
show @fruits.indexOf("missing")         >> -1

>> Get array length
show @fruits.length()                   >> 3

>> Join array elements
show @fruits.join(", ")                 >> "apple, banana, cherry"
show @numbers.join(" | ")               >> "1 | 2 | 3 | 4 | 5"
```

### String Methods

```mlld
var @text = "Hello World"
var @phrase = "  JavaScript rocks!  "

>> Check if string contains substring
show @text.includes("World")            >> true
show @text.includes("world")            >> false

>> Find substring position
show @text.indexOf("W")                 >> 6
show @text.indexOf("xyz")               >> -1

>> Get string length
show @text.length()                     >> 11

>> Change case
show @text.toLowerCase()                >> "hello world"
show @text.toUpperCase()                >> "HELLO WORLD"

>> Trim whitespace
show @phrase.trim()                     >> "JavaScript rocks!"

>> Check start/end
show @text.startsWith("Hello")          >> true
show @text.endsWith("World")            >> true

>> Split into array
show @text.split(" ")                   >> ["Hello", "World"]
show @text.split("")                    >> ["H", "e", "l", "l", "o", " ", "W", "o", "r", "l", "d"]
```

### Type Checking Methods

Check variable types at runtime:

```mlld
var @arr = [1, 2, 3]
var @obj = {"name": "Alice"}
var @str = "hello"
var @num = 42
var @bool = true
var @nothing = null

show @arr.isArray()      >> true
show @obj.isObject()     >> true
show @str.isString()     >> true
show @num.isNumber()     >> true
show @bool.isBoolean()   >> true
show @nothing.isNull()   >> true

>> isDefined() safely returns false for missing variables
show @missing.isDefined()   >> false
show @str.isDefined()       >> true
```

Use type checks in conditionals:

```mlld
exe @process(input) = when [
  @input.isArray() => foreach @handle(@input)
  @input.isObject() => @handleObject(@input)
  @input.isString() => @handleString(@input)
  * => "unknown type"
]
```

### @exists() Builtin

Check if a path or glob pattern has matches:

```mlld
>> Path existence
when @exists("config.json") => show "Config found"

>> Glob pattern existence (true if at least one match)
when @exists(<*.md>) => show "Markdown files exist"

>> Use in conditionals
exe @loadConfig() = when [
  @exists("config.local.json") => <config.local.json>
  @exists("config.json") => <config.json>
  * => {}
]
```

### @fileExists() Builtin

Check if a file exists at a given path. Unlike `@exists()`, this always resolves its argument to a string path first, then checks the filesystem:

```mlld
var @configPath = "config.json"

>> @exists(@configPath) checks if the VARIABLE is defined (always true here)
>> @fileExists(@configPath) checks if the FILE "config.json" exists
when @fileExists(@configPath) => show "Config found"

>> Works with object fields and globs
when @fileExists(@settings.configFile) => show "Settings loaded"
when @fileExists(<*.md>) => show "Markdown files exist"
```

## Data Transformations

### Pipeline Transformations

Transform data using the pipeline operator `|`:

```mlld
>> Load and transform files
var @config = <config.json> | @parse
var @uppercase = <readme.txt> | @upper

>> Chain transformations
exe @first(text, n) = js {
  return text.split('\n').slice(0, n).join('\n');
}
var @summary = <docs.md> | @first(3) | @upper
```

### Built-in Transformers

mlld provides built-in transformers (both uppercase and lowercase work):

```mlld
>> Load and parse CSV data
var @data = <file.csv>
var @tojson = @data | @parse
show @tojson

>> Convert to XML (SCREAMING_SNAKE_CASE)
var @toxml = @data | @XML
show @toxml

>> Convert arrays to CSV
var @users = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
var @tocsv = @users | @CSV
show @tocsv
```

`@parse` accepts loose JSON syntax (single quotes, trailing commas, comments). Use `@parse.loose` when you want to be explicit, or `@parse.strict` to require standard JSON and surface a clear error if the input is relaxed:

`@json` remains available as a deprecated alias for `@parse`.

```mlld
/var @loose = "{'name': 'Ada', /* comment */ age: 32,}"
/var @parsedLoose = @loose | @parse              >> Uses relaxed parsing
/var @parsedStrict = @loose | @parse.strict      >> Fails with hint to use @parse.loose
```

For extracting JSON from LLM responses that may contain markdown code fences or surrounding prose, use `@parse.llm`:


````mlld
>> Extract from code fence
/var @llmResponse = ::Here's your data:
```json
{"name": "Alice", "status": "active"}
```
::

/var @data = @llmResponse | @parse.llm
/show @data.name                                >> Alice

>> Extract from inline prose
/var @inline = `The result is {"count": 42} for this query.`
/var @extracted = @inline | @parse.llm
/show @extracted.count                          >> 42

>> Returns false when no JSON found
/var @text = `Just plain text, no JSON here.`
/var @result = @text | @parse.llm
/show @result                                   >> false
````

## Templates and Interpolation

### Template Syntax and Interpolation

Use backticks or `::...::` for inline templates, `.att` files for external templates (5+ lines).

#### Quick Reference

| Syntax | Interpolation | Pipes | Loops | Use For |
|--------|---------------|-------|-------|---------|
| `` `...` `` | `@var` `<file>` `@exe()` | ✓ | ✓ | **Default inline** |
| `::...::` | `@var` `<file>` `@exe()` | ✓ | ✓ | Content with backticks |
| `.att` | `@var` `<file>` `@exe()` | ✓ | ✓ | **Default external (5+ lines)** |
| `"..."` | `@var` `<file>` `@exe()` | ✓ | ✗ | Single-line only |
| `'...'` | None (literal) | ✗ | ✗ | Literal text |
| `{...}` | `@var` `<file>` | ✗ | ✗ | Commands/code |

> **Note**: For Discord mentions or content heavy with `@` symbols, see [alternatives.md](alternatives.md) for escape hatch syntax.

#### Inline Templates

```mlld
>> Backticks (default)
var @msg = `Hello @name!`
var @multi = `
Line 1: @var
Line 2: @other
`

>> Double-colon (for content with backticks)
var @doc = ::Use `npm test` before @env::
var @report = ::
Status: @status
Config: <@root/config.json>
Data: @data|@parse
::

>> Double quotes (single-line only)
var @path = "@root/files/@filename"
run cmd {echo "Processing @file"}

>> Single quotes (literal)
var @literal = '@name stays literal'
```

#### External Templates (.att)

Keep reusable templates in standalone files and execute them as functions.

**templates/deploy.att:**
```
Deployment: @env
Status: @status
Config: <@root/config/@env.json>
```

**Usage:**
```mlld
exe @deploy(env, status) = template "./templates/deploy.att"
show @deploy("prod", "success")
```

**Rules:**
- `.att` uses `@var` and supports `<file.md>` references plus `/for ... /end` loops inside the template
- In template content, use condensed pipes (`@value|@pipe`) to avoid ambiguity
- Relative `<file>` paths inside template files resolve from the template file directory
- These files are not imported as modules. Use the `exe ... = template "path"` form

#### Template Loops

Loops with `/for` and `/end` are supported in backticks, `::...::`, and `.att` files:

```mlld
var @list = ::
/for @item in @items
- @item.name: @item.value
/end
::

>> Requirements: /for and /end at line start
```

#### Common Mistakes

```mlld
>> Importing template files (use exe = template instead)
import { @tpl } from "./file.att"    >> Error
exe @tpl(x) = template "./file.att"  >> Correct

>> For template directories:
import templates from "./templates" as @tpl(x, y)
```

### Template Collections

Load entire directories of templates that share a parameter signature. Currently supports local directories only (not registry modules).

```mlld
import templates from "@root/agents" as @agents(message, context)

>> All templates accept (message, context)
show @agents["alice"](@msg, @mx)
show @agents["bob"](@msg, @mx)

>> Dynamic selection in loops
for @name in ["alice", "bob", "charlie"] [
  show @agents[@name](@msg, @mx)
]
```

For registry modules, use individual template exports:

```mlld
>> In the published module
exe @alice(msg, mx) = template "alice.att"
exe @bob(msg, mx) = template "bob.att"
export { @alice, @bob }

>> Import and use
import { @alice, @bob } from @author/templates
show @alice(@msg, @mx)
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
import templates from "@root/agents" as @agents(message, context)
import templates from "@root/formatters" as @fmt(data)

show @agents["alice"](@msg, @mx)    >> (message, context)
show @fmt["json"](@result)           >> (data)
```

### Directory Module Imports

Import a directory of modules by loading each immediate subdirectory `index.mld` and collecting its exports into an object.

```mlld
import "./agents" as @agents
show @agents.party.who

>> Default skipDirs: ["_*", ".*"]
import "./agents" as @agents with { skipDirs: [] }
show @agents._private.who
```

Directory names are sanitized (hyphens and special chars become underscores).

#### Interpolation Contexts

Variable interpolation works in specific contexts:

```mlld
>> In directives
show @name

>> In double quotes
var @greeting = "Hello @name"

>> In command braces
run cmd {echo "Welcome @name"}

>> NOT in single quotes (literal)
var @literal = 'Hello @name'               >> Outputs: Hello @name
```

In markdown mode (`.md`, `.mld.md` files), plain text lines are not interpolated:
```
Hello @name                                 >> Plain text, @name is literal
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
import { API_KEY, NODE_ENV } from @input
show `Deploying to @NODE_ENV with key @API_KEY`

>> Import and use in objects
var @config = {
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
import { version, author } from @input
show `Release @version by @author`

>> Access piped text (becomes 'content' field)
import { content } from @input
show `Received: @content`
```

### Combined Input

Environment variables and stdin are merged:

```bash
echo '{"config": "production"}' | API_KEY=secret mlld deploy.mld
```

```mlld
import { API_KEY, config } from @input
show `Deploying @config with key @API_KEY`
```

## Practical Examples

### Documentation Builder

```mlld
>> Collect all module documentation
var @modules = <modules/**/*.md>

>> Build README with metadata
var @readme = `# Project Modules

Total modules: @modules.length
Last updated: @now

@modules

`

output @readme to "README.md"
```

### Token-Aware Processing

```mlld
>> Load files and check context limits
var @files = <src/**/*.ts>

>> Define filter for large files (over 2000 tokens)
exe @filterLarge(files) = js {
  return files.filter(f => f.tokest > 2000)
}
var @large = @filterLarge(@files)

>> Calculate total tokens
exe @sumTokens(files) = js {
  return files.reduce((sum, f) => sum + (f.tokest || 0), 0)
}
var @totalTokens = @sumTokens(@files)

show `Found @large.length files over 2000 tokens`
show `Total estimated tokens: @totalTokens`
```

### Data Pipeline

```mlld
>> Process API data
var @users = run {curl -s api.example.com/users}
var @parsed = @users | @parse

>> Define filter function for active users
exe @filterActive(users) = js {
  return users.filter(u => u.status === "active")
}
var @active = @filterActive(@parsed)

>> Generate report
var @report = `# User Report

Active users: @active.length
Generated: @now

## Users
@active

`

output @report to "user-report.md"
```

### Configuration Management

```mlld
>> Load environment-specific config
import { NODE_ENV } from @input
var @env = @NODE_ENV || "development"

>> Load base config and environment overrides
var @baseConfig = <config/base.json>
var @envConfig = <config/@env.json>

>> Merge configurations using JS
var @config = js {
  return Object.assign(
    {},
    @baseConfig,
    @envConfig,
    {
      environment: @env,
      timestamp: @now
    }
  )
}

output @config to "runtime-config.json" as json
```

### Incremental JSONL Logging

Capture long-running results without rewriting the full file:

```mlld
var @checks = for @service in ["auth", "payments", "search"] =>
  {"service": @service, "status": "ok", "timestamp": @now}

for @entry in @checks => append @entry to "health.jsonl"

show <health.jsonl>
```

Each append writes one compact JSON object followed by a newline. Use `.jsonl` when you want structured JSONL output. Any other extension (e.g., `.log`, `.txt`, `'.md`) is treated as plain text. `.json` files are blocked to prevent producing invalid JSON.

## Gotchas

### Metadata in JS/Node Stages

When passing files to JavaScript stages, use `.keep` if you need metadata access inside the JS code:

```mlld
var @file = <config.json>

>> ✗ JS receives unwrapped data by default - no .mx
exe @process(file) = js { return file.mx.filename }  >> Error

>> ✓ Use .keep to preserve metadata for JS
exe @process(file) = js { return file.mx.filename }
run @process(@file.keep)                              >> Works
```

Note: In mlld templates and directives, metadata works directly without `.keep`:

```mlld
var @files = <docs/*.md>
for @file in @files => show @file.mx.filename        >> Works
for @file in @files => show @file.mx.data.status     >> Works
for @file in @files => show @file.mx.fm.title        >> Works
```

## Best Practices

**File Loading:**
- Use globs for multiple files: `<docs/*.md>`
- Check existence: `when @config => show "Found config"`
- Access metadata via `.mx`: `@file.mx.tokest`

**Data Access:**
- Prefer dot notation: `@user.name` over complex expressions
- Use slicing for arrays: `@items[0:5]` for first 5 elements
- Check array contents: `@list.includes("item")`

**Templates:**
- Default to backticks or `::...::` for inline, `.att` files for external (5+ lines)
- Loops (`/for`...`/end`) work in backticks, `::...::`, and `.att` only
- Never import template files; use `exe @name(...) = template "path.att"` form
- For Discord/social content with many `@` symbols, see [alternatives.md](alternatives.md)

**Environment Variables:**
- Import explicitly: `import { API_KEY } from @input`
- Provide defaults: `@NODE_ENV || "development"`
- Document required variables in comments