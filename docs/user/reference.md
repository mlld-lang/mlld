# Syntax Reference

Here's a syntax reference for mlld.

## Basic Directives

### Variables (`var`)

Create variables using `var` with `@` prefix:

```mlld
var @name = "Alice"
var @age = 25
var @active = true
var @items = ["apple", "banana", "cherry"]
var @user = {"name": "Alice", "role": "admin"}
var @merged = { ...@user, "role": "superadmin" }    >> object spread
```

Access object properties and array elements:

```mlld
var @userName = @user.name  >> "Alice"
var @firstItem = @items[0]  >> "apple"
```

Optional variables (omit if falsy):

```mlld
var @subtitle = @item.subtitle
show `Title: @item.title @subtitle?` >> subtitle only if present
```

Array slicing:

```mlld
var @numbers = [1, 2, 3, 4, 5]
var @first3 = @numbers[0:3]  >> [1, 2, 3]
var @last2 = @numbers[-2:]  >> [4, 5]
var @middle = @numbers[1:4]  >> [2, 3, 4]
```

### Display (`show`)

Output variables and templates:

```mlld
show @name
show `Hello @name!`
show ::Welcome @user.name to the system!::
```

### Commands (`run`)

Execute shell commands:

```mlld
run cmd {echo "Hello World"}
run cmd {ls -la}
run @data | { cat | jq '.[]' }       >> stdin via pipe
run cmd { cat | jq '.[]' } with { stdin: @data }  >> explicit stdin form
```

In strict mode (`.mld` files), you can call executables directly without `run`:

```mlld
@task()        >> same as: run @task()
```

Multi-line commands with `run sh`:

```mlld
run sh(@project):/tmp {
  npm test && npm run build
  echo "$project"
}
```

### Working directory (`:path`)

```mlld
run cmd(@root):/ {echo "$root"}
```

Output:
```
<project root path>
```

Paths can be absolute (for example `/tmp`, `/var/log`, `/`) or use `~` for home directory expansion. Relative paths or Windows-style paths fail. Executables accept the same suffix when you need to parameterize it:

```mlld
exe @list(dir) = cmd:@dir {pwd}
run @list("/")
```

`sh`, `bash`, `js`, `node`, and `python` accept the same `:/abs/path` suffix (and `~`). JavaScript and Node switch `process.cwd()` to the provided directory before running code.

### Executables (`exe`)

Define reusable functions and templates:

```mlld
>> Shell commands
exe @greet(name) = run {echo "Hello @name"}
exe @processJson(data) = @data | cmd { cat | jq '.[]' }  << stdin support
exe @deploy() = sh {
  npm test && npm run build
  ./deploy.sh
}

>> JavaScript (in-process, fast)
exe @add(a, b) = js { return a + b }
exe @processData(data) = js {
  return data.map(item => item.value * 2)
}

>> Node.js (VM-isolated, full Node.js API)
exe @hash(text) = node {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

>> Python (subprocess, print() returns values)
exe @add(a, b) = py { print(int(a) + int(b)) }
exe @calculate(x, y) = py {
result = x ** 2 + y ** 2
print(result)
}

>> Prose execution (requires config, see docs/user/prose.md)
import { @opus } from @mlld/prose
exe @summarize(text) = prose:@opus { summarize @text }      << inline interpolates
exe @review(code) = prose:@opus "./review.prose"            << .prose = no interpolation
exe @greet(name) = prose:@opus "./greet.prose.att"          << .prose.att/.mtt interpolate

>> Templates
exe @welcome(name, role) = ::Welcome @name! Role: @role::
exe @format(title, content) = ::
>> @title

@content
::

>> Invoke executables
run @greet("Bob")
var @sum = @add(10, 20)
show @welcome("Alice", "Admin")

>> `foreach` in `exe` RHS
exe @wrap(x) = `[@x]`
exe @wrapAll(items) = foreach @wrap(@items)
show @wrapAll(["a","b"]) | @join(',')  >> => [a],[b]

>> Exe blocks with `[...]` syntax
exe @greet(name) = [
  let @greeting = "Hello"
  => "@greeting @name!"
]
show @greet("World")  >> => Hello World!
```

Typed parameters (for tooling and MCP integration):

