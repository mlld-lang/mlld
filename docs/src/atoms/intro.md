---
id: intro
qa_tier: 1
title: Introduction to mlld
brief: What mlld is, mental model, and key concepts
category: intro
tags: [overview, quickstart, mental-model, gotchas]
related: [gotchas, labels-overview, security-policies, security-guards-basics]
updated: 2026-04-12
---

## Essential Commands

```
mlld howto                 Browse all documentation topics
mlld howto <keyword>       Search by keyword (searches tags, titles, briefs)
mlld howto grep <pattern>  Full-text search across all docs
mlld validate <dir>        Validate all mlld files in a directory (recommended)
mlld validate <file>       Validate a single file
```

---

mlld is an LLM scripting language for **surgical context assembly**, **token-efficient orchestration**, and **secure agent workflows**.

## What mlld Does

**1. Surgical Context Assembly**

Load exactly what you need, when you need it. Glob files, extract sections, filter by metadata, transform content — all with declarative syntax.

```mlld
var @relevantDocs = <docs/**/*.md # API, "SDK Usage"; !# Internal>
exe @releaseNotes(version) = <CHANGELOG.md # "[@version]" >
```

mlld makes context preparation explicit, reviewable, and reproducible.

**2. Token-Efficient Logic-Focused Orchestration**

Mix shell, JavaScript, Python, and prompts in a single script. Route data based on conditions. Parallelize LLM calls. Build orchestrators that are readable as documentation and executable as code.

```mlld
exe @reviewCode(file) = template "review.att"

var @files = <src/**/*.ts>
var @reviews = for parallel(10) @f in @files [
  => @reviewCode(@f.mx.relative)
]
```

Decision logic stays in your script. LLMs do what they're good at: reading, writing, analyzing. The orchestrator routes their work.

**3. Secure Agent Workflows**

Defend against prompt injection by enforcing what data can flow where, regardless of LLM intent. Labels track data provenance automatically. Policies block dangerous flows. Guards inspect and transform operations.

```mlld
policy @p = {
  defaults: { rules: ["no-secret-exfil"], unlabeled: "untrusted" },
  labels: { secret: { deny: ["op:show", "exfil"] } }
}

var secret @data = <@private/customer-list.txt>
>> LLM can be tricked into trying to exfil @data
>> But label flow rules block it before execution
```

See `mlld howto security` for comprehensive prompt injection defense strategies.

## Richly featured, many examples

mlld is very full-featured for creating LLM workflows. It *should* be possible to do most things you'd want to do natively in mlld, but you can also fallback to python or javascript or shell scripts *inside* mlld.

Before using a js/python fallback, search the docs: mlld PROBABLY solved it already. This matters for correctness, not just style — crossing into JS/Python strips all metadata (labels, factsources, handles). A value that round-trips through JS loses its proof trail and will fail downstream security checks. Native mlld preserves metadata automatically.

Use the `mlld` skill (installed with `mlld skill install`) and see the examples included with the skill.

## Two Syntax Modes

**.mld files (strict mode)** - Default for scripts
- Bare directives: `var @x = 1` (no slash prefix)
- Text lines are errors (catches accidental output)

**.md files (markdown mode)** - For literate scripts
- Slash prefix required for directives: `/var @x = 1`
- Text lines become content output

```mlld
>> Strict mode (.mld)
var @name = "Alice"
show `Hello @name!`

>> Markdown mode (.md) - same with slashes
/var @name = "Alice"
/show `Hello @name!`
```

## Key Concepts

**Directives** - Commands: `var`, `show`, `run`, `if`, `for`, `when`, `import`, `export`, `guard`, `policy`, `hook`, `checkpoint`

**Variables** - Always `@` prefixed: `@name`, `@data`, `@result`

**Templates** - Backticks or triple-colons for interpolation

```mlld
var @greeting = `Hello @name!`
var @alt = ::Hello @name!::
```

**File loading** - Angle brackets load content: `<README.md>`, `<src/*.ts>`

**Pipelines** - Chain transformations: `@data | @parse | @validate`

**Executables** - Reusable functions: `exe @greet(name) = `Hello @name!``

**Modules** - Import/export: `import { @helper } from @corp/utils`

**Records** - Declare data shapes with facts/data classification; first-class values that can be imported, passed as parameters, and used for coercion statically (`=> contact`) or dynamically (`=> record @schema`, `@value as record @schema`)

**Security** - Labels + policies + guards = prompt injection defense

**Hooks** - Lifecycle observers: `hook after op:named:fn = [...]` for logging, telemetry, transforms

**Checkpoint** - Auto-caches `llm`-labeled exe results; `--resume` re-runs selectively

## Gotchas

### Coming from JS/Python

