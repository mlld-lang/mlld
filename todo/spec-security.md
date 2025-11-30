# mlld Security Specification: Data Labels, Guards, and Context

**Version**: Ultimate Vision (includes Tier 1 + Tier 2 features)

**Implementation Status**: Phase 4.0f complete (expression hooks). Tier 1 features in design/planning (see `plan-security.md` for roadmap).

**Note**: This spec describes the complete end-state vision, including features not yet implemented. See implementation notes throughout for current status.

## Overview

mlld's security model is built on three primitives that work together to provide foundational security without restricting flexibility:

- **Data Labels**: Declarative labels on data expressing its sensitivity and risk
- **Guards**: Rules that evaluate whether operations should proceed based on labels and context
- **Context (@ctx)**: Ambient execution metadata that flows through all operations

**Design Philosophy**: Non-paternalistic security. Provide sharp tools, enable users to build policies, don't enforce magic safety.

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
/guard before secret = when [
  @ctx.op.labels.includes("network") =>
    deny "Can't send secrets over network"
  * => allow
]
```

### Taint (accumulated labels)

- `taint` is the full label set on a value (explicit + inherited + automatic)
- Automatic labels: `src:exec` for `/run` and `/exe` outputs, `src:file` for content loads, `src:dynamic` for dynamic module imports
- File loads add `dir:/...` labels for every parent directory of the resolved real path (absolute, follows symlinks, no trailing separators, stop before root, platform case rules)
- Access via `@value.ctx.taint` in guards, pipelines, and iterators

### Guards

Guards are validation functions that decide whether operations should proceed. Guards run as pre-execution hooks that block unsafe directives and user-defined exe invocations before they execute (see `docs/dev/HOOKS.md` for hook infrastructure).

```mlld
/guard [@name] [timing] <filter> = when [
  condition1 => allow
  condition2 => allow @value
  condition3 => deny "reason"
  condition4 => retry "hint"
  condition5 => prompt "message"
  * => allow
]
```

**Syntax:**
- `[@name]` - Optional guard name for identification and overrides
- `[timing]` - Optional timing: `before` (default), `after`, or `always`
- `<filter>` - Required filter specifying what to guard

**Guard Filters (Required):**
- `<data-label>` - Per-input guard (fires individually for each labeled input). Examples: `secret`, `pii`, `untrusted`
- `op:<type>` - Per-operation guard (fires once with all inputs). Examples: `op:run`, `op:show`, `op:exe`

**Syntactic sugar:** `/guard [@name] for <filter> = when [...]` is equivalent to `before` timing. Using explicit `before` is recommended for clarity.

**Examples:**
```mlld
/guard before secret = when [...]           # Explicit (recommended)
/guard for secret = when [...]              # Syntactic sugar for 'before'
/guard @name before secret = when [...]     # Named with explicit timing
/guard @name for secret = when [...]        # Named with sugar (equivalent to 'before')
/guard after op:exe = when [...]            # After guard (no sugar alternative)
/guard always pii = when [...]              # Both before and after (no sugar alternative)
```

**Guard Actions**:
- `allow` - Operation proceeds ✅ **Implemented (Phase 4.0f)**
- `allow @value` - Operation proceeds with fixed/transformed value 🔄 **Tier 1**
- `deny "reason"` - Operation blocked, prints warning, continues if handler exists ✅ **Implemented (Phase 4.0f)**
- `retry "hint"` - Re-execute data source with hint (pipeline-only) ✅ **Implemented (Phase 4.0d)**
- `prompt "message"` - User confirmation required ⏭️ **Tier 2 (post-release)**

### Handling Guard Denials

When a guard returns `deny "reason"`, the operation is blocked but the script continues. Functions can handle denials gracefully using `denied =>` patterns in their when-blocks.

**Without deny handlers** (unhandled denial):
```mlld
/exe @process(input) = /run {process @input}

/guard before secret = when [
  @ctx.op.type == "run" => deny "Cannot execute secrets in shell"
  * => allow
]

/var secret @key = "abc"
/show @process(@key)
# Prints to stderr: [Guard Warning] Cannot execute secrets in shell
# Throws GuardError - script halts
# Function does NOT execute
```

**With deny handlers** (handled denial):
```mlld
/exe @process(input) = when [
  denied => output "Blocked: @ctx.guard.reason - input: @input" to "audit.log"
  denied => show "Operation blocked by security policy"
  * => /run {process @input}
]