```mlld
exe @greet(name: string, times: number) = js { return "Hello " + name; }
exe @process(data: object, format: string) = js { return data; }
exe @count(items: array) = js { return items.length; }

>> With description for MCP tool listings
exe @searchIssues(repo: string, query: string, limit: number) = cmd {
  gh issue list -R @repo --search "@query" -L @limit --json number,title
} with { description: "Search GitHub issues by query" }
```

Supported parameter types: `string`, `number`, `boolean`, `object`, `array`.

### Conditionals (`if` and `when`)

Imperative conditions:

```mlld
if @active [ show "User is active" ]
```

Value selection:

```mlld
when @active => show "User is active"
```

List form (first match wins):

```mlld
when [
  @role == "admin" => show "Admin access"
  @role == "user" => show "User access"
  * => show "Guest access"
]
```

With logical operators:

```mlld
when @score >= 80 && @submitted => show "Passed"
when (@role == "admin" || @role == "mod") && @active => show "Privileged"
```

Value-returning `/exe...when` patterns:

```mlld
exe @getAccess(user) = when [
  @user.role == "admin" => "full"
  @user.verified && @user.premium => "premium"
  @user.verified => "standard"
  * => "limited"
]

var @access = @getAccess(@currentUser)
```

### Iteration (`for`)

Execute actions for each item:

```mlld
var @names = ["Alice", "Bob", "Charlie"]
for @name in @names => show `Hello @name`
```

Collect results:

```mlld
var @numbers = [1, 2, 3]
var @doubled = for @x in @numbers => js { return @x * 2 }
```

Object iteration with keys:

```mlld
var @config = {"host": "localhost", "port": 3000}
for @key, @value in @config => show `@key: @value`
```

Value-only form:

```mlld
for @value in @config => show `@value_key: @value`
```

Nested loops:

```mlld
for @x in ["A", "B"] => for @y in [1, 2] => show `@x-@y`
```

For blocks with `[...]` syntax:

```mlld
for @item in @items [
  show "Processing: @item"
  let @count += 1
]
```

Transform collections with `foreach`:

```mlld
exe @greet(name) = ::Hi @name!::
var @greetings = foreach @greet(@names)
```

`show foreach` with formatting options:

```mlld
var @names = ["Ann","Ben"]
exe @hello(n) = `Hello @n`
show foreach @hello(@names) with { separator: " | ", template: "{{index}}={{result}}" }
```

When-expressions in `for` RHS with filtering:

```mlld
var @xs = [1, null, 2, null, 3]
var @filtered = for @x in @xs => when [
  @x != null => @x
  none => skip
]
```

### Template loops (backticks and ::)

Render loops inline inside templates. The `for` header and `end` must start at line begins inside the template body.

Backticks:

```mlld
var @tpl = `
/for @v in ["x","y"]
- @v
/end
`
show @tpl
```

Double-colon:

```mlld
var @items = ["A","B"]
var @msg = ::
/for @x in @items
- @x
/end
::
show @msg
```

Limits:
- Supported in backticks and `::…::` templates.
- Not supported in `:::…:::` or `[[…]]` templates.

### File Operations

Load file contents with angle brackets:

```mlld
var @readme = <README.md>
var @config = <package.json>
show <documentation.md>
```

File metadata access:

```mlld
var @filename = <package.json>.mx.filename
var @tokens = <large-file.md>.mx.tokens
var @frontmatter = <doc.md>.mx.fm.title
```

Use `.mx` for metadata paths. Top-level metadata aliases like `<doc.md>.filename` are not available.

Glob patterns:

```mlld
var @allDocs = <docs/*.md>
var @toc = <docs/*.md> as "- [<>.mx.fm.title](<>.mx.relative)"
```

AST selection (extract code definitions from source files):

```mlld
>> Exact names
var @handler = <src/api.ts { createUser }>

>> Wildcards
var @handlers = <api.ts { handle* }>         >> prefix match
var @validators = <api.ts { *Validator }>    >> suffix match

>> Type filters
var @funcs = <service.ts { *fn }>            >> all functions
var @classes = <service.ts { *class }>       >> all classes

>> Name listing (returns string arrays)
var @names = <api.ts { ?? }>                 >> all definition names
var @funcNames = <api.ts { fn?? }>           >> function names only
```

Supported languages: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.java`, `.rb`
Type keywords: `fn`, `var`, `class`, `interface`, `type`, `enum`, `struct`

File existence checking:

```mlld
>> Optional load: returns null if file doesn't exist (no error)
var @cfg = <config.json>?
if @cfg [ show "config loaded" ]

