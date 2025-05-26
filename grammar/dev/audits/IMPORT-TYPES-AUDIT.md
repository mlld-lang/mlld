# Import Directive Types Audit

This document contains the results of auditing the import directive implementation and types in the Mlld grammar.

## Current Implementation

The import directive is implemented in `/Users/adam/dev/mlld/grammar/directives/import.peggy` with two variants:

1. Import All: `@import {*} from "path/to/file"` - Imports all variables from a file
2. Import Selected: `@import {var1, var2 as alias} from "path/to/file"` - Imports specific variables with optional aliases

## Current Type Definitions

The import directive is typed in `/Users/adam/dev/mlld/grammar/types/import.ts` with these interfaces:

1. `ImportDirectiveNode`: Base interface with kind 'import' and subtype 'importAll' or 'importSelected'
2. `ImportAllDirectiveNode`: For wildcard imports with subtype 'importAll'
3. `ImportSelectedDirectiveNode`: For specific variable imports with subtype 'importSelected'

## Issues and Misalignments

### 1. Variable Reference Node Structure

**Grammar Implementation**:
- Creates variable reference nodes for imports using `helpers.createVariableReferenceNode('import', { identifier: item.name, alias: item.alias || null })`
- Adds an `alias` property to variable reference nodes when aliases are used

**Type Definitions**:
- Uses `ImportWildcardNode` and `ImportReferenceNode` from values.ts
- These interfaces extend `VariableReferenceNode` but don't explicitly define an `alias` property
- The core `VariableReferenceNode` doesn't have an `alias` property either

### 2. Path Metadata Structure

**Grammar Implementation**:
- Creates path metadata with:
  - `hasVariables`: Whether the path contains variables
  - `isAbsolute`: Whether the path is absolute
  - `hasExtension`: Whether the path has a file extension
  - `extension`: The file extension if present

**Type Definitions**:
- `ImportMeta` extends `DirectiveMeta` and requires a `path` property
- The `PathMeta` interface only defines a `hasVariables` property
- Missing the `isAbsolute`, `hasExtension`, and `extension` properties used in implementation

### 3. Import Values Structure

**Grammar Implementation**:
- Creates a values object with:
  - `imports`: Array of variable reference nodes with added `alias` property
  - `path`: Path nodes array from PathCore

**Type Definitions**:
- `ImportValues` in values.ts has correct structure with `imports` and `path` properties
- The types are correct in concept but don't account for the added `alias` property

### 4. Source Attribute

**Grammar Implementation**:
- Sets source to 'path' in `createStructuredDirective`

**Type Definitions**:
- No explicit handling for the source attribute
- Implementation-defined source type is not documented or typed anywhere

## Recommendations

Based on the audit, here are recommendations for improving type alignment:

1. **Update Variable Reference Node Types**:
   - Update the core `VariableReferenceNode` interface or the import-specific extensions to include alias support:
   ```typescript
   export interface ImportReferenceNode extends VariableReferenceNode {
     identifier: string; // Any name except '*'
     valueType: 'import';
     alias?: string; // Add alias property
   }
   ```

2. **Enhance Path Metadata Structure**:
   - Update the `PathMeta` interface to include all path-related metadata:
   ```typescript
   export interface PathMeta {
     hasVariables: boolean;
     isAbsolute?: boolean;
     hasExtension?: boolean;
     extension?: string;
   }
   ```

3. **Standardize Source Attribute**:
   - Add explicit typing for source attribute:
   ```typescript
   export interface ImportDirectiveNode extends TypedDirectiveNode<'import', 'importAll' | 'importSelected'> {
     // ...
     source: 'path';
   }
   ```

4. **Add Type Guards**:
   - Add type guards for checking import directive types:
   ```typescript
   export function isImportAllDirective(node: ImportDirectiveNode): node is ImportAllDirectiveNode {
     return node.subtype === 'importAll';
   }
   
   export function isImportSelectedDirective(node: ImportDirectiveNode): node is ImportSelectedDirectiveNode {
     return node.subtype === 'importSelected';
   }
   ```

5. **Update Variable Reference Creation**:
   - Ensure the helper function for creating variable references properly handles the alias property:
   ```typescript
   // In appropriate helper file
   export function createImportReferenceNode(
     identifier: string,
     alias?: string,
     location?: SourceLocation
   ): ImportReferenceNode {
     return {
       type: 'VariableReference',
       identifier,
       valueType: 'import',
       isVariableReference: true,
       nodeId: crypto.randomUUID(),
       ...(alias && { alias }),
       ...(location && { location })
     };
   }
   ```

## Next Steps

1. Document these findings in the comprehensive types audit report
2. Prioritize these changes for implementation after the audit phase
3. Consider updating the variable reference node structure across all directives to ensure consistent handling of extended properties like aliases