# Plan: Implement New Mocking Strategy (Methodical Rollout)

## 1. Goal

Implement the new, standardized mocking strategy proposed in the `_cmte/audit-mocks/output/03-propose-mock-strategy.define-mock-strategy.md` audit result. This aims to improve test consistency, type safety, maintainability, and DI integration across the Meld test suite, using an incremental and investigative approach.

**References:**
*   **Strategy Proposal:** `_cmte/audit-mocks/output/03-propose-mock-strategy.define-mock-strategy.md`
*   **Analysis Findings:** `_cmte/audit-mocks/output/02-synthesize-mock-findings.consolidate-mock-analysis.md`
*   **Handler Audit Plan:** `_plans/PLAN-PHASE-5B.md` (Relevant handler refactoring steps integrated below)

**Key Components of the New Strategy:**
*   Centralized `MockFactory` (`tests/utils/mocks/MockFactory.ts`).
*   Dedicated `ClientFactoryHelpers` (`tests/utils/mocks/ClientFactoryHelpers.ts`).
*   Enhanced `TestContextDI` (`tests/utils/di/TestContextDI.ts`) with helpers (`setupMinimal`, `setupWithStandardMocks`).
*   Reusable `TestFixtures` (e.g., `DirectiveTestFixture`, `InterpreterTestFixture`).
*   Standard mock customization via `vi.spyOn` on resolved mocks.

## 2. Implementation Phases (Methodical Rollout)

### Phase 1: Implement Core Mock Utilities (No Integration Yet) ✅
*   **Objective:** Create the foundational mock utilities without modifying existing tests or `TestContextDI`.
*   **Tasks:**
    1.  ✅ Create `tests/utils/mocks/MockFactory.ts`. Implement static factory methods (`createStateService`, etc.) ensuring accurate interface matching based on previous checks and the strategy proposal.
    2.  ✅ Create `tests/utils/mocks/ClientFactoryHelpers.ts`. Implement `registerClientFactory` and `registerStandardClientFactories`, ensuring all necessary client factories (including `ParserServiceClientFactory`) are mocked.
*   **Verification:** Manually review the created files against the service interfaces and the strategy document. Ensure method signatures are correct.

### Phase 2: Verify `MockFactory` in Isolation (Simple Test Case) ✅
*   **Objective:** Confirm the `MockFactory` produces usable mocks in a simple, controlled test environment.
*   **Tasks:** (Verified during Phase 5 refactors)
*   **Verification:** Run tests *only for this specific file*. Debug any issues. Confirm the factory-created mocks function correctly in this limited scope.

### Phase 3: Verify `ClientFactoryHelpers` in Isolation (Simple Test Case) ✅
*   **Objective:** Confirm the `ClientFactoryHelpers` correctly mock and register client factories for services with circular dependencies.
*   **Tasks:** (Verified during Phase 5 refactors)
*   **Verification:** Run tests *only for this specific file*. Debug issues with client factory mock registration and usage.

### Phase 4: Integrate Factories into `TestContextDI` Helpers ✅
*   **Objective:** Refactor `TestContextDI` to leverage the verified `MockFactory` and `ClientFactoryHelpers`.
*   **Tasks:**
    1.  ✅ Edit `tests/utils/di/TestContextDI.ts`.
    2.  ✅ Import `MockFactory` and `ClientFactoryHelpers`.
    3.  ✅ Implement the proposed helper methods (`setupMinimal`, `setupWithStandardMocks`) ensuring they:
        *   Use `MockFactory.standardFactories` for default service mocks.
        *   Use `ClientFactoryHelpers.registerStandardClientFactories` to handle default client factory mocks.
        *   Register other essential mocks (like `IFileSystem`, `DirectiveLogger`).
    4.  ✅ Refactor the internal `registerServices` (or equivalent initialization logic) to use these defaults cleanly.
*   **Verification:** Create a *new*, simple test file (`tests/utils/di/TestContextDIHelpers.test.ts`?) specifically to test the `setupWithStandardMocks` and `setupMinimal` helpers. Verify they create a context and provide the expected default mocks.

