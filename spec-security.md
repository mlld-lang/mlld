# mlld Security Specification: Data Labels, Guards, and Context

## Overview

mlld's security model is built on three primitives that work together to provide foundational security without restricting flexibility:

- **Data Labels**: Declarative labels on data expressing its sensitivity and risk
- **Guards**: Rules that evaluate whether operations should proceed based on types and context
- **Context (@ctx)**: Ambient execution metadata that flows through all operations

## Core Concepts

### Data Labels

Data labels are declarative adjectives applied at variable/executable creation that describe data properties:

```mlld
/var secret @apiKey = "abc123"
/var pii,untrusted @userEmail = <form-input>
/exe destructive @cleanup(path) = {rm -rf @path}
```

**Syntax**: `label1,label2,label3 @variableName`

**Label Propagation**: Data labels automatically flow through operations:
```mlld
/var secret @key = "abc"
/var @message = `Key is: @key`  # @message inherits 'secret' type
/var @result = @key | @process   # @result inherits 'secret' + any @process types
```

**Labels on Operations:**

Executables can be labeled to describe what they do:

```mlld
/exe network @fetchData(url) = {curl @url}
/exe destructive @cleanup(path) = {rm -rf @path}
/exe network,paid @callClaude(prompt) = {/* api call */}
```

Operation labels are available in `@ctx.op.labels` for guard evaluation:

```mlld
/guard for secret = when [
  @ctx.op.labels.includes("network") =>
    deny "Can't send secrets over network"
  * => allow
]
```

### Guards

Guards are validation functions that decide whether operations should proceed. Guards run as pre-execution hooks that block unsafe directives before they execute (see `spec-hooks.md` for hook infrastructure).

```mlld
/guard [@name] for <filter> = when [
  condition1 => allow
  condition2 => allow @value
  condition3 => deny "reason"
  condition4 => retry "hint"
  condition5 => prompt "message"
  * => allow
]
```

**Guard Filters (Required):**
- `for <data-label>` - Per-input guard (fires individually for each labeled input)
- `for op:<type>` - Per-operation guard (fires once with all inputs)

**Guard Actions**:
- `allow` - Operation proceeds
- `allow @value` - Operation proceeds with fixed/transformed value
- `deny "reason"` - Operation blocked with error message
- `retry "hint"` - Re-execute data source with hint (auto-denies if source not retryable)
- `prompt "message"` - User confirmation required

**Guard Trigger Scopes:**

Per-input guards (data guards):
```mlld
/guard for secret = when [
  # @input is single value with label "secret"
  # Fires individually for each secret-labeled input
  @input.ctx.tokens > 5000 => deny "Secret too large"
  * => allow
]
```

Per-operation guards:
```mlld
/guard for op:run = when [
  # @input is array of ALL inputs
  # Fires once per /run directive
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell"
  * => allow
]
```

**Guard Execution Model:**

Guards execute as pre-execution hooks at directive boundaries (hook lifecycle is defined in `spec-hooks.md`):
1. The hook runtime extracts and evaluates directive inputs
2. System collects data labels from inputs
3. Matching guards evaluate before the directive executes
4. Guards see the data (`@input`) and pending operation (`@ctx.op`)
5. Guards prevent directives from running (not post-validation)
6. Guard retry uses the pipeline retry infrastructure

**Example flow:**
```mlld
/var secret @key = @fetchKey()
/run {curl api.com -d "@key"}

# Execution:
# 1. Hook runtime extracts inputs: [@key]
# 2. Hook runtime sees @key has label [secret]
# 3. Guard hook evaluates for 'secret' with @input = @key
# 4. Guard checks @ctx.op and decides
# 5. If deny → error thrown, /run never executes
#    If allow → /run executes normally
#    If retry → retry context increments, @fetchKey() re-executes, loop continues
```

**Per-Input vs Per-Operation:**

Data guards (per-input) fire individually:
```mlld
/var secret @a = "key1"
/var secret @b = "key2"
/run @func(@a, @b)

# Secret guard fires twice:
#   Guard check 1: @input = @a
#   Guard check 2: @input = @b
# First denial aborts operation
```

Operation guards (per-operation) fire once:
```mlld
/guard for op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets"
]

/run @func(@a, @b)
# Guard fires once: @input = [@a, @b]
```

**Schema Guards** _(Under design - Phase 4.1+)_

Guards can validate data against schemas:

```mlld
# Schema-style guard
/guard @userShape = {
  "email": {"type": "string", "pattern": ".*@.*"},
  "age": {"type": "number", "minimum": 0}
}

# Function-style guard
/guard @accessControl for secret = when [
  @ctx.labels.includes("secret") => deny "No secret access"
  * => allow
]
```

### Guard Helper Functions

Guards have access to helper functions for common checks:

