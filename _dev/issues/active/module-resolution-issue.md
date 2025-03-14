## Problem Statement

Installing `@swc/core` has revealed significant issues with our module import/export patterns. The compiler is enforcing stricter ES module export rules, resulting in numerous errors across the codebase:

```
No matching export in "services/state/StateService/IStateService.ts" for import "IStateService"
No matching export in "core/syntax/types/variables.ts" for import "VariableType"
... (and many more similar errors)
```

These errors indicate architectural issues in how our modules are structured and imported, which need to be addressed systematically.

## Evidence and Analysis

The build output shows 100+ errors related to missing exports. Key patterns:

1. Interface files are properly exporting interfaces, but imports cannot resolve them
2. Imports use '.js' extensions for TypeScript files: `import { IStateService } from '@services/state/StateService/IStateService.js'`
3. Many circular dependencies in type imports
4. Type re-exports from barrel files (index.ts) are failing

Analysis of one specific interface:
```typescript
// In IStateService.ts
export interface IStateService { ... }

// In another file
import { IStateService } from '@services/state/StateService/IStateService.js';
```

The interface is exported correctly, but @swc/core cannot resolve it due to ES module strictness.

## Root Causes

1. **Module System Mismatch**: Our codebase uses a hybrid CommonJS/ESM approach that worked with the previous compiler but is inconsistent with stricter ESM rules
2. **File Extension Convention**: TypeScript's module resolution adding '.js' to imports of '.ts' files creates confusion with @swc/core
3. **Circular Type Dependencies**: The codebase has circular dependencies that need proper architectural solutions
4. **Inconsistent Export Patterns**: The project uses multiple export patterns inconsistently

## Implementation Plan

### Phase 1: Audit and Documentation (1-2 days)
- [ ] Create a full inventory of affected files and patterns
- [ ] Document current import/export patterns and their issues
- [ ] Establish new standardized patterns for different module types
- [ ] Create automated tools to assist with migration

### Phase 2: Core Type System Refactoring (2-3 days)
- [ ] Fix `core/syntax/types/` - the foundation of the type system
  - [ ] Separate type definitions from runtime code
  - [ ] Create explicit re-export patterns that avoid circularity
  - [ ] Update the type index files to follow a consistent pattern
  - [ ] Implement proper type-only imports where appropriate
- [ ] Implement proper barrel files with explicit re-exports
- [ ] Resolve circular dependencies with interface segregation
- [ ] Update imports to reference these new patterns
- [ ] Create extensive tests to verify type resolution

### Phase 3: Service Interface Alignment (2-3 days)
- [ ] Implement consistent interface export pattern for all services
  - [ ] Follow the pattern established in DI-ARCHITECTURE.md
  - [ ] Use interface segregation to break circular dependencies
  - [ ] Ensure consistent export of interfaces and their implementations
- [ ] Update the DI registration system to align with new patterns
- [ ] Fix circular dependencies using the client factory pattern per DI-ARCHITECTURE.md
- [ ] Create validation tools to prevent regression

### Phase 4: Module Configuration Update (1 day)
- [ ] Standardize TypeScript module configuration
  - [ ] Define clear configuration for ESM or hybrid ESM/CommonJS
  - [ ] Update moduleResolution settings in tsconfig.json
  - [ ] Configure rules for file extensions in imports
- [ ] Update tsconfig.json and tsup.config.ts for consistency
- [ ] Document the new module system approach
- [ ] Update build scripts and CI to validate module compliance

### Phase 5: Codebase-Wide Migration (2-3 days)
- [ ] Apply the new patterns across all imports/exports
  - [ ] Create a migration guide for each type of file
  - [ ] Prioritize files based on dependency order
  - [ ] Implement automated transforms where possible
- [ ] Run extensive tests to ensure functionality is preserved
- [ ] Fix any remaining edge cases
- [ ] Document the migration for future reference

## Architectural Principles

The solution will follow these principles:
1. **Interface Segregation**: Minimize dependencies between modules
2. **Explicit Exports**: Make all exports explicit and avoid re-export issues
3. **Consistent Extensions**: Standardize file extension handling
4. **DI Compatibility**: Maintain compatibility with our DI system
5. **Progressive Migration**: Allow incremental adoption of the new patterns

## Testing Strategy

- Create specific module resolution tests
- Ensure all existing tests pass with the new patterns
- Add validation in the build process to prevent regression
- Create documentation for the correct patterns

## Technical Implementation Details

### Export Pattern Standards

For interfaces and types:
```typescript
// IMyService.ts - Pure interface definition
export interface IMyService {
  method(): void;
}

// index.ts - Explicit re-export
export { IMyService } from './IMyService.js';
```

For resolving circular dependencies:
```typescript
// IClientService.ts - Minimal interface for client usage
export interface IClientService {
  onlyTheMethodsNeededByClients(): void;
}

// Service implementation imports minimal client interface
import { IClientService } from './IClientService.js';
```

For module configuration:
```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    // Other settings...
  }
}
```

### Tool Support

We'll create tools to:
1. Detect circular dependencies
2. Validate export patterns
3. Automate migration where possible
4. Test module resolution

## Risk Mitigation

- Changes will be made incrementally with tests at each step
- A rollback plan will be documented
- Key service interfaces will be prioritized based on dependency order
- The plan allows for pausing at phase boundaries if issues arise

## Alternatives Considered

1. **Revert to previous compiler**: This would hide the issues but not solve them
2. **Full migration to CommonJS**: Would be incompatible with our ESM dependencies
3. **Quick fixes with type casting**: Would lead to technical debt
4. **Relaxed module checking**: Would hide issues that need architectural solutions

The proposed solution provides a long-term architectural foundation while allowing for incremental adoption.