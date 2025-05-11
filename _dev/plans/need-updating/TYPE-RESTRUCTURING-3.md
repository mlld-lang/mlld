# Type Restructuring Phase 3: Complete Directory Reorganization

This document outlines Phase 3 of the type system restructuring, focused on implementing a comprehensive directory reorganization. This plan assumes that Phase 1 (variable and state type consolidation) and Phase 2 (service interface updates) have been completed.

## Goals

- Create a clean, logical directory structure for all types
- Migrate all types to their canonical locations
- Establish clear import patterns
- Create comprehensive type documentation
- Maintain the standardized types established in Phases 1 and 2

## Target Directory Structure

```
/core
  /types
    /base          # Fundamental types with no dependencies
      /index.ts    # Re-export of all base types
      /state.ts    # Base state types
      /variables.ts # Base variable types
      /nodes.ts    # Base AST node types
      /common.ts   # Common utility types
    /variables     # Variable-specific types
      /index.ts    # Re-export of all variable types
      /definitions.ts  # Variable type definitions
      /metadata.ts    # Variable metadata types
      /factories.ts   # Variable factory functions
    /state         # State-specific types
      /index.ts    # Re-export of all state types
      /changes.ts  # State change types
      /tracking.ts # State tracking types
    /directives    # Directive-specific types
      /index.ts    # Re-export of all directive types
      /handlers.ts # Handler types
      /context.ts  # Processing context types
    /syntax        # AST and syntax types
      /index.ts    # Re-export of all syntax types
      /nodes.ts    # Node types
      /directives.ts # Directive node types
    /index.ts      # Main re-export point
```

## Implementation Approach

**Confidence: 90/100**

Unlike Phases 1 and 2, which focused on standardizing existing types in place, Phase 3 involves a physical restructuring of the codebase. This requires careful coordination to maintain compatibility during the transition.

### Step 1: Create New Directory Structure (1 day)

1. Create the directory structure outlined above
2. Create placeholder files with appropriate JSDoc comments describing purpose
3. Create empty re-export index files in each directory
4. Add structural TODO comments in each file to guide implementation
5. Create unit tests to validate the structure

### Step 2: Migrate Base Types (1-2 days)

1. Copy base types to their new locations in `/core/types/base/`:
   - Move `Position`, `SourceLocation` to `/core/types/base/common.ts`
   - Move `StateTransformationOptions` to `/core/types/base/state.ts`
   - Move base interfaces to their respective files
2. Update the base `index.ts` files to re-export these types
3. Create re-exports in the original locations that point to the new locations
4. Update imports in a small test area to validate approach
5. Run tests to verify functionality

### Step 3: Migrate Variable Types (1-2 days)

1. Move the now-standardized variable types (from Phase 1) to their canonical locations:
   - Move basic variable interfaces to `/core/types/variables/definitions.ts`
   - Move metadata interfaces to `/core/types/variables/metadata.ts`
   - Move factory functions to `/core/types/variables/factories.ts`
2. Update the index files to re-export these types
3. Add re-exports from original locations to maintain backwards compatibility
4. Update imports in a test area to validate
5. Verify tests still pass

### Step 4: Migrate State and Other Types (1-2 days)

1. Move state-related types to their canonical locations:
   - Move state change interfaces to `/core/types/state/changes.ts`
   - Move tracking interfaces to `/core/types/state/tracking.ts`
2. Move directive types to `/core/types/directives/`
3. Move syntax types to `/core/types/syntax/`
4. Update index files and add re-exports
5. Test and validate

### Step 5: Update Import Paths Across Codebase (2-3 days)

1. Create a script to identify all imports of the affected types
2. Gradually update imports in all affected files to use the new paths
3. Update tsconfig or other path mapping configurations
4. Use a phased approach, starting with less critical files
5. Test after each batch of updates

### Step 6: Remove Original Definitions (1 day)

1. Once all imports have been updated, convert original type files to pure re-export files
2. Run full test suite to verify compatibility
3. Add deprecation notices to old locations
4. Update documentation to reflect new structure

### Step 7: Documentation and Cleanup (1 day)

1. Create comprehensive documentation for the new type system
2. Create a type reference guide
3. Add examples for common imports
4. Clean up any remaining issues
5. Final verification of all tests

## Example Implementations

### Base Type Migration

```typescript
// In /core/types/base/common.ts
/**
 * Represents a position in a file
 */
export interface Position {
  /** The line number (1-based) */
  line: number;
  /** The column number (1-based) */
  column: number;
}

/**
 * Represents a location in a file
 */
export interface SourceLocation {
  /** Start position */
  start: Position;
  /** End position */
  end: Position;
  /** Optional file path */
  filePath?: string;
}

// In the original location (with re-export)
export { Position, SourceLocation } from '@core/types/base/common';
```

