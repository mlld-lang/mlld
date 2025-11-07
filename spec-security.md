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

Guards are validation functions that decide whether operations should proceed:

```mlld
/guard [@name] [for <label>] = when [
  condition1 => allow
  condition2 => deny "reason"
  condition3 => retry "hint"
  condition4 => prompt "message"  # Future - Phase 5+
  * => allow
]
```

**Guard Actions**:
- `allow` - Operation proceeds
- `allow @value` - Operation proceeds with fixed/transformed value (Phase 4.1+)
- `deny "reason"` - Operation blocked with error message
- `retry "hint"` - Re-execute data source with hint (auto-denies if source not retryable)
- `prompt "message"` - User confirmation required (Phase 5+)

**Guard Execution Model:**

Guards are invoked BY directives before execution:
1. Directives evaluate their inputs
2. System checks inputs for data labels
3. Matching guards evaluate before operation executes
4. Guards see both the data (`@ctx.input`) and pending operation (`@ctx.op`)
5. Guards prevent operations from running (not post-validation)

**Example flow:**
```mlld
/var secret @key = @fetchKey()
/run {curl api.com -d "@key"}

# Execution:
# 1. /run evaluates @key reference
# 2. /run sees @key has label [secret]
# 3. /run invokes guards registered for 'secret'
# 4. Guard checks @ctx.op and decides
# 5. If deny → error thrown, /run never executes
#    If allow → /run executes normally
#    If retry → @fetchKey() re-executes, then /run tries again
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
@input           # Data being guarded (primary - like pipeline stages)
@ctx.input       # Alias to @input (for consistency with other @ctx properties)
@ctx.labels      # Array of accumulated label strings ["secret", "pii"]
@ctx.sources     # Array of data source identifiers ["user-input", "api-response"]
@ctx.op          # Current operation metadata (see below)
@ctx.tries       # Current retry attempt number (if in retry loop)
@ctx.policy      # Active policy configuration
```

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
# /run
@ctx.op = {
  type: "run",
  command: "curl api.com",
  labels: ["shell", "external"],  # Implicit
  domains: ["api.com"]  # Phase 4.1+ - auto-extracted
}

# /import
@ctx.op = {
  type: "import",
  importType: "live",
  path: "https://api.com/data",
  labels: ["network", "import"],  # Implicit
  domains: ["api.com"]  # Phase 4.1+ - auto-extracted
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

### Implicit Operation Labels

Built-in directives have implicit operation labels:

| Directive | Implicit Labels |
|-----------|----------------|
| `/run` | `["shell", "external"]` |
| `/show` | `["output"]` |
| `/import live` | `["network", "import"]` |
| `/import cached` | `["network", "import"]` |
| `/output` | `["output", "io"]` |

User-defined executables have labels only if explicitly declared:
```mlld
/exe network,paid @fetch() = {curl ...}  # labels: ["network", "paid"]
/exe @helper() = {echo ...}              # labels: []
```

Guards can check these via `@opHas(label)` or `@ctx.op.labels`.

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
  @opHas("network") => deny "Secrets cannot be sent over network"
  @opIs("show") => deny "Secrets cannot be displayed"
  * => allow
]

# Restrict destructive operations
/guard @destructiveRestrictions for destructive = when [
  @opIs("run") => deny "Destructive operations in shell require review"
  * => allow
]

# Restrict untrusted content
/guard @untrustedRestrictions for untrusted = when [
  @opIs("run") => deny "Cannot execute untrusted content"
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

## Label-Guard Linkage

Guards can be automatically applied to specific data labels:

```mlld
# Guard applies to all 'secret' labeled variables
/guard @secretDataGuard for secret = when [
  @opIs("run") => deny "Can't use secrets in shell commands"
  @opHas("network") => deny "Can't send secrets over network"
  * => allow
]
```

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

**Note:** `retry` currently only works in pipeline contexts where the data source is a function call. For direct invocations without retryable sources, guards can only `allow` or `deny`. Retry will auto-deny with error: "Cannot retry: [hint] (source not retryable)".

```mlld
# Pipeline context - retry works naturally
/guard for llmjson = when first [
  @isValidJson(@ctx.input) => allow
  @ctx.tries < 3 => retry "Invalid JSON from LLM"
  * => deny "Invalid JSON after 3 attempts"
]

/var llmjson @result = @claude("generate user") | @process
/show @result  # Guard can retry @claude stage

# Direct invocation - limited support
/var llmjson @result = @claude("generate user")
/show @result  # Guard cannot retry (no retryable source in context)
```

### Fixing with Guards (Phase 4.1+)

```mlld
/guard @jsonFixer for llmjson = when first [
  @isValidJson(@ctx.input) => allow
  @isValidJson(@trimJson(@ctx.input)) => allow @trimJson(@ctx.input)
  @ctx.tries < 3 => retry "Invalid JSON"
  * => deny "Invalid JSON after fixes and retries"
]
```

## Network Activity Detection (Phase 4.1+)

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