/var secret @key = "abc"
/show @process(@key)
# Prints to stderr: [Guard Warning] Cannot execute secrets in shell
# Handler outputs to audit.log
# Handler shows "Operation blocked by security policy"
# Script continues - function returns handler results
```

**Syntactic sugar**: `denied` keyword in when-blocks evaluates to `@ctx.denied` (boolean).

**Multiple handlers**: All matching `denied =>` handlers execute in sequence (standard mlld when-block semantics).

**Handler context**:
- `@ctx.denied` - `true` when guard denied
- `@ctx.guard.reason` - The deny message from guard
- `@ctx.guard.name` - Guard name (if named)
- `@ctx.guard.filter` - Guard filter
- `@ctx.guard.input` - The Variable (or array) the guard evaluated (also available via `@ctx.input` while the guard context is active)
- Function parameters available as normal (e.g., `@input`, `@this`, `@that`)

**Design rationale**:
- **Explicit handling requirement**: Forces users to think about denial scenarios when writing security-critical functions
- **Orchestration resilience**: Long-running LLM scripts can log denials and continue rather than halt completely
- **Layered defense**: Deny handlers still subject to guards - trying unsafe operations in handlers triggers other guards
- **Adult language philosophy**: mlld provides sharp tools; guards help users build policies, not eliminate choices

**Best practice**: Functions that may be guarded should include `denied =>` handlers for logging, metrics, and graceful fallback.

**Guard Trigger Scopes:**

Per-input guards (data guards):
```mlld
/guard before secret = when [
  # @input is single value with label "secret"
  # Fires individually for each secret-labeled input
  @input.ctx.tokens > 5000 => deny "Secret too large"
  * => allow
]
```

Per-operation guards:
```mlld
/guard before op:run = when [
  # @input is array of ALL inputs
  # Fires once per /run directive
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell"
  * => allow
]
```

**Guard Execution Model:**

Guards execute as pre-execution hooks at evaluation boundaries (directives and user-defined exe invocations):
1. The hook runtime extracts and evaluates inputs (directive extraction logic or exe argument preservation)
2. System collects data labels from inputs
3. Matching guards evaluate before the directive/exe runs
4. Guards see the data (`@input`) and pending operation (`@ctx.op`)
5. Guards prevent directives/exe invocations from running (not post-validation)
6. Guard retry uses the pipeline retry infrastructure

**Directive example flow:**
```mlld
/var secret @key = @fetchKey()
/run {curl api.com -d "@key"}

# Directive execution:
# 1. Hook runtime extracts inputs: [@key]
# 2. Hook runtime sees @key has label [secret]
# 3. Guard hook evaluates for 'secret' with @input = @key
# 4. Guard checks @ctx.op and decides
# 5. If deny → error thrown, /run never executes
#    If allow → /run executes normally
#    If retry → retry context increments, @fetchKey() re-executes, loop continues
```

**Exe example flow:**
```mlld
/var secret @key = @fetchKey()
/exe network @sendKey(key) = {curl api.com -d "@key"}
/show @sendKey(@key)

# Exe execution:
# 1. Hook runtime preserves argument Variables: [@key]
# 2. Hook runtime sees @key has label [secret]
# 3. Guard hook evaluates for 'secret' with @input = @key
# 4. Guard checks @ctx.op.type == "exe" and operation labels ["network"]
# 5. If deny → GuardError thrown, executable never runs
#    If allow → Exe executes normally
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
/guard before op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets"
]

/run @func(@a, @b)
# Guard fires once: @input = [@a, @b]
```

`for op:exe` guards work the same way:
```mlld
/guard before op:exe = when [
  @ctx.op.labels.includes("network") && @input.any.ctx.labels.includes("secret") =>
    deny "No secrets in network executables"
  * => allow
]

