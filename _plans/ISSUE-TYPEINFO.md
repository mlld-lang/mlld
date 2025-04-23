# Debugging Notebook: TypeInfo Not Known for VariableReferenceResolverClientFactory

This document tracks the investigation into the persistent `TypeInfo not known` error related to `VariableReferenceResolverClientFactory` dependency injection in the `api/integration.test.ts` suite.

## 1. Problem Description

The API integration tests (`npm test api`), specifically those under the "Import Handling" suite and some smoke tests, consistently fail with the following error:

```
Error: Cannot inject the dependency "variableResolverClientFactory" at position #3 of "OutputService" constructor. Reason:
    TypeInfo not known for "VariableReferenceResolverClientFactory"
```

This occurs when `tsyringe` attempts to resolve the `OutputService` dependencies within the context of these tests.

## 2. Context

*   **Core Classes Involved**:
    *   `OutputService`: The service attempting to inject the factory (`services/pipeline/OutputService/OutputService.ts`).
    *   `VariableReferenceResolverClientFactory`: The factory being injected (`services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.ts`).
    *   `VariableReferenceResolver`: The dependency of the factory (`services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`).
*   **Dependency Injection**: Using `tsyringe`.
*   **Test Environment**: Failures occur specifically within `api/integration.test.ts`, which uses a **child DI container** created via `container.createChildContainer()` in its `beforeEach` block.

## 3. Investigation Steps & Findings

1.  **Checked `VariableReferenceResolverClientFactory` Definition**: Confirmed it has `@injectable()` and its constructor dependency (`VariableReferenceResolver`) is clearly defined.
2.  **Checked `VariableReferenceResolver` Definition**: Confirmed it has `@injectable()` and its own dependencies (`IStateService`, `IPathService`, etc.) appear correctly registered in the main DI config.
3.  **Checked Main DI Config (`core/di-config.ts`)**: Confirmed `VariableReferenceResolverClientFactory` is registered using both the class type and the string token `'VariableReferenceResolverClientFactory'`. Also confirmed registrations for `VariableReferenceResolver`'s dependencies.
4.  **Examined Test Setup (`api/integration.test.ts`)**: Discovered the use of a child container (`testContainer`) where registrations are performed manually within `beforeEach`.
5.  **Added Factory Registration to Test Container**: Explicitly added registration for `VariableReferenceResolverClientFactory` (both class and string token) to the `testContainer` in `api/integration.test.ts`. **Result**: Error persisted.
6.  **Changed Injection Method in `OutputService`**: Modified `OutputService` to inject the factory using the class type (`@inject(VariableReferenceResolverClientFactory)`) instead of the string token (`@inject('VariableReferenceResolverClientFactory')`). **Result**: Did not fix the API test error and introduced new failures in service tests (`npm test services`), indicating the string token injection is required elsewhere.
7.  **Reverted Injection Method**: Changed `OutputService` back to using the string token injection.
8.  **Added Isolating Test Case**: Added a test (`should resolve OutputService directly from test container`) in `api/integration.test.ts` to only resolve `OutputService` from the `testContainer`. **Result**: This test failed with the *exact same* `TypeInfo not known` error, confirming the problem lies in resolving the string-token dependency within the child container itself, independent of `processMeld` or file processing.
9.  **Added `reflect-metadata` Import to Test**: Added `import 'reflect-metadata';` as the very first line in `api/integration.test.ts`. **Result**: Error persisted.
10. **Changed Factory Registration Scope in Test**: Changed the registration of `VariableReferenceResolverClientFactory` (both class and string token) in the `testContainer` from `register`/`useClass` to `registerSingleton`. **Result**: Error persisted.

## 4. Relevant Code Snippets

**`OutputService` Constructor Injection (`services/pipeline/OutputService/OutputService.ts`)**

```typescript
	constructor(
		// ... other injections
		@inject('VariableReferenceResolverClientFactory') variableResolverClientFactory?: VariableReferenceResolverClientFactory, 
		// ... other injections
	)
```

**`VariableReferenceResolverClientFactory` Definition (`services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.ts`)**