### Phase 5: Gradual Migration Using `TestContextDI` Helpers (Simple -> Complex) ✅
*   **Objective:** Update existing test suites to use the new helpers, starting with simpler ones and deferring complex/fixture-suitable ones.
*   **Tasks:**
    1.  ✅ Refactor the simple test file(s) modified in Phase 2/3 to now use `helpers.setupWithStandardMocks()`.
    2.  ✅ Select another relatively simple test file (e.g., another handler, `StateEventService.test.ts`?). Refactor using the helpers and `vi.spyOn` for test-specific mocks.
    3.  ✅ Run tests specifically for the refactored file and debug any issues.
    4.  ✅ Continue this process incrementally, file by file or small group by small group.
    5.  ✅ **Defer** the most complex/problematic files (`ResolutionService.test.ts`, `PathService.test.ts`, `CLIService.test.ts`, `InterpreterService.unit.test.ts`, `FileSystemService.test.ts`, `RunDirectiveHandler.test.ts`) until later phases.
    6.  ✅ **(New)** Continue migrating remaining simpler/medium tests that *do not* primarily test directive handlers or interpreter logic. Candidates completed:
        *   ✅ `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
        *   ✅ `services/resolution/ResolutionService/resolvers/ContentResolver.test.ts`
        *   ✅ `services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts`
        *   ✅ `services/resolution/ResolutionService/resolvers/StringLiteralHandler.test.ts`
        *   ✅ `services/resolution/URLContentResolver/URLContentResolver.test.ts` (No DI changes needed)
        *   ✅ `services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts` (No DI changes needed)
        *   ✅ `services/sourcemap/SourceMapService.test.ts` (DI part refactored)
        *   ✅ `services/state/StateEventService/StateInstrumentation.test.ts` (No DI changes needed)
        *   ✅ `services/state/StateService/migration.test.ts`
        *   ✅ `services/state/StateService/StateFactory.test.ts`
        *   ✅ `services/state/utilities/StateVariableCopier.test.ts`
    7.  Identify remaining files suitable for Phase 5 (non-handler/interpreter focused):
        *   `services/fs/FileSystemService/NodeFileSystem.test.ts`
        *   `services/fs/ProjectPathResolver.test.ts`
        *   `services/pipeline/ParserService/ParserService.test.ts`
        *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.edge.test.ts`
        *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`
        *   `services/state/StateService/StateService.test.ts`
        *   Files under `tests/` directory should be evaluated individually for applicability.
*   **Verification:** Test each refactored file individually. Periodically run `npm test services` to track progress.

### Phase 6: Introduce & Verify Test Fixtures & Refactor Handlers/Interpreter
*   **Objective:** Create and utilize test fixtures for common setups, and refactor deferred handler/interpreter tests using these fixtures, addressing issues identified in `PLAN-PHASE-5B.md`.
*   **Tasks:**
    1.  **Stabilize Interfaces/Mocks (Review):** ✅ Briefly reviewed core interfaces (`IValidationService`, `IResolutionService`, `IFileSystemService`) and mocks. Added missing `createValidationService` to `MockFactory` and `IValidationService` to `standardFactories`. Adjusted `MeldResolvedUrlPath` type in `core/types/paths.ts` to add `isValidated` for compatibility with `IUrlPathState`. Corrected `PathDirectiveHandler` logic around `MeldPath`. See **Learnings** below.
    2.  **Create `DirectiveTestFixture.ts`:** ✅ Implemented the fixture in `tests/utils/fixtures/` based on the strategy, ensuring it uses new helpers and provides standardized setup.
    3.  **Refactor Directive Handler Tests:** Use `DirectiveTestFixture` to refactor relevant handler tests deferred from Phase 5. While refactoring each test file, ensure the handler code itself is updated according to `PLAN-PHASE-5B.md`, Phase 5B.4:
        *   Update `execute` signature.
        *   Use `context` parameter correctly.
        *   Update service calls to match revised interfaces.
        *   Remove unused injections.
        *   Standardize `DirectiveError` usage.
        *   Remove internal `state.clone()` calls.
        *   Fix test setup, assertions, and linter errors.
        *   Target Handler Tests:
            *   ✅ `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts`
            *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.command.test.ts`
            *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts`
            *   `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts`
            *   `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts`
            *   `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts`
            *   `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts`
            *   `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts`
    4.  **Create `InterpreterTestFixture.ts`:** Implement the fixture in `tests/utils/fixtures/`, ensuring it uses the new `TestContextDI` helpers.
    5.  **Refactor Interpreter Tests:** Use `InterpreterTestFixture` to refactor relevant interpreter tests deferred from Phase 5. Apply relevant refactoring principles (context usage, updated service calls, etc.).
        *   Target Interpreter Tests:
            *   `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`
            *   `services/pipeline/InterpreterService/InterpreterService.unit.test.ts`
    6.  **Refactor Other Suitable Tests:** Use the created fixtures (or new ones if needed) to refactor other suitable tests deferred from Phase 5 (e.g., `DirectiveService.integration.test.ts`, `DirectiveService.test.ts`, `OutputService.test.ts`? Apply relevant refactoring principles.).
*   **Verification:** Run tests specifically for fixture-using files. Ensure fixtures provide the correct setup and simplify the tests. Ensure handler/interpreter code aligns with updated interfaces and practices.
*   **Learnings from Phase 6.1-6.3 (PathDirectiveHandler):**
    *   **Mocking Service-Under-Test:** When testing a service's *own* implementation (e.g., `ValidationService.test.ts`), the test setup should explicitly register the *real* service class, mocking only its dependencies. Relying on standard mock helpers (`setupWithStandardMocks`) can inadvertently inject a mock, causing unexpected failures (`toBeInstanceOf` checks).
    *   **Fixture Node Creation vs. Parser:** Fixtures creating AST nodes (`DirectiveTestFixture.createDirectiveNode`) must accurately simulate the structure produced by the *parser*. For `@path`, this meant creating `node.directive.path` as a `StructuredPath` object (`{ raw: ..., structured: ... }`), not just assigning the raw path string.
    *   **Investigate Type Discrepancies:** Don't just silence linters. When types seem mismatched between interfaces and implementation usage (e.g., `MeldPath` vs. `IUrlPathState` usage in `PathDirectiveHandler` / `StateService.setPathVar`), investigate the implementation of both the provider and consumer. We found `MeldResolvedUrlPath` needed the `isValidated` property to match `IUrlPathState`.
    *   **Context Object Accuracy:** Ensure property names used when constructing context objects (like `DirectiveProcessingContext`) match the property names expected by the consumer (e.g., `directiveNode` vs. `node`).

### Phase 7: Tackle Complex Test Suites
*   **Objective:** Apply the verified strategy, helpers, and potentially fixtures to the most complex test suites identified earlier.
*   **Tasks:**
    1.  Refactor `ResolutionService.test.ts`. Focus on:
        *   Correctly mocking internal client calls (`ParserServiceClient`, `VariableReferenceResolverClient` etc.) needed for specific resolution paths, likely using `vi.spyOn` on the client instances obtained via `ClientFactoryHelpers`.
        *   Resolving the `ResolutionContext.withStrict` issue (revisit factory/type/usage).
    2.  Refactor `PathService.test.ts`, focusing on correct `FileSystemServiceClient` mocking for different validation scenarios.
    3.  Refactor `CLIService.test.ts`, ensuring `IFileSystemService.exists` and file writing/reading are mocked correctly for test cases.
    4.  Refactor `FileSystemService.test.ts`.
*   **Verification:** Focused debugging and testing for these specific complex files. Ensure mocks accurately reflect the service's interactions.

### Phase 8: Validation & Cleanup
*   **Objective:** Ensure the new strategy is fully implemented, stable, and documented.
*   **Tasks:**
    1.  Run the *entire* test suite (`npm test`) and fix any remaining failures.
    2.  Address previously skipped tests, attempting to enable and fix them using the new mocking strategy.
    3.  Perform a final review for consistency across test files, ensuring handler/service issues identified in `PLAN-PHASE-5B.md` are resolved.
    4.  Remove any old/unused mock utilities or helper functions (e.g., from `serviceMocks.js`).
    5.  Update testing documentation (`docs/dev/TESTS.md` or similar) to reflect the new standard mocking strategy.
    6.  Ensure TypeScript checks (`tsc --noEmit`) pass cleanly.

## 3. Next Steps

*   Continue remaining Phase 5 tasks (non-handler/interpreter files).
*   Continue Phase 6: Refactor next handler test (`services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.command.test.ts`). 

## 4. Learnings & Refinements (from Phase 6.3 Debugging)

*   **DI Resolution Debugging:** When encountering "Cannot resolve service" errors, investigate thoroughly:
    *   **DO NOT GIVE UP OR DEFER WORK.** Shaking these issues out is EXACTLY why we're doing what we're doing.
    *   **Check `@Service()` Decorators:** Verify the decorator exists on the service being resolved *and* all concrete classes in its dependency tree (including dependencies of dependencies).
    *   **Verify Token/Registration:** Ensure injection tokens match registration tokens. Avoid manual container registration in tests where possible; rely on `@Service()`.
    *   **Check Fixture Mocks:** Ensure test fixtures (`DirectiveTestFixture`, etc.) register mocks for all necessary dependencies, including transitive ones if not handled by DI.
    *   **Check Factory Dependencies:** If a service depends on a Factory, ensure the Factory *and* the concrete class it might resolve (like `VariableReferenceResolver` for its factory) are correctly decorated and resolvable.

*   **Mocking Strategy & Configuration:**
    *   **Plain Object Factories (`MockFactory` current):** Mocks returned as plain objects (like `{ method: vi.fn() }`) cannot be easily configured *later* in tests using Vitest methods (`.mockReturnValue`, etc.). Configuration must happen via the `overrides` object passed to the factory function. Add `// TODO:` comments if workarounds (like direct spying in tests) are needed due to factory limitations.
    *   **`mockDeep` (`vitest-mock-extended`):** While useful for auto-mocking large interfaces, configuring defaults and applying overrides *within a factory function* using `mockDeep` can be complex and lead to type errors. Use directly in tests or carefully manage factory configuration if used there.
    *   **`vi.spyOn`:** Best used on actual instances or `mockDeep` objects, not plain object mocks.

*   **Async/Await with Mocks:** Always `await` the results of mocked functions that return Promises (`mockResolvedValue` or `async mockImplementation`) before accessing properties or methods on the resolved value. Forgetting `await` (e.g., `const result = service.asyncMethod(); result.property;`) leads to errors as you're accessing the Promise object itself.

*   **Test Logic Accuracy:**
    *   Verify test assertions match the *actual* arguments and behavior of the code under test.
    *   Remove tests that assert unreachable states or side effects not relevant to the tested code path. 