**Operation Helpers:**
- `@opIs(type)` - Checks `@ctx.op.type == type`
- `@opHas(label)` - Checks `@ctx.op.labels.includes(label)`
- `@opHasAny([labels])` - Checks any label in operation
- `@opHasAll([labels])` - Checks all labels in operation

**Input Helpers:**
- `@inputHas(label)` - Checks `@ctx.labels.includes(label)`

**Examples:**
```mlld
/guard for secret = when [
  @opIs("run") => deny "No secrets in shell"
  @opHas("network") => deny "No secrets over network"
  @inputHas("trusted") => allow  # Bypass if trusted

  # Raw context access still available
  @ctx.op.type == "import" => deny "No secret imports"
  @ctx.labels.length > 2 => deny "Too many risk labels"

  # Domain checking (Phase 4.1+)
  @ctx.op.domains.includes("evil.com") => deny "Blocked domain"
]
```

**@input in Guards:**

Like pipeline stages, guards use `@input` to access the data being guarded:
- For simple values: the raw value
- For structured data: object with `.text` and `.data` properties
- Reuses the existing pipeline `@input` semantics

Note: `@ctx.input` is an alias to the same value (consistent with pipeline `@ctx.input`)

### Context (@ctx)

Extended ambient context that flows through all operations:

```mlld
@input           # Data being guarded (single value or array depending on guard scope)
@ctx.input       # Alias to @input (for consistency)
@ctx.labels      # Accumulated labels (in per-input guards: same as @input.ctx.labels)
@ctx.sources     # Data provenance array
@ctx.op          # Current operation metadata (see below)
@ctx.guard.try   # Current guard retry attempt (1, 2, 3...)
@ctx.guard.tries # Array of previous guard retry results
@ctx.guard.max   # Maximum guard retry limit (default: 3)
@ctx.policy      # Active policy configuration
```

**Note:** Guard context uses the pipeline retry infrastructure but surfaces through `@ctx.guard.*` namespace.

**@ctx.op Structure:**

For executable invocations (`/exe`):
```mlld
@ctx.op = {
  type: "exec-invocation",
  name: "functionName",
  labels: ["network", "destructive"]  # From /exe declaration
}
```

For built-in directives:
```mlld
# /run with execution context
@ctx.op = {
  type: "op:cmd",      # or op:sh, op:bash, op:js, op:node, op:py
  command: "curl api.com",
  labels: ["shell", "external"],  # Implicit
  domains: ["api.com"]  # Auto-extracted
}

# /import
@ctx.op = {
  type: "import",
  importType: "live",
  path: "https://api.com/data",
  labels: ["network", "import"],  # Implicit
  domains: ["api.com"]  # Auto-extracted
}

# /show
@ctx.op = {
  type: "show",
  labels: ["output"]  # Implicit
}

# /output
@ctx.op = {
  type: "output",
  labels: ["output", "io"]  # Implicit
}
```

**Execution Context Types:**
- `op:cmd` - Bare shell: `/run {...}`
- `op:sh` - Shell script: `/run sh {...}`
- `op:bash` - Bash script: `/run bash {...}`
- `op:js` - JavaScript: `/run js {...}`
- `op:node` - Node.js: `/run node {...}`
- `op:py` - Python: `/run python {...}`

### Implicit Operation Labels

Built-in directives have implicit operation labels:

| Directive | Implicit Labels |
|-----------|----------------|
| `/run {...}` (cmd) | `["shell", "external"]` |
| `/run sh {...}` | `["shell", "script"]` |
| `/run js {...}` | `["script", "sandboxed"]` |
| `/run node {...}` | `["script", "network-capable"]` |
| `/show` | `["output"]` |
| `/import live` | `["network", "import"]` |
| `/import cached` | `["network", "import"]` |
| `/output` | `["output", "io"]` |

User-defined executables have labels only if explicitly declared:
```mlld
/exe network,paid @fetch() = {curl ...}  # labels: ["network", "paid"]
/exe @helper() = {echo ...}              # labels: []
```

Guards can check these via `@ctx.op.labels`.

## Built-in Data Labels

mlld ships with a minimal built-in label set:

- `secret` - Sensitive data (passwords, keys, tokens)
- `pii` - Personally identifiable information
- `public` - Safe to expose anywhere
- `untrusted` - From external sources, potential injection risk
- `trusted` - From verified/safe sources
- `network` - Makes external calls
- `destructive` - Modifies or deletes data

## Built-in Guards

Default guards that prevent common security mistakes:

