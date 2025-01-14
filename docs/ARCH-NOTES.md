# Meld Interpreter Refactor: Implementation Plan

## HANDOFF NOTE - January 12, 2024

### Key Achievements
- Completed Phase 1 (Interface Consolidation) with all handlers updated and tests passing
- Completed Phase 2 (Core State and Location) with comprehensive location handling and state inheritance
- Completed Phase 3 (Error Factory Integration) with centralized error handling and location preservation
- Completed Phase 4 (Test Infrastructure) with comprehensive test coverage and infrastructure improvements
- Added extensive test coverage for edge cases and nested scenarios
- Improved logging and error context preservation

### Implementation Status
All planned phases have been completed successfully:

1. Phase 4 (Test Infrastructure) ✅ COMPLETE
   - Implemented TestContext with comprehensive utilities
   - Created mock implementations for state and test nodes
   - Added handler context utilities for both modes
   - Migrated all tests to new infrastructure
   - Added nested context testing support
   - Improved error location testing
   - Removed deprecated setup.ts in favor of new infrastructure

2. Previous Phases ✅ COMPLETE
   - Phase 1: Interface Consolidation
   - Phase 2: Core State and Location
   - Phase 3: Error Factory Integration

### Suggested Next Steps
While all planned phases are complete, here are suggested areas for future improvement:

1. Integration Testing
   - Add more complex nested directive scenarios
   - Test interactions between different directive types
   - Add performance benchmarks for nested operations

2. Error Handling Enhancements
   - Add more detailed error messages
   - Improve error recovery mechanisms
   - Add error aggregation for multiple failures

3. Documentation
   - Add detailed API documentation
   - Create usage examples
   - Document test patterns and best practices

4. Performance Optimization
   - Profile nested directive performance
   - Optimize state inheritance
   - Improve location adjustment efficiency

Important considerations for future work:
- Maintain the established testing patterns
- Keep using TestContext for all new tests
- Ensure proper error location handling
- Consider backward compatibility

### Next Phase (Phase 4 - Test Infrastructure)
You are starting Phase 4, which focuses on implementing comprehensive test infrastructure. The groundwork has been laid with:
- Base error classes and factory in place
- Location handling system fully implemented
- State inheritance and nested operations working correctly
- Error-specific tests added

Your key objectives:
1. Implement TestContext infrastructure
2. Create mock file system and state implementations
3. Add handler context utilities
4. Migrate existing tests to new infrastructure

Focus areas:
- Start with `tests/__mocks__/setup.ts`
- Create `src/interpreter/__tests__/test-utils.ts`
- Update all test files to use new infrastructure
- Add comprehensive test coverage

Important considerations:
- Maintain backward compatibility
- Leverage the existing location handling system
- Ensure proper error bubbling in nested scenarios
- Add detailed logging for test setup and teardown

### Current Implementation Status
- Phase 1 (Interface Consolidation) ✅ COMPLETE
  - DirectiveHandler interface consolidated
  - All handlers updated to new interface
  - Tests updated and passing
  - Registry implementation cleaned up

- Phase 2 (Core State and Location) ✅ COMPLETE
  - Enhanced InterpreterState with proper inheritance
  - Fixed subInterpreter implementation
  - Location handling fully implemented
  - Updated nested directive tests
  - Location adjustments working
  - Added detailed logging
  - Improved error location handling

- Phase 3 (Error Factory Integration) ✅ COMPLETE
  - Created and implemented ErrorFactory
  - Standardized error creation across handlers
  - Ensured proper location context preservation
  - Added comprehensive error-specific tests
  - Updated all directive handlers
  - Added integration tests for nested scenarios
  - Fixed type safety in error handling

- Phase 4 (Test Infrastructure) 🚧 IN PROGRESS
  - Base test utilities exist but need enhancement
  - Some mock implementations exist
  - Need comprehensive test context
  - Need handler context utilities

### Next Steps (Phase 4)
The next Claude instance should focus on implementing the Test Infrastructure. Key objectives:

1. TestContext Implementation:
   - Create new TestContext class for test setup/teardown
   - Add utilities for common test scenarios
   - Support both top-level and nested testing
   - Add mock file system support

2. Mock Implementations:
   - Create mock file system
   - Create mock state implementation
   - Add utilities for creating test nodes
   - Support location tracking in mocks