>> Pipeline check: pipe a path through @fileExists
var @path = "/tmp/output.txt"
var @found = @path | @fileExists
if @found [ show "file exists" ]

>> Shell recipe for yes/no string result
exe @checkFile(path) = sh { test -f "$path" && echo "yes" || echo "no" }
if @checkFile("/tmp/output.txt") == "yes" [ show "exists" ]
```

The `<path>?` operator is the simplest approach — it attempts to load the file and returns null on failure. The `@fileExists` transformer checks whether a path points to an existing file. For more complex checks (directories, permissions), use a shell recipe.

### Imports (`import`)

Import from modules (modules should declare `export { ... }` to list public bindings; the auto-export fallback for modules without manifests is still supported for now):

```mlld
import { @sortBy, @unique } from @mlld/array
import @company/utils as @utils
```

Import from files:

```mlld
import { @helper } from "./utils.mld"
import { @config } from "@root/config.mld"
```

Import types help declare how a source is resolved. You can prefix the directive with a keyword, or rely on inference:

```mlld
import module { @env } from @mlld/env
import static <./templates/system.mld> as @systemTemplates
import live { @value } from @input
import cached(5m) "https://api.example.com/status" as @statusSnapshot
import local { @helper } from @local/dev-tools
import templates from "./templates" as @tpl(message, context)
```

When omitted, mlld infers the safest option: registry references behave as `module`, files as `static`, URLs as `cached`, `@input` as `live`, `@root`/`@project` as `static` (`@base` is also supported), and `@local` as `local`. The identifier after `as` uses an `@` prefix in source code; mlld strips the prefix internally when referring to the namespace. If the keyword and source disagree (for example, `cached` on a relative path), the interpreter raises an error before evaluation.

Directory imports load each immediate subdirectory `index.mld` and return an object keyed by sanitized directory names. Directories matching `_*` or `.*` are skipped by default.

```mlld
import "./agents" as @agents
show @agents.party.who

import "./agents" as @agents with { skipDirs: [] }
show @agents._private.who
```

TTL durations use suffixes like 30s, 5m, 1h, 1d, or 1w (seconds, minutes, hours, days, weeks).

### Output (`output`)

Write to files and streams:

```mlld
output @content to "output.txt"
output @data to "config.json"
output @message to stdout
output @error to stderr
output @config to "settings.yaml" as yaml
```

### Append (`append`)

Append one record per call, preserving existing file content:

```mlld
append @payload to "events.jsonl"
append "raw text entry" to "events.log"
```

`.jsonl` targets must receive valid JSON objects; anything else will use plain text. The pipeline form `| append "file.jsonl"` appends the prior stage output.

### Log (`log`)

Syntactic sugar for `output ... to stderr`

### Script return (`=>`)

Return a final script value and terminate execution:

```mlld
=> @result
```

Strict-mode final output is explicit:
- `show` emits side-effect output
- `log` emits side-effect diagnostics to stderr
- `=> @value` emits final script output and stops execution
- No `=>` means no implicit final return output

Imported `.mld` modules expose the script return value through the `default` binding:

```mlld
>> module.mld
var @status = "active"
=> { code: 200, status: @status }
```

```mlld
>> main.mld
import { default as @result } from "./module.mld"
show @result.code     >> 200
```

### `bail` - Terminate on Error

Terminate the entire script immediately with exit code 1:

```mlld
bail "config file missing"
bail `Missing: @required`
bail                        >> uses default message
```

Works from any context including nested blocks, loops, and imported modules:

```mlld
if @checkFailed [
  bail "validation failed"
]

