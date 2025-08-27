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

Access pipeline context with `@ctx` and pipeline history with `@p`:

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
- `try` - current attempt number
- `tries` - array of all attempts
- `stage` - current pipeline stage
- `input` - original pipeline input
- `hint` - message from `retry "hint"`
- `lastOutput` - output from previous stage
- `isPipeline` - true if in pipeline

Pipeline array (`@p`) contains:
- `@p[0]` - original input
- `@p[-1]` - previous stage output
- `@p.retries.all` - full retry history

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
/exe @isProduction() = run {test "$NODE_ENV" = "production" && echo "true"}
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
