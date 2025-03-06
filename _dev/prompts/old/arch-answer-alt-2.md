Below is a clarified, evidence-driven plan for methodically resolving the transformation issues, state management bugs, and mismatches between real and mock services—all while preserving passing tests as we proceed. It incorporates the high-level advice of instrumenting each step, auditing our interfaces, and aligning mocks with real services. It is broken into phases to ensure incremental progress without regressions.

────────────────────────────────────────────────────────────────────
PHASE 0: CONTEXT & GOALS
────────────────────────────────────────────────────────────────────

Before making any changes, we must align on what we are trying to accomplish and how it fits into our existing Meld architecture and testing approach.

1. Context:
   • Meld interprets directive-based text into an AST, processes directives (possibly transforming or removing them), and generates output (Markdown, XML, etc.).  
   • "StateService" manages variables, transformations, and can clone its internal state for nested or repeated directive processing.  
   • "DirectiveService" and its handlers produce results that may replace directives in the final AST (transformation mode).  
   • The "OutputService" consumes nodes: if in transformation mode, it should see only text/code nodes and never see directive definitions.  
   • Mocks in tests sometimes omit partial implementations (like "clone()"), leading to runtime errors in integration or API tests.

2. Key Goals:
   1) Eliminate errors around missing or incorrect state methods (e.g. "currentState.clone is not a function").  
   2) Ensure transformation mode consistently replaces directives with their processed output, so the final output shows "test output" instead of raw directives like "@run [echo test]."  
   3) Maintain high test coverage and pass existing tests (unless a test's expectation is flatly incorrect).

3. High-Level Purpose:
   This plan ensures a stable approach to directive transformation—replacing directives with textual or code content—while retaining a well-defined "StateService" interface and consistent test mocks. By the end of these phases, "run" directives, "embed" directives, and others should yield correct transformed nodes, and all code paths (API, integration, unit) should rely on consistent service initializations.

4. Critical Dependencies:
   • Service Initialization Order:
     - Proper initialization sequence (as shown in cli/index.ts)
     - Handling of circular dependencies between services
     - Transformation mode initialization timing
   • State Management:
     - StateService clone operation must preserve transformation state
     - Child states must inherit transformation settings
     - State merging must handle transformed nodes correctly
   • Handler Flow:
     - Handlers must check transformation mode before replacing nodes
     - Node replacement must preserve source locations
     - Error handling must work in both modes
   • Test Infrastructure:
     - TestContext initialization must support both modes
     - Mock services must implement full interfaces
     - Integration tests must use consistent service setup

5. Key Architectural Decisions Required:
   1. Transformation Mode Scope:
      - Global vs per-directive setting
      - Inheritance rules for nested states
      - Default behavior and configuration
   2. Transformation Completeness:
      - All-or-nothing vs partial transformation support
      - Mixing transformed and untransformed content
      - Backward compatibility requirements
   3. Error Handling Strategy:
      - Location preservation in transformed nodes
      - Error reporting in transformation mode
      - Recovery options for partial failures

────────────────────────────────────────────────────────────────────
PHASE 1: AUDIT & ALIGNMENT
────────────────────────────────────────────────────────────────────

Objective: Rigorously align our service interfaces, the real implementations, and our test mocks before modifying any production code paths for transformation. This prevents repeated "ping-pong" fixes later.

1. Interface & Implementation Audit (IStateService):
   • Compare the real "StateService" methods to "IStateService."  
   • Confirm that "clone()", "getTransformedNodes,", "isTransformationEnabled," etc. are declared exactly in both.  
   • Check that every method used in production code is actually typed in the interface.  
   • If any method is missing or partially typed, update "IStateService" accordingly.

2. Mock Services Audit:
   • For each critical mock (especially the StateService mock), confirm it either implements all "IStateService" methods or explicitly extends a real instance.  
   • In a single doc or table, list each method (clone, addNode, transformNode, etc.), whether it is implemented in the real code, and whether it is implemented in the mock.  
   • Add missing methods to the mocks where needed.  
   • Validate that the mock returns data types consistent with the real service (e.g. "clone" returns a new valid mock, not a plain object).

3. Test-by-Test Check for Partial Mocks:
   • In the failing API integration tests and OutputService transformation tests, examine exactly how "StateService" (or its mocks) is created.  
   • If any tests pass in one file but fail in another, note differences in mock usage so we can unify them later.
   • Do not change any production code yet—only refine or unify the mock definitions if they are incomplete.

4. Deliverables & Exit Criteria:
   • A short "Interface vs. Implementation" mapping document (even a simple table).  
   • Updated "IStateService" that matches real usage in code.  
   • Updated StateService mock(s) ensuring "clone" and "transformation" methods are properly defined.  
   • All existing tests should still pass—this step is purely aligning definitions without changing production logic.

Success Criteria:
• All service interfaces are fully documented
• Implementation gaps are identified
• Mock implementations are validated
• No production code changes
• All existing tests remain passing

Evidence Required:
• Interface analysis documentation
• Mock implementation audit
• Test coverage analysis
• Service interaction map


────────────────────────────────────────────────────────────────────
PHASE 2: EVIDENCE COLLECTION
────────────────────────────────────────────────────────────────────

Objective: Build small, targeted test suites to verify that the newly aligned real services and mocks behave as expected in isolation. This clarifies where transformation fails or where a "clone" method might be returning incomplete objects.

1. "StateService.clone.test.ts":
   • Create a minimal test file that:  
     (a) Instantiates the real StateService.  
     (b) Populates it with text/data variables, a small list of nodes, or a mock directive node.  
     (c) Calls "clone()" and verifies each field (variables, commands, original nodes, transformed nodes) is copied properly.  
   • Confirm any transformation flags are copied if they exist.  
   • Confirm that the cloned state is not referencing the same arrays as the original.

2. "TransformationMode.test.ts" (Optional if not already present):
   • A minimal test that uses the real "DirectiveService," real or partial "RunDirectiveHandler," and real "StateService."  
   • Creates a single directive node ("@run [echo test]") with transformation enabled.  
   • Checks that after processing, "StateService.getTransformedNodes()" has replaced the directive node with the output ("test\n" or whatever is produced).  
   • Confirms no directives remain in the "transformedNodes" array.

3. Basic Logging / Instrumentation:
   • In these mini tests, add a few console.logs or debug logs to confirm what "clone()" returns and that "transformedNodes" is updated.  
   • This ensures our isolation environment lines up with real production expectations.

4. Deliverables & Exit Criteria:
   • Dedicated, passing isolation tests for "clone" and transformation.  
   • Confidence that the real "StateService" does indeed replicate behavior we expect.  
   • If these mini-tests fail, fix them before moving on.  
   • Again, no major production code changes (besides possibly small fixes to "clone" if needed). All existing production tests should still pass.


────────────────────────────────────────────────────────────────────
PHASE 3: INSTRUMENT FAILING INTEGRATION TESTS
────────────────────────────────────────────────────────────────────

Objective: Now that we trust the "StateService" and mock setups, locate precisely where the failing large-scope tests (API integration, OutputService transformation) diverge from the proven mini-tests.

1. Identify All Failing Tests:
   • The user's context indicates 7 failing tests:
     (a) 4 in "api/api.test.ts" around "currentState.clone is not a function."  
     (b) 3 in OutputService transformation mode.  

2. Add Debug Logs:
   • For each failing test, inject logs that show:  
     • The exact type of "currentState" or "state" object being passed around (e.g. use "console.log(state.constructor.name)").  
     • The presence or absence of "clone()" in that object or whether transformation is enabled.  
     • The final array in "state.getTransformedNodes()" if we are in transformation mode.  
   • This yields evidence: does the test accidentally inject some partial object? Does "getTransformedNodes()" come back empty?

3. Compare with Passing Tests:
   • If there is a closely related passing test (e.g. a simpler run directive test in OutputService), do a side-by-side to see how it configures the test harness vs. the failing test:  
     (a) Does the passing test set "enableTransformation(true)" but the failing test does not?  
     (b) Does the passing test create a real "StateService" while the failing test uses a stub?

4. Deliverables & Exit Criteria:
   • A short log output or debug capture for each failing test.  
   • A clear note explaining which object or method is missing or incorrectly set up.  
   • No code changes beyond inserting logs and debugging statements. At this point, we want the raw evidence.


────────────────────────────────────────────────────────────────────
PHASE 4: RESOLVE MISMATCHES AND ENSURE PRODUCTION-LIKE SETUP
────────────────────────────────────────────────────────────────────

Objective: Now that we see precisely which mocks or service initializations differ from production, we systematically fix them so the big tests pass.

1. Fix "StateService" Injection in Tests:
   • If logs show that "api/api.test.ts" uses a "fakeState" that lacks "clone," replace it with either (a) a proper mock that includes "clone()" or (b) the real "StateService" if we want a full integration test.  
   • Ensure each test that needs transformation mode is actually enabling transformation the same way production code does (e.g. "context.state.enableTransformation(true)").

2. Confirm DirectiveService -> StateService Flow:
   • In the "api/api.test.ts," check that "DirectiveService" is truly returning a new state object that also has "clone()."  
   • If a partial mock is returned, unify it (likely remove partial mocks for full integration tests, or fully implement them so they match production).

3. OutputService Node Flow:
   • For the 3 failing OutputService tests, confirm that by the time "OutputService.convert" is called, "state.getTransformedNodes()" actually has the directive replaced.  
   • If not, check "RunDirectiveHandler.execute" or "EmbedDirectiveHandler.execute" calls to see if they store the replacement node.  
   • Correct the logic or the test setup as needed. This might mean ensuring we call "interpreterService.interpret([...], { transformation: true })" in the test.  

4. Deliverables & Exit Criteria:
   • All 7 failing tests now pass (unless a test's expectation is truly incorrect). If the test's logic contradicts real architecture decisions, correct the test description or remove it.  
   • No directive definitions or raw commands appear in the final output for transformation-based tests.  
   • Feature parity with the mini-tests from Phase 2.  

By the end of this phase, the fundamental clones and transformation flows in integration tests will match what we already proved in isolation.


────────────────────────────────────────────────────────────────────
PHASE 5: DIRECTIVE & OUTPUT CONSISTENCY RULES
────────────────────────────────────────────────────────────────────

Objective: Confirm that the entire codebase has a unified rule on how directives should appear (or not appear) in output, plus handle any special edge cases (e.g., a directive intentionally kept).

1. Unify the Directive Transformation Rule:
   • Decide, once and for all, if seeing a "DirectiveNode" in transformation mode is a valid scenario or an error.  
   • If it's always invalid, ensure each directive handler replaces itself with text/code.  
   • If some directives are allowed, confirm which, under which conditions, and ensure all relevant handlers exhibit consistent logic.

2. Update Documentation & Comments:
   • In "docs/ARCHITECTURE.md" or a relevant doc, clarify that in transformation mode, all directive nodes are replaced by text/code nodes, or removed if they produce no user-visible output.  
   • Document how test authors can expect "StateService" to store final, transformed nodes.

3. Adjust or Add Tests if Needed:
   • If we discover any contradictory test scenario (one expects a directive to remain, another demands it vanish), either unify the expectation or split them into two test modes with explicit rationales.  
   • Add new coverage for corner cases:  
     (a) A directive that has no output (like a pure definition).  
     (b) A directive that partially modifies the text but remains.  
     (c) Edge cases around error handling (e.g., directive fails to transform properly).

4. Deliverables & Exit Criteria:
   • A clear-coded "transformation contract" that every directive handler follows.  
   • Documentation in the code (JSDoc or doc comments) plus test coverage verifying this rule.  
   • No contradictions or confusion in the test suite about whether "@define," "@import," etc. should appear in final output.


────────────────────────────────────────────────────────────────────
PHASE 6: CLEANUP & LONG-TERM MAINTENANCE
────────────────────────────────────────────────────────────────────

Objective: With all tests passing and consistent transformation rules in place, remove any debugging artifacts, unify leftover flags, and ensure we have robust instructions for future maintainers.

1. Remove or Convert Debug Logs:
   • If you inserted "console.log" or "debugger" statements in integration tests, strip them out or convert them to a more permanent debugging facility (stop spamming test outputs).

2. Finalize Docs & Architecture Overviews:
   • Incorporate diagrams or bullet references in "docs/ARCHITECTURE.md," "docs/TESTS.md," or "services/StateService/README.md" explaining the transformation pipeline.  
   • Summarize the "mini-tests" approach, so future devs can replicate it quickly when diagnosing new issues.

3. Ensure Ongoing Test Consistency:
   • Double-check that no new partial mocks slip in.  
   • Possibly add a lint or code check that mocks must implement the entire "IStateService" if they claim to do so.

4. Deliverables & Exit Criteria:
   • A final, stable codebase with no transformation or state-management failures.  
   • Thorough documentation for new devs to quickly see how we handle directive-to-text transformations.  
   • All 484 tests passing consistently, plus the new mini-tests and any updated coverage.


────────────────────────────────────────────────────────────────────
SUMMARY OF HOW THIS IS INCREMENTAL
────────────────────────────────────────────────────────────────────

• Phases 1–2 do not alter any core business logic; they simply align interfaces and confirm they function in isolation, ensuring no existing tests break.  
• Phases 3–4 systematically address the failing integration tests by matching them to real-world usage (no partial mocks, correct transformation toggles). We expect to fix the 7 known failing tests here without breaking the other 400+ passing tests.  
• Phases 5–6 unify directive transformation rules in all docs/tests, then clean up leftover logs or toggles. This final step ensures a fully coherent design that new team members can easily follow.

By following this plan in order—always focusing first on proven alignment before changing bigger test code—we avoid partial fixes that re-break existing functionality. This methodical approach uses evidence at each stage, verifying that "transformation mode" and "clone()" work as intended in isolation and in real integration flows.
