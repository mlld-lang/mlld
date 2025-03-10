## Code Review: Test Migration Consistency Issues

After reviewing the recently migrated test files, we've identified several inconsistencies in implementation patterns that should be standardized to ensure maintainable and consistent tests. Below are the key issues and proposed standards:

### Identified Inconsistencies

1. **Service Resolution Pattern**:
   - ⚠️ Inconsistent use of `await` with `context.container.resolve()`:
     - Some files use `service = await context.container.resolve('IService')`
     - Others use `service = context.container.resolve<IService>('IService')`
     - Some still use generic type parameters with interface types
   
2. **Mock Type Definitions**:
   - ⚠️ Inconsistent typing for mocked services:
     - Some use `jest.Mocked<IService>` (outdated)
     - Some use `ReturnType<typeof mockDeep<IService>>`
     - Some use `ReturnType<typeof createServiceMock>`
     - Some use untyped `any`

3. **Import Statements**:
   - ⚠️ Inconsistent import patterns:
     - Some use full paths with `.js` extensions
     - Some use `@` aliased imports without extensions
     - Some mix relative and aliased imports
   
4. **Mock Registration**:
   - ⚠️ Different approaches to mock registration:
     - Some directly register class instances: `context.registerMock('IService', new Service())`
     - Some register mocks: `context.registerMock('IService', mockService)`
     - Some use different type token parameters

5. **Error Handling**:
   - ⚠️ Inconsistent error testing patterns:
     - Some use direct try/catch 
     - Some use expect().toThrow()
     - Some use custom utility functions

6. **Context Cleanup**:
   - ⚠️ Inconsistent cleanup patterns:
     - Some files use `await context.cleanup()`
     - Others use `await context?.cleanup()` (with null check)

### Standardization Recommendations

To address these inconsistencies, we recommend the following standards for all test files:

1. **Service Resolution Pattern**:
   ```typescript
   // STANDARD PATTERN
   service = await context.container.resolve('IServiceName');
   
   // NOT RECOMMENDED
   service = context.container.resolve<IServiceName>('IServiceName');
   ```

2. **Mock Type Definitions**:
   ```typescript
   // STANDARD PATTERN
   let mockService: ReturnType<typeof createServiceMock>;
   // or
   let mockFs: ReturnType<typeof mockDeep<typeof fs>>;
   
   // NOT RECOMMENDED
   let mockService: jest.Mocked<IService>;
   ```

3. **Import Statements**:
   ```typescript
   // STANDARD PATTERN
   import type { IService } from '@services/path/IService.js';
   import { Service } from '@services/path/Service.js';
   import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
   
   // NOT RECOMMENDED
   import { IService } from '../../services/path/IService';
   ```

4. **Mock Registration**:
   ```typescript
   // STANDARD PATTERN
   context.registerMock('IServiceName', mockService);
   
   // FOR ACTUAL CLASS INSTANCES
   context.registerMock('IServiceName', new ServiceName());
   ```

5. **Error Handling**:
   ```typescript
   // STANDARD PATTERN
   await expect(async () => {
     await service.method();
   }).rejects.toThrow(ExpectedError);
   
   // FOR COMPLEX ERROR VALIDATION
   // Use consistent utility functions from errorTestUtils.js
   ```

6. **Context Cleanup**:
   ```typescript
   // STANDARD PATTERN
   afterEach(async () => {
     await context?.cleanup();
   });
   ```

7. **Standard Mock Factory Usage**:
   ```typescript
   // STANDARD PATTERN
   // Import the factory
   import { createServiceMock } from '@tests/utils/mocks/serviceMocks.js';
   
   // Create and reset the mock
   const mockService = createServiceMock();
   mockReset(mockService);
   ```

### Action Items

1. ⬜ Create a comprehensive test helpers guide document in /docs/testing
2. ⬜ Update the following files to apply consistent patterns:
   - ⬜ ProjectPathResolver.test.ts: Fix imports, standardize mock types
   - ⬜ PathOperationsService.test.ts: Add null check in cleanup
   - ⬜ ImportDirectiveHandler.transformation.test.ts: Fix jest type references
   - ⬜ ValidationService.test.ts: Update error handling patterns
3. ⬜ Create additional standard mock factories for common services
4. ⬜ Standardize error testing utilities across all test files
5. ⬜ Create PR with test consistency fixes

This standardization effort will improve maintainability, reduce errors, and make tests more consistent and easier to understand.