mlld is its own language — don't assume JS/Python syntax works. Common mistakes:

- **No `else if`** — use `when` for multi-branch matching, or nest `if` blocks: `if @a [...] else [ if @b [...] ]`
- **No array spread in literals** — use `.concat()`: `var @combined = @arr1.concat(@arr2)`
- **Object spread materializes plain data** — `{ ...@value }` makes a fresh plain object and drops wrapper metadata/identity. Use field access or pass the value directly when labels, factsources, or tool-collection identity matter.
- **Computed object keys are native** — `{ [@key]: @value }` resolves `@key` at runtime and preserves metadata on `@value`. No JS needed: `var @obj = for @k, @v in @source => { [@k]: @v }`
- **No methods on literals** — assign first: `var @s = "hello"` then `var @up = @s.toUpperCase()`
- **No standalone boolean flags** — use `--flag true` not `--flag` (all CLI payload flags need values)
- **Executable identifiers in templates render as `(executable: name)`.** A template like `` `calling @claude` `` interpolates `@claude` as `(executable: claude)`, not as the literal string `@claude`. Same for any `exe`-bound name. Use backticks around just the literal portion (`` `calling ` + "@claude" ``), escape the `@` (`` `calling \@claude` ``), or pick a different debug label.

mlld has familiar built-in JS methods. See `mlld howto builtins` for the full list.

Loaded files are rich objects, not strings. Frontmatter is already parsed (@file.mx.fm.title), metadata is available (@file.mx.tokens, @file.mx.filename). Check `mlld howto file-loading-metadata` before writing js/node blocks for file processing.

### JS/Python data boundary

mlld values are `StructuredValue` wrappers carrying `.text`, `.data`, and `.mx` (metadata). When values cross into `js {}` or `py {}` blocks, the runtime auto-unwraps them to `.data`:

- **JS/Node/Python receives raw data, not StructuredValues.** A JSON object becomes a plain JS object. A string becomes a string. `.mx` metadata (labels, taint, factsources) is NOT available inside the block.
- **Auto-unwrap erases labels AND factsources.** A value that crosses a `js {}` or `py {}` boundary loses both its label metadata (`untrusted`, `secret`, `fact:@contact.email`) and its `factsources` provenance trail. If the value re-enters mlld through the JS return, it comes back as a fresh value with no fact proof — downstream positive checks like `no-send-to-unknown` will deny it. The boundary is the most common proof-loss vector.
- **Return native objects, not JSON strings.** `return { foo: bar }` — not `return JSON.stringify({ foo: bar })`. mlld handles the conversion. Callers should NOT need `| @parse` on JS exe output.
- **`JSON.stringify` inside JS erases mlld metadata.** If you serialize and parse within JS, label metadata and proof are lost. Work with values as-is.
- **Handle wrappers pass through as plain objects.** `{ handle: "h_xxx" }` enters JS as a normal object with one key. Don't special-case it. Don't resolve it. If you need handle-aware logic, do it in mlld, not JS.
- **Need `.mx` in JS?** Use `.keep` on the value before passing it as a parameter. This preserves the full StructuredValue wrapper, so JS can access `.mx` for metadata (labels AND factsources) and `.data` for the content. Note this changes the interface — JS code must read `.data` explicitly instead of receiving raw data directly. `.keep` is the canonical accessor for inspecting factsources or passing a fact-bearing value through a JS helper without losing its proof.
- **`.keep` is only for embedded-language boundaries.** It is not the mlld-to-mlld preservation mechanism. Regular mlld reads already use wrapper-preserving field access where needed, while object spread and other plain-data boundaries intentionally materialize.
- **Reserved identifiers can collide with your JS locals.** Names like `mx` are injected into the JS scope by the runtime. If you write `const mx = ...` in a `js {}` block you'll see `Identifier 'mx' has already been declared` — rename your local to something else.

### Prefer native mlld over JS/Python for data reshaping

The most common reason developers drop to JS is reshaping data — iterating over object keys, mapping arrays, transforming structures. mlld handles all of these natively, and native constructs preserve metadata:

```mlld
>> Object key-value iteration (replaces Object.entries)
var @prices = { "Hotel A": "$100", "Hotel B": "$200" }
var @records = for @name, @price in @prices => { name: @name, price: @price }

>> Object metadata access
show @prices.mx.keys       >> ["Hotel A", "Hotel B"]
show @prices.mx.values     >> ["$100", "$200"]
show @prices.mx.entries    >> [["Hotel A", "$100"], ["Hotel B", "$200"]]

>> Key access inside single-variable iteration
for @val in @prices => show `@val.mx.key: @val`

>> Array mapping (replaces Array.map)
var @names = ["alice", "bob"]
var @users = for @n in @names => { name: @n }

>> String splitting (replaces String.split in JS)
var @lines = @raw.split("\n")
var @items = for @line in @lines when @line.trim() => @line.trim()
```

