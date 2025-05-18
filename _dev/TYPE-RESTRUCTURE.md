# Type Restructuring Post-AST Reorganization

## Context

1. **AST types** properly organized in `core/ast/types/` - These are the grammar-generated node types
2. **General types** in `core/types/` - These are the broader system types
3. Additional notes on current file locations are collected in `PLAN-CONTEXT.md`

## Related Documentation

This plan references several supporting documents:
- **`PLAN-CONTEXT.md`** - Current code structure and service dependencies
- **`AST-NODE-DESIGN.md`** - Detailed design for the `BaseMeldNode` interface and `MeldNode` union
- **`AST-BASE-INTERFACES.md`** - Canonical list of base interfaces and field mappings
- **`STATE-AFFECTED-METHODS.md`** - Inventory of StateService methods requiring updates
- **`STATE-UPDATES.md`** - Detailed execution plan for StateService migration (part of Step 5)
- **`TYPE-RESTRUCTURE-CONTEXT.md`** - Implementation context and decisions from completed phases

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
    /index.ts       # Main re-export point
```

## Implementation Approach

With our unified type architecture decision, we're restructuring to eliminate artificial AST/runtime separation and create a cohesive type system.

### ParserService Transformation Strategy

**Key Insight**: The AST grammar remains unchanged. The ParserService creates the discriminated union from existing AST nodes.

1. **Grammar Stability** - Peggy grammar files continue producing existing AST structures with `nodeId` and `location`
2. **Union Creation** - ParserService validates and types AST nodes as `MeldNode` union
3. **State Storage** - StateService stores nodes generically using the union type
4. **No Migration Bridge** - Clean cutover without legacy compatibility layers

### Processing Pipeline Flow

1. **Parser Phase**: 
   - Grammar produces AST nodes with `type`, `nodeId`, `location`
   - ParserService creates `MeldNode[]` union type from raw AST
   
2. **Interpreter Phase**:
   - Processes `MeldNode[]` using discriminated unions
   - Calls appropriate handlers based on node type
   
3. **Handler Phase**:
   - Handlers process specific node types
   - Return `StateChanges` (variables, commands, etc.)
   - Do not mutate nodes directly
   
4. **State Phase**:
   - StateService stores nodes generically as `MeldNode[]`
   - Tracks node transformations when enabled
   - Manages variables, imports, and other state

### Step 1: Analyze Current Type Duplication (1 day) *(Completed)*

**Reference:** Use `AST-BASE-INTERFACES.md` for canonical interface list

1. Map all AST types in `core/ast/types/` to their runtime equivalents
2. Identify overlapping fields and concepts  
3. Document transformation patterns (how AST becomes runtime)
4. Create unified type specifications
5. Review `PLAN-CONTEXT.md` for current import patterns

### Step 2: Create Unified Type Definitions (2-3 days) *(Completed)*

1. Define base interfaces with progressive enhancement:
   ```typescript
   interface BaseMeldNode {
     type: string;
     nodeId: string;
     location?: SourceLocation;
   }
   
   // Extended fields added during processing
   interface ProcessedNode extends BaseMeldNode {
     raw?: string;
     metadata?: NodeMetadata;
     resolvedValue?: any;
   }
   ```
2. Create specific node types extending base
3. Define standard extension patterns
4. Set up discriminated unions

### Step 3: Define Unified AST Node Union (1-2 days) *(Completed)*

**Reference:** See `AST-NODE-DESIGN.md` for complete design details

1. Create the discriminated union type for all AST nodes:
   ```typescript
   // Define union of all node types
   type MeldNode =
     | TextNode 
     | DirectiveNode 
     | CodeFenceNode
     | CommentNode
     | VariableReferenceNode
     | LiteralNode
     | DotSeparatorNode
     | PathSeparatorNode;

   // Include every interface exported from `core/ast/types` so future nodes are
   // automatically part of the union.
   
   // All nodes must extend BaseMeldNode and have:
   // - type: string (discriminator)
   // - nodeId: string
   // - location?: SourceLocation
   ```
2. Implement ParserService transformation:
   ```typescript
   // In ParserService
   function transformParsedNodes(rawAst: any[]): MeldNode[] {
     return rawAst.map(node => {
       // Validate node has required fields from AST
       if (!node.type || !node.nodeId) {
         throw new Error('Invalid AST node');
       }
       return node as MeldNode;
     });
   }
   ```
3. Define minimal type guards using discriminated unions:
   ```typescript
   function isTextNode(node: MeldNode): node is TextNode {
     return node.type === 'Text';
   }
   ```

### Step 4: Implement ParserService Transformation (2-3 days) *(Completed)*

**Reference:** Use helpers from `AST-NODE-DESIGN.md`

1. Create transformation functions in ParserService:
   - Transform raw AST nodes → `MeldNode[]` union
   - Validate required fields (type, nodeId, location)
   - Preserve all AST information
2. Update ParserService interface to return `MeldNode[]`
3. Test with downstream services
4. Remove old interface imports

### Step 4b: Replace "define"/"embed" with "exec"/"add" *(Completed)*

The new grammar has replaced "define" with "exec" and replaced "embed" with "add".

1. Replace all instances of the terms
2. Update file names.

### Step 5: Update Service Interfaces (5-7 days)

This step involves updating multiple services to use the new `MeldNode` union type. Each service requires careful attention:

#### 5a. StateService Migration (4-6 days) *(Completed)*
**Reference:** See `STATE-UPDATES.md` for detailed execution plan

- Update type imports from `@core/syntax/types` to `@core/ast/types`
- Replace old `MeldNode` interface with new `MeldNode` union
- Update interface methods per `STATE-AFFECTED-METHODS.md`
- Validate discriminated union usage
- Run comprehensive tests

#### 5b. InterpreterService Update (2-3 days) *(Completed)*
- Update node processing to use discriminated unions
- Simplify type checking with union discrimination
- Update handler dispatch logic

#### 5c. Directive Handlers (2-3 days) *(In Progress)*
- Update all directive handlers to accept new types
- Remove redundant type conversions
- Update return types to match new structure

**IMPORTANT: Test Infrastructure Update Required**

Before continuing with directive handler updates, we need to fix the test infrastructure to ensure our handlers remain correct. Tests are currently creating incorrect node structures, leading to backward handler modifications.

**New Approach: Fixture-Based Testing**
- See `UPDATE-TESTS-FIXTURES.md` for the comprehensive plan
- See `MIGRATION-TO-FIXTURES.md` for migration guide
- Track progress in `services/FIXTURE-MIGRATION-TRACKER.md`

1. **Problem**: Test factories create incorrect AST structures, causing handlers to be modified to accommodate tests (backwards!)
2. **Solution**: Use AST fixtures from `core/ast/fixtures/` as authoritative source
3. **Implementation**: 
   - Created `ASTFixtureLoader` utility
   - Example migration: `TextDirectiveHandler.fixture-test.ts`
   - Gradual migration approach

**Migration Order**:
1. TextDirectiveHandler (example complete)
2. DataDirectiveHandler
3. PathDirectiveHandler
4. ImportDirectiveHandler
5. AddDirectiveHandler
6. RunDirectiveHandler
7. ExecDirectiveHandler

**Benefits**:
- Ensures handlers work with correct AST structure
- Tests use real-world examples from fixtures
- Automatically stays in sync with grammar changes
- Reduces test maintenance burden

**Comprehensive Issues List (from test analysis):**

1. **AddDirectiveHandler (previously EmbedDirectiveHandler) - 14 failed tests**
   - Error: "Invalid node type provided to AddDirectiveHandler"
   - Handler expecting old structure with `node.directive` property
   - Needs update from `node.directive.kind` to `node.kind`
   - All internal property access needs updating

2. **TextDirectiveHandler - 7 failed tests**
   - Error: "Invalid value type for @text source 'literal'. Expected string or InterpolatableValue array"
   - Value access patterns need updating
   - Identifier extraction broken: old `node.directive.identifier` → new `node.raw.identifier`
   - Resolution integration failing

3. **DirectiveService Tests - 3 failed tests**
   - Mock resolution service returning 'ResolvedNodesValue' instead of actual values
   - Tests expecting actual directive values but getting placeholder strings
   - Mock handlers need updates to match new node structure

4. **Node Structure Migration Patterns:**
   - Old: `node.directive.kind` → New: `node.kind`
   - Old: `node.directive.identifier` → New: `node.raw.identifier`
   - Old: `node.directive.values` → New: `node.values`
   - Old: `node.directive.subtype` → New: `node.subtype`

5. **Handlers Requiring Updates:**
   - **AddDirectiveHandler**: Remove nested directive property checks
   - **TextDirectiveHandler**: Fix value type validation and access patterns
   - **DataDirectiveHandler**: Similar issues to TextDirectiveHandler
   - **ExecDirectiveHandler** (previously DefineDirectiveHandler): Node structure updates
   - **RunDirectiveHandler**: Structure updates needed
   - **ImportDirectiveHandler**: Structure updates needed
   - **PathDirectiveHandler**: Structure updates needed

6. **Import Path Updates:**
   - All handlers: `@core/syntax/types` → `@core/ast/types`
   - Test files: Fix mock implementations

7. **Resolution Service Integration:**
   - Mock resolution in tests not configured correctly
   - Returning placeholder 'ResolvedNodesValue' instead of actual resolved content
   - Need to update resolution mocks to work with new node structure

8. **Additional Issues from Directive Renaming:**
   - Old syntax: `@embed` → New: `@add`
   - Old syntax: `@define` → New: `@exec`
   - Handler class names already updated, but tests and internal references need fixes

**Test Failure Summary:**
- 15 failed test files out of 41 service test files
- 127 failed tests total
- Primary issue: Node structure access patterns throughout directive handlers

#### 5d. Other Services (1-2 days)
- Update remaining services
- Fix dependency injection types
- Ensure consistent type usage across services

### Step 6: Remove Legacy Types (1 day)

1. Remove old syntax types from `core/syntax/types`
2. Update all remaining imports
3. Clean up unused type definitions
4. Verify no circular dependencies

### Step 7: Update All Imports (2-3 days)

1. Update ParserService transformation to produce unified types
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

Based on our analysis of the state service, we've decided to use discriminated unions for node types:

1. **Create a union type** for all nodes (`MeldNode`)
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
  value: MeldNode;
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
type MeldNode = TextNode | DirectiveNode | CodeFenceNode | /* ... */;
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

## Timeline and Staging

### Week 1: Foundation (Steps 1-3)
- **Day 1**: Analyze current type duplication (Step 1)
  - Reference: `AST-BASE-INTERFACES.md` for canonical interfaces
- **Days 2-4**: Create unified type definitions (Step 2)
  - Define `BaseMeldNode` interface
  - Create specific node types per `AST-NODE-DESIGN.md`
- **Days 4-5**: Define `MeldNode` union (Step 3)
  - Export from `core/ast/types/index.ts`

### Week 2: Core Implementation (Steps 4-5)
- **Days 1-3**: Implement ParserService transformation (Step 4)
  - Transform raw AST → `MeldNode[]`
- **Days 4-5**: Begin StateService migration (Step 5a)
  - Execute plan from `STATE-UPDATES.md`
  - This serves as proof-of-concept for other services

### Week 3: Service Updates (Step 5 continued)
- **Days 1-2**: Complete StateService migration *(Completed)*
- **Days 2-3**: Update InterpreterService (Step 5b) *(Completed)*
- **Days 4-5**: Update directive handlers (Step 5c) *(Paused - Test Infrastructure Update Required)*
  - Must complete fixture-based testing migration first
  - See `UPDATE-TESTS-FIXTURES.md` for plan

### Week 3.5: Test Infrastructure Update (New - High Priority)
- **Days 1-2**: Implement fixture-based testing infrastructure *(Complete)*
- **Days 3-4**: Migrate handler tests to use fixtures
- **Days 5**: Resume directive handler updates with correct tests

### Week 4: Cleanup (Steps 6-8)
- **Day 1**: Remove legacy types (Step 6)
- **Days 2-4**: Update all imports (Step 7)
  - ~330 import statements need updating
  - Consider automation script
- **Days 4-5**: Documentation and validation (Step 8)

**Total:** 3-4 weeks for complete implementation

**Key Insight:** StateService update (documented in `STATE-UPDATES.md`) serves as the detailed prototype for updating other services. Success here validates the approach for remaining services.

## Plan Gap Assessment and Remediation

| Step | Description | Notes |
|-----|-------------|-------|
| 1 | Analyze current type duplication | Existing types are well organized but mapping may reveal gaps |
| 2 | Create unified type definitions | Need final list of base interfaces and field mapping to avoid gaps; see `AST-BASE-INTERFACES.md` |
| 3 | Define unified AST node union | Discriminated union pattern is clear; see `AST-NODE-DESIGN.md` |
| 4 | Implement ParserService transformation | Parsing flow understood but mapping from parser output to typed union needs explicit helpers |
| 5 | Update service interfaces | Many service files must change; inventory in `STATE-AFFECTED-METHODS.md` lists impacted methods |
| 6 | Remove legacy types | Clean cutover, no compatibility needed |
| 7 | Update all imports | Over 300 references to old paths; a scripted replacement plan would help |
| 8 | Validation and documentation | Straightforward once types settle |

## Notes for Implementation

### Key Reference Documents
1. **`PLAN-CONTEXT.md`** - Use this to understand current code structure and dependencies
2. **`AST-NODE-DESIGN.md`** - Reference for `BaseMeldNode` interface and `MeldNode` union design
3. **`AST-BASE-INTERFACES.md`** - Canonical list of all base interfaces and field mappings
4. **`STATE-AFFECTED-METHODS.md`** - Inventory of StateService methods needing updates
5. **`STATE-UPDATES.md`** - Detailed plan for StateService migration (prototype for other services)

### Implementation Guidelines
1. The AST restructuring provides a template for clean organization
2. Focus on runtime type organization without disturbing AST
3. Remove the legacy `core/syntax/types` package - no backward compatibility
4. StateService serves as the proof-of-concept for the approach
5. Use discriminated unions for all node type handling
6. Export unified `MeldNode` union from `core/ast/types/index.ts`
7. Ensure the union automatically includes all interfaces from `core/ast/types`

### Service Update Order
1. **StateService first** - Simplest service, validates approach
2. **InterpreterService second** - Core pipeline service
3. **Directive handlers** - Update as a group for consistency
4. **Remaining services** - Update based on dependency order
