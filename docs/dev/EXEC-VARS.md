---
updated: 2025-01-19
tags: #arch, #interpreter, #exec, #variables
related-docs: docs/slash/exe.md, docs/dev/PIPELINE.md
related-code: interpreter/eval/exec-invocation/*.ts, 
interpreter/eval/exec-invocation/strategies/*.ts
related-types: core/types { ExecutableDefinition, Variable,
ExecInvocation }
---

# EXEC-VARS

## tldr

Executable variables store parameterized commands, code blocks, or templates created by `/exe` directives. Universal pattern: `@myvar` references the executable itself, `@myvar()` executes it. Everything has context from birth enabling natural retry semantics in pipelines.

## Principles

- Universal pattern: parentheses determine execution vs reference
- Everything is retryable (no detection logic needed)
- Context flows naturally through execution
- Strategy pattern handles different execution types

## Architecture

### Execution Types

**Strategy Pattern Implementation**
(`interpreter/eval/exec-invocation/strategies/`):
- `TemplateExecutionStrategy` - String interpolation
- `CommandExecutionStrategy` - Shell commands
- `CodeExecutionStrategy` - JS/Python/Bash code
- `WhenExecutionStrategy` - Conditional logic
- `ForExecutionStrategy` - Iteration
- `TransformerExecutionStrategy` - Built-in transformers

### Universal Context Integration

**Context Manager**
(`interpreter/eval/exec-invocation/context-manager.ts`):
- Everything has context from birth
- Natural retry semantics for pipelines
- Access to `@ctx.try`, `@ctx.stage` without wrapping

### Critical Components

**Metadata Shelf**
(`interpreter/eval/exec-invocation/helpers/metadata-shelf.ts`):
- Preserves LoadContentResult metadata through JS transformations
- Essential for alligator syntax features

**Variable Factory**
(`interpreter/eval/exec-invocation/helpers/variable-factory.ts`):
- 5 Variable creation patterns with type preservation
- Critical for parameter binding

## Gotchas

- Metadata shelf MUST be cleared after each invocation
- First matching strategy wins (order matters)
- @typeof needs Variable metadata access (special case)