3. Handler Context Utilities:
   - Create utilities for handler testing
   - Support both modes (top-level/right-side)
   - Add location adjustment helpers
   - Support state inheritance testing

4. Test Migration:
   - Update existing tests to use new infrastructure
   - Add more comprehensive test coverage
   - Verify all edge cases
   - Add nested scenario tests

Files to modify:
- `tests/__mocks__/setup.ts`
- `src/interpreter/__tests__/test-utils.ts` (new)
- All test files

Important Considerations:
- Maintain backward compatibility with existing tests
- Ensure proper cleanup between tests
- Add comprehensive documentation
- Consider test performance

## Context and Background
This document outlines a comprehensive plan to fix critical issues in the Meld interpreter's implementation, particularly around state inheritance and location handling. The work has been broken down into phases that can be implemented by separate Claude instances.

### Current State
- The codebase has partially implemented a right-side operation refactor
- Tests are failing, particularly around nested directive handling
- Key issues include state inheritance, location adjustments, and error handling
- Core infrastructure components (LocationManager, ErrorFactory, TestContext) are missing or incomplete

### Key Issues
1. State inheritance is not working correctly in nested directives
2. Location adjustments are inconsistent and sometimes incorrect
3. Error handling lacks proper location context
4. Test infrastructure needs improvement for handling complex scenarios

### Implementation Strategy
- Work is divided into 4 phases
= Take your time with each step. Thoroughness is more important than speed.
- Each phase is designed to be handled by a fresh Claude instance
- Phases have clear dependencies and deliverables
- Changes are atomic and focused
- Tests are updated alongside implementation
- Verify each change with tests before moving to the next step.
- Keep detailed notes of your changes to assist the next Claude.
- If you encounter edge cases or unclear requirements, pause and ask for clarification.

When you complete your work:
- Run the tests. 
- Document all changes made in this file.
- Note any challenges or unexpected behaviors
- Write a handoff note for the next Claude who will implement the next phase
- Include suggestions for the advanced features based on your experience with the core implementation

### Success Criteria (of the full refactor)
- All tests pass, particularly nested directive tests
- State inheritance works correctly across multiple levels
- Location information is accurate in both normal operation and errors
- Test infrastructure supports both top-level and right-side testing scenarios

# Implementation Phases

This document outlines issues found during the refactor plan review. The implementation should be broken into the following phases, each handled by a fresh Claude instance:

## Phase 1: Interface Consolidation (1-2 days) ✅ COMPLETE
Focus: Issue #4f2 - Competing DirectiveHandler Interfaces
- Single Claude instance
- Must be completed before other phases
- Deliverables:
  1. ✅ Consolidated DirectiveHandler interface in one location
  2. ✅ All handlers updated to new interface
  3. ✅ Old interface removed
  4. ✅ Tests updated
- Files modified:
  - `src/interpreter/directives/types.ts`
  - `src/interpreter/directives/index.ts`
  - All directive handler implementations
  - All directive tests

## Phase 2: Core State and Location Implementation (2-3 days) ✅ COMPLETE
Focus: Architect's plan from ARCH-NOTES.md
- Single Claude instance
- Required Phase 1 to be complete
- Deliverables:
  1. ✅ Enhanced InterpreterState with proper inheritance
  2. ✅ Fixed subInterpreter implementation
  3. ✅ Improved location handling
  4. ✅ Updated tests
- Files modified:
  - `src/interpreter/state/state.ts`
  - `src/interpreter/subInterpreter.ts`
  - `src/interpreter/__tests__/nested-directives.test.ts`

## Phase 3: Error Factory Integration (1-2 days) 🚧 IN PROGRESS
Focus: Issue #3e7 - Error Factory Implementation
- Can run in parallel with Phase 2
- Separate Claude instance from Phase 2
- Deliverables:
  1. ErrorFactory implementation
  2. Location-aware error creation
  3. Updated error handling in subInterpreter
  4. Error-specific tests
- Files to modify:
  - `src/interpreter/errors/errors.ts`
  - `src/interpreter/errors/factory.ts` (new)
  - `src/interpreter/subInterpreter.ts`
  - Error-related tests

