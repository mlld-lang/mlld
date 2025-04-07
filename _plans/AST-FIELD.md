# Plan: Standardize Field Access Representation on AST `Field` Type

## 1. Goal

Standardize the representation of field access paths across the resolution services and error types to consistently use the `Field` type definition originating from the AST (`{ type: 'field' | 'index', value: string | number }`), as defined in `@core/syntax/types/shared-types.ts`.

This will eliminate the conflict with the currently used `FieldAccess` type (`{ type: FieldAccessType, key: string | number }`) defined in `@core/types`, improving type safety, consistency, developer experience, and resolving related linter errors.

## 2. Problem Context

Currently, there are two conflicting type definitions used for representing field access paths:

1.  **AST `Field`:** `{ type: 'field' | 'index', value: string | number }` (from `@core/syntax/types/shared-types` via `@core/syntax/types/interfaces/IVariableReference`) - This is what the parser generates within `VariableReferenceNode.fields`.
2.  **Core Types `FieldAccess`:** `{ type: FieldAccessType, key: string | number }` (from `@core/types/resolution`) - This is currently used in interfaces like `IResolutionService`, error details like `FieldAccessErrorDetails`, and was previously expected by `VariableReferenceResolver.accessFields`.

This discrepancy leads to:
*   Persistent TypeScript errors due to type mismatches between interfaces, implementations, and error details.
*   Necessary but confusing type mapping logic.
*   Difficulty in reasoning about field access paths across different modules.
*   Potential for future drift back to inconsistent representations.

## 3. Proposed Solution

Adopt the AST's `Field` type (`{ type: 'field' | 'index', value: ... }`) as the single standard throughout the resolution process.

This involves:
*   Removing or deprecating the `FieldAccess` type from `@core/types`.
*   Updating interfaces (`IResolutionService`) to use `Field[]`.
*   Updating error details (`FieldAccessErrorDetails`) to use `Field[]`.
*   Ensuring implementation code (`ResolutionService`, `VariableReferenceResolver`) consistently uses `Field[]`.
*   Adding documentation and code comments to clarify the standard and its purpose.
*   Updating tests where necessary.

## 4. Detailed Steps

**Phase 1: Update Core Types, Interfaces, and Documentation**

1.  **`core/syntax/types/shared-types.ts`:**
    *   Verify the `Field` interface is correctly defined: `interface Field { type: 'field' | 'index'; value: string | number; }`.
    *   Ensure it is properly exported.
    *   *(Optional but recommended)* Add a TSDoc comment explaining its role as the standard AST representation for field access steps.
2.  **`core/types/resolution.ts`:**
    *   **Remove** the `FieldAccess` interface definition.
    *   **Remove** the `FieldAccessType` enum definition.
3.  **`core/types/index.ts`:**
    *   Remove any re-exports of `FieldAccess` or `FieldAccessType`.
    *   Ensure `Field` from `@core/syntax/types/shared-types` is *not* exported here to avoid conflicts (it should be imported directly where needed).
4.  **`core/errors/FieldAccessError.ts`:**
    *   Import `Field` from `@core/syntax/types/shared-types` (aliased if necessary, e.g., `import { Field as AstField } from '@core/syntax/types/shared-types';`).
    *   Update `FieldAccessErrorDetails` interface: Change `fieldAccessChain: FieldAccess[]` to `fieldAccessChain: AstField[]` (or `Field[]`).
    *   **Note:** Ensure `FieldAccessError` leverages the `fieldAccessChain: Field[]` detail effectively to generate precise error messages indicating exactly where access failed (e.g., include `failedAtIndex` and the specific failing `Field` details in the message or properties).
    *   Add a TSDoc comment to `FieldAccessErrorDetails.fieldAccessChain` clarifying it uses the standard AST `Field` type.
5.  **`services/resolution/ResolutionService/IResolutionService.ts`:**
    *   Import `Field` from `@core/syntax/types/shared-types` (aliased if necessary).
    *   Update the `resolveFieldAccess` method signature: Change `fieldPath: FieldAccess[]` to `fieldPath: Field[]`.
    *   Add a TSDoc comment to the `fieldPath` parameter explaining it uses the standard AST `Field` type.