### Variable Type Migration

```typescript
// In /core/types/variables/definitions.ts
import { JsonValue } from '../base/common';
import { IFilesystemPathState, IUrlPathState } from '../paths';
import { ICommandDefinition } from '../directives/define';
import { VariableMetadata } from './metadata';

/**
 * Enum defining the supported variable types in Meld.
 */
export enum VariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command'
}

/**
 * Base interface for all Meld variables.
 */
export interface BaseVariable<T> {
  /** Discriminant for type checking */
  type: VariableType;
  /** Name of the variable */
  name: string;
  /** The actual value of the variable */
  value: T;
  /** Optional metadata for tracking and debugging */
  metadata?: VariableMetadata;
}

// Then the specific variable interfaces...
```

### Import Pattern Updates

Original imports:
```typescript
import { VariableType, TextVariable } from '@core/types/variables';
```

Updated imports:
```typescript
import { VariableType, TextVariable } from '@core/types/variables/definitions';
// Or using the re-export:
import { VariableType, TextVariable } from '@core/types/variables';
```

## Compatibility Strategy

**Confidence: 85/100**

To ensure backward compatibility during the transition:

1. **Re-export Pattern**: All new locations will be re-exported from the old locations
2. **Phased Import Updates**: Update imports gradually, focusing on core modules first
3. **Continuous Testing**: Run tests after each batch of updates
4. **Maintaining Both Paths**: Support both old and new import paths temporarily
5. **Documentation**: Clearly document the transition

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking imports | High | Medium | Use re-exports, update imports gradually |
| Circular dependencies | Medium | Medium | Careful planning of base type locations |
| Test failures | Medium | Medium | Incremental approach with continuous testing |
| Developer confusion | Medium | Low | Clear documentation and examples |
| Path resolution issues | High | Low | Validate tsconfig path mappings |

## Implementation Punch List

**Confidence: 95/100**

### Step 1: Create Directory Structure
- [ ] Create `/core/types/base` directory with files
- [ ] Create `/core/types/variables` directory with files
- [ ] Create `/core/types/state` directory with files
- [ ] Create `/core/types/directives` directory with files
- [ ] Create `/core/types/syntax` directory with files
- [ ] Create all index.ts files
- [ ] Create root `/core/types/index.ts`
- [ ] Add validation tests

### Step 2: Migrate Base Types
- [ ] Move Position, SourceLocation to common.ts
- [ ] Move state interfaces to state.ts
- [ ] Move node interfaces to nodes.ts
- [ ] Update index.ts files
- [ ] Add re-exports to original locations
- [ ] Test in limited scope

### Step 3: Migrate Variable Types
- [ ] Move variable interfaces to definitions.ts
- [ ] Move metadata to metadata.ts
- [ ] Move factories to factories.ts
- [ ] Update index.ts files
- [ ] Add re-exports
- [ ] Test variable-related functionality

### Step 4: Migrate State and Other Types
- [ ] Move state changes to changes.ts
- [ ] Move tracking to tracking.ts
- [ ] Move directive types
- [ ] Move syntax types
- [ ] Update index files
- [ ] Validate with tests

### Step 5: Update Import Paths
- [ ] Create import tracking script
- [ ] Update core service imports
- [ ] Update state service imports
- [ ] Update directive service imports
- [ ] Update other imports
- [ ] Verify with tests

### Step 6: Cleanup
- [ ] Convert original type files to re-exports
- [ ] Add deprecation notices
- [ ] Run full test suite
- [ ] Fix any remaining issues

### Step 7: Documentation
- [ ] Create type reference guide
- [ ] Add import examples
- [ ] Update developer documentation
- [ ] Final verification

## Timeline

**Confidence: 80/100**

- **Step 1:** 1 day
- **Step 2:** 1-2 days
- **Step 3:** 1-2 days
- **Step 4:** 1-2 days
- **Step 5:** 2-3 days
- **Step 6:** 1 day
- **Step 7:** 1 day

Total: 8-12 days for complete implementation

## Success Criteria

**Confidence: 95/100**

Phase 3 will be considered successful when:

1. All types are located in their canonical directories
2. All imports are updated to use the new structure
3. Clear index re-exports provide easy access to types
4. All tests pass with the new structure
5. Documentation clearly explains the type organization
6. Type discovery is intuitive and follows clear patterns

## Conclusion

This Phase 3 plan completes the vision for a fully restructured type system in Meld. By building on the standardization work done in Phases 1 and 2, we can now physically reorganize the type definitions into a more logical, discoverable structure.

The careful, phased approach ensures that we maintain compatibility throughout the transition while steadily moving toward a cleaner, more maintainable organization. When complete, developers will have a much clearer understanding of the type system, making future development more efficient and less error-prone.
