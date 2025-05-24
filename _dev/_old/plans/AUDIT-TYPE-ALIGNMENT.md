# Type System Alignment Audit

## Overview

This document compares the type definitions between `core/types` and `core/ast/types` to identify misalignments and inconsistencies. The goal is to establish a clear path toward a unified, consistent type system where:

1. Type definitions are aligned between both systems
2. We have a clear strategy for which types belong where
3. We can make `core/types/index.ts` a clean, centralized export point for all types

## Identified Misalignments

### Position & SourceLocation

**core/ast/types/primitives.ts:**
```typescript
export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}
```

**core/types/index.ts:**
```typescript
export interface Position {
  /** The line number (1-based) */
  line: number;
  /** The column number (1-based) */
  column: number;
}

export interface Location {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
  /** Optional file path */
  filePath?: string;
}
```

**Issue:** 
- AST version includes `offset` property
- Core version uses `Location` instead of `SourceLocation`
- Core version includes optional `filePath`

**Recommendation:**
Standardize on a single definition that includes all needed properties:
```typescript
export interface Position {
  /** The line number (1-based) */
  line: number;
  /** The column number (1-based) */
  column: number;
  /** Character offset from start of file */
  offset: number;
}

export interface SourceLocation {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
  /** Optional file path */
  filePath?: string;
}
```

### BaseMeldNode

**core/ast/types/primitives.ts:**
```typescript
export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}
```

**core/types/base/index.ts:**
```typescript
export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}
```

**Issue:**
- The definitions are identical, but they refer to different `SourceLocation` types
- One includes `offset` and one doesn't

**Recommendation:**
Ensure both systems use the same definition, with standardized `SourceLocation` that includes the `offset` property.

### DirectiveSource

**core/ast/types/primitives.ts:**
```typescript
export type DirectiveSource = 'path' | 'variable' | 'template' | 'literal' | 'embed' | 'run' | 'directive';
```

**core/types/nodes/directive.ts:**
```typescript
export type DirectiveSource = 'literal' | 'variable' | 'template' | 'path' | 'command' | 'code' | 'exec' | string;
```

**Issue:**
- Different allowed values between the two systems
- AST version has 'embed', 'run', 'directive' values
- Core version has 'command', 'code', 'exec' values
- Core version allows any string via the `string` union type
- Semantic intention is different between the two

**Recommendation:**
Standardize on a single definition that encompasses all valid directive sources:
```typescript
export type DirectiveSource = 
  | 'path' 
  | 'variable' 
  | 'template' 
  | 'literal' 
  | 'embed' 
  | 'run'
  | 'directive'
  | 'command' 
  | 'code' 
  | 'exec';
```

If allowing arbitrary string values is intentional, keep the `| string` part in the unified definition.

## Implementation Strategy

Based on our deeper analysis of duplication between the two type systems, we recommend a more fundamental approach to reorganization:

### Recommended Approach: Clear Separation of Concerns with Re-exports

This approach involves establishing a clear separation between AST types (in `core/ast/types`) and service types (in `core/types`), with `core/types/index.ts` acting as the unified export point:

1. **Keep AST Types in core/ast/types**:
   - Make this the definitive source for all AST node types
   - All parsing-related types stay here
   - All directive structure types stay here

2. **Keep Service Types in core/types**:
   - Focus on service interfaces, processing contexts, etc.
   - Remove all AST node type duplications

3. **Make core/types/index.ts the unified export point**:
   - Re-export everything from core/ast/types
   - Export service types directly

Implementation steps:

```typescript
// In core/types/index.ts

// First import and re-export all AST types
export * from '@core/ast/types';

// Then export service-specific types
export * from './services/context';
export * from './services/handlers';
export * from './system';
// etc...

// For any remaining conflicts, use explicit imports and exports with renames
import { SourceLocation as ASTSourceLocation } from '@core/ast/types';
export { ASTSourceLocation };
```

### Alternative Approach: Full Cleanup and Consolidation

If a more thorough cleanup is desired, consider:

1. **Remove completely redundant files**:
   - Identify files in `core/types` that only duplicate AST types
   - Create a migration plan to remove them
   - Update imports across the codebase

2. **Handle critical misaligned types**:
   - Update Position/SourceLocation in core/ast/types to add filePath
   - Update DirectiveSource to include all valid values
   - Document which type system should be used for what purposes

3. **Consolidate toward a cleaner structure**:
   - Gradually move toward cleaner separation of concerns
   - Eventually have distinct AST types and service types

Pros:
- Clearer separation of concerns
- Reduces confusion about which types to use
- Eliminates duplication
- Single import point for all types

Cons:
- More work to refactor existing code
- Requires careful testing to avoid regressions

## Next Steps

1. **Complete Type System Audit:**
   - Identify all redundant type definitions in `core/types`
   - Create a complete list of files that can be eliminated
   - Document the "source of truth" for each type concept

2. **Fix Critical Misalignments:**
   - Update core/ast/types/primitives.ts:
     - Add optional filePath to SourceLocation
   - Update core/ast/types/primitives.ts:
     - Expand DirectiveSource to include all values
   - Document any other critical misalignments that need immediate attention

3. **Update core/types/index.ts:**
   - Add re-exports for all core/ast/types
   - Remove redundant type exports
   - Maintain exports for service-specific types
   - Add clear documentation about type organization

