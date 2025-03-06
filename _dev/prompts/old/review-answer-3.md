Below is a synthesis of how the recent audit results reinforce and refine each step of the multi‐phase plan you already have. Your original plan (Phases 0–6) remains an excellent framework. With Phase 1 (the interface and mock audit) now complete, here is how you can proceed through Phases 2–6 while incorporating the new discoveries and evidence:

────────────────────────────────────────────────────────────────────
1) PHASE 2: BUILD TARGETED TESTS & VERIFY ISOLATED BEHAVIOR
────────────────────────────────────────────────────────────────────

WHY:  
• The audit confirmed that StateService (and related methods) sometimes differ from expectations (e.g., “currentState.clone is not a function,” leftover directives in transformed output).  
• You now have concrete findings (e.g., shallow vs. deep copies in clone(), transformation mode overwriting, partial mocks that might skip certain methods).  

WHAT TO DO:  
• Create small, dedicated tests for your real StateService in isolation. For example:  
  – clone() tests: Make sure it copies text/data variables, commands, node arrays, and transformedNodes properly.  
  – transformation tests: Simple “@run [echo test]” directive with enableTransformation(true) to verify that transformNode() actually replaces the directive node.  
• Confirm you do not rely on “currentState.clone()” anywhere; your real code should always call service.clone(). Add a minimal test scenario that calls service.clone() in the same way the integration test does—if that test fails, you know the problem is in your real clone() logic or in how you call it.  

DELIVERABLES BY END OF PHASE 2:  
• A small but complete set of direct tests covering:  
  1. clone() → verifying shallow vs. deep copies, transformation flags, immutability flags.  
  2. transformNode() → verifying correct node replacement for a single directive.  
  3. enableTransformation(true) → ensuring you only overwrite transformedNodes once, not every time.  
• All these new tests should pass before you move on—if not, you fix them in isolation.  

────────────────────────────────────────────────────────────────────
2) PHASE 3: INSTRUMENT THE FAILING INTEGRATION TESTS
────────────────────────────────────────────────────────────────────

WHY:  
• The audit showed 10 failing tests across “api/api.test.ts” and “OutputService/OutputService.test.ts.” Many revolve around:  
  – “currentState.clone is not a function” (i.e., a partial or incorrect state object)  
  – “Unexpected directive in transformed nodes”  
  – Mismatched transformations (expecting “test output” but got “echo test”)  

WHAT TO DO:  
• Add targeted debug logs to these failing tests so we can see exactly which object is injected into the pipeline. Specifically, confirm:  
  1. Is the test using a real or a mock StateService?  
  2. Does the mock omit clone() or transformNode()?  
  3. Is transformation actually enabled in the test’s setup?  
• Make notes on each test’s actual “state” object or “result” object. For instance, console.log(result.constructor.name) or console.log(Object.keys(result)) to see why getTextVar(...) fails or whether clone() is missing.  

DELIVERABLES BY END OF PHASE 3:  
• A short, per-test log or summary pinpointing the mismatch: e.g., “Test X is injecting a partial mock that lacks clone(). Test Y never enables transformation but expects replaced nodes.”  
• No major code changes yet—just logs, instrumentation, and observation.  

────────────────────────────────────────────────────────────────────
3) PHASE 4: FIX PARTIAL MOCKS & RESOLVE MISMATCHES
────────────────────────────────────────────────────────────────────

WHY:  
• The audit discovered that many test failures trace back to partial mocks or incomplete directive transformations.  
• Some tests expect “test output,” but the real directive code never transforms “echo test,” or the test calls .clone() on a raw data object.  

WHAT TO DO:  
1. Unify your mock usage:  
   – If your integration tests are truly “end to end,” consider switching to the real StateService so you don’t need partial mocks at all.  
   – If you must use mocks, ensure they fully implement IStateService, including clone() and transformNode().  