6.  **Documentation (New Step):**
    *   Create or update documentation (e.g., in `_spec/types/variables-spec.md`, `docs/dev/Resolution.md`, or similar) clearly defining the standard AST `Field` structure (`{ type: 'field' | 'index', value: string | number }`).
    *   Explain its origin (parser/AST) and its role as the single standard for field access representation throughout the resolution pipeline.
    *   Explicitly mention how `FieldAccessErrorDetails.fieldAccessChain` uses this structure for granular error reporting.

**Phase 2: Update Implementations**

7.  **`services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`:**
    *   Import `Field` from `@core/syntax/types/shared-types` (as `AstField`).
    *   Ensure `accessFields` method signature uses `fields: AstField[]`.
    *   Ensure `accessFields` internal logic correctly uses `field.type` (`'field'` or `'index'`) and `field.value`.
    *   In `accessFields`, when creating `FieldAccessError`, update the `details.fieldAccessChain` to correctly pass the `fields` parameter (which is `AstField[]`) and remove the `as any` cast.
    *   **Note:** When generating `FieldAccessError` instances, ensure the `failedAtIndex` and `fieldAccessChain` details are accurately populated using the `AstField[]` structure to maximize debugging clarity.
    *   In the `resolve` method, ensure `node.fields` (which is `AstField[]`) is passed directly to `this.accessFields`. Ensure any `FieldAccessError` thrown also correctly uses `AstField[]` in its details (remove `as any` cast).
    *   Remove any unused imports related to the old `FieldAccess` or `FieldAccessType`.
8.  **`services/resolution/ResolutionService/ResolutionService.ts`:**
    *   Import `Field` from `@core/syntax/types/shared-types` (as `AstField`).
    *   Update the `resolveFieldAccess` method implementation signature to use `fieldPath: AstField[]`, matching the interface.
    *   Ensure the call *within* this method to `this.variableReferenceResolver.accessFields` correctly passes the `fieldPath` (`AstField[]`).
    *   In `resolveData`, ensure the `VariableResolutionError` thrown for parsing failures doesn't incorrectly reference the old types.
    *   Remove any unused imports related to the old `FieldAccess` or `FieldAccessType`.

**Phase 3: Update Tests**

9.  **`services/resolution/ResolutionService/ResolutionService.test.ts`:**
    *   Remove any imports for the old `FieldAccess` or `FieldAccessType`.
    *   Review the mock implementation for `mockVariableResolverClient.resolveFieldAccess`. **Update this mock** to expect and handle the `AstField[]` structure (`{type, value}`).
    *   Review tests using `expectToThrowWithConfig` checking for `FieldAccessError`. Ensure assertions about `details.fieldAccessChain` (if any) expect the `AstField[]` structure.
    *   Review any other test code that might explicitly create or reference the old `FieldAccess` structure and update it to use the `AstField` structure.

## 5. Testing Strategy

1.  Run `npm run lint -- --fix` to catch any immediate type errors after applying changes.
2.  Run `npm test services/resolution/ResolutionService/ResolutionService.test.ts` and ensure all tests pass.
3.  Pay special attention to tests covering:
    *   Simple field access (`user.name`).
    *   Nested field access (`nested.data.info.status`).
    *   Array index access (`items[1]`) - *Note: Requires fixing the `resolveData` parsing logic separately, but the underlying `accessFields` should now work correctly*.
    *   Error conditions for field access (invalid field, invalid index, access on non-object/array) - Verify specific error codes and messages leveraging the detailed path.
4.  Consider adding specific tests (if missing) to verify the structure and content of `error.details.fieldAccessChain` for caught `FieldAccessError` instances.
5.  (Optional) Run full integration tests (`npm test`) to catch any unexpected downstream effects.

## 6. Potential Risks & Considerations

*   **Scope:** Other parts of the codebase might unexpectedly depend on the old `FieldAccess` type. A codebase search for `FieldAccess` and `FieldAccessType` is recommended after removal from `@core/types`.
*   **Complexity:** Refactoring error details and interfaces requires careful attention to ensure type consistency.
*   **`resolveData`:** This refactor highlights the need to fix the parsing logic within `ResolutionService.resolveData` separately so it correctly utilizes the AST and the standardized `Field[]` array.

## 7. Rollback Plan

*   Use Git to revert the changes made during this refactoring if significant issues arise that cannot be quickly resolved.
*   Address files in reverse order of the plan.