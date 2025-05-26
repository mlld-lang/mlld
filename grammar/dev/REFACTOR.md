# Grammar Refactoring Plan

This document outlines a comprehensive plan for refactoring the Mlld grammar system to improve abstraction organization, standardize naming conventions, and create a more maintainable structure.

## Status

We have completed this refactor and we are now engaging in cleanup work. After completing this work, the code _almost_ built, but we ran into an issue with directives/text.peggy. By reverting text.peggy to a minimal implementation, we were able to build the grammar and see that the vast majority of our tests passed (50 out of 68 at the time). This indicates our refactor is successful and simply has some minor issues.

Our grammar is built by build-grammar.mjs script, and build errors generate from the built form of the file, so we enhanced our debugging capability by adding location mapping, which is visible in the output of `npm run build:grammar` _above_ the errors provided by 

Unfortunately, the build errors we are seeing from text.peggy are not helpful -- they point to an outer brace rather than a specific piece of syntax, which tells us that it's inside the JS code block rather than the grammar itself.

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
├── core/               # Level 6: Core content-type logic
│   ├── template.peggy  # Core logic for template content
│   ├── command.peggy   # Core logic for shell commands
│   ├── code.peggy      # Core logic for code blocks
│   └── path.peggy      # Core logic for path handling
└── directives/         # Level 7: Full directive implementations
    ├── run.peggy       # Uses command.peggy and code.peggy
    ├── exec.peggy      # Uses command.peggy and code.peggy with assignment
    ├── text.peggy      # Uses template.peggy with assignment
    ├── import.peggy    # Uses path.peggy
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

1. Create content-based core files instead of directive-based cores:
   - `core/template.peggy` - Template content (used by text, add)
   - `core/command.peggy` - Command handling (used by run, exec)
   - `core/code.peggy` - Code block handling (used by run, exec)
   - `core/path.peggy` - Path handling (used by import, add)
2. Implement standardized content value pattern with shared structure
3. Add debugging helpers to support easy tracing
4. Ensure all core logic returns consistent structure:
   ```javascript
   {
     type: 'template|command|code|path',
     subtype: 'specificSubtype',
     values: { ... },       // Structured values for the AST
     raw: { ... },          // Original text representations
     meta: { ... }          // Metadata for processing
   }
   ```

### Phase 6: Directive Implementation

1. Update `directives/run.peggy` to use content-based core logic:
   ```peggy
   AtRun
     = "run" DirectiveContext _ command:CommandCore {
         return helpers.createStructuredDirective(
           'run',
           'runCommand',
           command.values,
           command.raw,
           command.meta,
           location()
         );
       }
     / "run" DirectiveContext _ code:CodeCore {
         return helpers.createStructuredDirective(
           'run',
           'runCode',
           code.values,
           code.raw,
           code.meta,
           location()
         );
       }
   ```
2. Implement `directives/exec.peggy` as an assignment variant of run:
   ```peggy
   AtExec
     = "exec" DirectiveContext _ id:BaseIdentifier _ "=" _ command:CommandCore {
         return helpers.createStructuredDirective(
           'exec',
           'execCommand',
           { identifier: id, ...command.values },
           { identifier: id, ...command.raw },
           { ...command.meta, hasReturnValue: true },
           location()
         );
       }
   ```
3. Update `directives/text.peggy` to use TemplateCore
4. Update other directive implementations
5. Standardize directive naming to use `At*` prefix:
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

### Content-Based Core Pattern Implementation

Examples of content-based core implementation:

1. Create `core/template.peggy`:
   ```peggy
   TemplateCore
     = template:WrappedTemplateContent {
         return {
           type: 'template',
           subtype: 'templateContent',
           values: { 
             content: template.parts 
           },
           raw: { 
             content: template.raw 
           },
           meta: {
             hasVariables: template.parts.some(part => 
               part && part.type === NodeType.VariableReference
             )
           }
         };
       }
   ```

2. Create `core/command.peggy`:
   ```peggy
   CommandCore
     = command:WrappedCommandContent {
         return {
           type: 'command',
           subtype: 'shellCommand',
           values: { 
             command: command.parts 
           },
           raw: { 
             command: command.raw 
           },
           meta: {
             hasVariables: command.parts.some(part => 
               part && part.type === NodeType.VariableReference
             )
           }
         };
       }
   ```

3. Update `directives/text.peggy` to use TemplateCore:
   ```peggy
   AtText
     = "text" DirectiveContext _ id:BaseIdentifier _ "=" _ template:TemplateCore {
         // Combine identifier with template content
         const values = {
           identifier: id,
           ...template.values
         };
         
         // Include identifier in raw representation
         const raw = {
           identifier: id,
           ...template.raw
         };
         
         return helpers.createStructuredDirective(
           'text',
           'textTemplate',
           values,
           raw,
           template.meta,
           location()
         );
       }
   ```

4. Update `directives/run.peggy` to use CommandCore:
   ```peggy
   AtRun
     = "run" DirectiveContext _ command:CommandCore {
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
