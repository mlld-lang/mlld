# Plan: Phase 2 - Foundational Types - Paths & Path/FileSystem Services

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md 
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md

This document details the implementation plan for **Phase 2** of the Types Refactoring effort, focusing on introducing strict path types and refactoring related services.

**References:**
*   Overall Plan: `_plans/PLAN-TYPES.md`
*   Path Types Spec: `_spec/types/import-spec.md`
*   Path Variable Spec: `_spec/types/variables-spec.md`
*   AST Structure: `docs/dev/AST.md` (specifically `PathValueObject`)
*   Target Services: `services/fs/PathService/*`, `services/fs/FileSystemService/*`

## A. Type Refinement Proposals

**No major type refinements are proposed for this phase.**

**Observations & Decisions:**

1.  **Branded Type Style:** Both `import-spec.md` and `variables-spec.md` define branded path types. We will adopt the simpler `string & { __brand: '...' }` style used in `variables-spec.md` (e.g., `ValidatedResourcePath`, `AbsolutePath`) for consistency and ease of use.
2.  **Path Context:** `import-spec.md` defines `PathValidationContext` and `variables-spec.md` defines `PathResolutionContext`. For the core `PathService` validation and resolution logic, `PathValidationContext` seems slightly more aligned and will be preferred, potentially consolidating concepts from `PathResolutionContext` if needed during implementation.
3.  **Path Type Location:** Core path types (branded types, `PathValidationContext`) will be defined in a new file: `core/types/paths.ts`.
4.  **AST to Path Variable:** The `IPathVariable` defined in `variables-spec.md` (with `IFilesystemPathState | IUrlPathState`) adequately represents the *resolved state* of a path variable after processing by `PathService` and potentially `FileSystemService` or `URLContentResolver`. `PathService` will be responsible for taking raw input (like `PathValueObject.raw` from the AST) and producing the appropriate underlying state (`IFilesystemPathState` or `IUrlPathState`) which includes the strict, branded path string (e.g., `ValidatedResourcePath`) upon successful validation.

## B. Detailed Implementation Plan

This plan expands on the Phase 2 punch list from `_plans/PLAN-TYPES.md`.

---

**1. Define Core Path Types**

*   **Action:** Create the new types file and define core branded path types and related interfaces.
*   **Files:**
    *   `core/types/paths.ts` (New File)
*   **Details/Considerations:**
    *   Define types like:
        *   `type RawPath = string & { __brand: 'RawPath' };`
        *   `type ValidatedResourcePath = string & { __brand: 'ValidatedResourcePath' };`
        *   `type AbsolutePath = ValidatedResourcePath & { __brand: 'AbsolutePath' };`
        *   `type RelativePath = ValidatedResourcePath & { __brand: 'RelativePath' };`
        *   `type UrlPath = ValidatedResourcePath & { __brand: 'UrlPath' };` // For validated URLs
        *   `type AnyPath = RawPath | ValidatedResourcePath;` // Union type
        *   `interface PathValidationContext { ... }` (Based on `import-spec.md`)
    *   Include factory functions or type guards if helpful (e.g., `isAbsolutePath(p: ValidatedResourcePath): p is AbsolutePath`).
    *   Ensure types are exported correctly (e.g., via `core/types/index.ts`).
*   **Testing:** N/A (Type definitions only).

---

**2. Refactor `IPathService` Interface**

*   **Action:** Update `IPathService` method signatures to use and return strict path types where appropriate.
*   **Files:**
    *   `services/fs/PathService/IPathService.ts`
*   **Details/Considerations:**
    *   `resolvePath`: May still accept `string | StructuredPath` but should return a stricter type like `AbsolutePath | UrlPath | RelativePath` (or `ValidatedResourcePath` as a base).
    *   `validatePath`: Should likely return `Promise<AbsolutePath | UrlPath>` (or similar validated type) upon success, instead of `Promise<string>`. Input might remain `string | StructuredPath`. `PathOptions` may need refinement to use `PathValidationContext`.
    *   `validateURL`: Should return `Promise<UrlPath>` instead of `Promise<string>`.
    *   `fetchURL`: Could potentially return `Promise<URLResponse & { validatedUrl: UrlPath }>` or adjust `URLResponse` itself.
    *   Low-level methods like `joinPaths`, `dirname`, `basename`, `normalizePath` can likely remain `string`-based.
    *   Update documentation comments for parameters and return types.
*   **Testing:** N/A (Interface changes only).

---

**3. Refactor `PathService` Implementation**

*   **Action:** Update `PathService` internal logic and method implementations to align with the refactored `IPathService` interface, producing and consuming strict types.
*   **Files:**
    *   `services/fs/PathService/PathService.ts`
*   **Details/Considerations:**
    *   **Input:** Methods like `resolvePath` and `validatePath` will take `string` or `StructuredPath.raw`.
    *   **Internal Logic:** Refactor internal validation (null bytes, security checks, existence checks via `IFileSystemServiceClient`) and normalization logic.
    *   **Output:** Methods must now construct and return the appropriate branded types (e.g., `AbsolutePath`, `UrlPath`). This might involve type assertions (`as AbsolutePath`) *after* successful validation steps confirm the path meets the type's criteria.
    *   **`validatePath`:** This method becomes central to producing validated, branded types. It should perform checks and return the specific branded type (`AbsolutePath`, `UrlPath`) or throw if validation fails.
    *   **`resolvePath`:** Should likely call `validatePath` internally or perform similar checks before returning a branded type.
    *   **AST Consumption:** Explicitly handle consumption of `PathValueObject` (likely just using `.raw` initially) when called from directive handlers later. The goal is for `PathService` to be the boundary where raw strings/AST objects are converted into reliable, typed paths.
    *   Dependency Injection: Ensure `IFileSystemServiceClient` is correctly injected and used for existence/type checks needed for validation.
    *   URL Handling: Update `validateURL`/`fetchURL` to produce `UrlPath`. **Ensure correct interaction with `URLContentResolver` (or equivalent) for fetching and validation logic needed to populate `IUrlPathState` (part of `IPathVariable` state).**
