# Type Restructuring Post-AST Reorganization

## Current Status (As of 2024-01-18)

### Migration Progress Summary
- **Core Services**: All main service files migrated to new AST types ✅
- **Directive Handlers**: All 7 handlers now use correct imports ✅
- **Import Issues**: 8/10 services fixed (2 test files remain)
- **AST Structure**: All `node.directive.*` usage fixed ✅
- **Type Guards**: InterpreterService now uses proper guards ✅
- **Testing**: Major issues in 2 services need fixture migration

### ✅ Completed
- **Steps 1-4b**: Type analysis, unified definitions, AST union, ParserService transformation
- **Step 5a**: StateService migration to use new AST types (main service only, tests need work)
- **Step 5b**: InterpreterService core updated with discriminated unions and type guards
- **Step 5c**: All directive handlers migrated with correct imports (7 handlers total)
- **NEW Step 5.5**: Migration Verification Audit completed for all services
- **Partial Step 6**: Old syntax types renamed to `types-old` (but not removed)

### ⚠️ Partially Completed  
- **InterpreterService**: Core fixed, test files still use old syntax helpers
- **StateService**: Core complete, tests need fixture migration and AST structure fixes
- **Step 5d**: ResolutionService (main service migrated, supporting files still use old types)
- **Step 5d**: PathService (main service migrated, test has one old import)
- **Step 5d**: OutputService (main service migrated, may have test imports)

### ❌ Still Pending
- **Step 5e**: Fix remaining test file imports (InterpreterService, StateService)
- **Step 5d**: Complete migration of supporting files for partial services
- **Step 6**: Full removal of `core/syntax/types-old` folder
- **Step 7**: Update remaining ~20-30 files still importing from old types (mostly tests)
- **Step 8**: Documentation and final validation

## Context

1. **AST types** properly organized in `core/ast/types/` - These are the grammar-generated node types
2. **General types** in `core/types/` - These are the broader system types
3. Additional notes on current file locations are collected in `PLAN-CONTEXT.md`

## Full Service/Handler Migration Requirements

A service or handler is considered **fully migrated** when ALL of the following criteria are met:

### 1. Updated Type Imports
- All imports changed from `@core/syntax/types` to `@core/ast/types`
- No references to old type paths in main service files or tests
- Supporting files (factories, utilities) also updated

### 2. Using Correct AST Structure
- Direct property access (e.g., `node.kind` not `node.directive.kind`)
- Properties map to actual AST output from grammar:
  - `node.values` instead of `node.directive.values`
  - `node.raw` for raw content access
  - `node.metadata` for additional attributes
- No adapter layers converting between structures

### 3. Discriminated Union Implementation
The `MeldNode` discriminated union enables type-safe node handling:

```typescript
// MeldNode is a union of all possible node types
type MeldNode = TextNode | DirectiveNode | CodeFenceNode | ...

// Usage with type narrowing:
function processNode(node: MeldNode) {
  switch (node.type) {
    case 'Text':
      // TypeScript knows this is TextNode
      console.log(node.content);
      break;
    case 'Directive':
      // TypeScript knows this is DirectiveNode
      console.log(node.kind);
      break;
  }
}

// Type guards for specific checks:
if (isTextNode(node)) {
  // node is narrowed to TextNode type
}
```

**Key Implications:**
- Services process nodes generically as `MeldNode`
- Type narrowing via `type` field discriminator
- No need for manual type assertions
- Compile-time safety for node-specific properties

### 4. Fixture-Based Testing
- Tests use real AST fixtures from `core/ast/fixtures/`
- No mock AST structures with incorrect shape
- Tests validate against expected outputs in fixtures
- Integration tests use multi-directive fixtures

### 5. Complete Migration
- Main service file uses new types
- All test files updated with new imports
- Supporting utilities (factories, validators) migrated
- No console warnings about deprecated imports
- Service passes all tests with real AST data

## Related Documentation

This plan references several supporting documents:
- **`PLAN-CONTEXT.md`** - Current code structure and service dependencies
- **`AST-NODE-DESIGN.md`** - Detailed design for the `BaseMeldNode` interface and `MeldNode` union
- **`AST-BASE-INTERFACES.md`** - Canonical list of base interfaces and field mappings
- **`STATE-AFFECTED-METHODS.md`** - Inventory of StateService methods requiring updates
- **`STATE-UPDATES.md`** - Detailed execution plan for StateService migration (part of Step 5)
- **`TYPE-RESTRUCTURE-CONTEXT.md`** - Implementation context and decisions from completed phases
- **`STEP-5D-SERVICE-MIGRATION-PLAN-V2.md`** - Detailed fixture-based migration strategy

## Updated Goals

