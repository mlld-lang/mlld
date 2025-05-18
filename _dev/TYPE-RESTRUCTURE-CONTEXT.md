# Type Restructure Implementation Context

This document captures important decisions and context from the completed phases that will be needed for the remaining work.

## Completed Work Summary

### Steps 1-5b Progress
1. **Created unified type definitions** in `core/types/` with proper directory structure
2. **Defined MeldNode union** in `core/ast/types/index.ts` - this is now the single source of truth
3. **Implemented ParserService transformation** to convert raw AST to typed MeldNode union
4. **Updated StateService** to use new types - all tests passing
5. **Updated InterpreterService** to use new types - basic functionality works, but directive tests failing

## Key Decisions Made

### 1. Node Structure Consistency
- All nodes must have fields in this order: `type`, `nodeId`, `location` (optional), then specific fields
- TextNode structure: `{ type: 'Text', nodeId: string, location?: SourceLocation, content: string }`
- This ordering is important for consistency across the codebase

### 2. Import Path Strategy
- Old: `@core/syntax/types/index`
- New: `@core/ast/types/index`
- SourceLocation remains in `@core/syntax/types/nodes` for now
- InterpolatableValue also remains in `@core/syntax/types/nodes`

### 3. Union Type Pattern
```typescript
// The discriminated union in core/ast/types/index.ts
export type MeldNode =
  | TextNode 
  | DirectiveNode 
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;
```

### 4. Transformation Approach
- Created `transformParsedNodes` helper in ParserService
- Validates required fields (type, nodeId)
- Preserves all AST information
- Returns properly typed MeldNode[]

## Known Issues for Remaining Phases

### Step 5c - Directive Handlers
1. **8 failing tests** with "Cannot read properties of undefined (reading 'identifier')"
   - Directive handlers expecting old structure
   - Need to update value access patterns
   - May involve nested property access issues

2. **Likely causes:**
   - Handlers accessing `directive.values.identifier` but structure changed
   - Import paths not yet updated in handlers
   - Type expectations mismatch

### Step 5d - Other Services
Services that will need updates:
- ResolutionService
- OutputService  
- ValidationService
- CircularityService
- PathService

### Step 6 - Remove Legacy Types
- Need to ensure all imports are updated first
- Remove `core/syntax/types` package completely
- May reveal hidden dependencies

### Step 7 - Update All Imports
- ~330 import statements to update (per original plan)
- Consider automation script
- Must be thorough to avoid runtime errors

## Migration Patterns

### Import Update Pattern
```typescript
// Old
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types/index';

// New  
import type { MeldNode, TextNode, DirectiveNode } from '@core/ast/types/index';
```

### Node Creation Pattern
```typescript
// Old (properties in any order)
const textNode: TextNode = {
  type: 'Text',
  content: 'Hello',
  location: { ... },
  nodeId: uuid()
};

// New (consistent order)
const textNode: TextNode = {
  type: 'Text',
  nodeId: uuid(),
  location: { ... },
  content: 'Hello'
};
```

### Type Guard Pattern
```typescript
// Using discriminated unions
function isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text';
}
```

## Critical Files Modified

1. **Type Definitions:**
   - `/core/types/base/` - New base types
   - `/core/types/nodes/` - New node types
   - `/core/types/directives/` - New directive types
   - `/core/ast/types/index.ts` - MeldNode union definition

2. **Services Updated:**
   - `ParserService` - Returns new MeldNode[] type
   - `IParserService` - Interface updated
   - `StateService` - Uses new types throughout
   - `IStateService` - Interface updated
   - `InterpreterService` - Partially updated (has test failures)
   - `IInterpreterService` - Interface updated

3. **Test Files Updated:**
   - `ParserService.test.ts` - Import paths updated
   - `StateService.test.ts` - Import paths updated
   - `InterpreterService.integration.test.ts` - Import paths updated but tests failing

## Recommendations for Next Phases

1. **Step 5c**: Start by examining the failing tests to understand exact structure expected by directive handlers
2. **Step 5d**: Create a checklist of all services from `/services` directory that import types
3. **Step 6**: Only remove legacy types after comprehensive search for imports
4. **Step 7**: Consider using automated script with manual verification
5. **Step 8**: Update all documentation to reflect new type structure

## Testing Strategy

- Run tests incrementally after each service update
- Watch for cascading failures that might indicate missed imports
- Pay attention to integration tests as they often reveal issues unit tests miss
- Keep the 8 failing InterpreterService tests as a benchmark for Step 5c completion

## Risk Areas

1. **Directive value access** - Complex nested structures may have subtle differences
2. **Third-party integrations** - Any external code expecting old types
3. **Dynamic property access** - Code using string keys to access properties
4. **Circular dependencies** - May surface when removing old types