# Add Directive Types Audit

This document contains the results of auditing the add directive implementation and types in the Mlld grammar.

## Current Implementation

The add directive is implemented in `/Users/adam/dev/mlld/grammar/directives/add.peggy` with four main variants:

1. Add Section: `@add "# Header" from [path.md] as "# New"` - Extracts a section from a file with optional title renaming
2. Add Template: `@add [[Template content]]` - Inlines template content
3. Add Variable: `@add @variable` - Inlines a variable's content
4. Add Path: `@add [path/to/file.md]` - Inlines content from a file path

Each variant also supports optional modifiers:
- Header level adjustment: `@add [path] as ###` (for adjusting heading levels)
- Under header placement: `@add [path] under My Section` (for placing content under a specific section)

## Current Type Definitions

The add directive is typed in `/Users/adam/dev/mlld/grammar/types/add.ts` with these interfaces:

1. `AddDirectiveNode`: Base interface with kind 'add' and subtypes 'addPath', 'addTemplate', 'addVariable', or 'addSection'
2. `AddPathDirectiveNode`: For file path inclusion with subtype 'addPath'
3. `AddTemplateDirectiveNode`: For template content with subtype 'addTemplate'
4. `AddVariableDirectiveNode`: For variable content with subtype 'addVariable'
5. `AddSectionDirectiveNode`: For section extraction with subtype 'addSection'

The types file has a well-structured organization with separate interfaces for:
- Raw values (`AddRaw` and specific variants)
- Structured values (`AddValues` and specific variants)
- Metadata (`AddMeta` and specific variants)
- Node types (`AddDirectiveNode` and specific variants)
- Type guards for type checking

## Issues and Misalignments

### 1. Source Attribute Inconsistencies

**Grammar Implementation**:
- Sets source in `createStructuredDirective` to:
  - 'section' for Add Section
  - 'template' for Add Template
  - 'variable' for Add Variable
  - 'path' for Add Path

**Type Definitions**:
- No explicit handling for the source attribute
- Source values are not documented or typed anywhere

### 2. Path Metadata Inconsistencies

**Grammar Implementation**:
- Creates path metadata with:
  - `hasVariables`: Whether the path contains variables
  - `isAbsolute`: Whether the path is absolute
  - `hasExtension`: Whether the path has a file extension
  - `extension`: The file extension if present

**Type Definitions**:
- `AddPathMeta` and `AddSectionMeta` only define `path.hasVariables`
- Missing the `isAbsolute`, `hasExtension`, and `extension` properties used in implementation

### 3. Header Level Value Type

**Grammar Implementation**:
- For header level, creates a number node:
  ```javascript
  values.headerLevel = [helpers.createNode(NodeType.Number, { value: headerLevelValue.value, raw: headerLevelValue.raw })];
  ```

**Type Definitions**:
- Several interfaces define `headerLevel?: number` (not as an array of nodes)
- This doesn't align with the implementation which creates an array with a Number node

### 4. Variable Node vs Variable Reference Node

**Grammar Implementation**:
- For Add Variable, uses `helpers.createVariableReferenceNode('varIdentifier', { identifier: id }, location()))`
- This creates a VariableReferenceNode

**Type Definitions**:
- Imports and uses `VariableNode` and `VariableNodeArray` from base.ts
- In `AddVariableValues`, defines `variable: VariableNodeArray`
- This is a mismatch with the actual implementation

### 5. AddDirectiveRef Structure

**Grammar Implementation**:
- `AddDirectiveRef` creates a simplified structure for RHS contexts with:
  - `subtype: 'addPath'`
  - `values: { path: path.parts }`
  - `raw: { path: path.raw }`
  - `meta: { path: { hasVariables: ... } }`

**Type Definitions**:
- No specific type for the return value of `AddDirectiveRef`
- This helper's return structure doesn't align with a formal type

## Recommendations

Based on the audit, here are recommendations for improving type alignment:

1. **Add Source Attribute Typing**:
   - Create a type for Add directive sources:
   ```typescript
   export type AddSource = 'path' | 'template' | 'variable' | 'section';
   
   export interface AddDirectiveNode extends TypedDirectiveNode<'add', 
     'addPath' | 'addTemplate' | 'addVariable' | 'addSection'> {
     // ...
     source: AddSource;
   }
   ```

2. **Update Path Metadata**:
   - Enhance the path metadata interfaces:
   ```typescript
   export interface AddPathMeta extends AddMeta {
     path: {
       hasVariables: boolean;
       isAbsolute?: boolean;
       hasExtension?: boolean;
       extension?: string;
     };
   }
   ```

3. **Fix Header Level Type**:
   - Update header level to correctly reflect it's an array of nodes:
   ```typescript
   export interface AddValues {
     // ...
     headerLevel?: TextNodeArray; // or a more specific NumberNodeArray if available
     // ...
   }
   ```

4. **Use VariableReferenceNode Consistently**:
   - Update the imports and type references:
   ```typescript
   import { 
     // ...
     VariableReferenceNode,
     // ... 
   } from '@core/syntax/types/nodes';
   
   export interface AddVariableValues extends AddValues {
     variable: VariableReferenceNode[];
     // ...
   }
   ```

5. **Add RHS Reference Type**:
   - Create a type for the AddDirectiveRef structure:
   ```typescript
   export interface AddDirectiveRef {
     subtype: 'addPath';
     values: {
       path: PathNodeArray;
     };
     raw: {
       path: string;
     };
     meta: {
       path?: {
         hasVariables: boolean;
       };
     };
   }
   ```

6. **Update Type Guards**:
   - Add a type guard for RHS references:
   ```typescript
   export function isAddDirectiveRef(node: any): node is AddDirectiveRef {
     return node && node.subtype === 'addPath' && node.values && node.values.path;
   }
   ```

## Next Steps

1. Document these findings in the comprehensive types audit report
2. Prioritize these changes for implementation after the audit phase
3. Consider updating the variable reference handling consistently across all directives