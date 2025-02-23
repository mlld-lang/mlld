## NEW: Transformation Flow Analysis

1. **DirectiveService Implementation Issue**:
   ```typescript
   // In DirectiveService.processDirective:
   const result = await handler.execute(node, context);
   return result.state;  // <-- CRITICAL: Discarding replacement node!
   ```
   - DirectiveService gets replacement nodes from handlers but doesn't use them
   - Handlers properly generate replacements (verified in RunDirectiveHandler, ImportDirectiveHandler, etc.)
   - But DirectiveService only returns the state, losing the transformations

2. **Handler Behavior**:
   - Handlers correctly implement transformation:
     ```typescript
     // Example from RunDirectiveHandler:
     if (clonedState.isTransformationEnabled()) {
       return {
         state: clonedState,
         replacement: {
           type: 'Text',
           content: stdout,
           location: node.location
         }
       };
     }
     ```
   - All execution handlers follow this pattern
   - Definition handlers return empty text nodes when transformed

3. **State Management**:
   - State tracks transformation correctly:
     - `isTransformationEnabled()`
     - `setTransformedNodes()`
     - `transformNode()`
   - But transformations never make it to OutputService

4. **Expected vs Actual Flow**:
   - Expected:
     1. DirectiveService processes directive
     2. Handler returns replacement node
     3. DirectiveService updates state's transformed nodes
     4. OutputService receives transformed nodes
   - Actual:
     1. DirectiveService processes directive
     2. Handler returns replacement node
     3. DirectiveService discards replacement
     4. OutputService gets original nodes

## NEW: InterpreterService Analysis

1. **Node Processing Flow**:
   ```typescript
   // In InterpreterService.interpretNode:
   case 'Directive':
     const directiveState = currentState.clone();
     directiveState.addNode(node);  // Adds original node
     currentState = await this.directiveService.processDirective(directiveNode, {
       state: directiveState,
       currentFilePath: state.getCurrentFilePath() ?? undefined
     });
   ```
   - InterpreterService adds original node to state BEFORE processing
   - Then calls DirectiveService but discards any replacement nodes
   - This means transformed nodes are never stored in state

2. **State Management**:
   - Creates clean state for each node interpretation
   - Properly clones state to maintain immutability
   - But doesn't handle transformed nodes specially
   - No awareness of transformation mode

3. **Pipeline Flow**:
   ```
   InterpreterService
     -> Adds original node to state
     -> Calls DirectiveService.processDirective
        -> Handler returns {state, replacement}
        -> DirectiveService discards replacement
     -> Returns only state
   ```
   This means:
   - Original nodes are preserved in state
   - Transformed nodes are generated but lost
   - OutputService only sees original nodes

## Root Cause Analysis

1. **Primary Issue**:
   - DirectiveService discards replacement nodes from handlers
   - But the problem is more systemic:
     1. InterpreterService adds original nodes before transformation
     2. DirectiveService discards replacements
     3. No service is responsible for managing transformed node list

2. **Required Changes**:
   a) DirectiveService needs to:
      - Store replacement nodes in state when transformation enabled
      - Use `state.transformNode()` to track replacements
   
   b) InterpreterService should:
      - NOT add original nodes for directives in transformation mode
      - OR add them but mark them for replacement
      - Let DirectiveService handle node storage in transformation mode

3. **Verification Points**:
   - Check if StateService's transformed nodes array is ever populated
   - Verify if any service calls `state.transformNode()`
   - Look for transformation mode checks in node storage logic

## Next Steps

1. **Fix DirectiveService First**:
   ```typescript
   // Current:
   return result.state;
   
   // Should be:
   if (context.state.isTransformationEnabled?.() && result.replacement) {
     result.state.transformNode(node, result.replacement);
   }
   return result.state;
   ```

2. **Then Review InterpreterService**:
   - Consider moving node addition after directive processing
   - Add transformation mode awareness
   - Ensure proper state inheritance of transformed nodes

3. **Finally Check OutputService**:
   - Verify it properly checks for transformed nodes
   - Ensure it uses the right node list based on mode

4. **Test Coverage**:
   - Add tests for transformation state inheritance
   - Verify node replacement in transformation mode
   - Test state cloning with transformed nodes

## Mock Implementation Analysis

1. **Multiple Mock Implementations**:
   - Found two different state mocking approaches:
     a) `MockStateService` class in `OutputService.test.ts` - full implementation
     b) `vi.fn()` based mocks in transformation tests
   - Need to verify consistency between these approaches

2. **Mock State Service Implementation**:
   ```typescript
   class MockStateService implements IStateService {
     private transformationEnabled = false;
     private transformedNodes: MeldNode[] = [];
     
     // Has complete transformation methods:
     isTransformationEnabled()
     enableTransformation()
     setTransformedNodes()
     getTransformedNodes()
     transformNode()
   }
   ```
   - Complete implementation of transformation interface
   - Proper state tracking for transformed nodes
   - Correct inheritance in `createChildState()`

## OutputService Investigation

1. **Node Selection Logic**:
   ```typescript
   // In OutputService.convert():
   const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
     ? state.getTransformedNodes()
     : nodes;
   ```
   Questions to investigate:
   - Is this check for existing transformed nodes intentional?
   - How should transformed nodes be populated in production?
   - What's the relationship between manual `setTransformedNodes()` and the transformation pipeline?

2. **Test Setup Pattern**:
   ```typescript
   state.enableTransformation();
   state.setTransformedNodes(transformedNodes);
   ```
   Need to verify:
   - Is this manual node setting the intended pattern?
   - Should we test the full transformation pipeline instead?
   - How do transformed nodes get populated in real usage?

## Next Steps

1. **Continue Service Audit**:
   - Review InterpreterService implementation
   - Understand transformation pipeline flow
   - Map out how transformed nodes should be populated

2. **Test Infrastructure**:
   - Consolidate mock implementations
   - Verify test patterns match intended usage
   - Consider adding pipeline integration tests

3. **Documentation**:
   - Map complete transformation lifecycle
   - Document intended state inheritance patterns
   - Clarify transformation pipeline responsibilities

4. **Verification Points**:
   - How transformed nodes get populated in production
   - Service responsibilities in transformation pipeline
   - Error handling expectations across pipeline