/exe network @callAPI(payload) = {curl api.com -d "@payload"}
/var secret @key = "sk-test-123"
/show @callAPI(@key)  # Guard fires before executable runs
```
Exe guard inputs contain the original Variables passed directly as arguments.

**Expression Tracking**: Guards see security metadata through chained helpers, templates, field access, iterators, pipelines, and directive replay. Expression outputs retain provenance, so guards block transformed secrets instead of allowing bypasses.

## Expression Tracking

✅ **Status**: Implemented (Phase 4.2)

Expression tracking guarantees that every evaluator either inherits provenance from its inputs or materializes guard-visible Variables on demand.

### Coverage Summary

- **Builtin helpers**: String/array helper chains (`trim`, `slice`, `split`, `concat`, etc.) return raw primitives to user code but stay registered in the provenance WeakMap so guard extraction can recreate guard-visible Variables.
- **Interpolation + templates**: Backticks, `::` templates, condensed pipes, inline `/show`, and `/for` template loops all route through provenance-aware collectors.
- **Field and array access**: Nested field accessors and array helpers call `inheritExpressionProvenance()` so child values retain `.ctx.labels` from parents without reparsing the AST.
- **Iterators and pipelines**: `/for`, `/for parallel`, and `foreach` normalize iterator outputs while tagging each normalized element; pipeline stages merge descriptors via `finalizeStageOutput()` and propagate handles through retries.
- **Directive guard inputs**: `/show`, `/run`, `/output`, `/append`, `/var`, and guard-denial logging share the same materialization helpers, so guard hooks receive provenance-tagged Variables even when user code only produces primitives.

### Guard Protection

```mlld
/guard before secret = when [
  @ctx.op.labels?.includes("network") => deny "No secrets to network functions"
  * => allow
]

/var secret @key = "sk-123"
/exe network @sendAPI(data) = {...}

# Every transformation remains guarded:
/show @sendAPI(@key.trim())
/show @sendAPI(`Key: @key`)
/show @sendAPI(@key.slice(0,10))
/show @sendAPI(@data.api.key)
```

**Result**: Guard filters reach the same label set regardless of helper chains or traversal depth, eliminating the bypass vector.

**Schema Guards** _(Tier 2 - Ecosystem modules)_

Guards can validate data against schemas (implemented in userland modules):

```mlld
# Schema-style guard
/guard @userShape = {
  "email": {"type": "string", "pattern": ".*@.*"},
  "age": {"type": "number", "minimum": 0}
}