2. Adjust the test setup for transformation:  
   – For tests that expect directive nodes to become plain text, confirm that you call enableTransformation(true) and that the relevant directive handler (e.g., RunDirectiveHandler) calls stateService.transformNode(directiveNode, newTextNode).  
3. Examine “result.getTextVar is not a function” errors in DirectiveService tests:  
   – Possibly the returned object is not the final StateService but an intermediate result. Decide if the test should be expecting the raw final state or only some partial object. If the test truly needs getTextVar(...), ensure the final object is the actual StateService.  

DELIVERABLES BY END OF PHASE 4:  
• The once-failing tests are now passing or updated.  
• Proper alignment between real services and test mocks.  
• Re-verified transformations: no leftover directives if transformation is enabled.  

────────────────────────────────────────────────────────────────────
4) PHASE 5: UNIFY DIRECTIVE & OUTPUT CONSISTENCY RULES
────────────────────────────────────────────────────────────────────

WHY:  
• The audit revealed confusion around whether some directives (“@define,” “@run,” etc.) are supposed to remain in final output. OutputService complains “Unexpected directive in transformed nodes.”  
• Integration tests sometimes want “echo test” replaced by “test output.”  

WHAT TO DO:  
• Decide a single transformation contract for your codebase:  
  – If a directive is purely an instruction, it must be replaced/removed in transformation mode.  
  – If a directive has user-facing text, define how it is turned into display text.  
• Update each directive handler to conform to the same rule. For example, “@run” always yields a final text node with the output. “@define” might yield no visible text.  
• Document these rules in “docs/ARCHITECTURE.md” or “services/DirectiveService/README.md” so future devs and tests can rely on them.  
• Adjust or create new tests for edge cases (e.g., a directive that produces no text, or partial success).  

DELIVERABLES BY END OF PHASE 5:  
• No test or service confusion about whether directive nodes remain in the final array.  
• OutputService code that never sees raw directives in transformation mode.  
• Clear documentation of your “when in transform mode → directive must be replaced” rule.  

────────────────────────────────────────────────────────────────────
5) PHASE 6: CLEANUP & LONG-TERM MAINTENANCE
────────────────────────────────────────────────────────────────────

WHY:  
• After fixing the immediate test and transformation issues, you want to avoid gradually sliding back into partial or contradictory mocks.  
• You also want new devs to quickly understand how transformations are meant to work.  

WHAT TO DO:  
• Remove extraneous debug logs or convert them into a stable debug option if needed.  
• Keep the plan for directive transformations and state clonability up to date in your code comments.  
• Possibly add a lint or code rule that ensures any mock claiming to implement IStateService implements every method.  
• Bake your new “mini tests” for clone() and transformation into the standard test suite so future changes remain safe.  

DELIVERABLES BY END OF PHASE 6:  
• A fully coherent codebase that provides the transformations, handles state clonability, and keeps all 484+ tests passing.  
• Clear, stable documentation that new devs can read to see how directive transformations, state management, and output generation work in concert.  

────────────────────────────────────────────────────────────────────
BOTTOM LINE (HOW TO MOVE FORWARD)
────────────────────────────────────────────────────────────────────

• You have completed Phase 1 (the interface/mocks audit).  
• Phase 2 is next: write small, direct tests covering clone(), transformation mode, and basic directive replacement to verify the real StateService works as expected in isolation.  
• Then, in Phase 3, instrument the failing integration tests with logs to see which mocks or test setups differ from real usage.  
• Proceed to systematically unify or fix those mismatches in Phase 4, and then finalize the directive transformation rules in Phase 5 so that OutputService never mysteriously sees leftover directive nodes.  
• Finally, do your cleanup and documentation pass in Phase 6.

By following these phases in strict sequence—and taking advantage of the new knowledge from your audit—you will incrementally resolve the partial mock issues, unify your transformation logic, and get all tests, including the final build output scenarios, passing reliably.
