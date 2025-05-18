# Type Restructuring Post-AST Reorganization

## Context

1. **AST types** properly organized in `core/ast/types/` - These are the grammar-generated node types
2. **General types** in `core/types/` - These are the broader system types

## Updated Goals

- **Unify AST and runtime types** into a single coherent type system
- Eliminate artificial separation between parsing and execution types
- Create types that evolve through the pipeline with optional fields
- Establish standard patterns for type extensions and lifecycle stages
- Improve type safety while reducing complexity
- Create comprehensive documentation for the unified type system
- Remove outdated types; no backward compatibility or shims

## Target Directory Structure

```
/core
  /types            # All types (both AST and runtime)
    /base           # Fundamental types and interfaces
      /index.ts
      /common.ts    # Common utility types
      /positions.ts # Position and SourceLocation types
      /metadata.ts  # Standard metadata interfaces
    /nodes          # All node types (unified AST/runtime)
      /index.ts
      /text.ts      # TextNode type
      /variable.ts  # Variable type
      /directive.ts # DirectiveNode and subtypes
      /comment.ts   # CommentNode type
      /codefence.ts # CodeFenceNode type
      /guards.ts    # Type guards for all nodes
    /directives     # Directive-specific types
      /index.ts
      /import.ts    # Import directive types
      /text.ts      # Text directive types
      /add.ts       # Add directive types
      /exec.ts      # Exec directive types
      /path.ts      # Path directive types
      /data.ts      # Data directive types
    /services       # Service-related types
      /index.ts
      /handlers.ts  # Handler interfaces
      /context.ts   # Processing context types
      /state.ts     # State service types
    /system         # System integration types
      /index.ts
      /paths.ts     # Path-related types
      /dependencies.ts # Dependency types
      /resolution.ts # Resolution types
    /extensions     # Standard extension patterns
      /index.ts
      /lifecycle.ts # Lifecycle stage extensions
      /validation.ts # Validation extensions
      /execution.ts # Execution extensions
    /legacy         # Deprecated types (temporary)
      /index.ts     # Re-exports for backward compatibility
    /index.ts       # Main re-export point
```

## Implementation Approach

**Confidence: 95/100**

With our unified type architecture decision, we're restructuring to eliminate artificial AST/runtime separation and create a cohesive type system.

### Step 1: Analyze Current Type Duplication (1 day)

1. Map all AST types in `core/ast/types/` to their runtime equivalents
2. Identify overlapping fields and concepts
3. Document transformation patterns (how AST becomes runtime)
4. Create unified type specifications

### Step 2: Create Unified Type Definitions (2-3 days)

1. Define base interfaces with progressive enhancement:
   ```typescript
   interface BaseNode {
     type: string;
     nodeId: string;
     location?: SourceLocation;
     raw?: string;
     metadata?: NodeMetadata;
     resolvedValue?: any;
   }
   ```
2. Create specific node types extending base
3. Define standard extension patterns
4. Set up discriminated unions

### Step 3: Implement Lifecycle Extensions (1-2 days)

1. Create extension interfaces for each pipeline stage:
   - Parsing extensions
   - Validation extensions
   - Resolution extensions
   - Execution extensions
2. Define type guards for each stage
3. Create utility functions for type narrowing

### Step 4: Merge AST and Runtime Types (2-3 days)

1. For each type (Variable, Text, etc.):
   - Unify AST definition with runtime type
   - Add optional fields for runtime data
   - Preserve all necessary information
2. Update grammar to produce unified types
3. Update state service to use unified types

### Step 5: Update Service Interfaces (1-2 days)

1. Update service interfaces to use unified types
2. Remove redundant type conversions
3. Simplify handler interfaces
4. Update dependency injection types

### Step 6: Create Migration Bridge (1 day)

1. Create compatibility layer for old imports
2. Add deprecation warnings
3. Provide automated migration scripts
4. Document breaking changes

### Step 7: Update All Imports (2-3 days)

1. Update parser to generate unified types
2. Update interpreter to handle unified types
3. Update state service completely
4. Update all directive handlers
5. Fix all test imports

### Step 8: Validation and Documentation (1-2 days)

1. Create comprehensive documentation
2. Generate type reference guide
3. Remove deprecated code (if safe)
4. Final validation

## Key Considerations

### Unified Type Architecture

**Confidence: 95/100**

Based on our analysis of the state service and runtime types, we're moving to a unified type architecture where types evolve through the pipeline rather than having separate AST and runtime types:

1. **Single Type Definition** - Each concept (Variable, Text, etc.) has one type definition
2. **Progressive Enhancement** - Fields are added as nodes move through the pipeline
3. **Optional Fields** - Parsing fields (location, raw) and runtime fields (metadata, value) are optional
4. **Type Safety** - TypeScript ensures only appropriate fields are accessed at each stage

