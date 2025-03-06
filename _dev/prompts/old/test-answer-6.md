# Advice

Below is a high-level strategy for tracking down these failures in a methodical, evidence-based way. Rather than focusing on “quick fixes,” the idea is to deeply trace how data, services, and mocks flow through your system, comparing the passing tests to failing ones and surfacing inconsistencies or missing connections. By methodically instrumenting each step and capturing evidence, you can pinpoint exactly where reality (the actual code) and expectations (the tests) diverge.

────────────────────────────────────────────────────────────────────
1. IDENTIFY AND MAP EACH CRITICAL FLOW
────────────────────────────────────────────────────────────────────

Given the breadth of these errors, you have at least two broad, failing “flows”:

• The “State Cloning” flow (the “currentState.clone” error in the API Integration Tests).  
• The “Transformation Mode” flow (where the OutputService is returning “echo test” instead of “test output”).  

First effort: map each of these end-to-end, stepping through how data is supposed to move from the initial parse all the way to the final conversion. Where do you create or clone states? Where do you store transformed nodes? Where does the OutputService pick them up? This mapping should be written out in detail—literally a small flow diagram or bullet list that references the actual classes/functions.

────────────────────────────────────────────────────────────────────
2. CHECK FOR INTERFACE AND MOCK INCONSISTENCIES
────────────────────────────────────────────────────────────────────

Many of these failures point to the test code using something that either:
 • Does not exist on the real object (e.g. “getTextVar is not a function”).  
 • Is not implemented in the mock (e.g. “currentState.clone is not a function”).  

Methodical approach:
1. Compare, side by side, the real “StateService” class (and any relevant real services) to each test double or mock. Which methods are missing or not returning the same shape?  
2. Check the “IStateService” interface for completeness. Is “clone” declared? Are the transformation methods declared the same way the real code uses them?  
3. Search for test files that cast or stub out the state incorrectly. For example, some test might mock “IStateService” as a plain object that lacks “clone.”  

You want a bulletproof alignment: if the real “StateService” has “clone(),” any interface, stub, and usage in tests must reflect that.

────────────────────────────────────────────────────────────────────
3. INSTRUMENT THE TEST SETUPS AND CAPTURE EVIDENCE
────────────────────────────────────────────────────────────────────

For each major failing test (especially the ones with “currentState.clone is not a function” or “getTextVar is not a function”), add instrumentation that logs which classes are actually instantiated and which methods are attached. For example:

• In the “SDK Integration Tests” that fail with “currentState.clone is not a function,” add a small debug statement to see what type the test is actually injecting as “currentState.” Is it a real “StateService,” a mock, or some partial object?  
• In the OutputService transformation tests, log “isTransformationEnabled,” “getTransformedNodes,” and the final nodes you are about to convert. Confirm whether the directive node is replaced with “test output” or if it is never replaced.  

This approach surfaces the mismatch between your assumptions and the actual objects running inside the test. Once you see the real shape of the objects, you can more easily spot the cause.

────────────────────────────────────────────────────────────────────
4. CAREFULLY COMPARE PASSING VS. FAILING TESTS
────────────────────────────────────────────────────────────────────

Some tests (especially in OutputService) pass, indicating that transformation logic works in certain conditions. Meanwhile, similar tests fail. This discrepancy often comes down to one or two subtle differences in test setup or usage. Look for the following in each pair of pass/fail tests:

1. Which service or mock is used in each? (Do passing tests spin up the real StateService while failing ones use a partial mock?)  
2. Are transformations or states toggled in the same way? (Compare how “transformationEnabled” is set. Possibly a passing test calls enableTransformation(true) at a different point, while the failing test never does.)  
3. Are node arrays or “transformedNodes” being properly assigned in one test suite but not in the other?  

Use a side-by-side table: the lines in the test setup, the lines in the code, and the final data each test receives.

────────────────────────────────────────────────────────────────────
5. EXAMINE TEST EXPECTATIONS FOR CONTRADICTIONS
────────────────────────────────────────────────────────────────────

There is a risk that, across your many test suites, some tests simply expect contradictory behaviors. In particular:

• Some tests want certain directive nodes to vanish or be replaced by “test output” in transformation mode.  
• Others might want certain directive metadata to remain intact or appear in the final output.  

You can see a hint of conflict around directives in transformation mode: 
• The code tries to throw an error if it sees a directive in the “transformed” node set.  
• Yet other tests might be letting directive nodes remain.  

A thorough approach is to unify (or at least verify) the fundamental rule of transformation: “Should directives always become text or code when transformation is enabled, or is some pass-through allowed?” If your code indicates an “Unexpected directive” error in the transformed set but a test expects that directive to remain, you may have a genuinely conflicting requirement.

────────────────────────────────────────────────────────────────────
6. RECONSTRUCT THE STATE HANDLING LOGIC IN MINI-TESTS
────────────────────────────────────────────────────────────────────

Because the “clone” and “getTextVar” errors suggest major confusion in your state management or in the return values, it is often helpful to write a small but thorough “mini” test suite that focuses on only the state-handling portion in isolation. For example:

1. Create a dedicated “StateService.clone.test.ts” that:  
   • Instantiates the real StateService.  
   • Populates it with sample data.  
   • Calls “clone()” and verifies all relevant fields are indeed copied.  

2. Create a second mini test around “DirectiveService.processImport()” returning an object with real or mock state. Confirm that after processing an import, the returned object definitely has “getTextVar()” or not.  

