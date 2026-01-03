# Security

## tldr

Guards protect data and operations. Label sensitive data, define guards to control access:

```mlld
var secret @apiKey = "sk-live-12345"

guard @noShellSecrets before secret = when [
  @mx.op.type == "run" => deny "Secrets cannot appear in shell commands"
  * => allow
]

run cmd { echo @apiKey }  >> Blocked by guard
```

Inline effects (`| output`, `| show`, `| append`, `| log`) use the same guard path as directives. Guard filters `op:output`/`op:show`/`op:append`/`op:log` cover both inline effects and directives.

## Data Labels

Mark data as sensitive by adding labels to variable declarations:

```mlld
var secret @apiKey = "sk-12345"  >> Labeled 'secret'
var pii @email = "user@example.com"  >> Labeled 'pii'
var secret,pii @ssn = "123-45-6789"  >> Multiple labels (comma-separated, no spaces)
```

Labels track through operations:

```mlld
var secret @token = "sk-12345"
var @trimmed = @token.trim()  >> Still labeled 'secret'
var @partial = @token.slice(0, 5)  >> Still labeled 'secret'
var @upper = @token.toUpperCase()  >> Still labeled 'secret'
```

Check labels with `.mx.labels`:

```mlld
var secret @data = "sensitive"
show @data.mx.labels  >> ["secret"]
```

## Taint Tracking

Taint is the accumulated label set on a value. It includes explicit labels plus automatic source labels. Check it with `.mx.taint`:

```mlld
var secret @token = "sk-123"
var @header = `Bearer @token`
show @header.mx.taint  >> ["secret"]
```

Automatic taint labels:
- `src:exec` — outputs from `/run` or `/exe`
- `src:file` — loaded file content, plus `dir:/...` entries for every parent directory
- `src:dynamic` — dynamic modules injected via `dynamicModules`

Use taint in guards to block risky sources:

```mlld
guard @noUploads before op:run = when [
  @input.any.mx.taint.includes("dir:/tmp/uploads") => deny "Cannot execute uploads"
  @input.any.mx.taint.includes("src:exec") => deny "No nesting command output"
  * => allow
]
```

## Guards

Guards enforce policies on labeled data or operations.

### Basic Guard Syntax

```
/guard [@name] TIMING LABEL = when [
  CONDITION => ACTION
  * => allow
]
```

Where:
- `@name` is optional guard name
- `TIMING` is required: `before`, `after`, or `always`
- `LABEL` is a data label (`secret`, `pii`) or operation filter (`op:run`, `op:exe`)

**Syntactic sugar:** `/guard [@name] for LABEL = when [...]` is equivalent to `before` timing. Using explicit `before` is recommended for clarity.

Actions:
- `allow` - Operation proceeds
- `deny "reason"` - Operation blocked
- `retry "hint"` - Retry operation (pipelines only)
- `allow @value` - Transform and allow

### Guard on Data Labels

Block secrets from shell commands:

```mlld
guard @noShellSecrets before secret = when [
  @mx.op.type == "run" => deny "Secrets cannot appear in shell"
  * => allow
]

var secret @key = "sk-12345"
run cmd { echo @key }  >> Blocked
```

### Guard on Operations

Block all shell commands regardless of data:

```mlld
guard @noShell before op:run = when [
  * => deny "Shell access disabled"
]

run cmd { ls }  >> Blocked
```

Filter by operation name:

```mlld
guard @blockSend before op:exe = when [
  @mx.op.name == "sendData" => deny "Network calls blocked"
  * => allow
]

exe @sendData(value) = run { curl -d "@value" api.example.com }
show @sendData("test")  >> Blocked
```

## Denied Handlers

Handle guard denials gracefully with `denied =>` branches:

```mlld
guard @secretBlock before secret = when [
  @mx.op.type == "show" => deny "Cannot display secrets"
  * => allow
]

var secret @key = "sk-12345"

exe @display(value) = when [
  denied => `[REDACTED] - @mx.guard.reason`
  * => `Value: @value`
]

show @display(@key)  >> Shows: [REDACTED] - Cannot display secrets
```