```mlld
# Prevent credential leaks
/guard @secretProtection for secret = when [
  @ctx.op.labels.includes("network") => deny "Secrets cannot be sent over network"
  @ctx.op.type == "show" => deny "Secrets cannot be displayed"
  @ctx.op.type == "op:cmd" => deny "Secrets in bare shell commands"
  @ctx.op.type == "op:node" => deny "Secrets in Node.js (network access)"
  @ctx.op.type == "op:js" => allow  # JavaScript is sandboxed
  * => allow
]

# Restrict destructive operations
/guard @destructiveRestrictions for destructive = when [
  @ctx.op.type == "op:cmd" => deny "Destructive operations in shell require review"
  @ctx.op.labels.includes("external") => deny "Destructive external operations blocked"
  * => allow
]

# Restrict untrusted content
/guard @untrustedRestrictions for untrusted = when [
  @ctx.op.type == "op:cmd" => deny "Cannot execute untrusted content in shell"
  @ctx.op.type == "op:sh" => deny "Cannot execute untrusted shell scripts"
  * => allow
]
```

## Configuration

Security configured in `mlld.lock.json`:

```json
{
  "security": {
    "enabled": true,
    "defaultGuards": [
      "@builtin/secretProtection",
      "@builtin/destructiveConfirmation", 
      "@builtin/untrustedRestrictions"
    ],
    "labelInference": {
      "enabled": true,
      "rules": {
        "secret": ["password", "key", "token", "secret"],
        "untrusted": ["<http", "<https", "user-input"]
      }
    },
    "strictMode": false
  }
}
```

## Guard Filters and Triggers

All guards must have a filter specifying when they trigger. Guards cannot be overbroad (no filter) as this creates performance and correctness issues.

**Data Guards (per-input):**
```mlld
# Fires individually for each secret-labeled input
/guard @secretDataGuard for secret = when [
  @ctx.op.type == "op:cmd" => deny "Can't use secrets in shell"
  @ctx.op.labels.includes("network") => deny "Can't send secrets over network"
  @input.ctx.tokens > 10000 => deny "Secret too large"
  * => allow
]
```

**Operation Guards (per-operation):**
```mlld
# Fires once per /run directive with all inputs as array
/guard @shellRestrictions for op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell"
  @input.totalTokens() > 50000 => deny "Total payload too large"
  * => allow
]

# Filter by execution context
/guard @nodeSecurityPolicy for op:node = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets in Node.js"
  * => allow
]
```

**Operation Type Filters (op: prefix for built-ins):**

Guards can filter by built-in operation types using the `op:` prefix:

**Directive types:**
- `op:run`, `op:show`, `op:import`, `op:output`, `op:var`, `op:exe`

**Execution contexts (within /run):**
- `op:cmd`, `op:sh`, `op:bash`, `op:js`, `op:node`, `op:py`

**User-Defined Labels (NO op: prefix):**

Labels from `/exe` declarations are plain labels without prefix:

```mlld
/exe network,paid @fetch() = {curl ...}

# Guard by label (no op: prefix)
/guard for network = when [
  # Matches BOTH:
  #   - Data with label 'network'
  #   - Operations with label 'network' (from /exe)
  @ctx.op.type == "op:cmd" => deny "No network in bare shell"
  * => allow
]

/guard for destructive = when [
  # Matches data OR operations labeled 'destructive'
  * => deny "Destructive operations require approval"
]
```

**Key distinction:**
- `for op:<type>` = Built-in operation types (per-operation guard)
- `for <label>` = User-defined labels (per-input guard for data, or per-operation for /exe labels)

## Guard Export and Import

Named guards can be exported and imported to enable reusable security policies:

```mlld
# security-policy.mld
/guard @noSecretsInLogs for secret = when [
  @opHas("output") => deny "No secrets in logs"
  * => allow
]

/guard @companyDomains for secret = when [
  @ctx.op.domains.some(d => !d.endsWith(".company.com")) =>
    deny "Secrets only to company domains"
  * => allow
]

/export { @noSecretsInLogs, @companyDomains }

# app.mld
/import module { @noSecretsInLogs, @companyDomains } from "./security-policy.mld"

# Guards are now active
/var secret @key = "abc"
/show @key  # @noSecretsInLogs fires → DENIED
```

**Key behaviors:**
- Imported guards activate immediately
- Guards cannot be overridden (mlld immutability)
- Guards are execution-scoped (apply to all operations)
- To disable a guard, don't import it

**Organization-wide policies:**
Teams can define shared guard libraries that all projects import, ensuring consistent security policies across codebases.

## Guard Scope and Execution (Phase 4.0)