# Function-style guard
/guard @accessControl before secret = when [
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
/guard before secret = when [
  @opIs("run") => deny "No secrets in shell"
  @opIs("show") => deny "No secrets in display output"
  @inputHas("trusted") => allow  # Bypass if trusted

  # Raw context access still available
  @ctx.op.type == "import" => deny "No secret imports"
  @ctx.labels.length > 2 => deny "Too many risk labels"

  # Domain checking (Tier 2)
  @ctx.op.domains.includes("evil.com") => deny "Blocked domain"

  # Check user-labeled executables
  @ctx.op.labels.includes("network") => deny "No secrets over network"
]
```

**@input in Guards:**

Guards use `@input` to access the data being guarded. The shape of `@input` depends on guard scope:

**Per-input guards** (data guards like `for secret`):
- `@input` is a single Variable or value
- Access: `@input.ctx.labels`, `@input.ctx.taint`, `@input.ctx.tokens`
- Example: `@input.ctx.tokens > 10000 => deny "Too large"`

**Per-operation guards** (operation guards like `for op:run`):
- `@input` is an array with universal helpers
- Quantifiers: `@input.any`, `@input.all`, `@input.none`
- Aggregate: `@input.totalTokens()`, `@input.maxTokens()`
- Individual access: `@input[0].ctx.labels`
- Example: `@input.any.ctx.labels.includes("secret") => deny "..."`

Note: `@ctx.input` is an alias to `@input` (for consistency with pipeline semantics)

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
# /run - no implicit labels
@ctx.op = {
  type: "run",
  subtype: "cmd",      # or sh, bash, js, node, py
  command: "curl api.com",
  labels: [],  # No implicit labels for built-ins
  domains: ["api.com"]  # Auto-extracted (Tier 2)
}

# /import - no implicit labels
@ctx.op = {
  type: "import",
  importType: "live",
  path: "https://api.com/data",
  labels: [],  # No implicit labels for built-ins
  domains: ["api.com"]  # Auto-extracted (Tier 2)
}

# /show - no implicit labels
@ctx.op = {
  type: "show",
  labels: []  # No implicit labels for built-ins
}

# /output - no implicit labels
@ctx.op = {
  type: "output",
  target: "file.txt",
  labels: []  # No implicit labels for built-ins
}

# /var - no implicit labels
@ctx.op = {
  type: "var",
  name: "variableName",
  labels: []  # No implicit labels for built-ins
}
```

**Execution Context Types:**

Built-in directives are identified by `@ctx.op.type` and `@ctx.op.subtype`:
- `/run {...}` → `type: "run", subtype: "cmd"`
- `/run sh {...}` → `type: "run", subtype: "sh"`
- `/run bash {...}` → `type: "run", subtype: "bash"`
- `/run js {...}` → `type: "run", subtype: "js"`
- `/run node {...}` → `type: "run", subtype: "node"`
- `/run python {...}` → `type: "run", subtype: "py"`

### No Implicit Labels (Phase 4.0 Design Decision)

**Built-in directives have NO implicit labels.** Users must explicitly label their `/exe` functions to enable guard enforcement.

**Rationale:**
- Security properties come from what the CODE does, not what DIRECTIVE it uses
- `/run {curl api.com}` vs `/run {echo hello}` - same directive, different security profiles
- Prevents false security assumptions ("it's marked sandboxed so it's safe")
- Forces users to read their code and think about security
- Guards enforce only what users explicitly declare

**User-defined executables:**
```mlld
/exe network,paid @fetch() = {curl ...}  # labels: ["network", "paid"]
/exe @helper() = {echo ...}              # labels: [] (no labels)
```

**Phase 4.1+ may add inference** (detection + suggestion), but NOT automatic invisible labeling.

## Universal Array Helpers

**All array variables** in mlld have quantifier and aggregate helpers, not just `@input` in guards. This provides consistent, powerful array operations across the entire language.

### Quantifier Helpers

Available on all array variables:

```mlld
# ANY element matches condition
@items.any.ctx.labels.includes("secret")
@items.any.valid == true

# ALL elements match condition
@items.all.ctx.labels.includes("trusted")
@items.all.score > 5

# NO elements match condition (NONE)
@items.none.ctx.labels.includes("unsafe")
@items.none.failed == true
```

### Aggregate Helpers

Available via `.ctx` on array variables:

```mlld
# Union of all element labels
@items.ctx.labels  # ["secret", "public", "trusted"]

# Token metrics
@items.ctx.tokens         # [100, 200, 150] - array of token counts
@items.ctx.totalTokens()  # 450 - sum of all tokens
@items.ctx.maxTokens()    # 200 - maximum token count

# Union of all sources
@items.ctx.sources  # ["file.txt", "api.com"]
```

### Individual Access

Access specific array elements directly:

```mlld
@items[0].ctx.labels       # Labels for first element
@items[-1].ctx.taint       # Taint labels for last element
@items.raw                 # Original raw array (when using helpers)
```

### Usage Across mlld

These helpers work everywhere arrays are used:

**In guards:**
```mlld
/guard before op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "..."
  @input.totalTokens() > 50000 => deny "..."
]
```

**In pipelines:**
```mlld
/exe @check(items) = when [
  @items.all.valid => allow
  @items.any.failed => retry
  * => @items
]
```

**In regular code:**
```mlld
/var @data = [{label: "secret"}, {label: "public"}]
/var @hasSecret = @data.any.label == "secret"
```

### Design Notes

- Array helpers are **universal**, not guard-specific
- Aligns with DATA.md first-class array philosophy
- Consistent behavior across guards, pipelines, and regular code
- No special-case logic needed

## Built-in Labels

mlld ships with a minimal built-in label set. Labels can be applied to both data and operations.

### Data Labels

Labels describing data properties:

- `secret` - Sensitive data (passwords, keys, tokens)
- `pii` - Personally identifiable information
- `public` - Safe to expose anywhere
- `untrusted` - From external sources, potential injection risk
- `trusted` - From verified/safe sources

### Operation Labels

Labels describing what operations do (applied to `/exe` functions):

**Base labels with access modes**:
- `net` or `network` - Network operations
  - `net:r` - Read-only (GET, HEAD requests)
  - `net:w` - Write-only (POST, PUT, DELETE)
  - `net:rw` - Read and write (default if no mode)
- `fs` or `filesystem` - Filesystem operations
  - `fs:r` - Read files only
  - `fs:w` - Write files only
  - `fs:rw` - Read and write (default if no mode)

**Other labels**:
- `destructive` - Modifies or deletes data
- `paid` - Costs money (API calls, cloud resources)
- `safe` - Read-only, no side effects
- `moderate` - Writes data but recoverable
- `dangerous` - Irreversible operations

**Access mode defaults**: If no mode specified, defaults to `rw` (most permissive).

**Examples**:
```mlld
/exe net:r,safe @fetchData(url) = cmd {curl "@url"}
/exe net:w,paid @postMetric(data) = cmd {curl -X POST api.com -d "@data"}
/exe net:rw,paid @callClaude(prompt) = {...}

/exe fs:r,safe @readFile(path) = cmd {cat "@path"}
/exe fs:w,destructive @deleteFile(path) = cmd {rm "@path"}
/exe fs:rw,moderate @editFile(path) = {...}

/exe dangerous,destructive @wipeDir(path) = sh {rm -rf "@path"}

# Abbreviated form (net/fs shorthand)
/exe net:r,fs:r @inspect() = {...}
# Long form (equivalent)
/exe network:r,filesystem:r @inspect() = {...}
```

**Design principle**: No automatic labeling. Users must explicitly label `/exe` functions. This forces intentional security thinking and prevents false assumptions about safety.

**Security UX**: Granular modes enable precise guards. `net:r` with guards preventing URL interpolation is safer than blocking all network access.

## Built-in Guards

⏭️ **Status**: Tier 2 (ecosystem modules, not core)

Default guard libraries that prevent common security mistakes:

```mlld
# Prevent credential leaks
/guard @secretProtection before secret = when [
  @ctx.op.type == "show" => deny "Secrets cannot be displayed"
  @ctx.op.type == "run" => deny "Secrets in shell commands"
  @ctx.op.domains.length > 0 => deny "Secrets cannot be sent over network"  # Phase 4.1+
  * => allow
]

# Restrict destructive operations - requires explicit labeling
/guard @destructiveRestrictions before destructive = when [
  @ctx.op.type == "run" => deny "Destructive operations in shell require review"
  * => allow
]

# Restrict untrusted content
/guard @untrustedRestrictions before untrusted = when [
  @ctx.op.type == "run" => deny "Cannot execute untrusted content in shell"
  * => allow
]
```

**Note:** These guards rely on users explicitly labeling their data and executables. Without labels, guards have no basis for enforcement.

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
/guard @secretDataGuard before secret = when [
  @ctx.op.type == "run" => deny "Can't use secrets in shell"
  @ctx.op.labels.includes("network") => deny "Can't send secrets over network"
  @input.ctx.tokens > 10000 => deny "Secret too large"
  * => allow
]
```

**Operation Guards (per-operation):**
```mlld
# Fires once per /run directive with all inputs as array
/guard @shellRestrictions before op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "No secrets in shell"
  @input.totalTokens() > 50000 => deny "Total payload too large"
  * => allow
]

