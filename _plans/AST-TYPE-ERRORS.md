# Plan: Address AST Type Errors in Directive Tests

## Issue

Many AST test files for directives (located in `core/ast/tests/directives/`) extract the first node from the parsed AST (`result.ast[0]`) but do not explicitly cast it to `DirectiveNode`. This leads to TypeScript errors when trying to access the `.directive` property, as the base type `INode` does not have this property.

## Solution

For each affected test file:

1.  Import `DirectiveNode` from `@core/syntax/types`.
2.  Locate instances where `result.ast[0]` (or similar) is assigned to a variable (e.g., `const directive = result.ast[0];`).
3.  Add the type assertion `as DirectiveNode` to the assignment (e.g., `const directive = result.ast[0] as DirectiveNode;`).
4.  For tests using `Array.prototype.find()`, ensure the result is checked for `undefined` before accessing properties, or cast appropriately.

## Affected Files (To be updated)

- [x] `core/ast/tests/directives/embed-syntax.test.ts` (Completed)
- [ ] `core/ast/tests/directives/import.test.ts` (Needs check after finding correct file)
- [ ] (Add other directive test files here as they are identified)

## Goal

Eliminate TypeScript errors related to accessing `.directive` on `INode` types across all relevant directive test files.
