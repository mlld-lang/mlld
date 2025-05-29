# STDIN Import Support for mlld

## Overview

This document outlines the design and implementation plan for adding stdin import support to mlld, allowing scripts to consume piped input through the familiar import syntax.

## Update: Revised Syntax Using @stdin

After reviewing mlld's import patterns, the most consistent syntax would be:

```mlld
# Import entire stdin
@import { content } from "@stdin"

# Import JSON fields from stdin
@import { name, version, config } from "@stdin"

# Import with aliases
@import { name as projectName } from "@stdin"

# Import all fields
@import { * } from "@stdin"
```

This aligns with existing patterns:
- File paths: `@import { x } from "[path/to/file]"`
- Registry modules: `@import { x } from "mlld://author/module"`
- Special source: `@import { x } from "@stdin"`

The `@stdin` syntax fits the pattern where `@` prefix indicates special/reserved identifiers.

## Alternative Approach - Global @INPUT Variable

We also considered using a global `@INPUT` variable:

```mlld
# Access entire stdin content
@text content = @INPUT

# For JSON input, access fields directly
@text projectName = @INPUT.name
@data version = @INPUT.version
@text theme = @INPUT.settings.theme

# Use in templates
@add [[Welcome to {{INPUT.name}} v{{INPUT.version}}]]
```

### Pros of @INPUT approach:
- ✅ Simpler syntax - no import needed
- ✅ More intuitive for simple use cases
- ✅ Direct field access for JSON: `@INPUT.field`
- ✅ Works immediately without explicit import

### Cons of @INPUT approach:
- ❌ Breaks mlld's "no magic variables" principle
- ❌ Less discoverable (how do users know @INPUT exists?)
- ❌ No way to alias or destructure
- ❌ Inconsistent with mlld's explicit declaration philosophy
- ❌ Could clash if user wants to define their own @INPUT


## Design Decision: @stdin as Reserved Import Source

The recommended approach is to use `@stdin` as a **reserved import source**. This approach:

1. **No Grammar Changes Required** - The existing import grammar already supports string literals in the path position
2. **Consistent Pattern** - Follows `@identifier` pattern for special sources (like `@author/module` in registry)
3. **Clean, Intuitive Syntax** - Matches existing import patterns perfectly
4. **Prevents File Name Collision** - The `@` prefix ensures no conflict with regular files
5. **Consistent with mlld Philosophy** - Simple, predictable, markdown-friendly

## Implementation Plan

### 1. Environment Class Extension

Add stdin reading capability to the Environment class:

```typescript
// In interpreter/env/Environment.ts
class Environment {
  private stdinContent?: string;
  
  async readStdin(): Promise<string> {
    if (this.stdinContent !== undefined) {
      return this.stdinContent; // Return cached content
    }
    
    // Read from stdin once and cache
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    this.stdinContent = Buffer.concat(chunks).toString('utf8');
    return this.stdinContent;
  }
}
```

### 2. Import Evaluator Modification

Add special handling in `interpreter/eval/import.ts`:

```typescript
// After line 29, before registry check
if (importPath === "@stdin") {
  return await evaluateStdinImport(directive, env);
}
```

### 3. Stdin Import Handler

Create a dedicated handler for stdin imports:

```typescript
async function evaluateStdinImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const content = await env.readStdin();
  
  // Try to parse as JSON first
  let variables: Map<string, Variable>;
  try {
    const jsonData = JSON.parse(content);
    variables = jsonToVariables(jsonData);
  } catch {
    // Fallback: entire content as 'content' variable
    variables = new Map([['content', {
      type: 'text',
      value: content,
      metadata: { source: 'stdin' }
    }]]);
  }
  
  // Handle different import types
  if (directive.subtype === 'importAll') {
    // Import all variables
    for (const [name, variable] of variables) {
      env.defineVariable(name, variable);
    }
  } else if (directive.subtype === 'importSelected') {
    // Import only selected variables
    const imports = directive.values.imports;
    for (const importItem of imports) {
      const varName = importItem.identifier;
      if (variables.has(varName)) {
        env.defineVariable(varName, variables.get(varName)!);
      } else {
        throw new Error(`Variable '${varName}' not found in stdin`);
      }
    }
  } else if (directive.subtype === 'importNamespace') {
    // Import as namespace
    const namespace = directive.values.imports[0].alias;
    const namespaceObj = Object.fromEntries(variables);
    env.defineVariable(namespace, {
      type: 'data',
      value: namespaceObj,
      metadata: { source: 'stdin' }
    });
  }
  
  return { type: 'void' };
}
```

## JSON Destructuring Behavior

### Example 1: JSON Input
```bash
echo '{"name": "my-project", "version": "1.0.0", "config": {"debug": true}}' | mlld script.mld
```

```mlld
# script.mld
@import { name, version, config } from "@stdin"
@text info = [[Project {{name}} v{{version}}]]
@data debugMode = @config.debug
@run [echo "Debug mode: {{debugMode}}"]
```

### Example 2: Plain Text Input
```bash
echo "Hello, mlld world!" | mlld script.mld
```

```mlld
# script.mld
@import { content } from "@stdin"
@text greeting = @content
@add [[Message: {{greeting}}]]
```