for @item in @items [
  if !@item.valid [
    bail `Invalid item: @item.id`
  ]
]
```

### `stream` - Stream Output

**Purpose**: Display output with live chunks as they arrive (instead of buffering until completion)

**Syntax**: `stream <expression>`

**Example**:
```mlld
stream @claude("Write a story")
```

### `stream` - Enable Streaming

**Purpose**: Enable streaming for a function call or code block (syntactic sugar for `with { stream: true }`)

**Syntax**:
- `stream @function()`
- `stream sh { ... }`
- `stream node { ... }`

**Example**:
```mlld
stream @claude("Write a haiku")
```

The `stream` directive is syntactic sugar - it sets `stream: true` on the invocation.

**Parallel execution**: Both branches stream concurrently, results buffer until complete

```mlld
exe @left() = sh { echo "L" }
exe @right() = sh { echo "R" }
var @results = stream @left() || stream @right()
show @results  >> => ["L","R"]
```

**Suppression**:
- CLI: `--no-stream`
- Env: `MLLD_NO_STREAM=true`
- API: `interpret(..., { streaming: { enabled: false } })`

### Hooks (`hook`)

Register user lifecycle hooks with required timing (`before` or `after`):

| Syntax | Filter Type | Notes |
|---|---|---|
| `hook before @fn = [ ... ]` | Function | Matches executable name |
| `hook before @fn("prefix") = [ ... ]` | Function + arg prefix | Matches first argument string prefix |
| `hook after op:exe = when [ ... ]` | Operation | Matches operation type |
| `hook before untrusted = [ ... ]` | Data label | Matches label-filtered inputs |

Supported operation filters: `op:var`, `op:run`, `op:exe`, `op:show`, `op:output`, `op:append`, `op:for`, `op:for:iteration`, `op:for:batch`, `op:loop`, `op:import`.

Hook bodies accept either a block (`[ ... ]`) or a `when [...]` expression.

Behavior notes:
- Matching hooks run in declaration order.
- `before` and `after` hook return values chain. A later hook receives the previous transformed value.
- Hook body errors do not abort the parent operation; they are collected in `@mx.hooks.errors`.
- Function filter arg-prefix matching (`@fn("prefix")`) uses `startsWith` against the first argument string form.
- Observability pattern: emit telemetry from hooks with `output ... to "state://telemetry"` and read errors from `@mx.hooks.errors`.

Hook body context variables:

| Variable | Availability | Description |
|---|---|---|
| `@input` | `before`, `after` | Current operation inputs. Function hooks expose the function args for `before`; non-function hooks expose the current operation input payload. |
| `@output` | `after` | Current operation result value (or guard-denial payload when an operation is denied before execution). |
| `@mx.op.name` | `before`, `after` | Operation/executable name for the active hook target. |
| `@mx.op.type` | `before`, `after` | Operation type string (for example: `exe`, `run`, `show`, `for:iteration`, `loop`). |
| `@mx.op.labels` | `before`, `after` | Merged input + operation labels on the active operation context. |
| `@mx.for.index` | `op:for:iteration`, `op:for:batch` | Zero-based iteration index (or batch index for batch hooks). |
| `@mx.for.total` | `op:for:iteration`, `op:for:batch` | Total number of iterable items in the parent `for` run. |
| `@mx.for.key` | `op:for:iteration` | Current key for object/map iteration (or `null` for array iteration). |
| `@mx.for.parallel` | `op:for:iteration`, `op:for:batch` | `true` when the parent `for` is running in parallel mode. |
| `@mx.for.batchIndex` | `op:for:iteration`, `op:for:batch` | Zero-based parallel batch window index. |
| `@mx.for.batchSize` | `op:for:iteration`, `op:for:batch` | Number of items in the current parallel batch window. |
| `@mx.hooks.errors` | `before`, `after` | Array of isolated hook body errors (`hookName`, `timing`, `filterKind`, `message`). |
| `@mx.checkpoint.hit` | `before`, `after` | `true` when the current operation was served from checkpoint cache, otherwise `false`. |
| `@mx.checkpoint.key` | `before`, `after` | Checkpoint cache key for the current operation (when checkpointing is active). |

### `env` - Scoped Execution

Create scoped execution contexts with isolation, credential management, and capability control:

```mlld
var @sandbox = {
  provider: "@mlld/env-docker",
  fs: { read: [".:/app"], write: ["/tmp"] },
  net: "none",
  tools: ["Read", "Bash"],
  mcps: []
}

env @sandbox [
  run cmd { claude -p "Analyze the codebase" } using auth:claude
]
```

Local execution with different auth (no provider = local):

```mlld
var @cfg = { auth: "claude-alt" }

env @cfg [
  run cmd { claude -p @task } using auth:claude_alt
]
```

Capability attenuation with `with`:

```mlld
env @sandbox with { tools: ["Read"] } [
  >> Only Read is available here
  run cmd { claude -p @task }
]
```

Return values from env blocks:

```mlld
var @result = env @config [
  let @data = run cmd { fetch-data }
  => @data
]
```

## Advanced Features

### Templates

Two template syntaxes:

```mlld
>> Backticks (primary)
var @msg = `Hello @name, welcome!`

