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

### Local Variables in When Blocks

Use `let` to declare local variables scoped to a when block:

```mlld
/var @mode = "active"
/when @mode: [
  let @prefix = "Status:"
  "active" => show "@prefix Active"
  * => show "@prefix Unknown"
]
```

Output:
```
Status: Active
```

Local variables work in all when forms:

```mlld
/exe @format(name) = when [
  let @greeting = "Hello"
  let @punctuation = "!"
  * => "@greeting @name@punctuation"
]

/show @format("World")
```

Output:
```
Hello World!
```

`let` variables are scoped to their when block and don't persist outside:

```mlld
/var @status = "ok"
/when @status: [
  let @msg = "Completed"
  "ok" => show @msg
]
# @msg is not accessible here
```

### Exe Block Syntax

Use `[...]` for multi-statement exe bodies with local variables:

```mlld
/exe @greet(name) = [
  let @greeting = "Hello"
  let @punctuation = "!"
  => "@greeting @name@punctuation"
]

/show @greet("World")
```

Output:
```
Hello World!
```

Exe blocks require an explicit return with `=>` as the last statement:

```mlld
/exe @combine(a, b) = [
  let @result = "@a-@b"
  => @result
]

/show @combine("hello", "world")
```

Output:
```
hello-world
```

Use `let @var += value` for accumulation within blocks:

```mlld
/exe @countItems(items) = [
  let @count = 0
  for @item in @items [
    let @count += 1
  ]
  => @count
]

/show @countItems(["a", "b", "c"])
```

Output:
```
3
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

### For Block Syntax

Use `[...]` for multi-statement iteration bodies:

```mlld
/for @item in ["a", "b", "c"] [
  show "Processing: @item"
  show "Done with: @item"
]
```

Output:
```
Processing: a
Done with: a
Processing: b
Done with: b
Processing: c
Done with: c
```

For blocks support `let` for local variables per iteration:

```mlld
/for @user in @users [
  let @status = when [
    @user.active => "active"
    * => "inactive"
  ]
  show "@user.name: @status"
]
```

Note: The arrow syntax `for @x in @xs => [...]` still works but `for @x in @xs [...]` (without arrow) is preferred.

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
/for parallel(2, 1s) @n in [1,2,3,4] => show `Item: @n`

# Collection form (preserves input order)
/var @res = for parallel(2) @x in ["x","y","z"] => @upper(@x)
/show @res
```

Output (collection form):
```
["X","Y","Z"]
```

Parallel loops support block bodies as well:
```mlld
/for parallel(3) @task in @tasks [
  let @result = @runTask(@task)
  show `done:@task.id`
]
show `errors:@mx.errors.length`
```
- Directive form keeps streaming effects as iterations finish (order may vary).
- Expression form preserves input order; failed iterations add error markers `{ index, key?, message, error, value }` in the results array.
- `@mx.errors` resets at the start of each parallel loop and records any failures; outer-scope variables cannot be mutated inside a parallel block body.

**Error handling with repair pattern:**

```mlld
/exe @invokeAll(agents, msg) = [
  let @results = for parallel @a in @agents => @invoke(@a, @msg)
  => when [
    @mx.errors.length == 0 => @results
    @results.length >= 2 => @results  << 2/3 succeeded is acceptable
    * => @repair(@results, @mx.errors, @msg)  << AI-driven repair
  ]
]
```

This enables multi-agent orchestration with graceful degradation. If some agents fail, the repair function sees partial results and decides next steps.

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

### Batch Pipelines on Results

Add `=> |` after the per-item expression to run a pipeline on the collected results. The batch stage receives the gathered array (or object) directly, so helpers can work with native values while `.text` stays available if you need the string form.

```mlld
/exe @wrap(x) = js { return [x, x * 2]; }
/exe @flat(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.flat();
}

/var @pairs = for @x in [1, 2, 3] => @wrap(@x) => | @flat
/show @pairs
```

Output:
```
[
  1,
  2,
  2,
  4,
  3,
  6
]
```

Batch pipelines can also collapse results to a single value:

```mlld
/exe @sum(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @total = for @n in [1, 2, 3, 4] => @n => | @sum
/show @total
```

Output:
```
10
```

`foreach` uses the same syntax:

```mlld
/exe @duplicate(item) = js { return [item, item.toUpperCase()]; }
/exe @flat(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.flat();
}

/var @names = ["one", "two"]
/var @result = foreach @duplicate(@names) => | @flat
/show @result
```

Output:
```
[
  "one",
  "ONE",
  "two",
  "TWO"
]
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

### Inline Pipeline Effects

Attach lightweight side effects after any stage without a full directive:

```text
| log "message"          # stderr
| show "message"         # stdout + document
| output @var to "file"  # reuse /output routing
| append "file.jsonl"    # append stage output
```

Example append usage:

```mlld
/var @runs = ["alpha", "beta", "gamma"]
/var @_ = for @name in @runs =>
  `processed @name` | append "runs.log"

/show <runs.log>
```

You can pass an explicit source to `append` when you need different content:

```mlld
/var @_ = "summary" | append @runs to "runs.jsonl"
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

### Template Loops (backticks and ::)

Write inline `/for` loops inside templates for simple rendering tasks. The loop header and `/end` must start at line begins inside the template.

Backticks:

```mlld
/var @tpl = `
/for @v in ["x","y"]
- @v
/end
`
/show @tpl
```