Access guard context in denied handlers:

```mlld
exe @handler(value) = when [
  denied => show "Blocked: @mx.guard.reason"
  denied => show "Guard: @mx.guard.name"
  denied => show "Labels: @mx.labels.join(', ')"
  * => show @value
]
```

## Before Guards (Input Validation)

Before guards check inputs before operations execute:

```mlld
guard @validateInput before op:exe = when [
  @input.length > 1000 => deny "Input too large"
  @input.includes("<script") => deny "Potentially malicious input"
  * => allow
]

exe @process(data) = run { echo "@data" }
show @process("<script>alert('xss')</script>")  >> Blocked
```

Transform inputs with `allow @value`:

```mlld
guard @sanitize before untrusted = when [
  * => allow @input.trim().slice(0, 100)
]

var untrusted @userInput = "  very long input...  "
exe @process(data) = `Processed: @data`
show @process(@userInput)  >> Input trimmed and truncated
```

## After Guards (Output Validation)

After guards validate outputs after operations complete:

```mlld
guard @validateOutput after op:exe = when [
  @output.includes("ERROR") => deny "Operation failed"
  * => allow
]

exe @query() = run { curl api.example.com/status }
show @query()  >> Blocked if output contains ERROR
```

Sanitize outputs:

```mlld
guard @redactSecrets after op:exe = when [
  @output.includes("sk-") => allow @output.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]')
  * => allow
]

exe @getStatus() = run { echo "Status: ok, key: sk-12345" }
show @getStatus()  >> Output: Status: ok, key: [REDACTED]
```

Check LLM output:

```mlld
guard @validateJson after op:exe = when [
  @isValidJson(@output) => allow
  * => deny "LLM did not return valid JSON"
]

exe @isValidJson(text) = js { try { JSON.parse(text); return true; } catch { return false; } }
```

## Guard Timing

Guards can run before, after, or both:

```mlld
guard @checkInput before secret = when [
  * => allow
]

guard @checkOutput after secret = when [
  * => allow
]

guard @checkBoth always op:exe = when [
  * => allow @tagValue(@mx.guard.timing, @output, @input)
]
```

Use `@mx.guard.timing` to differentiate:

```mlld
exe @tagValue(timing, out, inp) = js {
  const val = out ?? inp ?? '';
  return `${timing}:${val}`;
}

exe @emit(v) = js { return v; }
show @emit("test")
```

## Guard Composition

Multiple guards execute in order (top-to-bottom in file):

```mlld
guard @first before secret = when [
  * => allow @input.trim()
]

guard @second before secret = when [
  * => allow `safe:@input`
]

var secret @data = "  hello  "
exe @deliver(v) = `Result: @v`

>> Result: safe:hello
show @deliver(@data)
```

Decision precedence: deny > retry > allow @value > allow

```mlld
guard @retryGuard before secret = when [
  * => retry "need retry"
]

guard @denyGuard before secret = when [
  * => deny "hard stop"
]

>> deny wins, but retry hint preserved in @mx.guard.hints
```

## Guard Transforms

Guards can transform data with `allow @value`:

```mlld
exe @redact(text) = js { return text.replace(/./g, '*'); }

guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]

var secret @key = "sk-12345"
show @key  >> Output: *********
```

Transforms chain across multiple guards:

```mlld
guard @trim before secret = when [
  * => allow @input.trim()
]

guard @wrap before secret = when [
  * => allow `[REDACTED: @input]`
]

var secret @key = "  sk-12345  "
show @key  >> Output: [REDACTED: sk-12345]
```

## Guard Context

Access guard evaluation context with `@mx.guard.*`:

### In Guard Expressions

```mlld
guard @retryOnce before op:exe = when [
  @mx.guard.try == 1 => retry "first attempt failed"
  @mx.guard.try == 2 => retry "second attempt failed"
  * => allow
]
```

