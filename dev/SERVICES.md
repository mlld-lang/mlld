# Meld Services Inventory & Audit

## Service Inventory Table

```ascii
┌────────────────────┬────────────────────────┬───────────────┬────────────────┐
│     Service        │    Primary Role        │ Dependencies  │  Files To      │
│                    │                        │               │  Review        │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ CLIService        │ Entry point            │ All core      │ cli/index.ts   │
│                    │ Pipeline orchestration │ services      │ cli/cli.test.ts│
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ ParserService     │ AST generation         │ meld-ast      │ services/      │
│                    │ Location tracking      │               │ ParserService/ │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ InterpreterService│ Directive processing   │ DirectiveServ │ services/      │
│                    │ Node transformation    │ StateService  │ Interpreter    │
│                    │ Pipeline coordination  │ Resolution    │ Service/       │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ DirectiveService  │ Directive routing      │ Validation    │ services/      │
│                    │ Handler management     │ State         │ DirectiveServ/ │
│                    │ Node replacement       │ Resolution    │               │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ StateService      │ Variable storage       │ None          │ services/      │
│                    │ Node state management  │               │ StateService/  │
│                    │ Transform tracking     │               │               │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ ResolutionService │ Variable resolution    │ State         │ services/      │
│                    │ Path expansion         │ Circularity   │ Resolution    │
│                    │ Reference handling     │               │ Service/       │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ ValidationService │ Directive validation   │ None          │ services/      │
│                    │ Constraint checking    │               │ Validation    │
│                    │                        │               │ Service/       │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ CircularityService│ Import loop prevention │ None          │ services/      │
│                    │ Reference cycle detect │               │ Circularity   │
│                    │                        │               │ Service/       │
├────────────────────┼────────────────────────┼───────────────┼────────────────┤
│ OutputService     │ Format conversion      │ State         │ services/      │
│                    │ Clean output gen       │ llmxml        │ OutputService/ │
└────────────────────┴────────────────────────┴───────────────┴────────────────┘

## Audit Progress

### StateService (In Progress)

#### Mock Implementation Review
1. Multiple Mock Implementations Found:
   - `tests/mocks/state.ts`: Legacy `InterpreterState` class
   - `tests/utils/testFactories.ts`: Current `createMockStateService()`
   - `tests/utils/TestContext.ts`: Uses real `StateService` in test setup

2. Interface Alignment Status:
   - ✓ All interface methods present in `createMockStateService`
   - ✗ Legacy `InterpreterState` missing transformation methods
   - ⚠️ Mock implementations don't match real service behavior

3. Critical Gaps:
   - Transformation state inheritance not properly handled
   - Inconsistent state preservation in cloning
   - Child state creation doesn't match real implementation
   - State merging behavior differs between mocks and real service

4. Test Usage Patterns:
   - Some tests use legacy mock
   - Some tests use factory-created mock
   - Some tests use real service
   - No consistent pattern across test suite

#### Next Steps
1. Complete interface alignment audit
2. Document transformation state lifecycle
3. Verify mock behavior matches real implementation
4. Plan migration from legacy mock to current mock

## Files Needing Review

Critical files for initial audit:

1. Core Interfaces:
   - [x] services/StateService/IStateService.ts
   - [ ] services/DirectiveService/IDirectiveService.ts
   - [ ] services/InterpreterService/IInterpreterService.ts

2. Implementations:
   - [x] services/StateService/StateService.ts
   - [ ] services/DirectiveService/DirectiveService.ts
   - [ ] services/InterpreterService/InterpreterService.ts

3. Test Infrastructure:
   - [x] tests/utils/testFactories.ts
   - [x] tests/utils/TestContext.ts
   - [x] tests/mocks/state.ts

4. Failing Tests:
   - [ ] api/api.test.ts
   - [ ] services/OutputService/OutputService.test.ts
   - [ ] (other failing test files to be identified)

## Notes

### StateService Audit Findings

1. Interface Definition (`IStateService.ts`):
   - ✅ Well-defined interface with clear method groupings
   - ✅ Explicit transformation methods marked as "(new)"
   - ✅ Complete method signatures for all operations

2. Implementation (`StateService.ts`):
   - Core State Management:
     - Uses immutable `StateNode` pattern
     - Maintains state through `StateFactory`
     - All state updates go through `updateState()`
   
   - Transformation Implementation:
     - Private `_transformationEnabled` flag
     - Dual node arrays: `nodes` and `transformedNodes`
     - `transformedNodes` initialized as copy of `nodes` when enabled
     - Transformation operations properly check mutability

3. Mock Implementation Issues:
   - Multiple competing implementations
   - Inconsistent behavior with real service
   - Missing transformation state handling
   - State inheritance not properly implemented

4. Test Context Concerns:
   - Mixed usage of real and mock services
   - Inconsistent transformation state defaults
   - Potential source of test failures

## Next Steps

1. Review each interface file
2. Compare with implementation
3. Verify mock implementations
4. Document any gaps or misalignments
5. Propose fixes for identified issues

## Notes

### StateService Audit Findings

1. Interface Definition (`IStateService.ts`):
   - ✅ Well-defined interface with clear method groupings
   - ✅ Explicit transformation methods marked as "(new)"
   - ✅ Complete method signatures for all operations

2. Implementation (`StateService.ts`):
   - Core State Management:
     - Uses immutable `StateNode` pattern
     - Maintains state through `StateFactory`
     - All state updates go through `updateState()`
   
   - Transformation Implementation:
     - Private `_transformationEnabled` flag
     - Dual node arrays: `nodes` and `transformedNodes`
     - `transformedNodes` initialized as copy of `nodes` when enabled
     - Transformation operations properly check mutability

3. State Factory (`StateFactory.ts`):
   - Handles immutable state updates
   - Properly copies transformed nodes in:
     - `createState`
     - `createChildState`
     - `mergeStates`
     - `updateState`

4. Critical Findings:
   a) Clone Implementation:
      ```typescript
      clone(): IStateService {
        const cloned = new StateService();
        cloned.currentState = this.stateFactory.createState({...});
        cloned.updateState({
          // ... other state ...
          transformedNodes: this.currentState.transformedNodes ? 
            [...this.currentState.transformedNodes] : undefined,
        }, 'clone');
        cloned._transformationEnabled = this._transformationEnabled;
        return cloned;
      }
      ```
      - ✅ Creates new service instance
      - ✅ Copies transformation flag
      - ✅ Copies transformed nodes if they exist
      - ✅ Uses factory for state creation
      - ❓ Potential issue: Does `createState` properly handle all parent state?

   b) Transformation State Handling:
      - Transformation state is tracked in multiple places:
        1. Service level: `_transformationEnabled` flag
        2. State level: `transformedNodes` array
        3. Factory level: Copied during state operations
      - This complexity could lead to inconsistencies

5. Test Coverage (`StateService.transformation.test.ts`):
   - ✅ Tests default transformation state
   - ✅ Tests node transformation
   - ✅ Tests state preservation in cloning
   - ✅ Tests immutability with transformations
   - ❓ Missing: Tests for complex state inheritance scenarios

6. Potential Issues:
   a) State Inheritance:
      - Complex interaction between parent/child states and transformation
      - Need to verify transformation state is properly inherited
   
   b) State Merging:
      - `mergeStates` handles transformed nodes, but logic might need review
      - Child transformed nodes take precedence without clear documentation why

   c) Mock Implementation:
      - Need to verify mock service properly implements all this complexity
      - Particularly around state inheritance and transformation

Next Steps for StateService Audit:
1. Review mock implementation in `testFactories.ts`
2. Verify state inheritance behavior in failing tests
3. Document complete transformation state lifecycle
4. Review all callers of `clone()` to verify proper usage

(This section will be updated as we proceed with the audit) 