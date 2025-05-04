# Meld Grammar Documentation

This directory contains structured documentation for the Meld grammar, AST structure, and directive implementations. It serves as both reference documentation and implementation guidelines.

## Directory Structure

The documentation is organized by directive kind and subtype:

```
/grammar
  /docs
    README.md              # This file - overview and navigation
    PLAN.md                # Implementation plan and roadmap
    /import
      import.md            # Import directive overview
      import.importAll.md  # ImportAll subtype documentation
      import.importSelected.md  # ImportSelected subtype documentation
    /text
      text.md              # Text directive overview
      text.textVariable.md
      text.textTemplate.md
    ... (similarly for other directives)
```

This structure is mirrored in the implementation directories:

```
/grammar
  /directives              # Peggy grammar files
  /types                   # TypeScript type definitions
  /fixtures                # Test fixtures and examples
  /tests                   # Test implementation
```

Each of these implementation directories follows the same pattern of organization by directive kind and subtype.

## Documentation Format

### Directive Overview (e.g. `import.md`)

Each directive has an overview document that covers:

- Purpose and general usage
- Syntax patterns and variations
- Supported subtypes
- Common AST structure elements
- General handler behavior

### Subtype Documentation (e.g. `import.importAll.md`)

Each subtype has a dedicated document that provides:

- Specific syntax format
- AST structure details
- Values object structure and content
- Raw object structure and capture
- Metadata requirements
- Example AST outputs
- Edge cases and special handling

## AST Structure

All directives follow a consistent AST structure:

```typescript
interface DirectiveNode {
  type: 'Directive';
  kind: DirectiveKind;       // 'import', 'text', etc.
  subtype: DirectiveSubtype; // 'importAll', 'textAssignment', etc.
  
  // Values contains structured data organized by semantic groups
  // Values can contain arrays of nodes or nested directives
  values: { 
    [key: string]: MeldNode[] | DirectiveNode | { 
      [key: string]: MeldNode[] | DirectiveNode 
    }
  };
  
  // Raw contains the original text content for each value group
  raw: { [key: string]: string };
  
  // Meta contains derived properties and flags
  meta: { [key: string]: unknown };
}
```

This design supports recursive nesting of directives, allowing:

1. Directives as direct values: `@text content = @embed "file.txt"`
2. Directives within data objects: `@data config = { "content": @embed "file.md" }`
3. Directives within arrays: `@data results = [@run [command], @embed "file.txt"]`

## Type Definitions

Types are defined with strong typing to ensure consistency:

- Each directive kind has a dedicated type file
- Each subtype has clearly defined allowed properties
- Each value group has specified node types
- Type guards are provided for runtime validation

## Grammar Implementation

The grammar implementation follows the same structure:

- Each directive kind has a main grammar file
- Subtype-specific rules are clearly defined
- Raw text segments are captured alongside parsed nodes
- Helper methods ensure consistent AST creation

## Related Documentation

- [Implementation Plan](./PLAN.md) - Detailed implementation roadmap
- Core AST Types - [TypeScript definitions](/core/syntax/types/nodes.ts)
- Grammar Generation - [Build process](/grammar/build-grammar.mjs)