**Rule of thumb:** if you're writing `js { return Object.entries(...).map(...) }`, rewrite it as `for @k, @v in @obj => { ... }`. The result is shorter AND preserves labels and factsources.

Reserve `js {}` / `py {}` for operations mlld genuinely cannot do: complex math, regex with capture groups, calling external libraries. Dynamic object keys already work natively:

```mlld
var @obj = { [@key]: @value }
```

Bracket object keys evaluate the expression inside `[]` at runtime and preserve labels and factsources on `@value`.

### Returns are always explicit

mlld never implicitly returns the last expression. Use `=>` to return a value from any block:

```mlld
exe @greet(name) = [
  let @msg = `Hello @name`
  => @msg                      >> without =>, exe returns nothing
]

var @plan = box [
  @claude("Plan the next step") >> side effect — box ignores it
  => @claude("Plan the next step") >> returns the result
]
```

Without `=>`:
- An exe returns nothing
- A box returns its workspace object (for file inspection via `<@ws/path>`)

This catches people who expect the last expression to be the return value. It's not — `=>` is the only way to return.

**Use `>>` for comments, not `//`**

Labels are comma-separated: `var secret,pii @data = "x"`

`var` is module-level and immutable, `let` is block-scoped and mutable. Use `var` at module scope, `let` inside `for` / `if` / `when` / exe bodies. They are not interchangeable — each errors in the other position.

```mlld
var @config = "global"
let @global = "x"        >> WRONG: let not allowed at module scope

if true [
  let @temp = "local"    >> correct
  var @temp = "local"    >> WRONG: var not allowed in blocks
]
```

To accumulate or count inside a loop, declare the container with `var` at module scope and mutate it with `let +=` inside the block. Read the result back at module scope:

```mlld
var @passes = []
var @fails = []
for @r in @results [
  if @r.ok [ let @passes += [@r] ]
  else [ let @fails += [@r] ]
]
var @passCount = @passes.length    >> count by reading .length, not by += on a number
```

`var @count += 1` inside a loop does not work — `var` is module-only and immutable. The container-and-length pattern above is the idiom.

`var` can be labeled, `let` cannot be labeled. This is because labels get taint-tracked (taint tracking on a mutable object is a nightmare). Design your variable usage accordingly; use `exe` to create abstractions at top level which can also be labeled.

`if` vs `when`
```
if @cond [block] else [block]                  >> Run block if true
when @cond => value                            >> Select first match
when [cond => val; * => default]               >> First-match list
when @val ["a" => x; * => y]                   >> Match value against patterns
```

`run` is a value, not a process-control statement. `run sh { exit 1 }` produces a result with a non-zero `exit_code`; it does NOT make the script exit non-zero. The CLI exits 0 unless `/bail` (or an unhandled error) fires. To make a failed shell command fail the script — for test rigs, CI checks, etc. — use `/bail`:

```mlld
var @r = run sh { exit 1 }
when @r.exit_code != 0 => bail "shell step failed"
```

`cmd` interpolates `@variables`. Pipes work, but `>`, `&&`, `;`, `2>/dev/null` are rejected. Use `sh` for full shell syntax.
```mlld
exe @safe() = cmd { ls -la }                   >> correct: simple command
exe @piped() = cmd { ls -la | head -5 }        >> correct: pipes work in cmd
exe @redirect() = cmd { ls > out.txt }         >> WRONG: cmd rejects >, &&, ;
exe @shell() = sh { ls > out.txt 2>/dev/null } >> correct: sh allows all shell syntax
```

Use native variable syntax in `js`, `node`, `sh`, `py` blocks — pass mlld values as parameters.

| Block | mlld vars | Native vars | Comments |
|------|-----------|-------------|----------|
| `cmd` | `@name` | n/a | mlld interpolation |
| `sh` | not available | `$name` | exe params become shell vars |
| `js` | not available | `paramName` | exe params are JS locals |
| `py` | not available | `paramName` | exe params are Python locals |

Angle brackets `<>` in templates and expressions
```mlld
var @html = `<div>Hello</div>`                 >> properly interprets as text bc no slashes/dots/vars
var @template = `File contents: <file.md>`     >> interpolates full content of file.md in template value
var @readme = <README.md>                      >> loads file
var @files = <src/**/*.ts>                     >> glob pattern
var @files = <@pathvar/file.ts>                >> variable usage
```
`<@var>` always triggers file loading. For text output, use `@var` directly.

See `mlld howto file-loading-basics` for advanced usage.