>> Double-colon (for content with backticks)
var @doc = ::Use `npm install` to get started, @name::
```

Interpolation rules:
- Backticks `@var`: interpolate
- Double-colon `::@var::`: interpolate (use when content has backticks)
- Double quotes `"@var"`: interpolate
- Single quotes `'@var'`: literal (no interpolation)
- Commands `{@var}`: interpolate

> **Note**: For Discord mentions (`<@userid>`) or content heavy with `@` symbols, see the `:::{{var}}:::` escape hatch syntax in the alternatives guide.

### Builtin Methods

Common methods (work on both arrays and strings):

```mlld
var @fruits = ["apple", "banana", "cherry"]
show @fruits.length()           >> 3
show @fruits.includes("banana") >> true
show @fruits.indexOf("cherry")  >> 2
show @fruits.slice(0, 2)        >> ["apple", "banana"]

var @text = "Hello World"
show @text.length()              >> 11
show @text.includes("World")     >> true
show @text.indexOf("W")          >> 6
show @text.slice(0, 5)           >> "Hello"
```

Array methods:

```mlld
var @fruits = ["apple", "banana", "cherry"]
show @fruits.join(", ")          >> "apple, banana, cherry"
show @fruits.concat(["date"])    >> ["apple", "banana", "cherry", "date"]
show @fruits.reverse()           >> ["cherry", "banana", "apple"]
show @fruits.sort()              >> ["apple", "banana", "cherry"]
```

String methods:

```mlld
var @text = "Hello World"
show @text.toLowerCase()         >> "hello world"
show @text.toUpperCase()         >> "HELLO WORLD"
show @text.trim()                >> removes whitespace
show @text.startsWith("Hello")   >> true
show @text.endsWith("World")     >> true
show @text.split(" ")            >> ["Hello", "World"]
show @text.replace("World", "mlld")  >> "Hello mlld"
show @text.replaceAll("l", "L")  >> "HeLLo WorLd"
show @text.substring(6)          >> "World"
show @text.padStart(15, "-")     >> "----Hello World"
show @text.padEnd(15, "!")       >> "Hello World!!!!"
show @text.repeat(2)             >> "Hello WorldHello World"
```

Pattern matching:

```mlld
var @text = "error: line 42"
var @matched = @text.match("[0-9]+")  >> ["42"]
```

Type checking methods:

```mlld
var @items = ["a", "b"]
var @config = {"key": "value"}
var @name = "Alice"
show @items.isArray()    >> true
show @config.isObject()  >> true
show @name.isString()    >> true
show @name.isNumber()    >> false
show @name.isBoolean()   >> false
show @name.isNull()      >> false
show @name.isDefined()   >> true
```

### Pipelines

Chain operations with `|`:

```mlld
var @result = run {cat data.json} | @parse | @csv
var @processed = @data | @validate | @transform
```

Built-in transformers:
- `@parse`: parse/format JSON, accepting relaxed JSON syntax (single quotes, trailing commas, comments). Use `@parse.strict` to require standard JSON, `@parse.loose` to be explicit about relaxed parsing, or `@parse.llm` to extract JSON from LLM responses (code fences, prose). Returns `null` if no JSON found.
- `@json`: deprecated alias for `@parse`
- `@xml`: parse/format XML
- `@csv`: parse/format CSV
- `@md`: format as Markdown

Pipeline context variables:
- `@mx.try`: current attempt number
- `@mx.stage`: current pipeline stage
- `@mx.errors`: array of errors from parallel operations (for loops or pipeline groups); error markers: `{ index, key?, message, error, value }`
- `@mx.checkpoint.hit`: `true` when an eligible `llm` operation was fulfilled from checkpoint cache; `false` on miss path
- `@mx.checkpoint.key`: cache key used for the current eligible checkpointed operation
- `@p[0]`: pipeline input (original/base value)
- `@p[1]` … `@p[n]`: outputs from completed stages (as `StructuredValue` wrappers)
- `@p[-1]`: previous stage output (same value as current stage input); `@p[-2]` two stages back
- `@p.retries.all`: history of retry attempts across contexts
- Pipeline outputs expose wrapper access through `.mx.text` (string) and `.mx.data` (structured). Plain dotted access resolves through parsed data.

Checkpoint run flags:
- `mlld run <script> --checkpoint`: enable checkpoint cache reads/writes for eligible `llm` operations.
- `mlld run <script> --fresh`: clear that script cache before execution.
- `mlld run <script> --resume [target]`: enables checkpointed resume flow; target forms are:
  - `@function` (invalidate that function's checkpoint entries)
  - `@function:index` (invalidate only one invocation site, 0-based)
  - `@function("prefix")` (fuzzy cursor invalidation by args preview prefix)
- `mlld run <script> --fork <script>`: read checkpoint hits from another script cache as seed state (read-only); fork misses write only to the current script cache.
- `mlld checkpoint list|inspect|clean <script>`: inspect or clear stored checkpoint files.

Retry with hints:

```mlld
exe @validator(input) = when [
  @input.valid => @input
  @mx.try < 3 => retry "need more validation"
  * => "fallback"
]
```

While loops for bounded iteration:

```mlld
exe @countdown(n) = when [
  @n <= 0 => done "finished"
  * => continue (@n - 1)
]
var @result = 5 | while(10) @countdown
```

Control keywords:
- `done @value` - Terminate and return value
- `continue @value` - Next iteration with new state

While context (`@mx.while`):
- `iteration` - Current iteration (1-based)
- `limit` - Configured cap
- `active` - true when inside while loop

### Operators

Comparison: `<`, `>`, `<=`, `>=`, `==`, `!=`
Logical: `&&`, `||`, `!`
Ternary: `condition ? trueVal : falseVal`

```mlld
var @access = @score > 80 && @verified ? "granted" : "denied"
var @status = @isAdmin || (@isMod && @active) ? "privileged" : "standard"
```

### Comments

End-of-line comments with `>>` or `<<`:

```mlld
>> Start-of-line comment
var @name = "Alice"    >> end-of-line comment
show @greeting         << also end-of-line
```

### Reserved Variables

Special built-in variables:

```mlld
@now  >> current timestamp
@input  >> environment variables (must be allowed)
@root  >> project root path (preferred)
@base  >> project root path (alias for @root)
@debug  >> debug information
```

### Truthiness

Conditions evaluate to false for: `null`, `undefined`, `""`, `"false"`, `"0"`, `0`, `NaN`, `[]`, `{}`

All other values — including non-empty strings, non-zero numbers, and non-empty arrays/objects — are truthy.

### Undefined Variables

Behavior depends on context:

| Context | Behavior |
|---|---|
| Template interpolation (`` `@var` ``, `::@var::`) | Preserves literal text `@varName` in output |
| Conditional omission (`@var?`) | Omits silently (empty string) |
| Null coalescing (`@var ?? default`) | Uses fallback value |
| Conditions (`if`, `when`, expressions) | Evaluates as `undefined` (falsy) — no error |
| `show @var` | Error: `Variable not found: @var` |
| `var @x = @undefined` | Error: `Variable not found: @undefined` |
| Function arguments `@fn(@undefined)` | Error: `Undefined variable '@x' passed to function @fn` |
| Object/array literal values | Error: `Variable not found: @var` |
| Pipeline function | Error: `Pipeline function '@name' is not defined` |

In templates, undefined variables pass through as literal text. This means `@exists(@outPath)` in a template doesn't call a function — it produces the string `@exists(@outPath)`, which is truthy. Use `@val | @exists` (pipeline) or `@val.isDefined()` (method) to test whether a value exists.

### Data Structures

Complex nested structures:

```mlld
var @config = {
  "database": {
    "host": "localhost",
    "ports": [5432, 5433]
  },
  "features": ["auth", "api", "cache"]
}