- **Unify AST and runtime types** into a single coherent type system
- Eliminate artificial separation between parsing and execution types
- Create types that evolve through the pipeline with optional fields
- Establish standard patterns for type extensions and lifecycle stages
- Improve type safety while reducing complexity
- Create comprehensive documentation for the unified type system
- Remove outdated types; no backward compatibility or shims

## Actual Directory Structure (As Implemented)

**Note**: The implementation followed AST-TYPES-CLEANUP.md approach rather than the elaborate structure originally planned. This simpler structure achieves all objectives.

```
/core/ast/types/    # All AST and type definitions
  primitives.ts     # Base node types (TextNode, VariableReferenceNode, etc.)
  base.ts          # Base interfaces and types
  nodes.ts         # Node type exports
  meta.ts          # Metadata types
  values.ts        # Value array types
  raw.ts           # Raw content types
  variables.ts     # Variable-specific types
  guards.ts        # Type guards for all nodes
  errors.ts        # Error types
  
  # Directive-specific types
  import.ts        # Import directive types
  text.ts          # Text directive types
  add.ts           # Add directive types (renamed from embed)
  exec.ts          # Exec directive types (renamed from define)
  path.ts          # Path directive types
  data.ts          # Data directive types
  run.ts           # Run directive types
  
  index.ts         # Main exports and MeldNode union
```

**Key Decisions Made**:
1. Kept all types in `/core/ast/types/` instead of creating `/core/types/`
2. Created `primitives.ts` as single source for base node types
3. Each directive has its own file for specific types
4. MeldNode union defined in `index.ts`

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

#### 5c. Directive Handlers (2-3 days) *(Completed)*
- Update all directive handlers to accept new types
- Remove redundant type conversions
- Update return types to match new structure

**CRITICAL DISCOVERY: Handlers Using Outdated AST Structure**

During test migrations, we discovered that the handlers themselves are using the outdated AST structure with `node.directive` property. The actual AST puts all properties directly on the node.

**Root Cause**:
- Handlers expect: `node.directive.kind`, `node.directive.values`, etc.
- Actual AST has: `node.kind`, `node.values`, etc.
- Test adapter layers were masking this issue by converting new → old structure
- This prevented us from seeing that handlers needed updates

**New Approach: Update Handlers AND Tests Together**
- See `UPDATE-TESTS-FIXTURES.md` for the comprehensive plan
- See `MIGRATION-TO-FIXTURES.md` for migration guide
- Track progress in `services/FIXTURE-MIGRATION-TRACKER.md`

1. **Problem**: Handlers using outdated AST structure, test adapters masking the issue
2. **Solution**: Update handlers to use actual AST structure while creating fixture-based tests
3. **Implementation**: 
   - Update handler code to remove `node.directive` references
   - Create tests without adapter layers
   - Ensure handlers work with real AST structure

**Migration Order (Completed)**:
1. TextDirectiveHandler ✅
2. DataDirectiveHandler ✅
3. PathDirectiveHandler ✅
4. ImportDirectiveHandler ✅
5. AddDirectiveHandler ✅
6. RunDirectiveHandler ✅
7. ExecDirectiveHandler ✅

**Benefits**:
- Ensures handlers work with correct AST structure
- Tests use real-world examples from fixtures
- Automatically stays in sync with grammar changes
- Reduces test maintenance burden
- Eliminates artificial adapter layers

### Step 5.5: Migration Verification Audit (COMPLETED - 2024-01-18) ✅

**Purpose**: Verify that all "completed" services actually meet the full migration criteria.

**Services Audited**:
1. **StateService** - Found testing issues
2. **InterpreterService** - Found import and AST structure issues  
3. **All Directive Handlers** - Found import issues in 6/7 handlers
4. **ParserService** - Mostly complete

**Results Summary**:
- **Total Issues Found**: 
  - Import issues: 8 services (now fixed)
  - AST structure issues: 1 service (now fixed)
  - Testing issues: 8 services (2 critical remain)
  - Type guard usage: 7 services (1 fixed)

**Fixes Applied**:
1. **InterpreterService**:
   - ✅ Fixed imports from old syntax types
   - ✅ Fixed `node.directive.kind` → `node.kind`
   - ✅ Added proper type guards
   - ❌ Tests still use old helpers

2. **All Directive Handlers**:
   - ✅ TextDirectiveHandler: Fixed all imports
   - ✅ DataDirectiveHandler: Fixed all imports
   - ✅ PathDirectiveHandler: Fixed all imports
   - ✅ AddDirectiveHandler: Fixed all imports
   - ✅ RunDirectiveHandler: Fixed all imports
   - ✅ ExecDirectiveHandler: Already complete

3. **StateService**:
   - ✅ Core service already correct
   - ❌ Tests need fixture migration
   - ❌ Mock structures incomplete

