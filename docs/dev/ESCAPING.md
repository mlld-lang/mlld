---
updated: 2025-10-10
tags: #arch, #security, #interpreter
related-docs: docs/dev/DATA.md, docs/security.md, docs/slash/var.md, docs/slash/run.md
related-code: interpreter/core/interpolation-context.ts, interpreter/utils/shell-value.ts, interpreter/eval/run.ts, interpreter/utils/structured-value.ts
related-types: core/types { InterpolationContext, EscapingStrategy, StructuredValue }
---

# ESCAPING

## tldr

mlld uses context-aware escaping during interpolation. Variables store raw values (or StructuredValue wrappers). When interpolated into shell commands, they're classified by type and escaped. When used in templates or JavaScript, they're unwrapped to native values.

- **Escape at the boundary**: When values cross from mlld to shell
- **Context determines strategy**: `InterpolationContext.ShellCommand` vs `Template` vs `Default`
- **StructuredValue unwrapping**: `asText()` extracts `.text` before classification
- **Shell value classification**: Simple, array-simple, or complex → different serialization
- **Use stdin for raw payloads**: `/run { cmd } with { stdin: @data }` and `/run @data | { cmd }` send unescaped content via `asText()`

## Principles

- **Context-aware escaping**: Shell contexts escape, templates don't
- **Single source of truth**: Variables store raw, unescaped values
- **Escape at usage**: `interpolate()` applies context-appropriate escaping
- **No double escaping**: Each context gets exactly what it needs

## Details

### The Five Layers

1. **mlld Syntax Escaping** - `\@`, `\[`, `\]`, `\\` during parsing
2. **String Escape Processing** - `\n`, `\t`, etc. after parsing
3. **Variable Interpolation** - Replace `@var` with values
4. **StructuredValue Unwrapping** - Extract `.text` via `asText()` for shell contexts
5. **Shell Value Classification & Escaping** - Classify type, apply `InterpolationContext` strategy

### InterpolationContext System

Entry point: `interpreter/core/interpolation-context.ts`

```typescript
export enum InterpolationContext {
  Default = 'default',           // No escaping
  ShellCommand = 'shell-command', // Escape: \ " $ `
  Template = 'template',          // No escaping
  ShellCode = 'shell-code',       // Different shell context
  Url = 'url',                    // URL encoding
  DataValue = 'data-value',       // JSON-like
  FilePath = 'file-path'          // Path normalization
}
```

### StructuredValue and Shell Boundaries

Entry point: `interpreter/utils/structured-value.ts`

StructuredValue wrappers preserve both `.text` (string view) and `.data` (parsed structure). At shell boundaries:

1. **Unwrap first**: `asText(value)` extracts `.text` or coerces to string
2. **Classify**: `classifyShellValue()` determines serialization strategy
3. **Serialize**: Based on classification (simple, array-simple, complex)
4. **Escape**: Apply `ShellCommandEscapingStrategy` if needed

Shell value classification (`interpreter/utils/shell-value.ts`):
- **Simple**: Primitives, single-line strings → direct interpolation
- **Array-simple**: Arrays of simple values → space-separated
- **Complex**: Multi-line strings, objects, nested arrays → JSON stringify

### Shell Escaping Implementation

`ShellCommandEscapingStrategy` escapes these characters:
- `\` → `\\` (backslash)
- `"` → `\"` (double quotes)
- `$` → `\$` (dollar signs)
- `` ` `` → `` \` `` (backticks)

### The Critical Flow

```
/run {echo "@dangerous"}
          ↓
evaluateRun() calls interpolate(nodes, env, InterpolationContext.ShellCommand)
          ↓
interpolate() resolves @dangerous to value (may be StructuredValue wrapper)
          ↓
classifyShellValue(value) → calls asText() if StructuredValue → simple classification
          ↓
ShellCommandEscapingStrategy.escape() → "has \`backticks\`"
          ↓
env.executeCommand("echo \"has \`backticks\`\"")
```

### Where Context is Determined

`getInterpolationContext()` maps directive types to contexts:
- `/run` → `ShellCommand`
- `/var` with templates → `Template`
- JavaScript code → `Default`
- Executable command templates → `ShellCommand` (during invocation)

### Stdin Bypass

`/run { cmd } with { stdin: @data }` and `/run @data | { cmd }` bypass shell escaping entirely:

1. Expression evaluated via `resolveStdinInput()`
2. Result passed to `coerceValueForStdin()` which classifies and serializes
3. Classification may unwrap StructuredValues via `asText()` but applies no escaping
4. Command receives raw content via stdin

Entry point: `interpreter/eval/run.ts:resolveStdinInput()` → `coerceValueForStdin()`

## Gotchas

- **Shell executor can't escape**: By the time `executeCommand()` receives a string, it can't distinguish variables from literals
- **Escaping happens during interpolation**: Not before storage, not after execution
- **StructuredValue wrappers**: Must unwrap with `asText()` before classification
- **Array serialization**: Arrays with newlines/objects become JSON; simple arrays become space-separated

## Debugging

To trace escaping issues:
1. Check if value is StructuredValue wrapper - verify `asText()` called
2. Verify `classifyShellValue()` returns correct classification
3. Check if code path reaches `EscapingStrategyFactory.getStrategy()`
4. Verify correct `InterpolationContext` is passed

Key files:
- `interpreter/core/interpolation-context.ts` - Context enum and factory
- `interpreter/utils/shell-value.ts` - Classification logic
- `interpreter/utils/structured-value.ts` - Unwrapping helpers
- `interpreter/eval/run.ts` - Shell command execution and stdin handling