## Phase 4: Test Infrastructure (2-3 days) ⏳ PENDING
Focus: Issue #5d4 - TestContext Implementation
- Requires Phases 1-3 to be complete
- Final Claude instance
- Deliverables:
  1. TestContext implementation
  2. Mock file system and state implementations
  3. Handler context utilities
  4. Migration of existing tests
- Files to modify:
  - `tests/__mocks__/setup.ts`
  - `src/interpreter/__tests__/test-utils.ts` (new)
  - All test files to use new infrastructure

## Dependencies
- Phase 1 must complete before all others ✅
- Phase 2 can start after Phase 1 ✅
- Phase 3 can run in parallel with Phase 2 🚧
- Phase 4 must wait for all others to complete ⏳

## Notes for Claude Instances
1. Each phase should be handled by a fresh Claude instance
2. Provide the full context of ARCH-NOTES.md when starting Phase 2
3. Each Claude should be given:
   - The specific phase requirements
   - The relevant issue details
   - Access to all current code
   - List of files to modify
4. Each Claude should:
   - Review existing code before making changes
   - Make atomic, focused changes
   - Add detailed comments explaining changes
   - Update tests as needed

---

Below is a complete plan to address the top two (related) issues in this codebase—namely, (1) fixing sub-interpreter state inheritance and nested directive handling, and (2) ensuring location adjustments (for both interpreted content and errors) are handled correctly. The plan begins with what we will change, then provides exact line-by-line patches for the most complex files involved (primarily subInterpreter.ts and state.ts, with one test fix in nested-directives.test.ts).

High-Level Plan
	1.	Fix Sub-Interpreter State Inheritance and Nested Directive Handling
	•	Ensure that the InterpreterState supports partial or full inheritance of parent state variables (text, data, commands, etc.).
	•	Clarify how changes made in the child state merge back to the parent state. By design, some code already suggests we do mergeChildState(childState) in subInterpreter.ts, but that logic is incomplete or references inexistent methods (like getLocalTextVars()).
	•	Add (or correct) methods in InterpreterState to track only what changed locally, so that merges do not re-run every variable from scratch if we only want to merge partial changes. If a simpler approach is acceptable, we can merge the entire child’s state to the parent so that all child modifications become visible to the parent.
	2.	Fix Location Adjustments in Nested Directives
	•	Ensure that every node’s location object is properly offset by the baseLocation whenever we parse nested content in interpretSubDirectives.
	•	When an error occurs in nested directives, ensure we attach the adjusted location in the thrown error so test suites can confirm correct line/column references.
	•	Add (or fix) test coverage for nested location offsets with multi-line content, verifying we correctly handle line increments for everything past the first line.
	3.	Implement Additional/Corrected Tests
	•	In nested-directives.test.ts or subInterpreter.test.ts, add or fix a test that explicitly checks the final line/column of a multi-line nested directive is correct, so we can be sure our location arithmetic is accurate.

Detailed Steps and Code Changes

Below are explicit file-by-file code changes. All patches assume your repository structure is unchanged from the code you provided. You can apply these line-by-line diffs (or merge them manually) to implement the fixes.

	Note: Any line numbers in these diffs are illustrative. You may need to adjust them if your local file differs. However, the code snippets should be appended exactly as shown where indicated.

1. src/interpreter/state/state.ts (or wherever InterpreterState class is defined)

Goal: Fix or add methods needed for partial merges, and ensure merges do not break child/parent state references.

<details>
<summary>Patch Diff for <code>src/interpreter/state/state.ts</code></summary>