```typescript
@injectable()
export class VariableReferenceResolverClientFactory {
	constructor(private variableReferenceResolver: VariableReferenceResolver) {}

	createClient(context: ResolutionContext): VariableReferenceResolver {
		// Create a child/scoped instance or configure the existing one based on context
		// For now, let's assume we reuse the injected singleton but could potentially create new ones
		const resolver = container.resolve(VariableReferenceResolver);
		// Optionally configure the resolver based on the context (e.g., set state ID)
		return resolver; // Return the potentially configured resolver
	}
}
```

**`VariableReferenceResolver` Definition (`services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`)**

```typescript
@injectable()
export class VariableReferenceResolver {
  constructor(
    @inject('IStateService') private readonly stateService: IStateService,
    @inject('IPathService') pathService: IPathService,
    @inject('IResolutionService') private readonly resolutionService?: IResolutionService,
    @inject('IParserService') private readonly parserService?: IParserService
  ) {
    // ...
  }
  // ... methods
}
```

**Main DI Registrations (`core/di-config.ts`)**

```typescript
// VariableReferenceResolver's dependencies (examples)
container.registerSingleton<IStateService>('IStateService', StateService);
container.registerSingleton<IPathService>('IPathService', PathService);
// ... other relevant service registrations ...

// Factory Registrations
container.register(VariableReferenceResolverClientFactory, { useClass: VariableReferenceResolverClientFactory });
container.register('VariableReferenceResolverClientFactory', { useClass: VariableReferenceResolverClientFactory });
```

**Test DI Registrations (`api/integration.test.ts` `beforeEach`)**

```typescript
  beforeEach(async () => {
    // ... setup TestContextDI ...

    // 2. Create Child Container
    testContainer = container.createChildContainer();

    // 3. Register MOCKS and REAL services/factories needed for API tests
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fileSystem);
    testContainer.registerSingleton<IFileSystemService>('IFileSystemService', FileSystemService);
    testContainer.registerSingleton<IPathService>('IPathService', PathService);
    testContainer.registerSingleton<IStateService>('IStateService', StateService); // Using real StateService
    testContainer.registerSingleton<IParserService>('IParserService', ParserService);
    testContainer.registerSingleton<IInterpreterService>('IInterpreterService', InterpreterService);
    testContainer.registerSingleton<IOutputService>('IOutputService', OutputService);
    testContainer.registerSingleton<IResolutionService>('IResolutionService', ResolutionService);
    testContainer.registerSingleton<IDirectiveService>('IDirectiveService', DirectiveService);
    // Register Real Factories
    testContainer.register(FileSystemServiceClientFactory, { useClass: FileSystemServiceClientFactory });
    testContainer.register(ParserServiceClientFactory, { useClass: ParserServiceClientFactory });
    testContainer.register(InterpreterServiceClientFactory, { useClass: InterpreterServiceClientFactory });
    testContainer.register(DirectiveServiceClientFactory, { useClass: DirectiveServiceClientFactory });
    testContainer.register(StateTrackingServiceClientFactory, { useClass: StateTrackingServiceClientFactory });
    // ... other factory registrations

    // <<< Explicitly added registration that didn't fix the issue >>>
    testContainer.register(VariableReferenceResolverClientFactory, { useClass: VariableReferenceResolverClientFactory });
    testContainer.register('VariableReferenceResolverClientFactory', { useClass: VariableReferenceResolverClientFactory });

    // ... register other services like CircularityService, ValidationService, Loggers etc.
  });
```

## 5. Test Failure Log (`npm test api` - Step 72)