**Hyphens are valid in identifiers**: `@prefix-alpha` is one variable name, not `@prefix` minus `alpha`. If you need subtraction, use spaces: `@a - @b`.

`@var.json` is field access. Escape the dot for file extensions: `@name\.json`.

```mlld
let @out = `@dir/@name\.json`          >> correct
let @out = `@dir/@name.json`           >> accesses .json field
```

`\@` produces a literal `@`: `user\@example.com` outputs `user@example.com`.

Errors in `for parallel` loops become data objects with `.error` and `.message` fields. The loop continues. Regular (non-parallel) `for` loops throw on error.

```mlld
var @results = for parallel(4) @item in @list [ => @process(@item) ]
var @failures = for @r in @results when @r.error => @r
```

`@exists(@var)` checks if the *variable* is defined. `@fileExists(@var)` checks if the *file at that path* exists.

`[]` and `{}` are falsy in mlld

`==` compares structurally for arrays and objects: `{x: 1} == {x: 1}` and `[1, 2] == [1, 2]` are both true. Recurses into nested values.

**Reserved variables**: `@root`, `@base`, `@now`, `@input`, `@payload`, `@state`, `@debug`, `@keychain`, `@fm`, `@mx`, `@p`

**Reserved field accessors**: `.mx`, `.raw`. These resolve to the system-owned StructuredValue namespace at every level of the value hierarchy, not to user fields. A user object `{ raw: "hello" }` reads as blank via `@obj.raw` — use bracket access (`@obj["raw"]`) or pick a different field name. `.text` and `.data` fall back to user data when present, so they're safe as user field names.

**Built-in transformers** (pipes: `@data | name`): `@parse` (`.strict`, `.loose`, `.llm`, `.fromlist`), `@xml`, `@csv`, `@md`, `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`

**Built-in functions**: `@exists(@var)`, `@fileExists(@path)`, `@typeof(@var)`

## Key Syntax

Common patterns for quick reference. See topic-specific `mlld howto` pages for details.

```mlld
>> Variables and templates
var @name = "Alice"
var @greeting = `Hello @name!`
var @list = ["a", "b", "c"]
var @obj = { key: "value", ...@other }

>> File loading
var @content = <README.md>              >> load file
var @optional = <config.json>?          >> null if missing
var @files = <src/**/*.ts>              >> glob (returns array)

>> Functions
exe @greet(name) = `Hello @name!`
exe @prompt(ctx) = template "prompt.att"
exe @run(dir) = cmd { ls @dir }
exe @check(path) = @exists(@path)

>> Method chains (see `mlld howto builtins`)
var @trimmed = @raw.trim().split("\n")
var @slug = @name.replaceAll("/", "-")
var @upper = @text.toLowerCase().startsWith("hello")

>> Parallel loops
var @results = for parallel(10) @file in @files [
  => @process(@file)
]

>> Pipes
var @data = @text | @parse              >> parse JSON
var @data = @text | @parse.llm          >> extract JSON from LLM output
```

**Path resolution**: `<@file>` resolves from the current script's directory, not the project root. Use `@root` for absolute paths: `<@root/@file>`. This matters when `cmd` output gives project-root-relative paths but your script is in a subdirectory.

## Built-ins at a Glance

**Reserved variables**: `@root`, `@base`, `@now`, `@input`, `@payload`, `@state`, `@debug`, `@keychain`, `@fm`, `@mx`, `@p`

**Transformers** (pipes: `@data | name`): `@parse` (`.strict`, `.loose`, `.llm`, `.fromlist`), `@xml`, `@csv`, `@md`, `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`

**Functions** (call-style): `@exists(@var)`, `@fileExists(@path)`, `@typeof(@var)`

**Helpers**: `@keep`, `@keepStructured`

**String methods**: `.length`, `.includes()`, `.indexOf()`, `.startsWith()`, `.endsWith()`, `.toLowerCase()`, `.toUpperCase()`, `.trim()`, `.split()`, `.slice()`, `.substring()`, `.replace()`, `.replaceAll()`, `.match()`, `.padStart()`, `.padEnd()`, `.repeat()`

**Array methods**: `.length`, `.includes()`, `.indexOf()`, `.join()`, `.slice()`, `.concat()`, `.reverse()`, `.sort()`

**Type checks**: `.isArray()`, `.isObject()`, `.isString()`, `.isNumber()`, `.isBoolean()`, `.isNull()`, `.isDefined()`

See `mlld howto builtins` for full reference with examples.

## Next Steps

- `mlld howto syntax` — variables, templates, file loading
- `mlld howto control-flow` — if, when, for, foreach
- `mlld howto security` — labels, policies, guards
- `mlld howto modules` — import, export, organizing code