show @config.database.host  >> "localhost"
show @config.database.ports[0]  >> 5432
show @config.features[1]  >> "api"
```

Object spread:

```mlld
var @base = {"host": "localhost", "port": 3000}
var @prod = { ...@base, "port": 443 }    >> override port
```

## Code Execution Languages

mlld supports multiple languages for code execution, each with different isolation levels and capabilities.

### Language Comparison

| Language | Syntax | Isolation | Use Case |
|----------|--------|-----------|----------|
| `cmd` | `cmd { echo hello }` | Subprocess | Single-line shell commands with pipes |
| `sh` | `sh { ... }` | Subprocess | Multi-line scripts with control flow |
| `bash` | `bash { ... }` | Subprocess | Bash-specific features |
| `js` | `js { return x + 1 }` | None (in-process) | Fast calculations, no require() |
| `node` | `node { require('fs')... }` | VM context | Full Node.js API, isolated |
| `py`/`python` | `py { print(x) }` | Subprocess | Python libraries, data science |

### JavaScript vs Node.js

```mlld
>> JavaScript (in-process, fast, no require())
exe @double(n) = js { return n * 2 }
exe @upper(s) = js { return s.toUpperCase() }

>> Node.js (VM-isolated, full API)
exe @readFile(path) = node {
  const fs = require('fs');
  return fs.readFileSync(path, 'utf8');
}
exe @hash(text) = node {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}
```

### Python Execution

Python code runs in a subprocess via `python3`. Use `print()` to return values.

```mlld
>> Basic Python
exe @add(a, b) = py { print(int(a) + int(b)) }
exe @square(x) = py {
result = int(x) ** 2
print(result)
}