*   **Testing:**
    *   `services/fs/PathService/PathService.test.ts`: Major updates needed.
        *   Update existing tests to expect strict branded types as return values.
        *   Add new tests specifically verifying the correct branded type is returned based on input and validation outcomes (e.g., absolute vs. relative, file vs. URL).
        *   Add tests for edge cases and error conditions related to type validation.
        *   Ensure mocks for `IFileSystemServiceClient` are updated if method signatures change.

---

**4. Refactor `IFileSystemService` Interface**

*   **Action:** Update `IFileSystemService` method signatures to *accept* strict path types where appropriate.
*   **Files:**
    *   `services/fs/FileSystemService/IFileSystemService.ts`
*   **Details/Considerations:**
    *   Methods like `readFile`, `writeFile`, `exists`, `stat`, `isFile`, `isDirectory`, `readDir`, `ensureDir`, `watch` should likely accept `AbsolutePath` or potentially `ValidatedResourcePath` as input parameters instead of `string`. This enforces that paths have been validated *before* attempting filesystem operations.
    *   Return types (e.g., `Promise<string>` for `readFile`) likely remain unchanged.
    *   Update documentation comments.
*   **Testing:** N/A (Interface changes only).

---

**5. Refactor `FileSystemService` Implementation**

*   **Action:** Update `FileSystemService` implementation to align with the refactored `IFileSystemService` interface.
*   **Files:**
    *   `services/fs/FileSystemService/FileSystemService.ts`
    *   `services/fs/FileSystemService/NodeFileSystem.ts` (Check if any adjustments needed)
    *   `tests/utils/MemfsTestFileSystem.ts` (Check if any adjustments needed)
*   **Details/Considerations:**
    *   Methods will now receive strict path types (e.g., `AbsolutePath`).
    *   Since the underlying `IFileSystem` implementations (`NodeFileSystem`, `MemfsTestFileSystem`, `fs-extra`) expect plain strings, the `FileSystemService` methods will need to extract the underlying `string` value from the branded type before passing it to `this.fs.<operation>()`. The branded type primarily serves as a marker proving validation occurred *before* the call.
    *   Example: `async readFile(filePath: AbsolutePath): Promise<string> { const resolvedPath = filePath; /* No need to resolve again */ ... await this.fs.readFile(resolvedPath as string); ... }`
    *   Ensure `resolvePath` (which might be called internally or rely on `IPathServiceClient`) correctly returns strict types if used.
*   **Testing:**
    *   `services/fs/FileSystemService/FileSystemService.test.ts`:
        *   Update tests to pass strict path types (e.g., `AbsolutePath`) as arguments to service methods. This might require constructing mock branded types in tests.
        *   Verify that mocks for `IPathServiceClient` (if used) are updated.
        *   Verify mocks for `IFileSystem` (`NodeFileSystem`, `MemfsTestFileSystem`) are called with the correct underlying *string* path.

---

**6. Update Client Interfaces & Factories**

*   **Action:** Update client interfaces (`IPathServiceClient`, `IFileSystemServiceClient`) and their factories to reflect changes in the main service interfaces.
*   **Files:**
    *   `services/fs/PathService/interfaces/IPathServiceClient.ts`
    *   `services/fs/PathService/factories/PathServiceClientFactory.ts`
    *   `services/fs/FileSystemService/interfaces/IFileSystemServiceClient.ts`
    *   `services/fs/FileSystemService/factories/FileSystemServiceClientFactory.ts`
*   **Details/Considerations:**
    *   Mirror the signature changes made in `IPathService` and `IFileSystemService` in their respective client interfaces.
    *   Update the factory implementations (`createClient` methods) to correctly return objects conforming to the updated client interfaces, potentially involving casting or wrapping results from the underlying service.
*   **Testing:** Changes here might impact tests that mock these factories or clients.

---

**7. Update Unit Tests (`PathOperationsService`)**

*   **Action:** Review and update tests for `PathOperationsService` if they are affected by changes in dependent client interfaces (though `PathOperationsService` itself might not change).
*   **Files:**
    *   `services/fs/FileSystemService/PathOperationsService.test.ts`
*   **Details/Considerations:**
    *   `PathOperationsService` itself likely remains string-based as it's a low-level wrapper.
    *   However, if its tests involve mocking clients (`IPathServiceClient`, `IFileSystemServiceClient`) whose signatures have changed, those mocks will need updating.
*   **Testing:** Update mocks as needed.

---

**8. Integration & Downstream Preparation**

*   **Action:** Identify and potentially add temporary type assertions (`as any`, `as string`) in services that *consume* `PathService` or `FileSystemService` (e.g., `ResolutionService`, `DirectiveService` handlers) to allow the codebase to compile during the transition. These will be addressed in subsequent phases.
*   **Files:** Various files in `services/resolution/`, `services/pipeline/DirectiveService/handlers/`.
*   **Details/Considerations:** This phase focuses on the FS/Path services themselves. Full integration happens later, but we need to ensure the rest of the system doesn't break catastrophically during this phase. Use temporary casts sparingly, marked with `// TODO: Phase X - Remove cast`.
*   **Testing:** Existing integration tests might fail; focus on getting unit tests for Phase 2 services passing first. Address integration test failures in later phases.

--- 