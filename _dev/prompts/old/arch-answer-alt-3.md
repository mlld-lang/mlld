Below is a clarified, evidence-driven plan for methodically resolving the transformation issues, state management bugs, and mismatches between real and mock services—all while preserving passing tests as we proceed. It is broken into phases to ensure incremental progress without regressions.

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
   • Service Initialization:
     - Services must initialize in a consistent, deterministic order
     - Service dependencies must be properly resolved
     - Transformation behavior must be predictable across service boundaries
   • State Management:
     - State cloning must preserve all relevant context
     - State inheritance must be consistent and predictable
     - State changes must be atomic and traceable
   • Handler Behavior:
     - Handlers must have consistent transformation behavior
     - Source locations must be preserved for debugging
     - Error handling must be consistent in all modes
   • Test Infrastructure:
     - Test setup must match production behavior
     - Mock implementations must be complete and consistent
     - Integration tests must reflect real service interactions

5. Key Architectural Decisions Required:
   1. Transformation Scope:
      - Define the granularity of transformation control
      - Establish clear inheritance rules
      - Document configuration requirements
   2. Transformation Guarantees:
      - Define completeness requirements
      - Establish content mixing rules
      - Specify compatibility constraints
   3. Error Handling:
      - Define error preservation requirements
      - Establish reporting consistency rules
      - Specify recovery requirements

────────────────────────────────────────────────────────────────────
PHASE 1: AUDIT & ALIGNMENT
────────────────────────────────────────────────────────────────────

Objective: Establish a complete understanding of current service interfaces and their implementations before making any changes.

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

Objective: Gather concrete evidence about service behavior in isolation to guide implementation decisions.

Success Criteria:
• Core service behaviors are verified
• State management patterns are documented
• Transformation flows are validated
• No regressions in existing tests
• Clear evidence trail for decisions

Evidence Required:
• Isolated test results
• Behavior documentation
• State flow analysis
• Performance impact assessment

────────────────────────────────────────────────────────────────────
PHASE 3: FAILURE ANALYSIS
────────────────────────────────────────────────────────────────────

Objective: Understand precisely why integration tests are failing and what architectural principles they violate.

Success Criteria:
• Root causes identified for all failures
• Architectural violations documented
• Test expectations validated
• Clear path to resolution defined

Evidence Required:
• Failure analysis documentation
• Architectural violation report
• Test expectation audit
• Resolution strategy document

────────────────────────────────────────────────────────────────────
PHASE 4: ALIGNMENT IMPLEMENTATION
────────────────────────────────────────────────────────────────────

Objective: Systematically resolve identified issues while maintaining architectural integrity.

Success Criteria:
• All failing tests pass
• No new test failures introduced
• Architectural principles maintained
• Implementation consistent with evidence
• No partial or incomplete fixes

Evidence Required:
• Test results
• Implementation validation
• Architecture compliance check
• Regression analysis

────────────────────────────────────────────────────────────────────
PHASE 5: CONSISTENCY ENFORCEMENT
────────────────────────────────────────────────────────────────────

Objective: Establish and enforce consistent rules for transformation behavior across the codebase.

Success Criteria:
• Clear transformation rules documented
• Consistent behavior across all handlers
• Edge cases identified and handled
• No ambiguous scenarios
• Complete test coverage

Evidence Required:
• Transformation rule documentation
• Handler behavior analysis
• Edge case test results
• Coverage report

────────────────────────────────────────────────────────────────────
PHASE 6: VALIDATION & DOCUMENTATION
────────────────────────────────────────────────────────────────────

Objective: Ensure long-term maintainability and clear documentation of the transformation system.

Success Criteria:
• Complete architectural documentation
• Clear maintenance guidelines
• Robust test infrastructure
• No debug artifacts
• All 484+ tests passing

Evidence Required:
• Updated architecture docs
• Maintenance guide
• Test infrastructure audit
• Clean codebase verification

────────────────────────────────────────────────────────────────────
SUMMARY OF INCREMENTAL APPROACH
────────────────────────────────────────────────────────────────────

• Phases 1–2 focus on understanding and validation without changing core logic
• Phases 3–4 systematically resolve issues with clear evidence
• Phases 5–6 ensure long-term maintainability and consistency

This methodical approach ensures that each change is validated by evidence and maintains architectural integrity throughout the process.
