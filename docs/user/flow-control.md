# Control Flow

## tldr

mlld provides three control flow mechanisms: **conditionals** (`/when`), **iteration** (`/for` and `foreach`), and **pipelines** (`|`). Use `/when` for decisions, `/for` for actions per item, `foreach` for transforming collections, and pipelines for chaining transformations with retry logic.

## Conditionals

### Basic When

Use `/when` with `=>` for simple conditionals:

```mlld
/var @score = 85
/when @score > 80 => show "Excellent work!"
```

### When First (Switch-Style)

Use `/when first` to stop at the first matching condition:

```mlld
/var @role = "admin"
/when first [
  @role == "admin" => show "✓ Admin access granted"
  @role == "user" => show "User access granted"
  * => show "Access denied"
]
```

The `*` wildcard matches anything (catch-all). Use `none` when no conditions matched:

```mlld
/var @status = "unknown"
/when first [
  @status == "active" => show "Service running"
  @status == "inactive" => show "Service stopped"
  none => show "Unknown status"
]
```

### When All (Bare Form)

Without `first`, all matching conditions execute:

```mlld
/var @score = 95
/when [
  @score > 90 => show "Excellent!"
  @score > 80 => show "Above average!"
  @score == 95 => show "Perfect score!"
]
```

Output:
```
Excellent!
Above average!
Perfect score!
```

### Executable When Patterns

Use `/exe...when` to create value-returning conditional functions:

```mlld
/exe @classify(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  @score >= 70 => "C"
  * => "F"
]

/var @grade = @classify(85)
/show @grade
```

Output:
```
B
```

Complex conditions with operators:

```mlld
/var @tokens = 1200
/var @mode = "production"
/when (@tokens > 1000 && @mode == "production") => show "High usage alert"

/var @role = "editor"
/var @isActive = true
/when (@role == "admin" || @role == "editor") && @isActive => show "Can edit"
```

## Iteration

### For Loops

Use `/for` to execute actions for each item:

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/for @fruit in @fruits => show `Fruit: @fruit`
```

Output:
```
Fruit: apple
Fruit: banana
Fruit: cherry
```

### Object Iteration with Keys

When iterating objects, access keys with `_key`:

```mlld
/var @config = {"host": "localhost", "port": 3000}
/for @value in @config => show `@value_key: @value`
```

Output:
```
host: localhost
port: 3000
```

### Nested Loops

Chain multiple `/for` loops for nested iteration:

```mlld
/for @x in ["red", "blue"] => for @y in [1, 2] => for @z in ["a", "b"] => show "@x-@y-@z"
```

Output:
```
red-1-a
red-1-b
red-2-a
red-2-b
blue-1-a
blue-1-b
blue-2-a
blue-2-b
```

### Collection Form

Use `for` (without `/`) to collect results into an array:

```mlld
/var @numbers = [1, 2, 3, 4]
/var @doubled = for @n in @numbers => js { return @n * 2 }
/show @doubled
```

Output:
```
[2, 4, 6, 8]
```

### Parallel /for

Run iterations in parallel with an optional per-loop cap and pacing between starts. Use the directive form for side effects (order may vary) or the collection form for ordered results.

```mlld
/exe @upper(s) = js { return String(s).toUpperCase() }

# Directive form (streams as done; order not guaranteed)
/for parallel @x in ["a","b","c","d"] => show @x

# Cap override and pacing between task starts
/for (2, 1s) parallel @n in [1,2,3,4] => show `Item: @n`

# Collection form (preserves input order)
/var @res = for 2 parallel @x in ["x","y","z"] => @upper(@x)
/show @res
```

Output (collection form):
```
["X","Y","Z"]
```

### Foreach Transforms

Use `foreach` to transform collections with templates or executables:

```mlld
/var @names = ["Alice", "Bob", "Charlie"]
/exe @greeting(name) = :::{{name}}, welcome to the team!:::
/var @welcomes = foreach @greeting(@names)
/show @welcomes
```

Output:
```
["Alice, welcome to the team!", "Bob, welcome to the team!", "Charlie, welcome to the team!"]
```

Multiple parameters:

```mlld
/var @greetings = ["Hello", "Hi", "Hey"]
/var @names = ["Alice", "Bob", "Charlie"]
/exe @custom_greeting(greet, name) = :::{{greet}}, {{name}}! Nice to see you.:::
/var @messages = foreach @custom_greeting(@greetings, @names)
/show @messages
```

Define `foreach` in `/exe` and invoke it:

```mlld
/exe @wrap(x) = `[@x]`
/exe @wrapAll(items) = foreach @wrap(@items)
/show @wrapAll(["a","b"]) | @join(',')   # => [a],[b]
```

Use `/show foreach` with options:

```mlld
/var @names = ["Ann","Ben"]
/exe @greet(n) = `Hello @n`
/show foreach @greet(@names) with { separator: " | ", template: "{{index}}={{result}}" }
# Output: 0=Hello Ann | 1=Hello Ben
```

### When-Expressions in `for` RHS

Use a `when [...]` expression as the right-hand side in collection form. Combine with `none => skip` to filter non-matches:

```mlld
/var @xs = [1, null, 2, null, 3]
/var @filtered = for @x in @xs => when [
  @x != null => @x
  none => skip
]
/show @filtered   # => ["1","2","3"]
```

## Pipelines

### Basic Pipelines

Chain operations with `|`:

```mlld
/var @data = run {echo '{"users":[{"name":"Alice"},{"name":"Bob"}]}'} | @json
/show @data.users[0].name
```

Output:
```
Alice
```

### Pipeline Context

Access pipeline context with `@ctx` and pipeline history with `@p` (alias for `@pipeline`):

```mlld
/exe @validator(input) = when first [
  @input.valid => @input.value
  @ctx.try < 3 => retry "validation failed"
  none => "fallback value"
]

