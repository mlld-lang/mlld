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
```

Access object properties and array elements:

```mlld
var @userName = @user.name  >> "Alice"
var @firstItem = @items[0]  >> "apple"
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
```

Multi-line commands with `run sh`:

```mlld
run sh {
  npm test && npm run build
  echo "Build completed"
}
```

### Working directory (`:path`)

```mlld
run cmd:/ {pwd}
```

Output:
```
/
```

Paths must be absolute (for example `/tmp`, `/var/log`, `/`). Relative paths, `~`, or Windows-style paths fail. Executables accept the same suffix when you need to parameterize it:

```mlld
exe @list(dir) = cmd:@dir {pwd}
run @list("/")
```

`sh`, `bash`, `js`, `node`, and `python` accept the same `:/abs/path` suffix. JavaScript and Node switch `process.cwd()` to the provided directory before running code.

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
var @llm = { model: "claude-3", skillName: "prose" }
exe @summarize(text) = prose:@llm { summarize @text }      << inline interpolates
exe @review(code) = prose:@llm "./review.prose"            << .prose = no interpolation
exe @greet(name) = prose:@llm "./greet.prose.att"          << .prose.att/.mtt interpolate

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

Aliases like `<doc.md>.filename` still resolve to `.mx.filename`, but `.mx` is the preferred namespace.

Glob patterns:

```mlld
var @allDocs = <docs/*.md>
var @toc = <docs/*.md> as "- [<>.mx.fm.title](<>.mx.relative)"
```

### Imports (`import`)

Import from modules (modules should declare `export { ... }` to list public bindings; the auto-export fallback for modules without manifests is still supported for now):

```mlld
import { @sortBy, @unique } from @mlld/array
import @company/utils as @utils
```

Import from files:

```mlld
import { @helper } from "./utils.mld"
import { @config } from "@base/config.mld"
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

When omitted, mlld infers the safest option: registry references behave as `module`, files as `static`, URLs as `cached`, `@input` as `live`, `@base`/`@project` as `static`, and `@local` as `local`. The identifier after `as` uses an `@` prefix in source code; mlld strips the prefix internally when referring to the namespace. If the keyword and source disagree (for example, `cached` on a relative path), the interpreter raises an error before evaluation.

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

Array methods:

```mlld
var @fruits = ["apple", "banana", "cherry"]
show @fruits.includes("banana")  >> true
show @fruits.indexOf("cherry")  >> 2
show @fruits.length()  >> 3
show @fruits.join(", ")  >> "apple, banana, cherry"
```

String methods:

```mlld
var @text = "Hello World"
show @text.includes("World")  >> true
show @text.indexOf("W")  >> 6
show @text.toLowerCase()  >> "hello world"
show @text.toUpperCase()  >> "HELLO WORLD"
show @text.trim()  >> removes whitespace
show @text.startsWith("Hello")  >> true
show @text.endsWith("World")  >> true
show @text.split(" ")  >> ["Hello", "World"]
```

### Pipelines

Chain operations with `|`:

```mlld
var @result = run {cat data.json} | @json | @csv
var @processed = @data | @validate | @transform
```

Built-in transformers:
- `@json`: parse/format JSON, accepting relaxed JSON syntax (single quotes, trailing commas, comments). Use `@json.strict` to require standard JSON, `@json.loose` to be explicit about relaxed parsing, or `@json.llm` to extract JSON from LLM responses (code fences, prose). Returns `false` if no JSON found.
- `@xml`: parse/format XML
- `@csv`: parse/format CSV
- `@md`: format as Markdown

Pipeline context variables:
- `@mx.try`: current attempt number
- `@mx.stage`: current pipeline stage
- `@mx.errors`: array of errors from parallel operations (for loops or pipeline groups); error markers: `{ index, key?, message, error, value }`
- `@p[0]`: pipeline input (original/base value)
- `@p[1]` … `@p[n]`: outputs from completed stages (as `StructuredValue` wrappers)
- `@p[-1]`: previous stage output; `@p[-2]` two stages back
- `@p.retries.all`: history of retry attempts across contexts
- Pipeline outputs have `.text` (string) and `.data` (structured) properties. Display uses `.text` automatically.

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
@base  >> project root path
@debug  >> debug information
```

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
module: @myorg/helpers
description: Utility functions
version: 1.0.0
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

- `@json`: JSON parse/stringify
- `@xml`: XML parse/format
- `@csv`: CSV parse/format  
- `@md`: Markdown formatting

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
