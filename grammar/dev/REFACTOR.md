# Grammar Refactoring Plan

This document outlines a comprehensive plan for refactoring the Meld grammar system to improve abstraction organization, standardize naming conventions, and create a more maintainable structure.

## Goals

1. Reorganize file structure to match abstraction hierarchy
2. Implement standardized naming conventions
3. Strengthen context detection as a core abstraction
4. Consolidate duplicate abstractions
5. Eliminate circular dependencies
6. Improve documentation
7. Ensure backward compatibility

## New File Structure

```
grammar/
├── base/               # Level 1: Core primitives
│   ├── tokens.peggy    # Basic identifiers, characters
│   ├── literals.peggy  # Literal values 
│   ├── segments.peggy  # Basic text segments
│   └── context.peggy   # Context detection predicates
├── patterns/           # Levels 2-5: Reusable patterns
│   ├── variables.peggy # Variable reference patterns
│   ├── content.peggy   # Content patterns (formerly wrapped-content)
│   └── rhs.peggy       # Right-hand side patterns
├── core/               # Level 6: Core directive logic
│   ├── run-core.peggy  # Core logic for run operations
│   ├── text-core.peggy # Core logic for text operations
│   └── ...
└── directives/         # Level 7: Full directive implementations
    ├── run.peggy       # Uses run-core.peggy
    ├── text.peggy      # Uses text-core.peggy
    └── ...
```

## Refactoring Steps

### Phase 1: Setup and Preparation

1. Create the new directory structure
2. Update build scripts to support the new structure
3. Create a test branch for development
4. Update `NAMING-CONVENTIONS.md` in docs

### Phase 2: Context Detection Enhancement

1. Create `base/context.peggy` as a foundational abstraction
2. Define clear, reusable context predicates:
   ```peggy
   DirectiveContext "Directive context predicate"
     = &{ return helpers.isAtDirectiveContext(offset()); }
   
   VariableContext "Variable reference context predicate"
     = &{ return helpers.isAtVariableContext(offset()); }
     
   PlainTextContext "Plain text context predicate"
     = &{ return helpers.isPlainTextContext(offset()); }
     
   RHSContext "Right-hand side context predicate"
     = &{ return helpers.isRHSContext(offset()); }
   ```
3. Ensure helpers have the corresponding methods
4. Document the context detection system and its purpose
5. Use context predicates in variable access patterns first

### Phase 3: Base Abstractions

1. Move token patterns from `tokens.peggy` to `base/tokens.peggy`
2. Move literal patterns from `literals.peggy` to `base/literals.peggy`
3. Create `base/segments.peggy` with base text segment patterns
4. Standardize naming conventions:
   - `BaseIdentifier` instead of `Identifier`
   - `TextSegment` to `BaseTextSegment`
   - etc.

### Phase 4: Pattern Abstractions

1. Move variable patterns from `variable-access.peggy` to `patterns/variables.peggy`
   - Update using context predicates from base/context.peggy:
   ```peggy
   AtVar
     = "@" VariableContext id:BaseIdentifier {
         return helpers.createVariableReferenceNode('varIdentifier', {
           identifier: id
         }, location());
       }
   ```
2. Move content patterns from `wrapped-content.peggy` to `patterns/content.peggy`
3. Create `patterns/rhs.peggy` with RHS detection patterns
4. Standardize naming conventions:
   - `LiteralContent` to `QuotedContent`
   - `CommandStyleInterpolation` to `CommandInterpolation`
   - etc.

### Phase 5: Core Logic Extraction

1. Create `core/run-core.peggy` with extracted core Run logic
2. Create `core/text-core.peggy` with extracted core Text logic
3. Create core logic files for other directives
4. Implement standardized *Core pattern
5. Add debugging helpers to support easy tracing
6. Ensure all core logic returns consistent structure

### Phase 6: Directive Implementation

1. Update `directives/run.peggy` to use core logic and context predicates:
   ```peggy
   AtRun
     = "run" DirectiveContext _ core:RunCommandCore {
         return helpers.createStructuredDirective(
           'run',
           core.subtype,
           core.values,
           core.raw,
           core.meta,
           location(),
           core.source
         );
       }
   ```
2. Update `directives/text.peggy` to use core logic
3. Update other directive implementations
4. Standardize directive naming to use `At*` prefix:
   - `RunDirective` to `AtRun`
   - `TextDirective` to `AtText`
   - etc.

### Phase 7: Consolidate Template Content Handling

1. Eliminate duplicate template content handling in `text.peggy`
2. Use `WrappedTemplateContent` from `patterns/content.peggy` consistently
3. Standardize template handling patterns for all directives

### Phase 8: Testing and Validation

1. Update test files to match new structure
2. Create comprehensive tests for abstractions
3. Ensure all existing functionality works correctly
4. Validate that AST output remains unchanged

### Phase 9: Documentation

1. Update grammar documentation to reflect new structure
2. Document each abstraction level with clear examples
3. Create visual diagrams of abstraction hierarchy
4. Update README files in each directory

## Specific Task Breakdown

### Template Content Consolidation 

Current issue: `text.peggy` has `TemplatePlainContent` which duplicates functionality from `wrapped-content.peggy`'s `WrappedTemplateContent`.

Resolution steps:
1. Update `TextValue` in `text.peggy`:
   ```peggy
   TextValue
     = "@" addDirective:AtAdd { /* ... */ }
     / "@" runDirective:AtRun { /* ... */ }
     / textContent:WrappedTemplateContent { /* ... */ }
   ```

2. Remove `TemplatePlainContent` rule from `text.peggy`

3. Ensure `[[...]]` syntax is properly handled by `WrappedTemplateContent` 

### Directive Core Pattern Implementation

Example for `text.peggy`:

1. Create `core/text-core.peggy`:
   ```peggy
   TextValueCore
     = "@" addDirective:AtAdd {
         return {
           subtype: 'textAssignment',
           values: { content: addDirective },
           raw: { content: "@add " + addDirective.raw.path || "" },
           meta: { add: { type: addDirective.subtype } },
           source: 'add'
         };
       }
     / "@" runDirective:AtRun {
         return {
           subtype: 'textAssignment',
           values: { content: runDirective },
           raw: { content: "@run " + runDirective.raw.command || "" },
           meta: { run: { type: runDirective.subtype } },
           source: 'run'
         };
       }
     / template:WrappedTemplateContent {
         return {
           subtype: 'textTemplate',
           values: { content: template.parts },
           raw: { content: template.raw },
           meta: {},
           source: 'template'
         };
       }
   ```

2. Update `text.peggy`:
   ```peggy
   textAssignment
     = "text" _ id:BaseIdentifier _ "=" _ value:TextValueCore {
         // Create values with identifier
         const values = {
           identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
           ...value.values
         };
         
         // Create raw with identifier
         const raw = {
           identifier: id,
           ...value.raw
         };
         
         return helpers.createStructuredDirective(
           'text',
           value.subtype,
           values,
           raw,
           value.meta,
           location(),
           value.source
         );
       }
   ```

## Timeline and Priorities

1. First priority: Implement naming convention documentation
2. Second priority: Create new directory structure and update build scripts
3. Third priority: Strengthen context detection as a core abstraction
4. Fourth priority: Standardize variable access using context predicates
5. Fifth priority: Implement directive core pattern for run and text
6. Sixth priority: Consolidate template content handling
7. Seventh priority: Error handling improvements
8. Eighth priority: Extend to remaining directives

This refactoring will be done incrementally, with each phase validated before moving to the next to ensure backward compatibility is maintained throughout the process.