### In Denied Handlers

```mlld
exe @process(value) = when [
  denied => show "Blocked by: @mx.guard.name"
  denied => show "Reason: @mx.guard.reason"
  denied => show "Decision: @mx.guard.decision"
  denied => show "All reasons: @mx.guard.reasons.join(', ')"
  * => show @value
]
```

### Common Properties

- `@mx.guard.try` - Current attempt number (1, 2, 3...)
- `@mx.guard.max` - Max attempts allowed (default 3)
- `@mx.guard.reason` - Primary denial/retry reason
- `@mx.guard.reasons` - All reasons from guard chain
- `@mx.guard.hints` - Retry hints from guards
- `@mx.guard.trace` - Full guard evaluation trace
- `@mx.guard.timing` - "before" or "after"
- `@mx.guard.name` - Guard name
- `@mx.labels` - Data labels on input

See full reference in `@mx.guard` section below.

## Guard Overrides

Selectively control guards per operation:

Disable all guards:

```mlld
guard @block before secret = when [
  * => deny "blocked"
]

var secret @data = "test"
show @data with { guards: false }  >> Guards disabled (warning emitted)
```

Skip specific guards:

```mlld
guard @blocker before secret = when [
  * => deny "should skip"
]

guard @allowed before secret = when [
  * => allow
]

var secret @data = "visible"
show @data with { guards: { except: ["@blocker"] } }  >> Only @allowed runs
```

Run only specific guards:

```mlld
show @data with { guards: { only: ["@specific"] } }
```

## Guard Import/Export

Define guards in modules:

```mlld
>> guards/secrets.mld
guard @secretProtection before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

export { @secretProtection }
```

Import and use:

```mlld
import { @secretProtection } from "./guards/secrets.mld"

var secret @key = "sk-12345"
run cmd { echo @key }  >> Protected by imported guard
```

## Expression Tracking

Guards see labels through all transformations:

```mlld
guard @secretBlock before secret = when [
  @mx.op.type == "show" => deny "No secrets"
  * => allow
]

var secret @key = "  sk-12345  "

>> All of these preserve 'secret' label:
show @key.trim()  >> Blocked
show @key.slice(0, 5)  >> Blocked
show @key.toUpperCase()  >> Blocked
show @key.trim().slice(0, 3).toUpperCase()  >> Blocked
```

Labels track through:
- Chained builtin methods (`.trim().slice()`)
- Template interpolation (`` `text @secret` ``)
- Field access (`@obj.secret.field`)
- Iterators (`for @item in @secrets`)
- Pipelines (all stages)
- Nested expressions

## Common Patterns

### Redact Secrets for Display

```mlld
exe @redact(text) = js { return text.slice(0, 4) + '****'; }

guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]

var secret @key = "sk-12345678"
show @key  >> Output: sk-1****
```

### Validate LLM Output

```mlld
exe @isValidJson(text) = js {
  try { JSON.parse(text); return true; }
  catch { return false; }
}

guard @validateJson after op:exe = when [
  @mx.op.name == "llmCall" && !@isValidJson(@output) => deny "Invalid JSON from LLM"
  * => allow
]
```

### Block Network Access

```mlld
guard @noNetwork before op:run = when [
  @mx.op.subtype == "sh" => deny "Shell access blocked"
  * => allow
]

guard @noExecNetwork before op:exe = when [
  @input.any.mx.labels.includes("network") => deny "Network calls blocked"
  * => allow
]
```

### Sanitize Untrusted Input

```mlld
exe @sanitize(text) = js {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

guard @sanitizeUntrusted before untrusted = when [
  * => allow @sanitize(@input)
]

var untrusted @userInput = "<script>alert('xss')</script>Hello"
show @userInput  >> Output: Hello (sanitized)
```

### Operation-Specific Guards

```mlld
guard @fileWritePolicy before secret = when [
  @mx.op.type == "output" => deny "Cannot write secrets to files"
  * => allow
]

guard @displayPolicy before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]
```

