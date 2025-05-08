# Meld Grammar Documentation

This directory contains structured documentation for the Meld grammar, AST structure, and directive implementations. It serves as both reference documentation and implementation guidelines.

## Directory Structure

The documentation is organized by directive kind with comprehensive documentation for each directive:

```
/grammar
  /docs
    README.md              # This file - overview and navigation
    
    # Directive documentation files
    import.md              # Import directive with all subtypes
    text.md                # Text directive with all subtypes
    path.md                # Path directive with all subtypes
    data.md                # Data directive with all subtypes 
    add.md                 # Add directive with all subtypes
    run.md                 # Run directive with all subtypes
    exec.md                # Exec directive with all subtypes
```

> **NOTE**: We are in the process of consolidating all subtype-specific documentation into the main directive documentation files. For example, `importAll.md` and `importSelected.md` content will be combined into a comprehensive `import.md` document.

This structure is mirrored in the implementation directories:

```
/grammar
  /directives              # Peggy grammar files
  /types                   # TypeScript type definitions
  /tests                   # Test implementation
```

Each of these implementation directories follows the same pattern of organization by directive kind.

## Documentation Format

### Directive Documentation (e.g. `import.md`)

Each directive document provides comprehensive information on:

- Purpose and general usage
- Syntax patterns and variations
- Supported subtypes with detailed documentation for each:
  - Specific syntax format for each subtype
  - AST structure details
  - Values object structure and content
  - Raw object structure and capture
  - Metadata requirements
  - Example AST outputs
  - Edge cases and special handling
- Common AST structure elements
- General handler behavior

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

1. Directives as direct values: `@text content = @add "file.txt"`
2. Directives within data objects: `@data config = { "content": @add "file.md" }`
3. Directives within arrays: `@data results = [@run [command], @add "file.txt"]`

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

- Core AST Types - [TypeScript definitions](/core/syntax/types/nodes.ts)
- Grammar Generation - [Build process](/grammar/build-grammar.mjs)