**Deliverable**: Completed audit tracked in `MIGRATION-AUDIT-TRACKER.md` with detailed findings and fixes.

#### 5d. Other Services (6-8 days) *(In Progress)*
**Reference:** See `STEP-5D-SERVICE-MIGRATION-PLAN-V2.md` for comprehensive migration strategy

- Update remaining services using fixture-based approach:
  - ResolutionService (2-3 days) - Core done, supporting files remain
  - ValidationService (1 day)
  - PathService (1 day) - Core done, one test import remains
  - OutputService (1 day) - Core done, tests may need work
  - ParserService cleanup (1 day)
- Leverage fixtures from `core/examples/` and `core/ast/fixtures/`
- Test against expected outputs where available
- Remove all `@core/syntax/types` imports

#### 5e. Test File Migration (NEW - 2-3 days) *(Next Priority)*

**Purpose**: Fix remaining test files that still use old syntax helpers and incorrect mock structures.

**Critical Test Migrations**:
1. **InterpreterService.integration.test.ts**:
   - Replace `createNodeFromExample()` with fixture-based approach
   - Update imports from `@core/syntax/*` to `@core/ast/types`
   - Use `ASTFixtureLoader` for node creation

2. **StateService.test.ts**:
   - Update mock structures to include all required fields (e.g., `offset` in Position)
   - Consider migrating to fixture-based testing
   - Use new `astMocks.ts` utility for proper mock creation

**Approach**:
- Use fixtures from `core/ast/fixtures/*.json`
- Replace manual node construction with fixture loading
- Ensure mock structures match actual AST output
- Keep service dependency mocking separate from AST fixtures

#### 5f. Test Deduplication Audit (NEW - 3-4 days) *(After 5e)*

**Purpose**: Audit all service tests to identify duplicate tests and determine fixture migration needs.

**Scope**: Review all services that have both `.test.ts` and `.fixture.test.ts` files:
- All directive handlers (7 total)
- Core services with fixture tests
- Supporting services

**Process**:
1. **Read .fixture.test.ts first** - Understand what functionality is covered by fixture tests
2. **Review each test in .test.ts** - For each test, determine if it:
   - Duplicates functionality already tested in fixture tests (mark for removal)
   - Tests unique service-specific behavior (keep)
   - If keeping, determine if it should use fixtures (mark for migration)

**Deliverable**: Create `TEST-DEDUPLICATION-TRACKER.md` with detailed audit findings

**Expected Outcomes**:
- Significant reduction in test duplication
- Clear list of tests to migrate to fixtures
- Cleaner test organization

#### 5g. Test Fixture Migration (NEW - 2-3 days) *(After 5f)*

**Purpose**: Migrate identified tests to use fixtures where practical.

**Scope**: All tests identified in Step 5f as needing fixture migration

**Process**:
1. Replace manual node construction with fixture loading
2. Update test assertions to match fixture structure
3. Ensure tests remain focused on unique functionality
4. Remove duplicate tests identified in audit

**Success Criteria**:
- All practical tests use fixtures
- No duplicate test coverage
- Maintain 100% unique functionality coverage

### Step 6: Remove Legacy Types (1 day) *(Partially Complete)*

**Status**: Old syntax types renamed to `core/syntax/types-old` but not yet removed

**Remaining Tasks**:
1. ~~Rename old syntax types folder~~ ✅ (Now at `core/syntax/types-old`)
2. Update all remaining imports (~79 files still using old paths)
3. Clean up unused type definitions
4. Verify no circular dependencies
5. Final removal of `types-old` folder after all imports updated

**Note**: Per `AST-TYPES-CLEANUP.md`, the renaming helps identify dependencies by breaking old imports

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

### Week 4: Migration Verification (COMPLETED - Step 5.5) ✅
- **Day 1**: Audit all "completed" services for actual migration status ✅
- **Day 2**: Document findings in MIGRATION-AUDIT-TRACKER.md ✅
- **Day 3**: Fix critical issues (InterpreterService, handler imports) ✅

### Week 5: Test Migration & Remaining Services (IN PROGRESS)
- **Days 1-2**: Fix test files (InterpreterService, StateService) - Step 5e
- **Day 3**: Complete ResolutionService migration
- **Day 4**: Complete PathService and OutputService
- **Day 5**: Final service cleanups

### Week 6: Cleanup (Steps 6-8)
- **Day 1**: Remove legacy types (Step 6)
- **Days 2-3**: Update remaining imports (~20-30 files, mostly tests)
- **Day 4**: Documentation updates
- **Day 5**: Final validation

**Total:** 5-6 weeks for complete implementation (currently in Week 4-5)

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
6. **`STEP-5D-SERVICE-MIGRATION-PLAN-V2.md`** - Comprehensive plan for remaining service migrations using fixture-based approach

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
