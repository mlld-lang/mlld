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

The `@Service()` decorator registers the class with the container and adds some metadata for documentation purposes.

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

Services should be created using the DI container, not with `new`:

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

## Best Practices

### Service Design

1. **Interface-First Design**: Define an interface for your service before implementing it
2. **Explicit Dependencies**: Always specify dependencies in the constructor
3. **Private Injection**: Use `private` in constructor parameters to store the dependencies
4. **Explicit Return Types**: Always provide return types for methods
5. **Proper Initialization**: Services should be fully initialized after construction

### Example Service

```typescript
import { inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';

// 1. Define the interface
export interface IExampleService {
  process(data: string): Promise<string>;
  getStatus(): string;
}

// 2. Implement the service
@Service({
  description: 'Example service that demonstrates best practices'
})
export class ExampleService implements IExampleService {
  // 3. Constructor injection with explicit dependencies
  constructor(
    @inject('IDependencyService') private dependency: IDependencyService,
    @inject('ILoggerService') private logger: ILoggerService
  ) {}

  // 4. Explicit return type
  async process(data: string): Promise<string> {
    this.logger.log('Processing data...');
    return this.dependency.transform(data);
  }

  getStatus(): string {
    return 'Ready';
  }
}
```

## Testing with DI

### Using TestContextDI

The `TestContextDI` class provides utilities for testing with DI:

```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    // Create a test context with DI
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    // Clean up resources
    await context.cleanup();
  });
  
  it('should process data correctly', async () => {
    // Register a mock dependency
    const mockDependency = { transform: vi.fn().mockReturnValue('transformed') };
    context.registerMock('IDependencyService', mockDependency);
    
    // Get the service from the container
    const service = context.container.resolve('IExampleService');
    
    // Test the service
    const result = await service.process('input');
    expect(result).toBe('transformed');
    expect(mockDependency.transform).toHaveBeenCalledWith('input');
  });
});
```

### Mocking Services

To register mock implementations:

```typescript
// Register a mock instance
context.registerMock('IServiceName', mockImplementation);

// Register a mock class
context.container.registerMockClass('IServiceName', MockClass);
```

## Common Patterns

### Factory Pattern

For services that need complex initialization or multiple instances:

```typescript
@Service()
export class ServiceFactory {
  constructor(
    @inject('IDependencyA') private depA: IDependencyA,
    @inject('IDependencyB') private depB: IDependencyB
  ) {}
  
  createService(config: ServiceConfig): IService {
    // Create a specialized instance with the given config
    // The factory can use its injected dependencies
    return new SpecializedService(this.depA, this.depB, config);
  }
}
```

### Service Providers

For centralized service registration:

```typescript
// In a central di-config.ts file:
import { container } from 'tsyringe';

// Register core services
container.register('FileSystemService', { useClass: FileSystemService });
container.register('IFileSystemService', { useToken: 'FileSystemService' });
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