/var @result = "invalid" | @validator
/show @result
```

Context object (`@ctx`) contains:
- `try` - current attempt number in the context of the active retry
- `tries` - array containing history of attempts
- `stage` - current pipeline stage
- `input` - current stage input (use `@p[0]` to read the original pipeline input)
- `hint` - the most recent hint passed via `retry "..."` (string or object)
- `lastOutput` - output from the previous stage (if any)
- `isPipeline` - true when executing inside a pipeline stage

Pipeline array (`@p`) contains:
- `@p[0]` - original/base input to the pipeline
- `@p[1]` … `@p[n]` - outputs of completed visible stages
- `@p[-1]` - previous stage output; `@p[-2]` two stages back, etc.
- `@p.retries.all` - all attempt outputs from all retry contexts (for best-of-N patterns)

Gotchas:
- `@ctx.try` and `@ctx.tries` are local to the active retry context. Stages that are not the requester or the retried stage will see `try: 1` and `tries: []`.
- `@ctx.input` is the current stage input, not the original. Use `@p[0]` for the original pipeline input.
- A synthetic internal stage may be created for retryable sources; stage numbers and `@p` indices shown above hide this internal stage.

### Retry with Hints

Use `retry` with hints to guide subsequent attempts:

```mlld
/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry "missing title"
  * => `Used hint: @ctx.hint`
]

/var @result = @source() | @validator
/show @result
```

Output:
```
Used hint: missing title
```

### Parallel Pipelines

Run multiple transforms concurrently within a single pipeline stage using `||`.

```mlld
/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @combine(input) = js {
  // Parallel stage returns a JSON array string
  const [l, r] = JSON.parse(input);
  return `${l} | ${r}`;
}

/var @out = "seed" with { pipeline: [ @left || @right, @combine ] }
/show @out
```

Notes:
- Results preserve order of commands in the group.
- The next stage receives a JSON array string (parse it or accept as text).
- Concurrency is capped by `MLLD_PARALLEL_LIMIT` (default `4`).
- Returning `retry` inside a parallel group is not supported; do validation after the group and request a retry of the previous (non‑parallel) stage if needed.
- Inline effects attached to grouped commands run after each command completes.

### Complex Retry Patterns

Multi-stage pipelines with retry and fallback:

```mlld
/exe @randomQuality(input) = js {
  const values = [0.3, 0.7, 0.95, 0.2, 0.85];
  return values[ctx.try - 1] || 0.1;
}

/exe @validateQuality(score) = when first [
  @score > 0.9 => `excellent: @score`
  @score > 0.8 => `good: @score`
  @ctx.try < 5 => retry
  none => `failed: best was @score`
]

/var @result = @randomQuality | @validateQuality
/show @result
```

## Error Handling

mlld has no early exit (`return`/`exit`). Model different outcomes with `/when` and state:

```mlld
/var @validation = @validate(@input)
/when [
  @validation.valid => show "Processing successful"
  !@validation.valid => show `Error: @validation.message`
]
```

Use flags to coordinate flow:

```mlld
/var @canDeploy = @testsPass && @isApproved
/when [
  @canDeploy => run {npm run deploy}
  !@canDeploy => show "Deployment blocked - check tests and approval"
]
```

## Common Patterns

### Guarded Execution

```mlld
/var @result = @data | @validate | @process
/when [
  @result.success => output @result.data to "output.json"
  !@result.success => show `Processing failed: @result.error`
]
```

### Conditional Actions

```mlld
/exe @isProduction() = sh {test "$NODE_ENV" = "production" && echo "true"}
/when first [
  @isProduction() && @testsPass => run {npm run deploy:prod}
  @testsPass => run {npm run deploy:staging}
  * => show "Cannot deploy: tests failing"
]
```

### Collection Processing

```mlld
/var @files = ["config.json", "data.json", "users.json"]
/exe @processFile(file) = when first [
  @file.endsWith(".json") => `Processed: @file`
  * => `Skipped: @file`
]
/var @results = foreach @processFile(@files)
/for @result in @results => show @result
```
