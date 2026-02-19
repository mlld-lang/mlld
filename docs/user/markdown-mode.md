# Markdown Mode

Markdown mode allows embedding mlld directives in markdown files. This is useful for executable documentation - files that render beautifully as markdown while also functioning as mlld scripts.

## File Extensions

| Extension | Mode | Behavior |
|-----------|------|----------|
| `.mld` | strict | Every line is a directive or blank. Text lines error. |
| `.mld.md` | markdown | `/` required for directives. Text becomes content. |
| `.md` | markdown | Same as `.mld.md` |

## Syntax

In markdown mode, directives require a leading slash:

```mlld
/var @name = "Alice"
/show `Hello @name!`
/=> "final output"
```

Plain text passes through as content:

```markdown
# Welcome

This text becomes output.

/var @greeting = "Hello"
/show @greeting
```

## When to Use Markdown Mode

Use markdown mode (`.mld.md`) when:

- Creating executable documentation that should render on GitHub
- Publishing modules to the registry (`.mld.md` is the recommended format)
- Writing scripts that include prose explanations

## When to Use Strict Mode

Use strict mode (`.mld`) when:

- Writing utility scripts
- Building tools and automation
- Code where prose output would be noise

Most day-to-day scripting uses strict mode.

## Example: Executable Documentation

**my-utils.mld.md:**
```markdown
---
name: my-utils
author: alice
about: Utility functions for common tasks
---

# My Utilities

A collection of useful mlld functions.

## String Formatting

/exe @titleCase(str) = js {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

## Number Utilities

/exe @clamp(n, min, max) = js {
  return Math.min(Math.max(n, min), max);
}

/export { @titleCase, @clamp }
```

This file:
- Renders as readable documentation on GitHub
- Works as a module: `import { @titleCase } from @alice/my-utils`
- Self-documents with prose explanations

## Publishing Modules

When publishing to the registry, `.mld.md` files are recommended:

```bash
mlld init my-module.mld.md
mlld add-needs my-module.mld.md
mlld publish my-module.mld.md
```

See [registry.md](registry.md) for full publishing documentation.

## Differences from Strict Mode

| Feature | Strict (`.mld`) | Markdown (`.mld.md`) |
|---------|-----------------|----------------------|
| Directive prefix | None required | `/` required |
| Plain text | Error | Becomes content |
| Comments | `>> comment` or `value << comment` | same |
| GitHub rendering | Code only | Full markdown |

## Best Practices

1. **Use `.mld.md` for modules** - Better documentation, GitHub-friendly
2. **Use `.mld` for scripts** - Cleaner, no slash noise
3. **Keep prose minimal** - Markdown mode is for docs, not novels
4. **Test both ways** - Ensure your module works when imported