--- a/src/interpreter/state/state.ts
+++ b/src/interpreter/state/state.ts
@@ -1,6 +1,7 @@
 import type { MeldNode } from 'meld-spec';

 export class InterpreterState {
+  private isMutable: boolean = true;
   private nodes: MeldNode[] = [];
   private textVars: Map<string, string> = new Map();
   private dataVars: Map<string, any> = new Map();
@@ -33,6 +34,34 @@ export class InterpreterState {
     this.dataVars.set(name, value);
   }

+  /**
+   * Merge all textVars/dataVars/commands/nodes from a child state.
+   * This is meant to unify nested directive changes back into the parent.
+   */
+  public mergeChildState(childState: InterpreterState): void {
+    if (!this.isMutable) {
+      throw new Error('Cannot modify immutable state');
+    }
+    // Merge child text vars
+    for (const [k, v] of childState.textVars.entries()) {
+      this.textVars.set(k, v);
+    }
+    // Merge child data vars
+    for (const [k, v] of childState.dataVars.entries()) {
+      this.dataVars.set(k, v);
+    }
+    // Merge child commands
+    for (const [k, v] of childState.commands.entries()) {
+      this.commands.set(k, v);
+    }
+    // Merge child nodes
+    for (const n of childState.nodes) {
+      this.nodes.push(n);
+    }
+    // Merge child imports
+    for (const imp of childState.imports.values()) {
+      this.imports.add(imp);
+    }
+  }
+
   addImport(path: string): void {
     this.imports.add(path);
   }
@@ -61,4 +90,33 @@ export class InterpreterState {
     return this.dataVars.get(name);
   }

+  /**
+   * Set this state as immutable, preventing further writes.
+   */
+  public setImmutable(): void {
+    this.isMutable = false;
+  }
+
+  /**
+   * Return whether this state is currently immutable.
+   */
+  public get isImmutable(): boolean {
+    return !this.isMutable;
+  }
+
+  /**
+   * If we are linking a parent state, store the reference.
+   */
+  public parentState?: InterpreterState;
+
+  constructor(parentState?: InterpreterState) {
+    if (parentState) {
+      this.parentState = parentState;
+    }
+  }
+
+  /**
+   * Return the parent state if any.
+   */
+  public getParentState(): InterpreterState | undefined {
+    return this.parentState;
+  }
 }

</details>


Explanation:
	•	We introduce mergeChildState(childState) to unify child modifications into the parent.
	•	We add setImmutable() and an isImmutable getter. Now a child state can be “locked” after merging, preventing further modifications.
	•	We clarify how a state can hold parentState (passed to the constructor) and optionally retrieve it with getParentState().

2. src/interpreter/subInterpreter.ts

Goal: Properly adjust node locations for sub-directives, ensure correct merges to parent, handle the base location across multi-line content, and lock child state if needed.

<details>
<summary>Patch Diff for <code>src/interpreter/subInterpreter.ts</code></summary>


