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

### Guards

Guards are validation functions that decide whether operations should proceed:

```mlld
/guard @guardName(operation, inputs, ctx) = when [
  condition1 => allow()
  condition2 => deny("reason")
  condition3 => prompt("confirmation message")
  * => allow()
]
```

**Guard Actions**:
- `allow()` - Operation proceeds
- `deny(reason)` - Operation blocked with error message
- `prompt(message)` - User confirmation required
- `retry(hint)` - Operation retried with hint

**Guard Shapes**: Guards can be declarative (schemas) or procedural (functions):
```mlld
# Schema-style guard
/guard @userShape = {
  "email": {"type": "string", "pattern": ".*@.*"},
  "age": {"type": "number", "minimum": 0}
}

# Function-style guard  
/guard @accessControl(op, inputs, ctx) = when [
  @ctx.labels.includes("secret") => deny("No secret access")
  * => allow()
]
```

### Context (@ctx)

Extended ambient context that flows through all operations:

```mlld
@ctx.labels      # Array of accumulated type strings ["secret", "pii"]
@ctx.sources    # Array of data source identifiers ["user-input", "api-response"]
@ctx.operation  # Current operation metadata {type: "network", target: "api.com"}
@ctx.policy     # Active policy configuration
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
/guard @secretProtection(op, inputs, ctx) = when [
  @ctx.labels.includes("secret") && @op.type == "network" => deny("Secrets cannot be sent over network")
  @ctx.labels.includes("secret") && @op.type == "log" => deny("Secrets cannot be logged")
  * => allow()
]

# Confirm destructive operations
/guard @destructiveConfirmation(op, inputs, ctx) = when [
  @op.type == "destructive" && !@ctx.userConfirmed => prompt("Confirm destructive operation")
  * => allow()
]

# Restrict untrusted content
/guard @untrustedRestrictions(op, inputs, ctx) = when [
  @ctx.labels.includes("untrusted") && @op.type == "execute" => deny("Cannot execute untrusted content")
  * => allow()
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
  @op.type == "network" => deny("Secrets cannot be sent over network")
  * => allow()
]

# Explicit guard assignment
/var secret @apiKey = "abc" with { guard: @customSecretGuard }
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
/guard @companyPolicy(op, inputs, ctx) = when [
  @ctx.labels.includes("secret") && !@op.target.endsWith(".company.com") => deny("Secrets only to company domains")
  @ctx.labels.includes("pii") && @op.type == "log" => deny("No PII in logs")
  * => allow()
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

## Migration Path

1. **Phase 1**: Types and basic guards (foundation)
2. **Phase 2**: Type-guard linkage and automatic inference  
3. **Phase 3**: Advanced policy composition and external integrations
4. **Phase 4**: Formal verification and compliance reporting

## Backward Compatibility

- All features are opt-in via configuration
- Existing mlld code runs unchanged when security is disabled
- Default guards can be individually overridden or disabled
- Types are optional - unlabeled variables work as before