Double-colon:

```mlld
/var @items = ["A","B"]
/var @msg = ::
/for @x in @items
- @x
/end
::
/show @msg
```

Notes:
- Loops are supported in backticks and `::…::` templates.
- `:::…:::` and `[[…]]` templates do not support loops.

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

Access pipeline context with `@mx` and pipeline history with `@p` (alias for `@pipeline`):

```mlld
/exe @validator(input) = when first [
  @input.valid => @input.value
  @mx.try < 3 => retry "validation failed"
  none => "fallback value"
]

/var @result = "invalid" | @validator
/show @result
```

Context object (`@mx`) contains:
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
- Pipeline stage outputs are `StructuredValue` wrappers with `.text` (string view) and `.data` (structured payload) properties. Templates and display automatically use `.text`; use `.data` when you need structured information.

Gotchas:
- `@mx.try` and `@mx.tries` are local to the active retry context. Stages that are not the requester or the retried stage will see `try: 1` and `tries: []`.
- `@mx.input` is the current stage input, not the original. Use `@p[0]` for the original pipeline input.
- A synthetic internal stage may be created for retryable sources; stage numbers and `@p` indices shown above hide this internal stage.

### Retry with Hints

Use `retry` with hints to guide subsequent attempts:

```mlld
/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @mx.input == "draft" => retry "missing title"
  * => `Used hint: @mx.hint`
]

/var @result = @source() | @validator
/show @result
```

Output:
```
Used hint: missing title
```

### While Loops (Bounded Iteration)

Use `while(cap)` for bounded iteration with explicit control flow:

```mlld
/exe @countdown(n) = when [
  @n <= 0 => done "finished"
  * => continue (@n - 1)
]

/var @result = 5 | while(10) @countdown
/show @result
```

Output:
```
finished
```

The `while(cap)` stage invokes a processor repeatedly until it returns `done`:
- `done @value` - Terminate iteration and return the value
- `done` - Terminate and return current state
- `continue @value` - Continue with new state for next iteration
- `continue` - Continue with current state (implicit if no control keyword)

Access iteration context with `@mx.while`:

```mlld
/exe @process(state) = when [
  @mx.while.iteration > 5 => done @state
  @mx.while.iteration == @mx.while.limit => done "hit cap"
  * => continue @state
]
```

Context variables:
- `@mx.while.iteration` - Current iteration (1-based)
- `@mx.while.limit` - Configured cap
- `@mx.while.active` - true when inside while loop

Optional pacing with `while(cap, delay)`:

```mlld
/var @result = @initial | while(100, 1s) @processor
```

The delay is applied BETWEEN iterations (not before first or after last).

Note: Use `continue` instead of `retry` in while processors. Retry is for pipeline retries, not loop iteration.

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

Pipelines can also start with a leading `||` to run parallel stages immediately:

```mlld
/exe @fetchA() = "A"
/exe @fetchB() = "B"
/exe @fetchC() = "C"

>> Leading || runs all three in parallel
/var @results = || @fetchA() || @fetchB() || @fetchC()
/show @results

>> Works in /run directive too
/run || @fetchA() || @fetchB() || @fetchC()

>> Control concurrency with (cap, delay) syntax
/var @limited = || @fetchA() || @fetchB() || @fetchC() (2, 100ms)
```

Output:
```
["A","B","C"]
["A","B","C"]
["A","B","C"]
```

The leading `||` syntax is equivalent to the longhand form:

```mlld
>> These produce identical results:
/var @shorthand = || @a() || @b() | @combine
/var @longhand = "" with { pipeline: [[@a, @b], @combine] }
```

Notes:
- Results preserve order of commands in the group.
- The next stage receives a JSON array string (parse it or accept as text).
- Concurrency is capped by `MLLD_PARALLEL_LIMIT` (default `4`).
- Leading `||` syntax avoids ambiguity with boolean OR expressions.
- Use `(n, wait)` after the pipeline to override concurrency cap and add pacing between starts.
- Returning `retry` inside a parallel group is not supported; do validation after the group and request a retry of the previous (non‑parallel) stage if needed.
- Errors inside a parallel group are collected as `{ index, key?, message, error, value }` elements and exposed via `@mx.errors`; the pipeline continues so downstream stages can repair or decide whether to retry.
- Inline effects attached to grouped commands run after each command completes.

**Error handling with graceful degradation:**

```mlld
>> Multi-source fetch with repair
/exe @aggregate(sources) = [
  let @data = || @fetch(@sources[0]) || @fetch(@sources[1]) || @fetch(@sources[2])
  => when [
    @mx.errors.length == 0 => @data
    @data.length >= 2 => @data  << 2/3 is good enough
    * => retry `Need at least 2 sources. Failed: @mx.errors`
  ]
]
```

This enables best-effort parallel execution where partial success is acceptable. The `@mx.errors` array provides details on what failed, and `@data` contains results from successful operations plus error markers for failed ones.

### Complex Retry Patterns

Multi-stage pipelines with retry and fallback:

```mlld
/exe @randomQuality(input) = js {
  const values = [0.3, 0.7, 0.95, 0.2, 0.85];
  return values[mx.try - 1] || 0.1;
}

/exe @validateQuality(score) = when first [
  @score > 0.9 => `excellent: @score`
  @score > 0.8 => `good: @score`
  @mx.try < 5 => retry
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
