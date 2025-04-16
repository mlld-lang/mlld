# Playbook: Debugging DI & Mocking Issues in Tests

This document captures learnings from troubleshooting complex Dependency Injection (DI) and mocking issues, particularly those involving circular dependencies and lazy loading with `tsyringe`. Use this as a guide when fixing existing skipped tests or writing new tests for complex services.

## The Problem: DI Resolution / Mock Interaction Failures

Tests often fail due to errors like "Cannot resolve dependency", "Cannot inject dependency", "Maximum call stack size exceeded" (circular dependency), or mock assertions failing (`expected "spy" to be called...`). These issues frequently arise from the interaction between `tsyringe`, test containers (manual or `TestContextDI`), mocking strategies, and lazy loading mechanisms like `delay()`.

## Troubleshooting Steps:

**Step 0: ADD LOGGING!**
   *   **Learning:** Complex DI/mock interactions can obscure the root cause. Copious logging is often the fastest way to diagnose issues.
   *   **Action:** Add logs (using `process.stdout.write` to avoid being swallowed by the test runner) at:
       *   Entry/exit points of the function/method under test.
       *   Entry/exit points of mock implementations.
       *   Right before and after calls to mocked dependencies.
       *   Inside `catch` blocks to see exactly what errors are caught.
       *   Log key variable values, mock return values, and object properties (`typeof`, `instanceof`, specific method presence) to verify assumptions.

**Step 1: Identify the Cycle / Complexity**
   *   Trace the dependency graph for the service under test and its dependencies. Look for direct circular dependencies (A -> B -> A) or dependencies involving factories that might indirectly create cycles (A -> FactoryB -> B -> FactoryA -> A).

**Step 2: Apply `tsyringe.delay()` for Constructor Cycles**
   *   **Learning:** `delay()` is the standard `tsyringe` way to break tight *constructor injection* cycles.
   *   **Action:** If a constructor injects Service/Factory B, which eventually requires Service/Factory A back, wrap the problematic injection in A with `@inject(delay(() => B))` (and vice-versa in B if needed).

**Step 3: Choose the Right Test Container Strategy**
   *   **Learning:** While `TestContextDI` offers convenience, it can sometimes obscure resolution issues or interact unexpectedly with `delay()`. Manual child containers provide more explicit control.
   *   **Recommendation:** For complex services, especially those involved in DI cycles or using `delay()`, prefer using a manual child container: `testContainer = container.createChildContainer();`. Dispose it in `afterEach`. For simpler services, `TestContextDI` helpers might suffice.

**Step 4: Mock Dependencies Thoroughly and Correctly**
   *   **Mock *All* Direct Dependencies:** Identify *every* token injected into the service's constructor (including factories, optional dependencies). Create mocks for *all* of them.
   *   **Register Mocks Correctly:** Register each mock instance in the chosen test container (`testContainer.registerInstance(Token, mockInstance)`).
   *   **Match Injection/Registration Tokens:** CRITICAL: The token used for registration **must match** the token used in the `@inject(Token)` decorator (Class vs. String). Mismatches lead to the real service/factory being resolved instead of the mock.
   *   **Mock the *Factory* for `delay()`ed Dependencies:** If Service A uses `@inject(delay(() => FactoryB))`, you **must** mock `FactoryB`. Configure the mock factory's `createClient` (or equivalent method) to return your *mock client instance*. Do NOT try to mock only the client instance directly.
   *   **Sufficient Mock Implementation:** Ensure mock objects implement the methods/properties actually *used* during the test's execution path (even if called indirectly via other services). Start minimal, but add mocked methods as required by runtime errors (e.g., `mockStateService` needed `isTransformationEnabled`).
   *   **Mock Handler/Callback Side-Effects:** If testing delegation (e.g., `DirectiveService` calling a handler), the mock handler must simulate essential side-effects (like `state.setTextVar`) if the test asserts on those effects.
   *   **`vi.spyOn` vs. Direct Assignment:** When mocking methods in `beforeEach`, prefer using `vi.spyOn(mockObject, 'method').mockImplementation(...)` over direct assignment (`mockObject.method = vi.fn()...`). `spyOn` ensures Vitest properly tracks and restores the mock, which can prevent subtle issues where mocks don't trigger correctly in all tests within a suite.
   *   **Avoid Shared State for Side Effects:** Resist using shared variables defined in `beforeEach` (like `stateStorage`) within mock implementations to track side effects. This proved unreliable due to potential scope/closure/reset issues. Instead, assert directly that the relevant mock method (e.g., `mockStateService.setTextVar`) was called with the correct arguments using `expect(...).toHaveBeenCalledWith(...)`.