**Current behavior:**
Guards are execution-scoped and global within an execution context:
- Guards imported in a module apply to all operations during execution
- No module-level scoping (guards don't distinguish between modules)
- Guards fire based on data labels and operation types, regardless of where data originated

**Example:**
```mlld
# main.mld
/import module { @strictSecrets } from "./guards.mld"
/import module { @externalData } from "registry:external-lib"

/show @externalData  # @strictSecrets checks this (if @externalData has 'secret' label)
```

**Future considerations (Phase 4.1+):**
- Module-aware guards that can check `@ctx.module` (which module is executing)
- Data provenance in guards (which module data came from)
- Fine-grained scoping (guards that apply only to specific modules)
- Integration with taint tracking for module provenance

**Current design philosophy:**
Keep scoping simple. If a guard is too broad, rewrite it with more specific conditions. If you don't want a guard, don't import it.
```

## Runtime Execution

1. **Label Accumulation**: When variables are created or operations executed, labels accumulate in `@ctx.labels`
2. **Guard Evaluation**: Before executing operations (`/run`, `/output`, `/exe`), applicable guards are evaluated
3. **Policy Enforcement**: Guards return `allow`/`deny`/`prompt`, runtime enforces the decision
4. **Context Flow**: `@ctx` flows through pipelines, function calls, and templates automatically

## Examples

### Basic Usage
```mlld
# Types declared at creation
/var secret @dbPassword = "secret123"
/var public @greeting = "Hello world"

# Built-in guard blocks this:
/run {echo "@dbPassword" > debug.log}  # DENIED: "Secrets cannot be logged"

# This works fine:
/run {echo "@greeting" > welcome.txt}  # ALLOWED: public data
```

### Custom Guards
```mlld
# Company-specific policy
/guard @companyPolicy for secret = when [
  @ctx.op.domains.some(d => !d.endsWith(".company.com")) =>
    deny "Secrets only to company domains"
  * => allow
]

/guard @piiPolicy for pii = when [
  @ctx.op.labels.includes("output") => deny "No PII in logs"
  * => allow
]

# Apply to operations
/var secret,pii @userData = <customer-data>
/run {curl -X POST external-api.com -d "@userData"}  # DENIED by @companyPolicy
```

### Type Propagation
```mlld
/var secret @apiKey = "abc123"
/var @authHeader = `Authorization: Bearer @apiKey`  # Inherits 'secret'
/var @request = @authHeader | @buildRequest          # Still 'secret'

# Guard checks accumulated types
/output @request to "request.log"  # DENIED: secret data cannot be logged
```

### Retry with Guards

Guards use the pipeline retry infrastructure. Guard retries create a retry context and track attempts through `@ctx.guard.try`:

```mlld
# Guard with retry
/guard for llmjson = when first [
  @isValidJson(@input) => allow
  @ctx.guard.try < 3 => retry "Invalid JSON from LLM"
  * => deny "Invalid JSON after 3 attempts"
]

/var llmjson @result = @claude("generate user") | @process
/show @result  # Guard can retry @claude stage
```

**Retry semantics:**
- Guards can retry if the input's source is retryable (function call in pipeline)
- Retry creates a retry context (reuses `RetryContext` from pipeline state machine)
- `@ctx.guard.try` increments with each retry (1, 2, 3...)
- Non-retryable sources auto-deny: "Cannot retry: [hint] (source not retryable)"
- Each guard evaluation point has its own retry budget (resets per directive)

### Fixing with Guards

Guards can fix invalid data using `allow @value`:

```mlld
/guard @jsonFixer for llmjson = when first [
  @isValidJson(@input) => allow
  @isValidJson(@trimJson(@input)) => allow @trimJson(@input)  # Fix and continue
  @ctx.guard.try < 3 => retry "Invalid JSON"
  * => deny "Invalid JSON after fixes and retries"
]
```

**Flow:**
1. Check if input is valid → allow
2. Try common fixes → allow with fixed value
3. If unfixable and retries remain → retry source
4. Otherwise → deny

This enables progressive fixing: try cheap fixes first, expensive retries later.

## Network Activity Detection

Guards can detect network activity by examining `@ctx.op.domains`, which auto-extracts domains from:

- Protocol URLs: `https://api.com`, `ftp://server.com`
- Network commands: `curl api.com`, `wget example.com`, `ssh user@host.com`
- Git URLs: `git@github.com:user/repo`
- IP addresses: `8.8.8.8` (excluding private ranges)

```mlld
/guard for secret = when [
  # Block any network activity
  @ctx.op.domains.length > 0 =>
    deny "Can't use secrets in commands with network activity"

  # Allow only company domains
  @ctx.op.domains.some(d => !d.endsWith(".company.com")) =>
    deny "Secrets only to company domains"

  * => allow
]
```

**Detection coverage:**
- ✅ Catches 95%+ of common network commands
- ⚠️ May miss obfuscated commands (`curl $(echo api.com)`)
- ⚠️ May have false positives (domain-like strings in comments)

## Backward Compatibility

- All features are opt-in via configuration
- Existing mlld code runs unchanged when security is disabled
- Default guards can be individually overridden or disabled
- Types are optional - unlabeled variables work as before
