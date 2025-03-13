# Test Update Template

This template provides a standardized approach for updating tests based on the audit results.

## Test Update Workflow

### 1. Analysis Phase

- [ ] **Review Audit Results** for the specific test file
- [ ] **Examine Current Implementation**
  - Note current mocking approach
  - Identify service initialization pattern
  - Understand test structure and assertions
- [ ] **Review Reference Implementation** (from commit `9a31e16` or similar pre-DI state)
  - Note how mocks were created
  - Identify how services were initialized
  - Understand test flow

### 2. Planning Phase

- [ ] **Identify Required Changes** based on audit results
- [ ] **Plan Mock Updates**
  - List all mocks needed
  - Determine mock registration order
- [ ] **Plan Service Resolution** approach
  - Identify services that need async resolution
  - Note any circular dependencies

### 3. Implementation Phase

#### A. Setup and Cleanup

```typescript
// BEFORE
let service: MyService;
let mockDependency: any;

beforeEach(() => {
  mockDependency = { method: vi.fn() };
  service = new MyService(mockDependency);
});

// AFTER
let context: TestContextDI;
let service: MyService;

beforeEach(async () => {
  context = TestContextDI.createIsolated();
  await context.initialize();
  
  // Register mocks
  context.registerMock('IDependency', {
    method: vi.fn()
  });
  
  // Resolve service
  service = await context.resolve(MyService);
});

afterEach(async () => {
  await context?.cleanup();
});
```

#### B. Mock Registration

```typescript
// BEFORE
const mockDirectiveService = {
  executeDirective: vi.fn()
};
const mockStateService = {
  addNode: vi.fn()
};

// AFTER
import { createServiceMock } from '@tests/utils/di';

// Create mocks
const mockDirectiveService = createServiceMock();
mockDirectiveService.executeDirective.mockReturnValue({ state: {} });

const mockStateService = createServiceMock();
mockStateService.addNode.mockImplementation(() => {});

// Register mocks
context.registerMock('IDirectiveService', mockDirectiveService);
context.registerMock('IStateService', mockStateService);
```

#### C. Factory Mocking

```typescript
// Factory mock
const mockFactory = {
  getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
} as unknown as DirectiveServiceClientFactory;

// Register factory mock
context.registerMock('DirectiveServiceClientFactory', mockFactory);
```

#### D. Service Resolution

```typescript
// BEFORE
const service = new MyService(mockDep1, mockDep2);

// AFTER
const service = await context.resolve<IMyService>('IMyService');
```

#### E. Error Testing

```typescript
// BEFORE
try {
  await service.method();
  fail('Should have thrown');
} catch (e) {
  expect(e.message).toContain('Expected error');
  expect(e.code).toBe('expected_code');
}

// AFTER
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils';

await expectToThrowWithConfig(async () => {
  await service.method();
}, {
  errorType: MeldError,
  code: 'expected_code',
  message: 'Expected error'
});
```

### 4. Verification Phase

- [ ] **Run Tests** to verify updates
- [ ] **Review Test Output**
  - Identify any failing tests
  - Analyze error messages
- [ ] **Debug and Fix**
  - Update mocks as needed
  - Resolve any initialization issues
  - Fix any timing/async problems

### 5. Documentation

- [ ] **Update Test File Header** with migration status
- [ ] **Add Comments** for complex patterns or solutions
- [ ] **Update Tracking Document** with completion status

## Special Patterns

### 1. Handling Circular Dependencies

```typescript
// Register dependencies first
context.registerMock('IDep1', mockDep1);
context.registerMock('IDep2', mockDep2);

// Configure lazy resolution
const servicePromise = context.resolveAsync<IMyService>('IMyService');
```

### 2. Testing Factories

```typescript
// Create a properly mocked factory
const mockFactory: IServiceFactory = {
  getService: vi.fn().mockImplementation(() => {
    if (!this.service) {
      this.service = mockService;
    }
    return this.service;
  })
};

// Register the factory
context.registerMock('IServiceFactory', mockFactory);
```

### 3. Dealing with Lazy Initialization

```typescript
// Ensure proper initialization with mock for lazy loaded service
const mockLazyService = createServiceMock();
context.registerMock('ILazyService', mockLazyService);

// Force initialization if needed
await service.ensureInitialized();
``` 