Example:
```typescript
interface Variable {
  // Core fields (always present)
  type: 'Variable';
  name: string;
  valueType: VariableType;
  nodeId: string;
  
  // Parsing fields (present during/after parsing)
  location?: SourceLocation;
  raw?: string;
  
  // Runtime fields (added during execution)
  value?: any;
  metadata?: VariableMetadata;
  origin?: VariableOrigin;
}
```

This eliminates the artificial separation between AST and runtime types, reducing confusion and duplication.

### Discriminated Unions for State Management

**Confidence: 95/100**

Based on our analysis of the state service, we've decided to use discriminated unions for node types:

1. **Create a union type** for all AST nodes (e.g., `ASTNode`)
2. **Leverage TypeScript's type narrowing** based on the `type` field
3. **Maintain generic operations** while enabling type-specific handling
4. **No runtime changes** - purely type-level improvements

This approach maintains simplicity in the state service while providing type safety.

### Example Type Organization

```typescript
// Before: Separate AST and runtime types
// core/ast/types/variables.ts
export interface VariableDeclarationNode {
  type: 'VariableDeclaration';
  name: string;
  value: ASTNode;
  location: SourceLocation;
}

// core/types/runtime/variables.ts
export interface RuntimeVariable {
  name: string;
  value: JsonValue;
  type: VariableType;
  metadata?: VariableMetadata;
}

// After: Unified type with optional fields
// core/types/nodes/variable.ts
export interface Variable {
  type: 'Variable';
  name: string;
  valueType: VariableType;
  nodeId: string;
  
  // Parsing phase
  location?: SourceLocation;
  raw?: string;
  
  // Resolution phase
  resolvedValue?: JsonValue;
  dependencies?: string[];
  
  // Runtime phase
  metadata?: VariableMetadata;
  origin?: VariableOrigin;
  history?: VariableChange[];
}

// Type guards for different stages
export function isParsedVariable(v: Variable): v is Variable & Required<Pick<Variable, 'location' | 'raw'>> {
  return v.location !== undefined && v.raw !== undefined;
}

export function isResolvedVariable(v: Variable): v is Variable & Required<Pick<Variable, 'resolvedValue'>> {
  return v.resolvedValue !== undefined;
}
```

### Import Pattern Examples

```typescript
// For AST manipulation
import { TextAssignmentNode } from '@core/ast/types';

// For runtime operations
import { RuntimeVariable, StateContext } from '@core/types/runtime';

// For service implementation
import { IDirectiveHandler } from '@core/types/services';

// For state service (using discriminated unions)
import type { 
  TextNode, 
  DirectiveNode, 
  CodeFenceNode,
  // ... other node types
} from '@core/ast/types';

// Define union type for state management
type ASTNode = TextNode | DirectiveNode | CodeFenceNode | /* ... */;
```

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Confusion between AST/runtime types | Medium | High | Clear naming, documentation |
| Import path churn | High | Medium | Legacy bridge, gradual migration |
| Missing type exports | High | Low | Comprehensive testing |
| Circular dependencies | Medium | Medium | Careful module boundaries |

## Success Criteria

Phase 3 will be considered successful when:

1. AST types remain cleanly separated in `core/ast/types/`
2. Runtime types are logically organized in `core/types/`
3. Clear distinction between AST and runtime types
4. All imports updated without breaking changes
5. Comprehensive documentation explains the structure
6. Type discovery is intuitive

## Timeline

**Confidence: 85/100**

- **Week 1:** Steps 1-3 (Analysis, unified type creation, lifecycle extensions)
- **Week 2:** Steps 4-5 (Merge types, update services)
- **Week 3:** Steps 6-8 (Migration bridge, imports, validation)

Total: 3 weeks for complete implementation

Note: This is more ambitious than the original plan due to unifying types, but eliminates future confusion and maintenance burden.

## Confidence Assessment

| Step | Description | Confidence | Notes |
|-----|-------------|-----------|-------|
| 1 | Analyze current type duplication | 92 | Existing types are well organized but mapping may reveal gaps |
| 2 | Create unified type definitions | 90 | Need to confirm final base interfaces |
| 3 | Implement lifecycle extensions | 85 | Unsure of expected extension pattern |
| 4 | Merge AST and runtime types | 80 | Requires grammar updates and broad refactor |
| 5 | Update service interfaces | 90 | Service files are clear but numerous |
| 6 | Create migration bridge | 80 | Clarify scope of legacy aliases |
| 7 | Update all imports | 85 | Many packages rely on old paths |
| 8 | Validation and documentation | 90 | Straightforward once types settle |

## Notes for Implementation

1. The AST restructuring provides a template for clean organization
2. Focus on runtime type organization without disturbing AST
3. Maintain backward compatibility throughout
4. Consider future extensibility in the structure
5. Document the AST/runtime distinction prominently
6. Implement discriminated unions for state management as outlined in STATE-UPDATES.md
7. Consider exporting a unified `ASTNode` union type from the AST package for reuse

