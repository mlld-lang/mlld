# Plan: Refactor TestContext and TestContextDI

## Goal

To eliminate the outdated `TestContext` base class by merging its essential non-DI testing utilities (like the mock filesystem and fixture management) directly into `TestContextDI`. This simplifies the testing utility hierarchy and makes `TestContextDI` a self-contained helper for test setup, supporting both its DI features and the necessary filesystem/fixture setup required by the manual child container pattern.

## Motivation

-   `TestContext` represents an older testing pattern and is largely superseded by DI-aware testing strategies.
-   The inheritance relationship between `TestContextDI` and `TestContext` adds unnecessary complexity.
-   `TestContextDI`, even when used alongside the preferred manual child container pattern, is primarily valued for providing the initialized mock filesystem (`context.fs`) and fixture loading capabilities.
-   Merging these core utilities into `TestContextDI` consolidates related setup logic and removes the dependency on the outdated base class.

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

2.  **Delete `tests/utils/TestContext.ts`:**
    *   Once `TestContextDI` no longer inherits from it and incorporates the necessary logic, delete the `tests/utils/TestContext.ts` file.

3.  **Address Fallout (Deferred):**
    *   Acknowledge that tests or helper files still directly importing and using `new TestContext()` will break.
    *   Plan to address these breakages in a separate follow-up effort. Solutions may include:
        *   Deleting obsolete test files.
        *   Updating files to use `TestContextDI.create()` or `TestContextDI.createIsolated()`.
        *   Refactoring tests to use the manual child container pattern, potentially still using `TestContextDI` just for `fs` access if needed.

## Verification

-   Run tests that rely on `TestContextDI` (especially those using `context.fs`, `context.fixtures`, `context.builder`, or `context.snapshot`). Ensure they still pass after the refactoring.
-   Confirm that the core functionalities copied from `TestContext` (filesystem operations, fixture loading) work correctly within `TestContextDI`.

## Deferred Work

-   The primary deferred task is fixing all test files that directly imported and instantiated `TestContext`. This will be handled separately after the merge is complete. 