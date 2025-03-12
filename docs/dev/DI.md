# Dependency Injection in Meld

This document provides guidance on working with the dependency injection (DI) system in the Meld codebase.

## Overview

Meld uses [TSyringe](https://github.com/microsoft/tsyringe) for dependency injection. All services are registered and resolved through the DI container, which simplifies service initialization and testing.

## Core Concepts

### 1. Service Registration

Services are automatically registered with the DI container when they are decorated with the `@Service()` decorator:

```typescript
import { Service } from '@core/ServiceProvider';

@Service({
  description: 'Service that provides file system operations'
})
export class FileSystemService implements IFileSystemService {
  // Implementation...
}
```

The `@Service()` decorator registers the class with the container and adds metadata for documentation purposes.

### 2. Dependency Injection

Services can inject their dependencies through constructor parameters:

```typescript
import { inject } from 'tsyringe';

@Service()
export class ResolutionService implements IResolutionService {
  constructor(
    @inject('IStateService') private stateService: IStateService,
    @inject('IFileSystemService') private filesystem: IFileSystemService,
    @inject('IParserService') private parser: IParserService,
    @inject('IPathService') private pathService: IPathService
  ) {}
  
  // Implementation...
}
```

### 3. Creating Services

Services should be created using the DI container:

```typescript
// CORRECT: Let the DI container create the service
import { container } from 'tsyringe';
const service = container.resolve(ServiceClass);

// CORRECT: Use the ServiceProvider helper
import { createService } from '@core/ServiceProvider';
const service = createService(ServiceClass);

// INCORRECT: Don't use 'new' directly
const service = new ServiceClass(); // Avoid this
```

## Testing with DI

### 1. Test Context

Use `TestContextDI` for test setup:

```typescript
import { TestContextDI } from '@tests/utils/di';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should do something', async () => {
    const service = await context.resolve('IMyService');
    // Test implementation...
  });
});
```

### 2. Mocking Services

Register mocks using the test context:

```typescript
// Register a mock implementation
context.registerMock('IMyService', {
  doSomething: vi.fn().mockReturnValue('mocked result')
});

// Or use the mock helpers
import { createServiceMock } from '@tests/utils/di';
const mockService = createServiceMock();
context.registerMock('IMyService', mockService);
```

### 3. Isolated Testing

For tests that need complete isolation:

```typescript
const context = TestContextDI.createIsolated();
```

This creates a container that won't affect or be affected by other tests.

## Best Practices

### Service Design

1. **Interface-First Design**: Define an interface for your service before implementing it
2. **Explicit Dependencies**: Always specify dependencies in the constructor
3. **Private Injection**: Use `private` in constructor parameters to store the dependencies
4. **Explicit Return Types**: Always provide return types for methods
5. **Proper Initialization**: Services should be fully initialized after construction

### Testing

1. **Use TestContextDI**: Always use TestContextDI for test setup
2. **Proper Cleanup**: Always clean up test contexts in afterEach
3. **Async Resolution**: Use async/await with context.resolve()
4. **Mock Registration**: Register mocks before resolving services
5. **Isolation**: Use createIsolated() when tests need complete isolation

### Example Service

```typescript
// IMyService.ts
export interface IMyService {
  doSomething(): Promise<string>;
}

// MyService.ts
@Service()
export class MyService implements IMyService {
  constructor(
    @inject('ILogger') private logger: ILogger,
    @inject('IConfig') private config: IConfig
  ) {}

  async doSomething(): Promise<string> {
    this.logger.info('Doing something');
    return 'done';
  }
}

// MyService.test.ts
describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    context = TestContextDI.createIsolated();
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should do something', async () => {
    // Register mocks
    context.registerMock('ILogger', {
      info: vi.fn()
    });
    
    context.registerMock('IConfig', {
      get: vi.fn()
    });
    
    // Resolve service
    const service = await context.resolve<IMyService>('IMyService');
    
    // Test implementation
    const result = await service.doSomething();
    expect(result).toBe('done');
  });
});
```

## Troubleshooting

### Circular Dependencies

If you have circular dependencies, use `@inject(token)` with a string token instead of a direct class reference:

```typescript
// Instead of this (can cause circular dependency issues):
constructor(@inject(DependentService) private dependent: DependentService)

// Do this:
constructor(@inject('IDependentService') private dependent: IDependentService)
```

### Missing Dependencies

If a service fails to resolve with "unregistered dependency token" errors:

1. Check that the service is decorated with `@Service()`
2. Verify that the injected token is registered in the container
3. Check for typos in the injection token string
4. Make sure the services are imported and executed before use

### Testing Issues

If tests fail with DI errors:

1. Use `TestContextDI` to create a clean container for each test
2. Register all required mock dependencies before resolving the service
3. Clean up after tests with `context.cleanup()`