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

### Context (@ctx)

Extended ambient context that flows through all operations:

```mlld
@ctx.input       # Actual data value being guarded (available to guards)
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
```

## Built-in Data Labels

mlld ships with a minimal built-in label set:

- `secret` - Sensitive data (passwords, keys, tokens)
- `public` - Safe to expose anywhere  
- `untrusted` - From external sources, potential injection risk
- `network` - Makes external calls
- `destructive` - Modifies or deletes data

## Built-in Guards

Default guards that prevent common security mistakes:

```mlld
# Prevent credential leaks
/guard @secretProtection for secret = when [
  @ctx.op.labels.includes("network") => deny "Secrets cannot be sent over network"
  @ctx.op.type == "show" => deny "Secrets cannot be displayed"
  * => allow
]

# Confirm destructive operations
/guard @destructiveConfirmation for destructive = when [
  !@ctx.userConfirmed => prompt "Confirm destructive operation"
  * => allow
]

# Restrict untrusted content
/guard @untrustedRestrictions for untrusted = when [
  @ctx.op.type == "run" => deny "Cannot execute untrusted content"
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
  @ctx.op.type == "run" => deny "Can't use secrets in shell commands"
  @ctx.op.labels.includes("network") => deny "Can't send secrets over network"
  * => allow
]
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

**Note:** Retry outside of pipelines requires investigation (Phase 4.0). For now, retry works best in pipeline contexts.

```mlld
# Pipeline context - retry works naturally
/guard for llmjson = when first [
  @isValidJson(@ctx.input) => allow
  @ctx.tries < 3 => retry "Invalid JSON from LLM"
  * => deny "Invalid JSON after 3 attempts"
]

/var llmjson @result = @claude("generate user") | @process
/show @result  # Guard can retry @claude stage

# Direct invocation - under investigation
/var llmjson @result = @claude("generate user")
/show @result  # Can guard retry @claude? TBD in Phase 4.0
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
