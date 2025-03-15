# Shared Types Pattern for Breaking Circular Dependencies

## Overview
This document describes the shared-types pattern implemented to break circular dependencies in the Meld codebase. The pattern centralizes core type definitions that have no dependencies but are depended upon by many other modules.

## Problem
Circular dependencies in TypeScript occur when:
1. Module A imports from Module B
2. Module B imports from Module C
3. Module C imports from Module A

These cycles create build errors even when the code works at runtime. While runtime circular dependencies can be resolved using various techniques (lazy loading, dependency injection), TypeScript's static type system struggles with circular type references during build.

## Solution: Shared Types Pattern

### Core Principles
1. **Base Types Foundation**: Create a single file (`shared-types.ts`) containing fundamental types with no imports
2. **One-way Dependencies**: Ensure dependencies flow in one direction (shared types → interfaces → implementations)
3. **Type-only Exports**: Use `export type` for interface exports to avoid runtime dependency issues
4. **Interface Segregation**: Define minimal interfaces that can be composed into larger interfaces

### Implementation

#### 1. Shared Types File
The `core/syntax/types/shared-types.ts` file:
- Contains primitive types with no imports
- Exports base interfaces, types, and constants
- Acts as the foundation of the type system

```typescript
// shared-types.ts
export type NodeType = 'Directive' | 'Text' | /* other types */;
export interface BaseNode {
  type: NodeType;
  location?: SourceLocation;
}
// Other core types...
```

#### 2. Interface Extensions
Individual interface files extend the base types:

```typescript
// INode.ts
import type { BaseNode } from '../shared-types.js';
export interface INode extends BaseNode {
  // Additional properties...
}
```

#### 3. Explicit Type Exports
Barrel files use explicit type exports:

```typescript
// interfaces/index.ts
export type { INode } from './INode.js';
export type { IDirectiveNode } from './IDirectiveNode.js';
// Other type exports...
```

#### 4. Value vs Type Exports
Clear separation between value and type exports:

```typescript
// Exporting types
export type { NodeType, Position } from './interfaces/common.js';

// Exporting values (constants, classes, functions)
export { SPECIAL_PATH_VARS } from './interfaces/IVariableReference.js';
export { NodeFactory } from './factories/NodeFactory.js';
```

## Benefits

1. **Eliminates Circular Dependencies**: By creating a single source of truth for base types
2. **Improves Build Performance**: Simplifies the dependency graph
3. **Enhances Type Safety**: Centralizes core type definitions
4. **Facilitates Maintenance**: Makes type relationships explicit and easier to manage
5. **Preserves Runtime Behavior**: Works with existing code without runtime changes

## Usage Guidelines

When working with the type system:

1. **Add new base types** to `shared-types.ts` if they:
   - Have no dependencies
   - Are used by multiple interfaces
   - Form the foundation of the type system

2. **Use explicit type imports/exports**:
   ```typescript
   import type { INode } from './interfaces/INode.js';
   export type { IDirectiveNode } from './IDirectiveNode.js';
   ```

3. **Separate type and value exports**:
   - Use `export type` for interfaces and type aliases
   - Use regular `export` for constants, classes, and functions

4. **Maintain the dependency direction**:
   - `shared-types.ts` → interface definitions → implementations
   - Never import from implementation into interface definitions

## Related Documentation
- [MODULE-RESOLUTION.md](./MODULE-RESOLUTION.md) - Module resolution patterns
- [DI-ARCHITECTURE.md](./DI-ARCHITECTURE.md) - Dependency injection architecture
- [AST-FACTORY-PATTERN.md](./AST-FACTORY-PATTERN.md) - Factory pattern for AST nodes