```
 FAIL  api/integration.test.ts > API Integration Tests > Import Handling > should handle simple imports
Error: Cannot inject the dependency "variableResolverClientFactory" at position #3 of "OutputService" constructor. Reason:
    TypeInfo not known for "VariableReferenceResolverClientFactory"
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:330:23
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:301:38
 ❯ InternalDependencyContainer.construct node_modules/tsyringe/dist/cjs/dependency-container.js:303:11
 ❯ InternalDependencyContainer.resolveRegistration node_modules/tsyringe/dist/cjs/dependency-container.js:170:24
 ❯ InternalDependencyContainer.resolve node_modules/tsyringe/dist/cjs/dependency-container.js:112:33
 ❯ Module.processMeld api/index.ts:64:44
     62|   const stateService = executionContainer.resolve<IStateService>('…
     63|   const interpreterService = executionContainer.resolve<IInterpret…
     64|   const outputService = executionContainer.resolve<IOutputService>…
       |                                            ^
     65| 
     66|   // <<< Pass the state resolved from the execution container >>>
 ❯ api/integration.test.ts:696:28

 FAIL  api/integration.test.ts > API Integration Tests > Import Handling > should handle nested imports with proper scope inheritance
Error: Cannot inject the dependency "variableResolverClientFactory" at position #3 of "OutputService" constructor. Reason:
    TypeInfo not known for "VariableReferenceResolverClientFactory"
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:330:23
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:301:38
 ❯ InternalDependencyContainer.construct node_modules/tsyringe/dist/cjs/dependency-container.js:303:11
 ❯ InternalDependencyContainer.resolveRegistration node_modules/tsyringe/dist/cjs/dependency-container.js:170:24
 ❯ InternalDependencyContainer.resolve node_modules/tsyringe/dist/cjs/dependency-container.js:112:33
 ❯ Module.processMeld api/index.ts:64:44
     62|   const stateService = executionContainer.resolve<IStateService>('…
     63|   const interpreterService = executionContainer.resolve<IInterpret…
     64|   const outputService = executionContainer.resolve<IOutputService>…
       |                                            ^
     65| 
     66|   // <<< Pass the state resolved from the execution container >>>
 ❯ api/integration.test.ts:732:28

 FAIL  api/integration.test.ts > API Integration Tests > Import Handling > should detect circular imports
AssertionError: expected [Function] to throw error matching /Circular import detected/i but got 'Cannot inject the dependency "variabl…'

- Expected: 
/Circular import detected/i

+ Received: 
"Cannot inject the dependency \"variableResolverClientFactory\" at position #3 of \"OutputService\" constructor. Reason:
    TypeInfo not known for \"VariableReferenceResolverClientFactory\""

 FAIL  api/smoke.test.ts > API Smoke Tests > should process simple text content correctly
AssertionError: expected Error: Cannot inject the dependency "vari… to be undefined

 FAIL  api/smoke.test.ts > API Smoke Tests > should process a simple text variable substitution
AssertionError: expected Error: Cannot inject the dependency "vari… to be undefined

 FAIL  api/integration.test.ts > API Integration Tests > should resolve OutputService directly from test container
Error: Cannot inject the dependency "variableResolverClientFactory" at position #3 of "OutputService" constructor. Reason:
    TypeInfo not known for "VariableReferenceResolverClientFactory"
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:330:23
 ❯ node_modules/tsyringe/dist/cjs/dependency-container.js:301:38
 ❯ InternalDependencyContainer.construct node_modules/tsyringe/dist/cjs/dependency-container.js:303:11
 ❯ InternalDependencyContainer.resolveRegistration node_modules/tsyringe/dist/cjs/dependency-container.js:170:24
 ❯ InternalDependencyContainer.resolve node_modules/tsyringe/dist/cjs/dependency-container.js:112:33
 ❯ api/integration.test.ts:153:33

## 6. Conclusions & Hypotheses

*   **Confirmed**: The issue is specific to resolving the dependency injected via the **string token** (`@inject('VariableReferenceResolverClientFactory')`) within the **child container** (`testContainer`) created in `api/integration.test.ts`. Direct resolution attempts within this container fail.
*   **Hypothesis #1 Reinforced**: The most likely cause is an underlying issue or limitation in `tsyringe` or `reflect-metadata` regarding how type metadata for string tokens is handled or propagated within dynamically created child containers. Class-based injection seems unaffected.
*   **Hypothesis #2 (Less Likely)**: An extremely subtle import order or timing issue specific to the test environment setup might still exist, but the isolating test failing makes this less probable.
*   **Hypothesis #3 (Less Likely)**: A `tsconfig.json` misconfiguration affecting only string token metadata seems unlikely given other injections work.

## 7. Next Steps

*   **Search `tsyringe` Issues**: Search the `tsyringe` GitHub repository for issues related to "TypeInfo not known", "child container", "string token", "reflect-metadata".
*   **Consider Test-Specific Workaround**: If the root cause is external or hard to fix, consider manually instantiating `VariableReferenceResolverClientFactory` and `VariableReferenceResolver` in the test's `beforeEach` and registering the *instance* using `testContainer.registerInstance('VariableReferenceResolverClientFactory', instance);` as a temporary measure to unblock tests.
*   ~~Simplify Test Case~~: (Done - Isolating test confirmed the issue is in DI resolution).
*   ~~Verify `reflect-metadata` Import~~: (Done - Adding import to test file didn't help).
*   ~~Experiment with Registration Scopes~~: (Done - `registerSingleton` didn't help).
*   **Check `tsconfig.json`**: Briefly review `tsconfig.json` again for any relevant flags (`emitDecoratorMetadata`, `experimentalDecorators`).

## Further Investigation (Session 2)

### Checking `import type`

- Based on `tsyringe` GH issues, checked if `import type` was used for the factory or its dependencies, potentially stripping metadata.
- Verified `VariableReferenceResolverClientFactory` import in `di-config.ts` (no `type`).
- Verified `VariableReferenceResolverClientFactory` import in `api/integration.test.ts` (no `type`).
- Removed `type` from `IVariableReferenceResolverClient` import in `OutputService.ts`.
- **Result:** No change. `import type` does not seem to be the cause.

### Test-Specific Workaround: Manual Instance Registration

- **Hypothesis:** If the issue is resolving the token in the child container, maybe manually creating the instance and registering it directly will bypass the problem.
- **Steps:**
    1. In `api/integration.test.ts`'s `beforeEach`, resolve `VariableReferenceResolver` from `testContainer`.
    2. Manually create `const factoryInstance = new VariableReferenceResolverClientFactory(resolver);`
    3. Register `testContainer.registerInstance('VariableReferenceResolverClientFactory', factoryInstance);`
- **Initial Problem:** This caused a *new* DI error: `StateService` needed `DependencyContainer`, which wasn't registered yet when resolving `VariableReferenceResolver`.
- **Fix:** Moved `testContainer.registerInstance('DependencyContainer', testContainer);` earlier in `beforeEach`.
- **Problem 2:** The original `TypeInfo not known` error persisted in both `integration.test.ts` and `smoke.test.ts`. The error stack trace consistently pointed to the resolution attempt *inside* `processMeld`:
  ```
  ❯ Module.processMeld api/index.ts:64:44
      64|   const outputService = executionContainer.resolve<IOutputService>('IOutputService');
  ```
- **Hypothesis 2:** Maybe the dual registration (`registerInstance` for string token AND `registerSingleton` for class type) was confusing.
- **Step:** Removed `testContainer.registerSingleton(VariableReferenceResolverClientFactory, VariableReferenceResolverClientFactory);` from `beforeEach`.
- **Result:** No change. The error still occurs inside `processMeld` when resolving `OutputService`.

### Conclusion (Session 2)

- The core problem lies in resolving the string token `'VariableReferenceResolverClientFactory'` when `OutputService` is instantiated within the `executionContainer` used by `processMeld`.
- The test-specific workaround (`registerInstance` in `testContainer`) is **ineffective** because the `executionContainer` inside `processMeld` (even if it *is* the `testContainer` passed via options) doesn't seem to respect or find this instance registration when resolving via the string token.
- This suggests the root cause is either:
    - A fundamental issue with `tsyringe` resolving string tokens across container boundaries or within the context of `processMeld`'s setup.
    - An incorrect assumption about how the `testContainer`'s registrations are inherited or used by the `executionContainer` within `processMeld`.

## Next Steps

1.  Focus on the **global DI configuration** (`di-config.ts`). Ensure `VariableReferenceResolverClientFactory` is explicitly registered using the string token `'VariableReferenceResolverClientFactory'` there, so it's available in the main container and any properly configured child container.
2.  Re-examine the container logic within `processMeld` (`api/index.ts`) to ensure the `executionContainer` is correctly inheriting registrations from the main container or the provided test container.
3.  Consider alternative injection patterns for `OutputService` if string token resolution remains problematic (though this feels like avoiding the root cause).
4.  Address the unrelated lint error in `RunDirectiveHandler.ts` once this blocker is resolved.