If these mini-tests pass reliably, you’ll know the real implementation is correct in isolation. If something fails, you’ll find the mismatch in how your “DirectiveService” or “StateService” is returning results. Then you can map that knowledge back onto the failing big tests.

────────────────────────────────────────────────────────────────────
7. ADDRESS THE OUTPUTSERVICE TRANSFORMATION CONFLICTS
────────────────────────────────────────────────────────────────────

For the “echo test” vs. “test output” mismatch, zero in on exactly which node is present right before calling “OutputService.convert.” The test implies that “echo test” is supposed to have been replaced in transformation mode by “test output.” So ask:

1. Does the “RunDirectiveHandler” store a replacement node with “test output” in “transformedNodes”?  
2. Does the “OutputService” actually call “state.getTransformedNodes()”? (Log it!)  
3. If it does, is that array empty (meaning the directive was never replaced), or does the array contain the correct text node?  

In short, if the directive is not replaced or the method is never called, you will keep seeing “echo test.” If the directive is replaced but the OutputService is ignoring “transformedNodes,” same outcome.  

Instrument these steps with debug logs or console prints so that you can see the entire chain from “run directive => transform => store new node => OutputService picks up node.”  

Once you have the logs from a failing scenario, cross-compare to a truly passing scenario (like a simpler directive transformation test that passes). You will quickly see which step in the chain is broken.

────────────────────────────────────────────────────────────────────
8. REVISE TEST INFRASTRUCTURE WHERE NEEDED
────────────────────────────────────────────────────────────────────

If your deeper instrumentation reveals that the test environment is set up differently from production (e.g., real code relies on a default “StateFactory” that is not invoked in the test environment), revise the test harness. This might involve:

• Ensuring you use the real “StateFactory” in integration tests instead of patching in a half-complete mock.  
• Making the global “service initialization” match how the app runs in production so that “clone” truly is available.

Any mismatch in service initialization—particularly with partial stubs or half-implemented mocks—will cause repeated partial fixes and “ping-ponging” test results.

────────────────────────────────────────────────────────────────────
9. TAKE STOCK OF THE FAILED ATTEMPTS (AND WHY THEY MISSED)
────────────────────────────────────────────────────────────────────

From your summary, each previous solution touched only slices of the bigger problem:

• Some solutions fixed “clone” but ignored transformation.  
• Others improved transformation usage but overlooked the missing mock method.  
• Some recognized optional-chaining logic in “OutputService” but never addressed the mismatch in directive expectations.  

By looking at them together, it is clear that issues are deeply entangled:
 • You must ensure consistent interfaces and mocks (missing “clone()”).  
 • You must ensure consistent transformation semantics (especially for directives).  
 • You must unify how the test environment is set up (so you don’t store data in “transformedNodes” in real code but nowhere in the mock).  

Each fix that focuses on only one problem is failing if the others remain. Hence the reason for a broader, evidence-collecting approach that verifies all services and test stubs in concert.

────────────────────────────────────────────────────────────────────
10. OUTLINE YOUR STEP-BY-STEP “ACTION PLAN”
────────────────────────────────────────────────────────────────────

Here is a concise plan you can follow (in order):

1. DO AN INTERFACE AUDIT  
   • Confirm “IStateService” includes every method the real “StateService” uses, including “clone,” “getTextVar” (if needed), etc.  
   • Update your mocks to match.  

2. CREATE MINIMAL STATE/MOCK TESTS  
   • Write small tests to confirm the real “StateService” clone functionality.  
   • Write small tests for the directive service’s return object (should it have “getTextVar”?).  

3. REPEAT “TRANSFORMATION MODE” IN A MINI TEST  
   • Construct a single run directive, ensure transformation is true, then confirm the directive node is replaced by a text node containing “test output.”  
   • Immediately pass that state to OutputService, verifying that the output is indeed “test output.”  

4. INSTRUMENT AND COMPARE  
   • Add console logs or debug statements to the failing integration tests to see exactly which object type is being used for “currentState.” Confirm that “clone()” is present. Confirm that “transformedNodes” is populated.  
   • Compare outputs from any passing transformation tests to the failing ones and highlight the differences.  

5. FIX AND RETEST  
   • Once you find missing methods/fields or see that “transformedNodes” is never populated, fix the actual service code or your mock code.  
   • Rerun the entire suite. If new failures appear, re-instrument them in the same methodical way.  

6. RESOLVE DIRECTIVE CONTRADICTIONS  
   • If you still get “Unexpected directive in transformed nodes,” confirm whether your system truly should have zero directives in transformed mode. If a test demands them, decide if that test is invalid or if your design must change.  

7. UPDATE LONGER-RUNNING INTEGRATION TESTS  
   • After you unify the system, ensure that the integration tests do not rely on partial stubbing or nondeterministic environment setups.  
   • If tests still fail, add further instrumentation (like a “transformation debug log”) just for those bigger tests.

By following each step in sequence—always capturing logs, verifying the real vs. mock code, and cross-checking with a minimal example—you’ll avoid incomplete patchwork fixes and systematically press each puzzle piece into place.

────────────────────────────────────────────────────────────────────

The overarching theme: carefully gather evidence at each step to discover exactly where the real system deviates from the tests. Write small isolation tests plus instrumented logs in your bigger integration tests. Compare passing vs. failing code paths. Resolve or rewrite contradictory test expectations if necessary. This approach will solidify your entire codebase’s consistency and finally end the repeated “ping-pong” test failures.