>> Standard library access
exe @parseJson(data) = py {
import json
obj = json.loads(data)
print(json.dumps(obj, indent=2))
}

>> Multi-line with variables
var @numbers = [1, 2, 3, 4, 5]
exe @sumList(items) = py {
import json
nums = json.loads(items)
print(sum(nums))
}
show @sumList(@numbers)  >> 15
```

### Shadow Environments

Expose helper functions to all code blocks of a language:

```mlld
>> Define helpers
exe @double(n) = js { return n * 2 }
exe @triple(n) = js { return n * 3 }

>> Expose to all js blocks
exe js = { double, triple }

>> Now all js blocks can use them
var @result = js { double(5) + triple(3) }  >> 19
```

Shadow environments work with `js`, `node`, and `py`/`python`:

```mlld
>> Python shadow environment
exe @greet(name) = py { print(f"Hello, {name}!") }
exe @shout(text) = py { print(text.upper()) }
exe py = { greet, shout }

run py {
greet("World")
shout("mlld rocks")
}
```

## Module System

Create modules with frontmatter:

```yaml
---
name: my-helpers
author: myorg
version: 1.0.0
about: Utility functions
---
```

Export functions:

```mlld
exe @formatDate(date) = run {date -d "@date" "+%Y-%m-%d"}
exe @validate(data) = js { return data.valid === true }
```

## Reference

### Execution Contexts

Where interpolation applies:

| Context | Syntax | Example |
|---------|---------|---------|
| Backticks | `@var` | `` `Hello @name` `` |
| Double-colon | `@var` | `::Use @command here::` |
| Commands | `@var` | `{echo "@msg"}` |
| Double quotes | `@var` | `"Hi @name"` |
| Single quotes | `'@var'` | `'Hi @name'` (literal) |
| Directives | `@var` | `show @greeting` |

### Built-in Transformers

Data formats:
- `@parse`: JSON parse (relaxed JSON5 syntax by default)
- `@parse.strict`: JSON parse (strict syntax only)
- `@parse.loose`: JSON parse (explicit relaxed JSON5)
- `@parse.llm`: extract JSON from LLM responses (code fences, prose); returns `null` if no JSON found
- `@parse.fromlist`: convert plain text list (one item per line) to JSON array
- `@json`: deprecated alias for `@parse`
- `@xml`: XML parse/format
- `@csv`: CSV parse/format
- `@md`: Markdown formatting

Text transforms:
- `@upper`: convert text to uppercase
- `@lower`: convert text to lowercase
- `@trim`: remove leading and trailing whitespace
- `@pretty`: pretty-print JSON with indentation
- `@sort`: sort array elements, object keys, or text lines alphabetically

Inspection:
- `@typeof`: get type information (`"simple-text"`, `"array (3 items)"`, `"object (2 properties)"`, `"primitive (boolean)"`, etc.)
- `@exists`: returns true when the piped expression is non-empty (tests that a value exists, not file existence — see `@fileExists`)
- `@fileExists`: returns true when the piped value is a path to an existing file on disk

### File Metadata Fields

- `content`: file contents (default)
- `filename`: filename only
- `relative`: relative path
- `absolute`: absolute path
- `tokens`: approximate token count
- `fm`: frontmatter object
- `json`: parsed JSON (for .json files)

### URL Metadata Fields

All file fields plus:
- `url`: original URL
- `domain`: domain name
- `title`: page title
- `description`: meta description
- `html`: raw HTML
- `text`: extracted text
- `md`: converted markdown
- `headers`: HTTP headers
- `status`: HTTP status code
- `contentType`: content type
