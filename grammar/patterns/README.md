# mlld Grammar Patterns

This directory contains pattern abstractions for the mlld grammar. These patterns are reusable components that can be composed to build directive parsers.

## Pattern Organization

The patterns are organized as follows:

### variables.peggy
Defines variable reference patterns used across different directives:
- `AtVar` - Direct variable references using `@var` syntax
- `InterpolationVar` - Template variable interpolation using `{{var}}` syntax
- `PathVar` - Legacy variable references using `$var` syntax (for backward compatibility)

Uses context predicates from `base/context.peggy` to disambiguate different uses of the `@` symbol.

### fields.peggy
Defines patterns for accessing fields in objects and arrays:
- `FieldAccess` - Dot notation for accessing object properties (e.g., `obj.property`)
- `NumericFieldAccess` - Numeric field access (e.g., `obj.123`)
- `ArrayAccess` - Array indexing with brackets (e.g., `array[0]`)

### content.peggy
Defines patterns for handling different types of content with variable interpolation:
- `PathContent` - Path-style content with `@var` interpolation
- `TemplateContent` - Template content with `{{var}}` interpolation
- `CommandContent` - Command content with various interpolation styles
- `CodeContent` - Literal code blocks without interpolation

## Usage in Directive Implementations

These patterns are intended to be used as building blocks for directive implementations in the `core/` directory. Each directive implementation should import the patterns it needs and compose them into directive-specific rules.

For example, the `@path` directive might import both the `variables.peggy` and `content.peggy` files to handle paths with variable interpolation.

## Context Detection

Variable patterns use context detection predicates from `base/context.peggy` to disambiguate different uses of the `@` symbol, ensuring that `@run` is recognized as a directive, while `@varName` is recognized as a variable reference.

Context detection determines what kind of construct we're parsing by analyzing the surrounding text.