**Step 5: Refine Service Logic (If Necessary)**
   *   **Avoid `instanceof` for Interfaces/Mocks:** `instanceof` doesn't work reliably for interfaces or plain mock objects. Use structural checks (`'prop' in obj`) or object identity (`===`) to verify return types or object states where appropriate (e.g., checking results from handlers).

**Step 6: Refine Test Assertions**
   *   **Use `expect.objectContaining`:** When asserting that mocks were called with complex objects (e.g., `processingContext`), use `objectContaining` to focus on essential properties. This makes tests less brittle to unrelated changes in internal object construction.
   *   **Verify Side-Effects:** Ensure assertions match the *actual* expected outcome based on the code path and the (potentially mocked) side-effects.

**Step 7: Debugging Runtime Failures**
   *   **DI Resolution Errors ("Cannot resolve/inject"):** Double-check Step 4. Verify *all* dependencies (direct and transitive, if not resolved from parent) are registered in the *correct container* with the *correct token*.
   *   **Mock Not Called Errors:**
        *   Verify the mock registration token matches the injection token (Step 4).
        *   Ensure the code path leading to the mock method call is actually executed. Add console logs or debug.
        *   If using `delay()`, ensure the mock factory setup (Step 4) is correct.
   *   **Incorrect Mock Call Arguments:** Use `expect(spy).toHaveBeenCalledWith(expect.objectContaining(...))` (Step 6). Analyze the difference between expected and received arguments shown in the test failure output.
   *   **Assertion Failures (`.toBe`, `.toEqual`):** Verify the expected value matches what the code *and* the mock implementations actually produce. Did a mock handler forget to perform a side-effect (Step 4)?

**Step 8: Address Linter Noise**
   *   **Learning:** We observed persistent, potentially misleading linter errors regarding Vitest mock methods (`Property 'mockResolvedValue' does not exist...`) even when using standard patterns or `as any`.
   *   **Recommendation:** If tests pass at runtime, prioritize fixing runtime logic. Investigate persistent type errors later (potential Vitest/TS version/config issues). Casting mocks with `as any` (`(vi.fn() as any).mockResolvedValue(...)`) can be a temporary workaround to unblock runtime testing, but isn't ideal.

Always: **ADD LOGGING!** Add copious logging to production code and tests so you can see what's going on. Use `process.stdout.write` to ensure it doesn't get swallowed by the test runner. 

## Applying This Playbook to Skipped Tests:

Many skipped tests (especially in `InterpreterService`, `DirectiveService`, Handlers) likely failed due to issues covered above. When tackling a skipped test:
1.  Start by applying the manual child container pattern (Step 3).
2.  Identify *all* constructor dependencies for the service-under-test.
3.  Apply `delay()` if cycles are suspected (Step 2).
4.  Create and register mocks for *all* dependencies, paying close attention to factory mocking and token matching (Step 4).
5.  Run the test. Analyze failures using Steps 6 & 7. Refine mocks (Step 4) or assertions (Step 6) as needed.
6.  Ignore persistent Vitest-related type errors if runtime behavior is correct (Step 8).

## Additional notes

- To get logs to show up you need to use `process.stdout.write` instead of `console.log` otherwise logs get swallowed by the test runner.