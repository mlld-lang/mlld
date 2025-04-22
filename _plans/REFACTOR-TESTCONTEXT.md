# Plan: Refactor TestContext and TestContextDI

## Goal

To eliminate the outdated `TestContext` base class by merging its essential non-DI testing utilities (like the mock filesystem and fixture management) directly into `TestContextDI`, and to remove the problematic global test context setup. This simplifies the testing utility hierarchy, makes `TestContextDI` a self-contained helper, and enforces better test isolation practices.

## Motivation

-   `TestContext` represents an older testing pattern and is largely superseded by DI-aware testing strategies.
-   The inheritance relationship between `TestContextDI` and `TestContext` adds unnecessary complexity.
-   `TestContextDI`, even when used alongside the preferred manual child container pattern, is primarily valued for providing the initialized mock filesystem (`context.fs`) and fixture loading capabilities.
-   Merging these core utilities into `TestContextDI` consolidates related setup logic and removes the dependency on the outdated base class.
-   The global `TestContextDI` instance created in `tests/setup.ts` violates test isolation principles, leading to potential cross-test contamination and conflicts with the preferred manual child container pattern.

## Refactoring Steps

1.  **Modify `tests/utils/di/TestContextDI.ts`:**
    *   **Remove Inheritance:** Delete `extends TestContext` from the class definition.
    *   **Add Imports:** Ensure the following imports are present:
        ```typescript
        import { MemfsTestFileSystem } from '@tests/utils/MemfsTestFileSystem.js';
        import { ProjectBuilder } from '@tests/utils/ProjectBuilder.js';
        import { TestSnapshot } from '@tests/utils/TestSnapshot.js';
        import * as testFactories from '@tests/utils/testFactories.js';
        import * as path from 'path'; // For fixtures logic
        import * as fsExtra from 'fs-extra'; // For fixtures logic (needs alias if 'fs' is already used)
        // potentially FixtureManager if its type is needed explicitly
        ```
    *   **Add Properties:** Add the following public and private properties, mirroring `TestContext`:
        ```typescript
        // public fs: MemfsTestFileSystem; // Already declared, ensure initialization matches
        public builder!: ProjectBuilder;
        public fixtures!: { load(fixtureName: string): Promise<void> }; // Or import/copy TestFixtures interface
        public snapshot!: TestSnapshot;
        public factory!: typeof testFactories;
        private fixturesDir: string = 'tests/fixtures'; // Default value
        ```
    *   **Update Constructor (`constructor`)**:
        *   Remove the `super(options.fixturesDir);` call.
        *   Store the `fixturesDir` option: `this.fixturesDir = options.fixturesDir ?? 'tests/fixtures';`
    *   **Update Initialization (`initializeAsync`)**:
        *   Keep the existing `this.fs = new MemfsTestFileSystem();` and `this.normalizePathForTests = ...`.
        *   Add `this.fs.initialize();` (if not already implicitly done).
        *   Add initialization for the newly added properties *after* `fs` is initialized:
            ```typescript
            this.builder = new ProjectBuilder(this.fs);
            this.snapshot = new TestSnapshot(this.fs);
            this.factory = testFactories;
            this.fixtures = {
              load: async (fixtureName: string): Promise<void> => {
                const fixturePath = path.join(process.cwd(), this.fixturesDir, `${fixtureName}.json`);
                // Use fsExtra alias if needed to avoid conflict with MemfsTestFileSystem instance 'fs'
                const fixtureContent = await fsExtra.readFile(fixturePath, 'utf-8'); 
                const fixture = JSON.parse(fixtureContent);
                await this.fs.loadFixture(fixture); // Assumes loadFixture method exists on MemfsTestFileSystem
              }
            };
            ```
        *   Add the directory creation logic from `TestContext.initialize`:
            ```typescript
            // Ensure project directory exists (adjust path if needed)
            await this.fs.mkdir('/project', { recursive: true }); 
            // Add other mkdir calls from TestContext.initialize if necessary
            await this.fs.mkdir('/project/src', { recursive: true });
            await this.fs.mkdir('/project/nested', { recursive: true });
            await this.fs.mkdir('/project/shared', { recursive: true });
            ```
    *   **Update Cleanup (`cleanup`)**:
        *   Add a call to clean up the filesystem resources: `this.fs.cleanup();` (ensure it's called before or after container disposal as appropriate).

2.  **Refactor `tests/setup.ts` to Remove Global Context:**
    *   **Problem:** The current `tests/setup.ts` creates a single, global `TestContextDI` instance (`globalThis.testContext`). This is poor practice for test isolation and conflicts with the recommended manual child container approach.
    *   **Action:** Modify `tests/setup.ts` to remove the global instance and its lifecycle management:
        *   Delete the line: `globalThis.testContext = TestContextDI.createIsolated();`
        *   Delete the `beforeEach` logic block that checks `globalThis.testContext.isInitialized` and called the (now removed) `initialize` method.
        *   Delete the `afterEach` logic that calls `globalThis.testContext.cleanup()`.
        *   Delete the `declare global { ... }` block for `testContext`.
        *   Keep other useful setup logic (e.g., `reflect-metadata`, `vi.resetAllMocks()`, `vi.restoreAllMocks()`).
    *   **Expected Fallout:** This change is *expected* to cause more tests to fail. Specifically, any test file that implicitly relied on `globalThis.testContext` will now break. This is desirable as it highlights tests that require proper, isolated setup (either via manual child containers or by creating their own `TestContextDI` instance if needed just for `fs`).

3.  **Modify `tests/utils/di/TestContextDI.ts` (Follow-up):**
    *   **Action:** Remove the `isInitialized` property and related checks, as initialization is now handled automatically via the constructor and `initializeAsync`.
    *   **Action:** Remove the `initialize` method if it still exists remnants from the previous step.

4.  **Delete `tests/utils/TestContext.ts`:**
    *   Once `TestContextDI` no longer inherits from it and incorporates the necessary logic, and `tests/setup.ts` no longer references it globally, delete the `tests/utils/TestContext.ts` file.

5.  **Address Fallout (Incremental):**
    *   Iteratively fix the test failures introduced by steps 1, 2 and 3.
    *   For each failing test file:
        *   If it relied on `globalThis.testContext`, implement proper setup using the manual child container pattern (`container.createChildContainer()`, explicit registration) as documented in `docs/dev/TESTS.md`.
        *   If the test only needs the mock filesystem or fixtures, it *can* instantiate a local `TestContextDI` (`const context = TestContextDI.createIsolated();`) and use `context.fs` or `context.fixtures`, ensuring `await context.cleanup()` is called in `afterEach`.
        *   Update any direct calls to methods that were specific to the old `TestContext` (like potentially `context.restore()` for mocks if that was part of `TestContext` rather than `TestContextDI`).
        *   Delete obsolete test files if they are no longer relevant.

## Verification

-   Run tests (`npm test`) frequently during the "Address Fallout" step.
-   The end goal is a clean test run (`npm test`) after all fallout has been addressed.
-   Confirm that core functionalities (filesystem, fixtures, DI mocking, manual containers) work as expected in the refactored tests.

## Deferred Work

-   No major deferred work planned with this updated approach; fallout is addressed incrementally. 