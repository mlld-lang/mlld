# Add Directive Renaming Implementation Plan

This document outlines the plan for completing the renaming of the `embed` directive to `add` throughout the codebase. As part of the AST value objects refactoring, we've already implemented the following changes:

1. Changed the grammar to use the new directive name:
   - Renamed `grammar/directives/embed.peggy` to `grammar/directives/add.peggy`
   - Renamed `grammar/types/embed.ts` to `grammar/types/add.ts`
   - Updated the directive handler in `meld.peggy`

2. Updated the syntax to improve consistency:
   - Changed `addPath` to use quotes instead of brackets: `@add "path/to/file"` instead of `@add [path/to/file]`
   - Changed `addTemplate` to use single brackets instead of double brackets: `@add [template]` instead of `@add [[template]]`
   - Removed `addMultiline` subtype entirely (consolidated into `addTemplate`)

3. Updated documentation to reflect the new syntax:
   - Updated all directive examples, syntax, and AST structure descriptions
   - Removed documentation for the `addMultiline` subtype

## Remaining Tasks

The following codebase changes are needed to complete the renaming:

### 1. Core Services & Handlers

- Rename `EmbedDirectiveHandler` to `AddDirectiveHandler` in service implementations
- Update all imports and references to the handler
- Update type signatures and interface implementations

Affected files include:
- `/services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`
- Any service tests that import the handler

### 2. Type Definitions

- Rename `EmbedSubtype` to `AddSubtype` in core type definitions
- Update enum values from `embedPath`, `embedVariable`, `embedTemplate` to `addPath`, `addVariable`, `addTemplate`
- Rename `EmbedDirectiveData` interface to `AddDirectiveData`

Affected files include:
- `/core/syntax/types/directives.ts`
- `/core/syntax/types/fixtures/embed.ts` (rename to `/core/syntax/types/fixtures/add.ts`)
- `/core/ast/index.ts` (check exports)

### 3. Test Files

- Update all test imports and references
- Rename test files containing "embed" in their name if they specifically test this directive

Affected files include:
- `/tests/embed-directive-fixes.test.ts`
- `/tests/embed-variable-transform.test.ts`
- `/tests/embed-transformation-e2e.test.ts`
- And potentially others

### 4. Documentation

- Ensure all user-facing documentation is updated:
  - `/docs/directives/embed.md` should be renamed to `/docs/directives/add.md`
  - Update any references in other documentation files

### 5. Example Files

- Update all example `.meld` files to use the new syntax
- Update code samples in README and other documentation

## Implementation Strategy

The recommended approach for implementing these changes is to:

1. Create a new branch from the current `ast-values-object-refactor` branch
2. Make a comprehensive search for all occurrences of "embed" in the codebase
3. Create a detailed task list of all files that need updating
4. Implement changes in logical groups (e.g., types first, then handlers, then tests)
5. Run targeted tests after each group of changes to ensure functionality is maintained
6. Update documentation and examples last

This systematic approach will help ensure that all references are updated consistently and that no functionality is broken during the transition.

## Backwards Compatibility Considerations

If backward compatibility is a concern, consider implementing a temporary compatibility layer that:
- Warns when using the old `@embed` syntax but still processes it correctly
- Maintains old type names alongside new ones with appropriate deprecation notices
- Provides clear migration documentation for users

## Testing Strategy

Each set of changes should be thoroughly tested:
1. Unit tests for updated handlers and services
2. Integration tests to ensure directives work correctly in context
3. End-to-end tests with real `.meld` files using the new syntax
4. Test both successful cases and error handling

## Conclusion

The renaming of `embed` to `add` improves the consistency of the Meld syntax by establishing a clear pattern: variable directives as four-letter nouns (`text`, `path`, `data`) and action directives as three-letter verbs (`add`, `run`). This enhances the usability and learnability of the Meld language.

The changes to the syntax (quoted paths, single brackets for templates) also create a more consistent and intuitive pattern that will be easier for users to learn and remember.