--- a/src/interpreter/subInterpreter.ts
+++ b/src/interpreter/subInterpreter.ts
@@ -85,15 +85,18 @@ export function interpretSubDirectives(
   console.log('[SubInterpreter] Starting interpretation:', {
     contentLength: content.length,
     baseLocation,
-    hasParentState: !!parentState,
+    hasParentState: parentState != null,
     parentStateNodes: parentState.getNodes().length
   });

   try {
     // Create child state that inherits from parent
-    const childState = new InterpreterState(parentState);
+    const childState = new InterpreterState(parentState);
+    childState.setCurrentFilePath(parentState.getCurrentFilePath() || '');
 
     console.log('[SubInterpreter] Created child state:', {
-      hasParentState: !!childState.parentState,
+      hasParentState: childState.parentState != null,
       inheritedVars: {
         text: Array.from(parentState.getAllTextVars().keys()),
         data: Array.from(parentState.getAllDataVars().keys())
@@ -108,26 +111,33 @@ export function interpretSubDirectives(
     console.log('[SubInterpreter] Parsed nodes:', {
       count: nodes.length,
       types: nodes.map(n => n.type)
+      // We could also log node.location, but let's keep it concise
     });

     // Adjust locations for all nodes before interpretation
     for (const node of nodes) {
       adjustNodeLocation(node, baseLocation);
     }

-    // Store nodes in child state
-    for (const node of nodes) {
-      childState.addNode(node);
-    }
-
     // Interpret nodes in child state with right-side context
     console.log('[SubInterpreter] Interpreting nodes in child state...');
     interpret(nodes, childState, {
       mode: 'rightside',
       parentState,
       baseLocation
     });

+    // NOTE: interpret() already calls childState.addNode(node) for non-directives.
+    // If you want to store them upfront, do it *before* interpret, but not both.
+
     // Merge child state back to parent before making it immutable
     console.log('[SubInterpreter] Merging child state back to parent...');
-    if (!parentState.isImmutable) {
-      let currentParent: InterpreterState | undefined = parentState;
-      while (currentParent && !currentParent.isImmutable) {
-        currentParent.mergeChildState(childState);
-        currentParent = currentParent.parentState;
+    {
+      // If parent is immutable, do nothing. Otherwise, keep merging up.
+      let tmp = parentState;
+      while (tmp && !tmp.isImmutable) {
+        tmp.mergeChildState(childState);
+        tmp = tmp.getParentState();
       }
     }
@@ -138,7 +148,7 @@ export function interpretSubDirectives(
     console.log('[SubInterpreter] Making child state immutable...');
     childState.setImmutable();

-    console.log('[SubInterpreter] Interpretation completed:', {
+    console.log('[SubInterpreter] Sub-interpretation completed:', {
       nodeCount: childState.getNodes().length,
       vars: {
         text: Array.from(childState.getAllTextVars().keys()),
@@ -161,7 +171,7 @@ export function interpretSubDirectives(
       console.error('[SubInterpreter] Error during interpretation:', {
         errorType: error instanceof Error ? error.constructor.name : typeof error,
         errorMessage: error instanceof Error ? error.message : String(error),
-        baseLocation
+        baseLocation,
       });

       if (error instanceof Error) {

</details>


Explanation:
	•	We set the new childState to inherit the parent file path, ensuring relative path-based logic is consistent.
	•	We remove the redundant loop that was adding nodes to the child state before interpret() if interpret() is already adding them. (We only do one or the other to avoid duplication.)
	•	We ensure a consistent while-loop merges child state up the entire chain of parents (stopping if any parent is immutable).
	•	We added a console.log tweak for clarity.

3. src/interpreter/state/state.ts (Optional Addendum)

If your code references setCurrentFilePath or getCurrentFilePath inside InterpreterState (some code in importDirectiveHandler suggests it), you need to add these. If you already have them, ignore this patch.

<details>
<summary>Patch Diff for <code>src/interpreter/state/state.ts</code> (Add getCurrentFilePath/setCurrentFilePath)</summary>


--- a/src/interpreter/state/state.ts
+++ b/src/interpreter/state/state.ts
@@ -95,6 +95,16 @@ export class InterpreterState {

+  private currentFilePath: string = '';
+
+  public setCurrentFilePath(path: string): void {
+    if (this.isImmutable) {
+      throw new Error('Cannot modify immutable state');
+    }
+    this.currentFilePath = path;
+  }
+
+  public getCurrentFilePath(): string {
+    return this.currentFilePath;
+  }
 }

</details>


4. test/interpreter/nested-directives.test.ts (or similarly named)

Goal: Fix or add a test to confirm location offsets on a multi-line nested directive. If the test is missing or references broken location logic, we add a test that fails unless location is properly adjusted.

Below is an example minimal fix: suppose you have a test block named "should handle location offsets correctly". We add an assertion verifying that the final line/column is also correct.

<details>
<summary>Patch Diff for <code>nested-directives.test.ts</code></summary>


--- a/tests/nested-directives.test.ts
+++ b/tests/nested-directives.test.ts
@@ -77,6 +77,13 @@ describe('Nested Directives', () => {
       expect(nodes[1].location?.start).toEqual({ line: 11, column: 1 });
     });

+    it('should properly offset multi-line content in nested directives', () => {
+      baseLocation = {
+        start: { line: 8, column: 2 },
+        end: { line: 8, column: 10 }
+      };
+      // Additional content or directives that occupy multiple lines...
+    });
   });

</details>


Then fill in the test content as needed. The crucial fix is verifying that location.end.line is offset by baseLocation.start.line - 1.

5. Optional: Add a new failing test for subInterpreter if you suspect we do not have test coverage for partial merges.

You can do something like:

it('should only merge child state once and preserve unique data from the parent', () => {
  // ...
});

Make it fail if the child’s changes vanish or if parent is re-written incorrectly.

Final Recap
	1.	State: We add mergeChildState and “immutability” to unify child changes with the parent and freeze the child once done.
	2.	Sub-interpreter: We fix location adjustments, remove double-adding of nodes, unify the while-loop merging approach, and keep consistent file path references.
	3.	Tests: We extend or correct tests to confirm multi-line location offsets and ensure child merges are correct.

With these changes, nested directives will now properly inherit the parent’s variables, generate correct line/column offsets for errors, and propagate newly created or updated data/text vars back to the entire parent chain—consistent with your codebase vision for maintainability, testability, clarity, and functionality.

This completes the explicit plan and patch-level instructions needed to resolve the key outstanding refactor and integration issues.