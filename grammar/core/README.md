# mlld Grammar Core Abstractions

This directory contains core content-type abstractions for mlld grammar. Unlike directive-based cores, these abstractions focus on the underlying content types that are reused across different directives.

## Purpose

Content-based core abstractions provide:

1. **Content-Centric Organization** - Organized around content types rather than directives
2. **Reusability Across Directives** - The same content handler can be used by multiple directives
3. **Standardization** - All core modules return a consistent structure
4. **Semantic Alignment** - Core modules reflect the actual content semantics

## Core Structure

Each core file exports rules that return a standardized object with the following structure:

```javascript
{
  type: 'template|command|code|path',  // Primary content type
  subtype: 'specificSubtype',          // Specific content variant
  values: { ... },                     // Structured values for the AST
  raw: { ... },                        // Original text representations
  meta: { ... }                        // Metadata for processing
}
```

## Available Core Modules

- **template.peggy** - Template content handling
  - Used by: `@text`, potentially `@add`
  - Handles: text templates with variable interpolation

- **command.peggy** - Shell command handling
  - Used by: `@run`, `@exec`
  - Handles: command strings with variable interpolation

- **code.peggy** - Code block handling
  - Used by: `@run`, `@exec`
  - Handles: code blocks with 

- **path.peggy** - Path reference handling
  - Used by: `@add`, `@import`, potentially `@text`
  - Handles: filesystem paths with variable interpolation

## Directive Composition Pattern

Directives are implemented through composition with these core content types:

```peggy
// In directives/run.peggy
AtRun
  = "@run" DirectiveContext _ command:CommandCore {
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        command.meta,
        location()
      );
    }
```

Assignment directives like `@text` and `@exec` add variable binding to a content type:

```peggy
// In directives/text.peggy
AtText
  = "@text" DirectiveContext _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      return helpers.createStructuredDirective(
        'text',
        'textTemplate',
        { identifier: id, ...template.values },
        { identifier: id, ...template.raw },
        template.meta,
        location()
      );
    }
```

This content-centric approach aligns with the true semantics of the grammar and reduces duplication when related directives share content handling patterns.
