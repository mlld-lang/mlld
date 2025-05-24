# Diagnosing and Resolving API Test Failures (OOM & DI Scopes)

## Problem Description

After major refactors related to AST, State management, Types, and Directive Handlers, the API integration tests (`npm test api`) started failing with:

1.  JavaScript heap out of memory errors (OOM), particularly in tests involving `@import` directives.
2.  Worker exited unexpectedly errors.
3.  Specific test failures related to circular import detection (throwing DI errors instead of expected circularity errors).
4.  Other functional failures (variable resolution, output formatting).

## Investigation Strategy & Fix Summary

We systematically investigated the failures using extensive logging (`process.stdout.write`) and targeted code changes.

1.  **Variable Resolution Issues Fixed:** Several underlying bugs preventing basic variable definition and resolution were fixed first (detailed in previous versions of this log, involving `StateFactory` map merging and missing `name` properties in handler results).

2.  **Initial DI Scope Investigation:** We explored making various services singletons within the test container (`api/integration.test.ts`) and explicitly passing the container or specific service instances (`ICircularityService`) during recursive `interpret` calls made by `ImportDirectiveHandler`. Extensive logging was added.

3.  **Findings from DI Logging:**
    *   Logs confirmed that crucial stateful services (`CircularityService`) were being re-instantiated during recursive imports, causing their state (like the import stack) to reset.
    *   The `InterpreterServiceClientFactory` and `ImportDirectiveHandler` constructors were receiving containers with `unknown` IDs, indicating they were not being resolved within the scope of the intended child `testContainer` created in the `beforeEach` block.
    *   Neither registering services/factories as singletons nor explicitly passing the container/service instance solved the core scope problem.

4.  **Root Cause Identified (`StateService.createChildState`):**
    *   Investigation revealed that `StateService.createChildState` was manually creating child state instances using `new StateService(...)`.
    *   This **bypassed the DI container** for the child state and all dependencies resolved *by* that child state instance (including nested `InterpreterService`, `DirectiveService`, `ImportDirectiveHandler`, `CircularityService` calls during import interpretation).
    *   This manual instantiation broke the singleton scope inheritance chain, leading to new service instances being created with incorrect (or global) scope, thus losing the `CircularityService` stack and causing infinite recursion and the OOM error.

5.  **Fix Implemented:**
    *   Implemented a two-pronged approach for `StateService.createChildState`:
        1. **Primary Method - Manual Child Creation with Explicit Parent Reference:**
           * Create child state instances with direct constructor injection
           * Explicitly pass the parent state service instance
           * Call `initializeState(this)` with the parent reference
           * This ensures proper parent-child state relationships
        
        2. **Secondary Method - Container-based Resolution (Fallback):**
           * Create a child container using `this.container.createChildContainer()`
           * Register the parent state service with a token
           * Manually propagate singleton services like `CircularityService`
           * Add explicit parent reference verification and correction

    *   **Direct CircularityService Tracking:** 
        * Added explicit tracking in the ImportDirectiveHandler with proper error handling
        * Call `beginImport` before interpretation to update the stack
        * Call `endImport` after interpretation (in both success and error paths)
        * This ensures the import stack is always consistently maintained

6.  **Result:** These changes ensure proper parent-child state relationships and singleton service sharing across recursive imports, fixing the OOM errors and enabling correct circular import detection.

## Lessons Learned & Guidelines for Debugging Similar Issues

### Symptoms Indicating DI Scope Problems

1. **Memory Usage Grows Unbounded:** When a service that should maintain state (like tracking a stack) is being recreated in nested calls.

2. **Unexpected Service Re-Initialization:** Singleton services getting recreated or reset when they should persist (check logs for patterns of initialization).

3. **Stack Overflows or Infinite Recursion:** Often occurs when state tracking is lost between recursive calls.

4. **Expected Errors Not Thrown:** When error detection depends on state that's being lost between calls.

### Effective Debugging Techniques

1. **Strategic Logging:**
   * Use `process.stdout.write()` instead of `console.log()` in test environments that capture output
   * Log object IDs, state values, and container IDs
   * Add entry/exit logging for critical functions
   * Track state changes before and after critical operations

2. **Object Identity Checks:**
   * Log and verify parent/child relationships with identity checks: `parent === expectedParent`
   * Check service instance identities across recursive calls

3. **Container Scoping Verification:**
   * Track container IDs through different layers of the application
   * Verify singletons are being resolved from the correct container

4. **Service State Monitoring:**
   * Track critical state like stack sizes, array lengths, or map entries
   * Add state assertion diagnostics at critical points

### Common Causes of DI Scope Issues

1. **Manual Object Creation:**
   * Using `new Service()` instead of `container.resolve(Service)`
   * Direct instantiation bypasses the DI container and breaks scope inheritance

2. **Missing Parent References:**
   * Child objects not properly linked to parent objects
   * Parent state not being propagated to child objects

3. **Improper Singleton Registration:**
   * Services that need to maintain state not registered as singletons
   * Singletons not properly shared across container boundaries

4. **Container Boundary Problems:**
   * Child containers not inheriting from parent containers
   * Missing service registrations in child containers

5. **Poor Error Management:**
   * No cleanup of state on error paths
   * Missing try/finally blocks around critical state changes

### Best Practices for DI in Recursive Systems

1. **Container Hierarchy Management:**
   * Always create child containers using `parentContainer.createChildContainer()`
   * Register shared services in parent containers
   * Pass container references explicitly when necessary

2. **Parent-Child State Relationships:**
   * Use explicit tokens for parent references (`'ParentServiceForChild'`)
   * Verify parent references are set in child objects
   * Add fallback mechanisms to manually set parent references if DI fails

3. **State Tracking Services:**
   * Register stateful services as singletons in parent containers
   * Check state before and after operations
   * Implement proper cleanup in both success and error paths

4. **Resource Management:**
   * Use try/finally blocks to ensure state is cleaned up
   * Explicitly track resource usage with begin/end patterns
   * Consider using context objects to track operation state

## Conclusion

The OOM issues in the API tests were successfully resolved by identifying and fixing the root causes related to DI scope issues in nested imports. The key insight was understanding that manually creating service instances without proper container integration breaks the singleton scope inheritance chain, leading to loss of critical state tracking and resulting in infinite recursion.

By implementing a more robust approach to child state creation and ensuring proper propagation of parent references and singleton services, we've restored the expected behavior of the circular import detection system and resolved the OOM issues.

This experience highlights the importance of proper DI container management, especially in systems with recursive processing and state tracking requirements.