### Example 3: Nested JSON Handling
```bash
echo '{"user": {"name": "Alice", "role": "admin"}, "settings": {"theme": "dark"}}' | mlld script.mld
```

```mlld
# script.mld
@import { * } from "@stdin"
# Creates variables: user, settings
@text userName = @user.name
@text userRole = @user.role
@text theme = @settings.theme
```

## Error Handling

1. **Empty stdin**: Results in empty variable set (no error)
2. **Invalid JSON**: Falls back to single `content` variable containing raw text
3. **Missing variables**: Error when importing non-existent variables
4. **Binary data**: Detect non-UTF8 data and provide helpful error
5. **Timeout**: Consider adding configurable timeout (default: 5 seconds)

## Security Considerations

- Stdin imports bypass URL security checks (user explicitly piped data)
- Content size limits should still apply
- Track "stdin" as import source for circular dependency detection
- No special approval needed - considered trusted input

## Alternative Approaches Considered

### 1. Plain string: `@import { var } from "stdin"`
- ❌ Inconsistent with @ pattern for special sources
- ❌ Could conflict with a file named "stdin"
- ❌ Doesn't signal it's a special source

### 2. Environment variable: `@import { var } from "env://STDIN"`
- ❌ Conceptually wrong - stdin isn't an environment variable
- ❌ Would need new protocol handling infrastructure
- ❌ Confusing mental model

### 3. Built-in module: `@import { stdin } from "mlld://builtin"`
- ❌ Over-engineered for a single use case
- ❌ Would require registry-like infrastructure
- ❌ Breaks simplicity principle

### 4. Special variable: `@stdin` available globally
- ❌ Breaks explicit import pattern
- ❌ No way to destructure JSON
- ❌ Inconsistent with mlld's design

## Testing Strategy

1. **Unit tests** for stdin reading in Environment
2. **Integration tests** for import evaluation
3. **E2E tests** covering:
   - JSON destructuring
   - Plain text fallback
   - Empty stdin
   - Invalid JSON
   - Nested objects
   - Array handling
   - Binary data rejection

## Documentation Updates

1. Add stdin import section to `docs/directives/import.md`
2. Include examples in `docs/syntax-reference.md`
3. Add stdin piping examples to CLI usage guide
4. Create example files demonstrating common patterns

## Implementation for Global @INPUT Variable

If we decide to go with the global variable approach, here's how to implement it:

### 1. Detect if stdin has data (CLI entry point)
```typescript
// In cli/index.ts, before calling interpret()
let stdinContent: string | undefined;
if (!process.stdin.isTTY) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  stdinContent = Buffer.concat(chunks).toString('utf8');
}
```

### 2. Pass to interpreter options
```typescript
const result = await interpret(content, {
  // ... other options
  stdinContent
});
```

### 3. Inject @INPUT variable
```typescript
// In interpreter/index.ts, after creating Environment
if (options.stdinContent) {
  let inputValue: any;
  
  // Try to parse as JSON
  try {
    inputValue = JSON.parse(options.stdinContent);
  } catch {
    // Fallback to plain text
    inputValue = options.stdinContent;
  }
  
  env.setVariable('INPUT', {
    type: typeof inputValue === 'string' ? 'text' : 'data',
    name: 'INPUT',
    value: inputValue,
    metadata: {
      definedAt: { line: 0, column: 0, filePath: '<stdin>' },
      source: 'stdin',
      isReadOnly: true  // Prevent reassignment
    }
  });
}
```

### Usage Examples

#### JSON input:
```bash
echo '{"name": "project", "version": "1.0", "config": {"debug": true}}' | mlld script.mld
```

```mlld
# script.mld
@text projectInfo = [[{{INPUT.name}} v{{INPUT.version}}]]
@data debugMode = @INPUT.config.debug
@run [echo "Debug: {{debugMode}}"]
```

#### Plain text input:
```bash
echo "Hello, world!" | mlld script.mld
```

```mlld
# script.mld
@text message = @INPUT
@add [[Received: {{message}}]]
```

## Recommendation

While the `@INPUT` approach is simpler for basic use cases, I recommend sticking with the **import-based approach** for these reasons:

1. **Consistency**: mlld has no other magic variables - everything is explicitly declared
2. **Discoverability**: Import syntax is documented and expected
3. **Flexibility**: Supports destructuring, aliasing, and selective imports
4. **No Collisions**: Users can still define their own @INPUT if needed
5. **Philosophy**: Aligns with mlld's explicit, predictable design

The import approach is only slightly more verbose but much more aligned with mlld's design principles.

## Open Questions

1. Should we support streaming for large stdin inputs?
2. Should stdin be readable multiple times or just once?
3. How should we handle stdin in programmatic API usage?
4. Should we add a timeout for stdin reading?
5. If using @INPUT, should it be read-only to prevent accidental modification?
6. How do we document a magic variable without setting precedent for more?

## Next Steps

1. Implement Environment.readStdin() method
2. Add stdin special case to import evaluator
3. Implement JSON parsing and variable extraction
4. Add comprehensive test coverage
5. Update documentation
6. Consider adding stdin examples to the examples/ directory