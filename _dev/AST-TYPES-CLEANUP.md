# AST Types Cleanup Plan

## Overview

This document outlines the plan to clean up the AST type system by eliminating the hybrid state where new AST types still import from old syntax types. The goal is to create a single, unified type system in `/core/ast/types/` as originally designed.

## Current State

- New AST types in `/core/ast/types/` exist but import from `@core/syntax/types`
- Services are split between importing from old and new locations
- This creates confusion and circular dependencies

## Goal State

- All types defined in `/core/ast/types/`
- No imports from `@core/syntax/types` within AST folder
- All services import exclusively from `@core/ast/types`
- Clear separation between primitive nodes and directive nodes

## Implementation Plan

### Phase 0: Move Old Types (Immediate)

Rename the old types folder to make dependencies explicit:
```bash
mv core/syntax/types core/syntax/types-old
```

This will immediately break all imports from `@core/syntax/types`, making it clear what needs to be migrated.

### Phase 1: Create Primitive Types (Day 1)

Create `/core/ast/types/primitives.ts` containing all base node types:

```typescript
// SourceLocation and base types
export interface SourceLocation {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

export interface BaseMeldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}

// Primitive node types
export interface TextNode extends BaseMeldNode {
  type: 'Text';
  content: string;
  formattingMetadata?: FormattingMetadata;
}

export interface VariableReferenceNode extends BaseMeldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: string;
  isVariableReference: boolean;
}

export interface LiteralNode extends BaseMeldNode {
  type: 'Literal';
  value: any;
  valueType?: string;
}

export interface DotSeparatorNode extends BaseMeldNode {
  type: 'DotSeparator';
  value: '.';
}

export interface PathSeparatorNode extends BaseMeldNode {
  type: 'PathSeparator';
  value: '/';
}

export interface CodeFenceNode extends BaseMeldNode {
  type: 'CodeFence';
  language?: string;
  content: string;
}

export interface CommentNode extends BaseMeldNode {
  type: 'Comment';
  content: string;
}

export interface ErrorNode extends BaseMeldNode {
  type: 'Error';
  error: string;
  debugDetails?: any;
  partialNode?: any;
}
```

### Phase 2: Update Internal AST Imports (Day 1)

Update files in `/core/ast/types/`:

1. **nodes.ts**:
```typescript
// Remove all imports from @core/syntax/types
// Export all from primitives
export * from './primitives';
```

2. **values.ts**:
```typescript
// Change imports from @core/syntax/types/nodes to ./primitives
import { TextNode, VariableReferenceNode, DotSeparatorNode, PathSeparatorNode } from './primitives';
```

3. **base.ts**:
```typescript
// Change imports to use local types
import { SourceLocation } from './primitives';
```

### Phase 3: Create Union Type (Day 1)

Update `/core/ast/types/index.ts`:

```typescript
// Import all primitive nodes
import {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  ErrorNode
} from './primitives';

// Import all directive nodes
import { TextDirectiveNode } from './text';
import { PathDirectiveNode } from './path';
// ... etc

// Define the unified MeldNode union
export type MeldNode =
  // Primitive nodes
  | TextNode
  | CodeFenceNode
  | CommentNode
  | VariableReferenceNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode
  | ErrorNode
  // Directive nodes
  | DirectiveNode
  | TextDirectiveNode
  | PathDirectiveNode
  // ... etc
```

### Phase 4: Migrate Service Imports (Days 2-3)

Systematically update imports in services:

1. **Automated search/replace**:
   - `@core/syntax/types` → `@core/ast/types`
   - Handle specific type imports

2. **Service groups to migrate**:
   - StateService and related
   - InterpreterService and related
   - ResolutionService and related
   - ValidationService and validators
   - PathService and related
   - DirectiveHandlers
   - ParserService (special handling needed)

### Phase 5: Special Cases (Day 3)

1. **ParserService**: May need transformation layer since Peggy parser outputs old structure
2. **Test files**: Update test imports and mocks
3. **Factory classes**: Ensure they use new types

### Phase 6: Cleanup (Day 4)

1. Remove `/core/syntax/types-old` folder entirely (after confirming all migrations complete)
2. Update all documentation
3. Run full test suite
4. Fix any remaining issues

## Migration Checklist

- [ ] Rename core/syntax/types to core/syntax/types-old
- [ ] Create primitives.ts with all base types
- [ ] Update nodes.ts to export from primitives
- [ ] Update values.ts imports
- [ ] Update base.ts imports  
- [ ] Create proper MeldNode union in index.ts
- [ ] Migrate StateService imports
- [ ] Migrate InterpreterService imports
- [ ] Migrate ResolutionService imports
- [ ] Migrate ValidationService imports
- [ ] Migrate PathService imports
- [ ] Migrate DirectiveHandler imports
- [ ] Update ParserService with transformation
- [ ] Update all test file imports
- [ ] Remove old syntax types folder
- [ ] Update documentation
- [ ] Run full test suite

## Benefits

1. **Single source of truth**: All types in `/core/ast/types/`
2. **No circular dependencies**: AST doesn't depend on syntax
3. **Clearer structure**: Primitives vs directives separation
4. **Easier maintenance**: One place to update types
5. **Better aligned with design**: Matches original AST-NODE-DESIGN.md

## Risks and Mitigations

1. **Risk**: Breaking existing code
   - **Mitigation**: Phase approach, comprehensive testing

2. **Risk**: Parser compatibility
   - **Mitigation**: Add transformation layer if needed

3. **Risk**: Missing types
   - **Mitigation**: Use AST-BASE-INTERFACES.md as checklist

4. **Risk**: Build failures from renamed folder
   - **Mitigation**: This is intentional - helps identify all dependencies

## Success Criteria

- All services compile without errors
- All tests pass
- No imports from `@core/syntax/types` remain
- Documentation reflects new structure
- Type system matches AST-NODE-DESIGN.md specification