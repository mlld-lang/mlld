# mlld Gotchas

Things that will bite you when writing orchestrators.

## Variable basics

### `var` vs `let`

`var` is module-level, immutable. `let` is block-scoped, mutable.

```mlld
var @config = "global"         >> immutable, available everywhere
if true [
  let @temp = "local"          >> block-scoped, only exists here
  let @temp = "reassigned"     >> ok — let is mutable within its block
]
>> @temp is not accessible here
```

`var` inside blocks is a parse error. Use `let`.

### `exe` vs `var`

`exe` defines a callable function. `var` holds a value.

```mlld
exe @greet(name) = `Hello @name`       >> function — call with @greet("world")
var @greeting = @greet("world")        >> value — stores "Hello world"
```

### Reserved variable names

Names like `@exists`, `@upper`, `@debug`, `@base`, `@now`, `@json` are reserved by the system. You'll get "already defined" errors on first use with no hint it's a built-in. Use descriptive names: `@fileCheck` not `@exists`, `@dumped` not `@debug`.

## Output

### `show` — stdout

`show` outputs to stdout. Use it for user-visible results.

```mlld
show `Found @results.length items`
```

### `| log` — stderr

Append `| log` to any LLM function call to get output on stderr for debugging.

```mlld
var @response = @claudePoll(@prompt, "sonnet", "@root", @tools, @outPath) | log
```

## Shell execution: `cmd` vs `sh`

`cmd` uses `@var` interpolation (mlld syntax). `sh` uses `$var` and you pass values in.

```mlld
>> cmd: @variables interpolated directly
exe @list(dir) = cmd { ls -la "@dir" }

>> sh: shell variables, pass params as $1, $2...
exe @list(dir) = sh { ls -la "$dir" }
```

Use native variable syntax in `js`, `node`, `sh`, `py` blocks — pass mlld values in as parameters.

```mlld
exe @double(x) = js { return x * 2 }        >> x is a js param, not @x
exe @count(dir) = sh { ls "$dir" | wc -l }   >> $dir is a shell param
```

### `cmd` rejects shell operators

`cmd { }` only allows simple single commands. Shell operators like `>`, `<`, `2>/dev/null`, `&&`, `||`, `;` are all rejected. Use `sh { }` for anything that needs real shell syntax.

```mlld
>> WRONG: cmd rejects redirections
exe @count(dir) = cmd { ls "@dir" 2>/dev/null | wc -l }

>> RIGHT: use sh for shell features
exe @count(dir) = sh { ls "$dir" 2>/dev/null | wc -l }
```

## Conditionals: `if` vs `when`

```
if @cond [block]                 Run block when true (side effects)
when @cond => value              Return value when true (expression)
when @val ["a" => x; * => y]    Pattern match against value
when [c1 => v1; c2 => v2]       First-match conditional expression
```

`if` runs blocks (side effects). `when` returns values (expressions). Don't mix them up.

## The `.mx` namespace

Every loaded value has metadata at `.mx`:

```mlld
var @files = <src/**/*.ts>
show `@files.0.mx.filename`     >> "index.ts"
show `@files.0.mx.absolute`     >> "/Users/you/project/src/index.ts"
show `@files.0.mx.relative`     >> "./src/index.ts"
show `@files.0.mx.tokens`       >> token count
```

In for loops: `@item.mx.loop.iteration`, `@item.mx.loop.index`.

Other keys: `.mx.keys` (object keys), `.mx.dirname`, `.mx.source`.

## Path resolution

### `@base` and `@root` are project root

`@base` and `@root` both resolve to the project root (the directory containing `mlld-config.json`), not the CWD or the script's directory. `@root` is preferred in new code.

```mlld
var @runDir = `@root/runs/@today`   >> /project/root/runs/2026-02-10
```

To create a new addressable project root (e.g. in a test directory), run `mlld init` there.

### Relative paths resolve from the script file

Relative paths in `output`, `append`, and file loading resolve from the script or template file's own directory. Alligator paths (`<file>`) inside `.att` template files resolve from the template file's directory.

### Escaping dots in constructed paths

`@var.ext` looks like field access. Escape the dot:

```mlld
let @outPath = `@runDir/reviews/@filename\.json`   >> correct
let @outPath = `@runDir/reviews/@filename.json`    >> WRONG: accesses .json field
```

### Escaping `@`

Double it: `@@` produces a literal `@`.

## Templates

### `.att` files use `@` syntax

Template files (`.att`) work exactly like mlld backtick template strings — `@var` interpolation, embedded `<file.md>` loads. Unlike backtick templates, you can use backticks inside them.

```
You are reviewing @file.

<@file>
@fileContent
</@file>
```

### Templates stringify objects automatically

If you pass an object to a template parameter, it gets JSON-stringified. No need for manual serialization.

### JSON from cmd/sh auto-parses

If a `cmd` or `sh` block returns a string that looks like JSON, mlld turns it into an object. If you need the raw string, be aware of this.

## Known sharp edges

### Runtime errors in for-loops become data

Errors inside `for` loop bodies get silently packaged as `{__error: true, __message: '...'}` objects. The loop continues. Always check results for error objects if your loop body can fail.

### Bare function calls need `run`

Side-effect-only function calls at top level need the `run` keyword:

```mlld
>> WRONG: "Text content not allowed in strict mode"
@save(@data)

>> RIGHT:
run @save(@data)
```

### Complex inline expressions hit parse boundaries

Ternaries containing `for`, nested function calls as arguments, and other compound expressions can fail to parse without a clear error. Break them into separate assignments.

```mlld
>> WRONG: ternary with inline for fails to parse
var @filtered = @cond ? for @a in @list when @a.name => @a : @list

>> RIGHT: use exe with when
exe @filterItems(items, cond) = when [
  @cond => for @a in @items when @a.name => @a
  * => @items
]
var @filtered = @filterItems(@list, @cond)
```

### Conditional iteration: don't gate `for` with `when`

Using `for ... when @staticCond [block]` where the condition doesn't reference the iteration variable is ambiguous. Pre-filter to an empty list instead.

```mlld
>> WRONG: ambiguous — is when a per-item filter or a block gate?
var @results = for parallel(8) @item in @list when @shouldRun [
  => @process(@item)
]

>> RIGHT: pre-filter the list
var @items = @shouldRun ? @list : []
var @results = for parallel(8) @item in @items [
  => @process(@item)
]
```