4. **Create Removal Plan:**
   - Identify files that can be safely eliminated
   - Create a stepped migration plan with deadlines
   - Document deprecated files with clear comments

5. **Testing and Validation:**
   - Add type compatibility tests
   - Use TypeScript strict mode to check for type errors
   - Verify imports work correctly across the codebase

6. **Documentation:**
   - Update AST Explorer documentation
   - Add clear guidelines for which types to use where
   - Document the new type organization in ARCHITECTURE.md

### DirectiveNode

**core/ast/types/primitives.ts:**
```typescript
export interface DirectiveNode extends BaseMeldNode {
  type: 'Directive';
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  source?: DirectiveSource;
  values: { [key: string]: BaseMeldNode[] };
  raw: { [key: string]: string };
  meta: { [key: string]: unknown };
}
```

**core/types/nodes/directive.ts:**
```typescript
export interface DirectiveNode extends BaseMeldNode {
  type: 'Directive';
  
  // Top-level directive properties
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  
  // Source of content (where the content originated)
  source?: DirectiveSource;
  
  // Structured values with semantic grouping
  values: { [key: string]: BaseMeldNode[] };
  
  // Raw text segments parallel to values
  raw: { [key: string]: string };
  
  // Metadata and derived information
  meta: { [key: string]: unknown };
  
  // Parsing phase fields
  location?: SourceLocation;
}
```

**Issue:**
- Structures are functionally identical
- Both systems reference `DirectiveKind` and `DirectiveSubtype` from AST types
- Core version has duplicate `location` property (already inherited from BaseMeldNode)
- Core version includes comments and better formatting

**Recommendation:**
Standardize on the core version format (with comments) but remove the duplicate `location` property.

## Audit Tasks

- [x] Complete full audit of Position/SourceLocation/Location
- [x] Audit BaseMeldNode implementations
- [x] Audit DirectiveNode implementations
- [x] Audit DirectiveSource definitions
- [ ] Identify all other overlapping type definitions
- [ ] Check for subtle differences in similar but differently named types

## Summary of Key Findings

Based on our initial audit, we've identified several key areas of misalignment between `core/types` and `core/ast/types`:

1. **Position/SourceLocation:**
   - AST version includes `offset` property which is missing in core version
   - Naming differences: SourceLocation vs Location
   - Core version has optional filePath property

2. **DirectiveSource:**
   - Different sets of allowed values
   - Core version allows arbitrary strings while AST version is strict

3. **DirectiveNode:**
   - Mostly aligned but has duplicate location property in core version
   - Core version has better documentation via comments

### Broader Analysis of Duplication

A deeper analysis suggests that many of the types in `core/types` are simply duplications of `core/ast/types` with less complete or outdated definitions:

1. **AST Types Are More Complete**:
   - `core/ast/types` generally has more complete, consistent, and better-organized definitions
   - Type definitions appear to be auto-generated from examples using AST Explorer
   - Better modularization and documentation

2. **Significant Duplication**:
   - Almost all node definitions (TextNode, DirectiveNode, etc.) exist in both systems
   - Most directive types are duplicated
   - Base types and interfaces are defined in both places

3. **Types Unique to core/types**:
   - Service interfaces (ProcessOptions, Services)
   - Context types (DirectiveProcessingContext, ExecutionContext)
   - State and pipeline types
   - System organization types

### Recommended Approach

Rather than simply aligning types, a more fundamental approach is recommended:

1. **Make core/ast/types the source of truth for all AST-related types**:
   - Node definitions
   - Directive structures
   - Parsing-related types

2. **Keep core/types focused only on service and processing types**:
   - Context objects
   - Service interfaces
   - Processing options
   - State management

3. **Remove duplicate AST type definitions from core/types**:
   - Many files in `core/types/directives/` are redundant
   - `ast-nodes.ts` has simplified versions of what's in `core/ast/types/primitives.ts`

Once this separation of concerns is implemented, `core/types/index.ts` can be updated to re-export all from `core/ast/types`, creating a clean, single entry point for all type imports.

## Conclusion

The current state of types in the Meld codebase reveals significant duplication between `core/types` and `core/ast/types`, with many types in `core/types` being less complete or outdated versions of those in `core/ast/types`. Rather than simply aligning mismatched type definitions, a more fundamental reorganization is recommended.

The proposed solution is to establish a clear separation of concerns:
- `core/ast/types` becomes the definitive source for all AST-related types
- `core/types` maintains only service-related and processing types
- `core/types/index.ts` serves as the unified export point for all types

This approach will eliminate duplication, reduce confusion about which types to use, and create a more maintainable type system with clear boundaries. It will require some refactoring effort but will result in a more robust codebase with fewer potential sources of bugs related to type mismatches.

The most immediate tasks are to identify all redundant type definitions, fix critical misalignments in shared types, and update `core/types/index.ts` to re-export AST types. This should be followed by a gradual removal of redundant files and comprehensive documentation of the new type organization.

## References

- `core/types/index.ts`
- `core/ast/types/index.ts`
- `core/types/base/index.ts`
- `core/ast/types/primitives.ts`
- `core/types/nodes/directive.ts`
- `core/types/base/positions.ts`