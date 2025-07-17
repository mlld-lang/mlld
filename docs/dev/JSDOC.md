# JSDoc Comment Guidelines

## Purpose

This guide defines pragmatic JSDoc comment patterns for the mlld codebase. The goal is to provide context that would not be discernible from reading the code alone.

## Core Patterns

### 1. WHY Comments

Use when code does something non-obvious or when the reasoning behind a decision needs to be preserved.

```typescript
/**
 * Extract Variable value for display output
 * WHY: Display contexts need raw values because users see final content,
 *      not internal Variable metadata or wrapper objects
 */
const value = await resolveValue(variable, env, ResolutionContext.Display);
```

**When to use:**
- Extraction boundaries (Variable → raw value)
- Type conversions that seem unnecessary
- Complex logic that could be simplified but shouldn't be
- Design decisions that might be questioned

### 2. GOTCHA Comments

Warn about non-obvious behavior that might trip up developers.

```typescript
/**
 * Parse array in var directive
 * GOTCHA: Arrays with complex items are stored as AST nodes, not evaluated
 *         immediately. This enables lazy evaluation but means the value
 *         is not a regular array until accessed.
 */
if (hasComplexArrayItems(valueNode.items)) {
  resolvedValue = valueNode; // Stores AST, not array!
}
```

**When to use:**
- Behavior that contradicts reasonable expectations
- Side effects that aren't obvious
- Lazy evaluation that delays processing
- Type differences between similar operations

### 3. CONTEXT Comments

Describe the system state, environment, or assumptions the code operates under.

```typescript
/**
 * Execute pipeline command with arguments
 * CONTEXT: Runs in child environment with parameters bound as Variables
 *          @input is available as first parameter or via variable reference
 *          Parent variables are read-only, modifications stay in child env
 */
async function executePipelineCommand(cmd: Command, env: Environment) {
  const childEnv = env.createChild();
  // ...
}
```

**When to use:**
- Environment or scope assumptions
- System state requirements
- Dependencies on external state
- Execution context (child env, pipeline, etc.)

### 4. SECURITY Comments

Document security boundaries, implications, and constraints.

```typescript
/**
 * Enable file interpolation for this script
 * SECURITY: Once enabled, cannot be disabled for the lifetime of the script.
 *           This prevents malicious includes from re-enabling after a security
 *           check. Affects all child environments.
 */
enableFileInterpolation(): void {
  this._fileInterpolationEnabled = true;
  // Note: No way to set to false
}
```

**When to use:**
- Security boundaries
- Trust levels and validation
- Irreversible operations
- Permission checks
- Input sanitization

## Best Practices

1. **Be Specific**: Don't just say "for security reasons" - explain the specific attack vector
2. **Be Concise**: 2-4 lines maximum per comment type
3. **Use Consistently**: If one extraction uses WHY, all similar extractions should
4. **Update with Code**: When changing code, update its pragmatic comments
5. **Avoid Redundancy**: Don't document what the code clearly shows

## Examples from mlld

### Variable Resolution
```typescript
/**
 * Resolve variable with field access
 * WHY: Field access needs the Variable wrapper to track access paths
 *      and provide better error messages
 * CONTEXT: Variable may be lazy-evaluated, resolution triggers evaluation
 */
const resolved = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
```

### Pipeline Processing
```typescript
/**
 * Create pipeline input variable
 * WHY: Pipeline functions expect @input with text/json/csv/xml properties
 * GOTCHA: First stage gets raw string, later stages get PipelineInput objects
 * CONTEXT: Format is inherited from pipeline declaration or defaults to 'text'
 */
const inputVar = createPipelineInputVariable(name, value, format);
```

### Security Boundaries
```typescript
/**
 * Import environment variables
 * SECURITY: Only variables listed in mlld.lock.json are accessible
 *           This prevents scripts from accessing arbitrary env vars
 * CONTEXT: Validated at startup, script fails if required vars missing
 */
const allowedVars = await loadAllowedEnvVars();
```

## When NOT to Use These Patterns

- Don't document obvious code behavior
- Don't repeat what good variable/function names already convey  
- Don't use for TODOs or FIXMEs (use standard `// TODO:` instead)
- Don't document implementation details that might frequently change
- Don't duplicate information available in architecture docs
- Don't explain what the code does (focus on why)
- Don't add comments that will become stale quickly

## What Makes a Good JSDoc Comment

**WHY Comments**
- Explain design decisions that aren't obvious from reading the code
- Focus on the reasoning behind the implementation
- Example: "WHY: Display contexts need raw values because users see final content"

**GOTCHA Comments**
- Highlight non-obvious behavior or edge cases
- Warn about common mistakes or assumptions
- Example: "GOTCHA: First stage gets different input format than subsequent stages"

**CONTEXT Comments**
- Explain environmental assumptions or dependencies
- Clarify when/where behavior applies
- Example: "CONTEXT: Shadow environments isolate variable scopes"

**SECURITY Comments**
- Explain why security checks are necessary
- Highlight potential vulnerabilities
- Example: "SECURITY: Command execution requires validation to prevent injection"

## Migration Strategy

When adding pragmatic comments to existing code:
1. Review existing architecture docs first
2. Identify gaps between docs and implementation
3. Ask questions about non-obvious design decisions
4. Add comments only where they provide pragmatic value
5. Focus on boundaries and transitions where behavior changes