# Filter by subtype (js, node, py, etc.)
/guard @nodeSecurityPolicy before op:run = when [
  @ctx.op.subtype == "node" && @input.any.ctx.labels.includes("secret") =>
    deny "No secrets in Node.js"
  * => allow
]
```

**Operation Type Filters (op: prefix for built-ins):**

Guards can filter by built-in operation types using the `op:` prefix:

**Directive types:**
- `op:run`, `op:show`, `op:import`, `op:output`, `op:var`

**Within guards, check execution subtype via @ctx.op.subtype:**
- For `/run` directives: `@ctx.op.subtype` is `"cmd"`, `"sh"`, `"bash"`, `"js"`, `"node"`, `"py"`
- Example: `@ctx.op.type == "run" && @ctx.op.subtype == "node"`

**User-Defined Labels (NO op: prefix):**

Labels from `/exe` declarations are plain labels without prefix:

```mlld
/exe network,paid @fetch() = {curl ...}

# Guard by label (no op: prefix)
/guard before network = when [
  # Matches BOTH:
  #   - Data with label 'network'
  #   - Operations with label 'network' (from /exe)
  @ctx.op.type == "run" => deny "No network in shell"
  * => allow
]

/guard before destructive = when [
  # Matches data OR operations labeled 'destructive'
  * => deny "Destructive operations require approval"
]
```

**Key distinction:**
- `for op:<type>` = Built-in operation types (per-operation guard)
- `for <label>` = User-defined labels (per-input guard for data, or per-operation for /exe labels)
- No implicit labels on built-ins - users must label their `/exe` functions explicitly

## Guard Export and Import

Named guards can be exported and imported to enable reusable security policies:

```mlld
# security-policy.mld
/guard @noSecretsInLogs before secret = when [
  @opHas("output") => deny "No secrets in logs"
  * => allow
]

