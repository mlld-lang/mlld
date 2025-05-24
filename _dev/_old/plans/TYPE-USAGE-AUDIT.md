# Type Usage Audit

## Types Organization Analysis

### Current Type Structure

1. **AST Types (`core/ast/types/`):**
   - **Content:** Grammar-generated node types (TextNode, DirectiveNode, etc.)
   - **Purpose:** Represent AST nodes from the parser
   - **Key Files:** `index.ts`, `primitives.ts`, `base.ts`, directive-specific files

2. **Runtime Types (`core/types/`):**
   - **Content:** General system types, extensions of AST types, service interfaces
   - **Purpose:** Runtime extensions, state management, service definitions
   - Organized into subdirectories:
     - `nodes/` - Node type extensions
     - `directives/` - Directive-specific types
     - `services/` - Service interfaces and contexts
     - `extensions/` - Runtime extensions
     - `system/` - System-level types

3. **Old Types (to be removed):**
   - `core/syntax/types-old/` - Old AST types (renamed but not fully removed)
   - `core/types-old/` - Old runtime types (for reference)

## Import Pattern Analysis

1. **Most common imports from `@core/types`:**
   - `VariableType` and variable-related types
   - `ResolutionContext` and resolution-related types
   - Path-related types (`MeldPath`, `PathContentType`, etc.)
   - Common utility types (`JsonValue`, `Result`, etc.)

2. **Imports from `@core/ast/types`:**
   - `MeldNode` (the discriminated union)
   - `DirectiveNode` and other node types
   - Type guards for node typing

3. **Old imports to fix:**
   - `@core/syntax/types` → `@core/ast/types` (mainly for AST node types)
   - `node.directive.*` access patterns → `node.*` (only 5 files found)

## Type Hierarchy Dependencies

1. **Base Types:**
   - `BaseMeldNode` - Base for all AST nodes
   - `SourceLocation` - Location information
   - Common utility types (`JsonValue`, `Result`, etc.)

2. **AST Types extending Base Types:**
   - `TextNode`, `DirectiveNode`, etc.
   - All implemented in `core/ast/types`

3. **Runtime Extensions:**
   - `StateService` types extend AST types with runtime information
   - `ResolutionContext` types for variable resolution
   - Service interfaces and contexts

## Key Findings

1. **Types Location Confirmation:**
   - `core/ast/types` is the canonical location for AST node types
   - `core/types` is the canonical location for runtime/system types
   - No evidence of needing another type location

2. **Clean Imports:**
   - Most of the codebase already properly imports from `@core/types`
   - Only a handful of files still import from `@core/syntax/types`

3. **Type Usage Patterns:**
   - AST types are primarily used by the parser and interpreters
   - Runtime types extend AST types with additional properties/behavior
   - Services use type interfaces from `core/types/services`

4. **Old Types Status:**
   - Most old types appear to be properly migrated or no longer needed
   - `core/syntax/types-old` can likely be safely removed after fixing remaining imports

5. **Node.directive Pattern:**
   - Only 5 files use the old `node.directive.*` pattern that needs updating to `node.*`

## Recommendations

1. **Immediate Actions:**
   - Fix remaining `@core/syntax/types` imports (update to `@core/ast/types`)
   - Fix the 5 files with `node.directive.*` access patterns
   - Update the search script to exclude `@core/types` (already canonical)

2. **Type Structure Confirmation:**
   - Continue with current type structure: AST types in `core/ast/types`, runtime types in `core/types`
   - No need for additional type locations

3. **Cleanup:**
   - After fixing imports, remove `core/syntax/types-old` and `core/types-old` 
   - Run tests to verify everything works correctly

4. **Documentation:**
   - Document canonical type locations and usage patterns
   - Explain the relationship between AST and runtime types

## Required Types

Based on import analysis, the essential types needed are:

1. **AST Types:**
   - `MeldNode` - The discriminated union of all node types
   - `DirectiveNode` and specific directive nodes (`TextNode`, etc.)
   - Type guards for node typing

2. **State Types:**
   - `VariableType` and variable-related types
   - State management interfaces and types
   - Transformation options

3. **Service Types:**
   - Service interfaces and contexts
   - Processing context types
   - Resolution context types

4. **Path Types:**
   - Path representation and validation
   - Resource path types
   - Path purpose and content types

5. **Common Utility Types:**
   - `JsonValue`
   - `Result` type
   - `SourceLocation` and position types

All of these types are currently covered between `core/ast/types` and `core/types`, with no apparent gaps in the type system.