# mlld Grammar Directive Implementations

This directory contains the top-level implementations of mlld directives. Each directive is implemented as a composition of core content handlers.

## Directive Design Pattern

Each directive follows a consistent pattern:

1. **Import core content handlers** - Rather than implementing content handling directly, each directive imports the relevant core handlers.
2. **Compose directive from cores** - The directive creates a structured result by composing with the appropriate core content handler.
3. **Use context predicates** - Context detection predicates are used to disambiguate the @ symbol in different contexts.
4. **Follow standard naming** - Directive rules use the `At*` prefix (AtRun, AtText, etc.).
5. **Return consistent structure** - All directives return a consistent structure through `createStructuredDirective`.

## Directive Structure

Each directive returns an AST node created with `helpers.createStructuredDirective`:

```javascript
helpers.createStructuredDirective(
  'directiveKind',         // e.g., 'run', 'text', 'import'
  'specificSubtype',       // e.g., 'runCommand', 'textTemplate'
  valuesObject,            // Structured values for the AST
  rawObject,               // Original text representations
  metaObject,              // Metadata for processing
  location()               // Source location information
)
```

## Directive Implementations

- **run.peggy** - Implements `@run` for executing commands and code blocks
  - Uses: CommandCore, CodeCore
  - Forms: `@run command`, `@run language [code]`, `@run @commandVariable`

- **text.peggy** - Implements `@text` for variable definition through templates
  - Uses: TemplateCore
  - Forms: `@text varName = "template"`, `@text varName = @run command`

- Additional directives will follow the same pattern...

## Example: Composing with Core Content Handlers

```peggy
// Example directive implementation
AtRun
  = "@run" DirectiveContext _ command:CommandCore {
      // Use the command content handler result to create the directive
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

## RHS Context Handling

Some directives can appear in right-hand side (RHS) contexts within other directives:

```peggy
// Right-hand side reference
RunDirectiveRef
  = "@run" RHSContext _ command:CommandCore {
      // Similar to top-level but with RHS context
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        command.values,
        command.raw,
        { ...command.meta, isRHSRef: true },
        location()
      );
    }
```

This approach standardizes directive implementation, improves reusability, and reduces duplication across the grammar.