/guard @companyDomains before secret = when [
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
/guard @companyPolicy before secret = when [
  @ctx.op.domains.some(d => !d.endsWith(".company.com")) =>
    deny "Secrets only to company domains"
  * => allow
]

/guard @piiPolicy before pii = when [
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

### Fixing with Guards (allow @value)

🔄 **Status**: Tier 1 (in design)

Guards can fix invalid data using `allow @value`:

**See**: `plan-guard-allow-value.md` (needs creation after composition + before/after designed)

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

**Allow @value Semantics** (Tier 1):

Guards can transform/sanitize data before allowing operations:

```mlld
# Sanitize secrets before display
/guard before secret = when [
  @opIs("show") => allow @redact(@input)  # Replace with redacted version
  * => allow
]

# Fix LLM JSON
/guard for llmjson = when [
  @isValidJson(@input) => allow
  @isValidJson(@trimJson(@input)) => allow @trimJson(@input)  # Fix whitespace
  * => retry "Invalid JSON"
]

# Transform untrusted data
/guard for untrusted = when [
  @opIs("run") => allow @sanitize(@input)  # Escape shell characters
  * => allow
]
```

**Substitution flow**:
1. Guard evaluates `allow @transformedValue`
2. Hook system replaces original input with transformed value
3. Operation proceeds with sanitized data
4. Taint tracking updates labels on transformed value

**Taint propagation**:
- Transformed value inherits original labels by default
- Guards can add/remove labels via metadata (design TBD)
- Example: `allow @redact(@input)` keeps `secret` label but removes risky taint labels

**Composition**: When multiple guards return `allow @value`, transformations chain (first guard's output becomes second guard's input). See "Guard Composition" section.


# Execution:
# 1. @trimmer returns: allow @trimJson(@input)
# 2. @validator receives trimmed value
# 3. Validates trimmed version
```

**Chaining semantics**: Output of guard N becomes input of guard N+1

**Conflict resolution**: No conflicts possible - transforms chain sequentially

### Guard Overrides

Per-directive guard control:

```mlld
# Disable all guards
/show @sensitiveData with { guards: false }

# Disable specific guards
/show @data with { guards: { except: ["@alice/security", "@bob/validator"] } }

# Enable only specific guards (future)
/show @data with { guards: { only: ["@schemaCheck"] } }
```

**Semantics**:
- `guards: false` - Skip all guard evaluation for this operation
- `guards: { except: [...] }` - Skip named guards, run others
- Guard names must match registered guard `@name`

**Use cases**:
- Emergency overrides in controlled environments
- Testing (disable guards to test raw functionality)
- Gradual policy rollout (disable strict guards initially)

## Before/After Guards

✅ **Status**: Implemented (Phases 1-6 complete; docs/validation in Phase 7)

Guards fire before **and** after execution. Guard-before and guard-after share the same registry with timing filters; guard-always runs in both positions. After guards validate and can transform outputs; retry in after guards is intentionally not implemented and surfaces a clear error.

Streaming is incompatible with after guards. guard-post-hook throws when streaming is enabled and any after-timed guard applies, because streamed effects emit immediately and cannot be retracted during validation or retry.

**See**: `plan-guard-before-after.md`

### Syntax

```mlld
# Default: before execution
/guard before secret = when [...]
/guard before secret = when [...]  # Explicit

# After execution (output validation)
/guard afterllmjson = when [
  @isValidJson(@output) => allow
  * => retry "Invalid JSON in response"
]

# Both before and after
/guard always pii = when [
  @containsPII(@input) => deny "PII detected"
  * => allow
]
```

### Context in After Guards

After guards receive different context:

```mlld
/guard afterllmjson = when [
  # @input - Original input to operation
  # @output - Result from operation (aliased to @ctx.guard.output)
  @isValidJson(@output) => allow
  @canFix(@output) => allow @fix(@output)
  @ctx.guard.try < 3 => retry "Invalid response"
  * => deny "Can't fix output"
]
```

**Context variables**:
- `@input` or `@ctx.guard.input` - Original input to operation
- `@output` or `@ctx.guard.output` - Result from operation (what after guard validates)
- `@ctx.op` - Operation metadata (past tense: describes what JUST happened)
- `@ctx.guard.{try,tries,max}` - Retry tracking

### Actions in After Guards

All guard actions work in after guards:

**allow** - Output proceeds unchanged
```mlld
/guard afterllmjson = when [
  @isValidJson(@output) => allow
  * => deny "Invalid JSON"
]
```

**allow @value** - Transform output before proceeding (implemented)
```mlld
/guard afterpii = when [
  @containsPII(@output) => allow @redactPII(@output)
  * => allow
]
```

**deny** - Block operation, throw error or run handler
```mlld
/guard afterjailbreak = when [
  @containsJailbreak(@output) => deny "LLM jailbreak detected"
  * => allow
]
```

**retry** - Re-execute operation with hint
```mlld
/guard afterschema:user = when [
  @matchesSchema(@output, @userSchema) => allow
  @ctx.guard.try < 3 => retry "Response must match user schema"
  * => deny "Schema mismatch after retries"
]
```

### Before + After Composition

Guards with same label can fire both before and after:

```mlld
/guard before secret = when [
  @ctx.op.labels.includes("network") => deny "No secrets over network"
  * => allow
]

/guard aftersecret = when [
  @containsSecret(@output) => deny "Operation leaked secret in output"
  * => allow
]

/exe network @processData(data) = {...}
/var secret @key = "sk-123"
/show @processData(@key)
# 1. Before guard checks input → blocks if network label
# 2. Operation executes (if allowed)
# 3. After guard checks output → blocks if secret in result
```

**Execution order**: All before guards → operation → all after guards

**Composition with always**: `/guard always` registers as both before AND after with same body

### Use Cases

**LLM Output Validation**:
```mlld
/guard afterllmjson = when [
  @isValidJson(@output) => allow
  @ctx.guard.try < 3 => retry "Invalid JSON"
  * => deny "LLM produced invalid JSON"
]
```

**Schema Compliance**:
```mlld
/guard afterschema:user = when [
  @matchesSchema(@output, @userSchema) => allow
  * => retry "Output doesn't match schema"
]
```

**Jailbreak Detection**:
```mlld
/guard afterllm = when [
  @containsJailbreak(@output) => deny "Jailbreak attempt detected"
  @containsInjection(@output) => deny "Prompt injection detected"
  * => allow
]
```

**PII Scrubbing** (with allow @value):
```mlld
/guard afterpii = when [
  !@containsPII(@output) => allow
  * => allow @redactPII(@output)  # Auto-scrub PII from outputs
]
```

## Network Activity Detection

⏭️ **Status**: Tier 2 (post-release enhancement)

Guards can detect network activity by examining `@ctx.op.domains`, which auto-extracts domains from:

- Protocol URLs: `https://api.com`, `ftp://server.com`
- Network commands: `curl api.com`, `wget example.com`, `ssh user@host.com`
- Git URLs: `git@github.com:user/repo`
- IP addresses: `8.8.8.8` (excluding private ranges)

```mlld
/guard before secret = when [
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

## Implementation Roadmap

This spec describes the complete vision. Implementation is phased:

### ✅ Implemented (Phase 4.0f - Current)

**Core Infrastructure**:
- Data labels on variables and executables
- Taint tracking with propagation
- Hook architecture (HookManager, ContextManager)
- Guard directive parsing and registry
- Guard pre-hooks at directive + exe boundaries
- Universal array helpers (`.any/.all/.none`, `.ctx` aggregates)
- Denied handler support (`denied =>` patterns)
- Guard export/import
- Pipeline-only retry

**See**: `plan-security.md` Phases 0-4.0f, `docs/dev/HOOKS.md`

### 🔄 Tier 1: Production Prerequisites (~5-6 weeks)

**Required before production release**:

1. **ctx/internal API split** - Clean, stable API (`plan-ctx-internal.md`)
2. **Expression tracking** - Close security bypass hole (`plan-expression-tracking.md` - needs creation)
3. **Guard composition** - Multi-guard policies (`plan-guard-composition.md` - needs creation)
4. **Before/after guards** - Output validation (`plan-guard-before-after.md` - needs creation)
5. **Allow @value** - Guard-based sanitization (`plan-guard-allow-value.md` - needs creation)
6. **Comprehensive tests** - Production test coverage (`plan-tier1-testing.md` - needs creation)

**Blocking Issues**:
- Expression tracking: `@secret.trim()` bypasses guards (security hole)
- Guard composition: Can't build multi-guard policies (single guard limitation)
- Before/after: Can't validate outputs (no LLM response validation)
- Allow @value: Can't sanitize data (deny-only is too blunt)
- ctx/internal: API instability (can't change later without breaking)

**See**: `plan-tier1-execution.md` for sequencing, `TQD-ship-security.md` for design discussions

### ⏭️ Tier 2: Post-Release Enhancements

**Valuable but not blocking**:

- **Guard testing infrastructure** - Userland DSL, `env.testGuard()` helper
- **Standalone retry** - Guard retry outside pipelines (complex architecture)
- **Built-in guards** - `@secretProtection`, `@piiRestrictions` (ecosystem modules)
- **Domain detection** - `@ctx.op.domains` auto-extraction (network activity)
- **Secret inference** - Auto-detect secrets (typeInference: "basic")
- **Enforcement modes** - Strict/paranoid modes
- **Prompt action** - `prompt "message"` for user confirmation

**Rationale**: Tier 2 items improve DX and add convenience, but Tier 1 closes security holes and enables core use cases.

**See**: `discuss-guard-retry.md` for retry analysis

---

## Backward Compatibility

- All features are opt-in via configuration
- Existing mlld code runs unchanged when security is disabled
- Default guards can be individually overridden or disabled
- Types are optional - unlabeled variables work as before
## Guard Composition

🔄 **Status**: Tier 1 (in execution)

**Current (Phase 4.0f)**: First matching guard stops evaluation.

**Tier 1 Design**: All guards execute as chains, decisions aggregate, hints/trace exposed, overrides configurable.

**See**: `plan-guard-composition.md`

### Guard Chains

Guards execute as **chains** in registration order (file top-to-bottom):
- Guards fire sequentially based on where they appear in your code
- Imports flatten at their position: guards from imported modules execute when `/import` appears
- Each guard sees the result of previous guards in the chain
- First `deny` stops the chain (remaining guards listed in trace but don't execute)

### Execution Model
- All guards matching a filter run in registration order (per-input or per-operation).
- Each guard returns a `GuardResult` (`allow`, `allow @value`, `deny`, `retry`).
- The guard runtime accumulates `guardResults[]` and builds an aggregate decision:
  1. If any guard denies → operation blocked; all deny reasons recorded.
  2. Else if any guard retries → operation retry triggered; hints combined.
  3. Else apply `allow @value` transforms sequentially (each guard sees transformed value).
  4. Else operation proceeds (all allow).
- Guard context exposes `@ctx.guard.trace` (one entry per guard), `@ctx.guard.hints` (structured array), `@ctx.guard.reasons` (denial reasons).
- In pipelines, `@p.guards` tracks guard activity across all stages.

### Hint & Trace Accumulation
```mlld
/guard @jsonValidator for llmjson = when [
  @isValidJson(@input) => allow
  * => retry "Response must be valid JSON"
]
/guard @schemaValidator for llmjson = when [
  @matchesSchema(@input, @userSchema) => allow
  * => retry "Response must match user schema"
]
# Both guards run; @ctx.guard.hints == [
#   { guardName: "@jsonValidator", hint: "Response must be valid JSON" },
#   { guardName: "@schemaValidator", hint: "Response must match user schema" }
# ]
```

### Transform Chaining
```mlld
/guard @trimmer for llmjson = when [
  * => allow @trimJson(@input)
]
/guard @validator for llmjson = when [
  @isValidJson(@input) => allow
  * => retry "Invalid JSON"
]
# Guards execute in file order: @trimmer → @validator
# @validator receives the trimmed value from @trimmer
# Transforms chain: Guard N output → Guard N+1 input
# Provenance preserved: sources include 'guard:@trimmer'
```

### Overrides
```mlld
/show @llm(@secret) with {
  guards: {
    except: ["@team/compliance"],
    only: ["@core/sanitizer"]
  }
}
```
- `guards: false` disables all guards (emits warning to stderr).
- `guards: { only: [...] }` runs only named guards (unnamed guards excluded).
- `guards: { except: [...] }` skips named guards only (unnamed guards still run).

### Context
- `@ctx.guard.trace` – ordered array of guard evaluations.
- `@ctx.guard.hints` – structured hint objects `{ guardName, hint, severity }`.
- `@ctx.guard.reasons` – array of denial reasons.
- `@ctx.guard.reason` – first deny reason (backward compatibility).

### GuardError
- Includes `reasons[]`, `guardResults[]`, and `hints[]`.
- `error.reason` remains first deny for legacy consumers.
