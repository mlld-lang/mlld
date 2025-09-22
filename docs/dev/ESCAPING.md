---
updated: 2025-08-05
tags: #arch, #security, #interpreter
related-docs: docs/security.md, docs/slash/var.md, docs/slash/run.md
related-code: interpreter/core/interpolation-context.ts, interpreter/core/interpreter.ts, interpreter/eval/run.ts, interpreter/eval/for.ts
related-types: core/types { InterpolationContext, EscapingStrategy }
---

# ESCAPING

## tldr

mlld uses context-aware escaping during interpolation. Variables store raw values. When interpolated into shell commands, they're escaped. When used in templates or JavaScript, they're not. Bug exists where some code paths (nested functions, /for loops) bypass escaping, causing shell injection vulnerabilities.

- **Escape at the boundary**: When values cross from mlld to shell
- **Context determines strategy**: `InterpolationContext.ShellCommand` vs `Template` vs `Default`
- **No round-trip escaping**: Values stay raw until used
- **Critical bug**: Some paths skip `interpolate()` and concatenate raw values
- **Use stdin for raw payloads**: `/run { cmd } with { stdin: @data }` and `/run @data | { cmd }` send unescaped content

## Principles

- **Context-aware escaping**: Shell contexts escape, templates don't
- **Single source of truth**: Variables store raw, unescaped values
- **Escape at usage**: `interpolate()` applies context-appropriate escaping
- **No double escaping**: Each context gets exactly what it needs

## Details

### The Four Layers

1. **mlld Syntax Escaping** - `\@`, `\[`, `\]`, `\\` during parsing
2. **String Escape Processing** - `\n`, `\t`, etc. after parsing
3. **Variable Interpolation** - Replace `@var` with values
4. **Context-Specific Escaping** - Apply `InterpolationContext` strategy

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
interpolate() gets @dangerous value: "has `backticks`"
          ↓
ShellCommandEscapingStrategy.escape() → "has \`backticks\`"
          ↓
env.executeCommand("echo \"has \`backticks\`\"")
```

### Where Context is Determined

`getInterpolationContext()` maps directive types to contexts:
- `/run` → `ShellCommand`
- `/exe` → `ShellCommand`
- `/var` with templates → `Template`
- JavaScript code → `Default`

## Gotchas

- **The Bug**: `/for` loops and nested function calls bypass `interpolate()`, directly concatenating values
- **Shell executor can't escape**: By the time `executeCommand()` receives a string, it can't distinguish variables from literals
- **No shell-quote library**: Despite docs claiming otherwise, uses custom `ShellCommandEscapingStrategy`
- **Escaping happens during interpolation**: Not before storage, not after execution

## Debugging

To trace escaping issues:
1. Set breakpoint in `interpolate()` at `interpreter/core/interpreter.ts:1075`
2. Check if code path reaches `EscapingStrategyFactory.getStrategy()`
3. Verify correct `InterpolationContext` is passed
4. If bypassed, look for direct `String()` concatenation

Key files for the fix:
- `interpreter/eval/for.ts:84` - Direct string concatenation bug
- `interpreter/eval/exec-invocation.ts` - Nested function call handling