## @mx.guard Reference

Properties available in guard expressions and denied handlers:

### Attempt Tracking
- `@mx.guard.try` - Current attempt (1, 2, 3...)
- `@mx.guard.max` - Max attempts (default 3)
- `@mx.guard.tries` - Previous attempt history

### Guard Identity
- `@mx.guard.name` - Guard name (or null for anonymous)
- `@mx.guard.timing` - "before" or "after"

### Input/Output
- `@input` - Input value being guarded (also `@mx.guard.input`)
- `@output` - Output value (after guards only, also `@mx.guard.output`)

### Decision Info (Denied Handlers Only)
- `@mx.guard.decision` - Final decision ("allow", "deny", "retry")
- `@mx.guard.reason` - Primary denial/retry reason
- `@mx.guard.reasons` - All reasons from guard chain
- `@mx.guard.hints` - Retry hints from guards
- `@mx.guard.trace` - Full guard evaluation results

### Data Context
- `@mx.labels` - Data labels on input
- `@mx.sources` - Source provenance

## Guard Retry

Guards can retry operations in pipeline contexts:

```mlld
guard before secret = when [
  @mx.op.type == "pipeline-stage" && @mx.guard.try == 1 => retry "Try again"
  * => allow
]

exe @mask(v) = js { return v.replace(/.(?=.{4})/g, '*'); }

var secret @key = "sk-12345"
var @safe = @key | @mask
show @safe  >> Retries once, then succeeds
```

Retry budget is shared across guard chain (max 3 attempts).

## Best Practices

**Label sensitive data early:**
```mlld
var secret @apiKey = <.env>
var pii @userData = <users.json>
```

**Use operation-level guards for broad policies:**
```mlld
guard @noShell before op:run = when [
  * => deny "Shell disabled in production"
]
```

**Use data-level guards for specific protections:**
```mlld
guard @secretProtection before secret = when [
  @mx.op.type == "run" => deny "No secrets in shell"
  @mx.op.type == "output" => deny "No secrets to files"
  * => allow
]
```

**Always handle denials in production code:**
```mlld
exe @handler(value) = when [
  denied => show "Operation blocked: @mx.guard.reason"
  denied => "fallback-value"
  * => @value
]
```

**Transform instead of deny when possible:**
```mlld
guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]
```

## Guard Helpers

mlld provides helpers in guard contexts:

### @prefixWith(label, value)
Add prefix to values:

```mlld
guard @tag before op:exe = when [
  * => allow @prefixWith("tagged", @input)
]
```

### @tagValue(timing, output, input)
Tag based on guard timing:

```mlld
guard @tag always op:exe = when [
  * => allow @tagValue(@mx.guard.timing, @output, @input)
]
```

### @input.any / @input.all / @input.none
Array quantifiers for per-operation guards:

```mlld
guard @blockSecretsInRun before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Shell cannot access secrets"
  @input.all.mx.tokest < 1000 => allow
  @input.none.mx.labels.includes("pii") => allow
  * => deny "Input validation failed"
]
```

## Security Model

mlld's security is based on three pillars:

**Data Labels** - Tag sensitive data
```mlld
var secret @key = "sk-12345"
```

**Guards** - Enforce policies
```mlld
guard before secret = when [
  @mx.op.type == "run" => deny "No shell access"
  * => allow
]
```

**Context** - Access metadata
```mlld
@mx.labels  >> Data labels
@mx.guard.reason  >> Guard decisions
@mx.op.type  >> Operation type
```

Guards are:
- **Non-reentrant** - Don't fire during guard evaluation (prevents infinite loops)
- **Ordered** - Execute top-to-bottom in file, imports flatten at position
- **Composable** - All guards run, decisions aggregate with precedence

Labels propagate through:
- Builtin methods, template interpolation, field access
- Pipelines, iterators, nested expressions
- Transform chains, guard evaluations
