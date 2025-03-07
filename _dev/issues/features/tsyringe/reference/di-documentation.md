# Dependency Injection with TSyringe

This document provides a comprehensive guide to dependency injection (DI) with TSyringe in the Meld codebase.

## Overview

The Meld codebase uses TSyringe for dependency injection. TSyringe is a lightweight dependency injection container for TypeScript/JavaScript that simplifies the process of creating and managing dependencies.

## Key Concepts

### Dependency Injection

Dependency Injection is a design pattern where a class receives its dependencies from external sources rather than creating them itself. This makes code more:

- **Testable**: Dependencies can be easily mocked
- **Maintainable**: Reduces coupling between components
- **Extensible**: Dependencies can be swapped without changing the consumer

### TSyringe Basics

TSyringe uses TypeScript decorators to mark classes and their dependencies:

- `@injectable()`: Marks a class as available for injection
- `@inject()`: Specifies a dependency to inject
- `container`: The global dependency container

## Implementation in Meld

### Service Decorator

The `@Service()` decorator is used to mark classes as services in Meld:

```typescript
@Service({
  description: 'Handles path operations in the codebase',
  dependencies: [
    { token: 'IFileSystemService', name: 'fileSystem' }
  ]
})
export class PathOperationsService implements IPathOperationsService {
  // ...
}
```

### Constructor Injection

Dependencies are injected through the constructor:

```typescript
constructor(
  @inject('IFileSystemService') private fileSystem: IFileSystemService,
  @inject('IConfigService') private config: IConfigService
) {
  // The dependencies are already available
}
```

### Interface Tokens

We use string tokens to represent interfaces:

```typescript
container.register('IPathOperationsService', { useClass: PathOperationsService });
```

### Container Configuration

The DI container is configured in `di-config.ts`:

```typescript
// Register core services
container.register('IPathOperationsService', { useClass: PathOperationsService });
container.register('IFileSystemService', { useClass: FileSystemService });
// ...
```

## Working with DI

### Creating a New Service

1. **Create the interface**:
```typescript
export interface IMyService {
  doSomething(): void;
}
```

2. **Create the implementation**:
```typescript
@Service({
  description: 'My service description',
  dependencies: [
    { token: 'IDependencyService', name: 'dependency' }
  ]
})
export class MyService implements IMyService {
  constructor(@inject('IDependencyService') private dependency: IDependencyService) {}
  
  doSomething(): void {
    // Implementation...
  }
}
```

3. **Register with the container** in `di-config.ts`:
```typescript
container.register('IMyService', { useClass: MyService });
```

### Using a Service

```typescript
// In another service
constructor(@inject('IMyService') private myService: IMyService) {
  // myService is ready to use
}

// Or manually resolve
const myService = container.resolve<IMyService>('IMyService');
```

### Handling Circular Dependencies

When services depend on each other, use `@delay()`:

```typescript
constructor(
  @inject('IServiceA') serviceA: IServiceA,
  @delay() @inject('ICircularDependency') circularDependency: ICircularDependency
) {
  this.serviceA = serviceA;
  
  // Use setTimeout to ensure all services are fully initialized
  setTimeout(() => {
    this.circularDependency = circularDependency;
  }, 0);
}
```

## Testing with DI

### Test Context

The `TestContextDI` helper simplifies testing with DI:

```typescript
describe('MyService', () => {
  let context: TestContextDI;
  let service: IMyService;

  beforeEach(() => {
    context = TestContextDI.create();
    
    // Register mocks
    context.registerMock('IDependencyService', mockDependency);
    
    // Get service instance
    service = context.resolve<IMyService>('IMyService');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should do something', () => {
    // Test...
  });
});
```

### Mocking Dependencies

```typescript
// Create a mock implementation
const mockDependency: IDependencyService = {
  someMethod: jest.fn().mockReturnValue('mock value')
};

// Register with the test container
context.registerMock('IDependencyService', mockDependency);
```

### Testing Both DI and Non-DI Modes

While we're still supporting both modes:

```typescript
describe.each([
  { useDI: true, name: 'with DI' },
  { useDI: false, name: 'without DI' },
])('$name', ({ useDI }) => {
  let context: TestContextDI;
  let service: IMyService;

  beforeEach(() => {
    // Create context with appropriate DI setting
    context = TestContextDI.create({ useDI });
    
    // Register mocks
    context.registerMock('IDependencyService', mockDependency);
    
    // Get service instance
    service = context.resolve<IMyService>('IMyService');
    
    // Legacy initialization if not using DI
    if (!useDI && service['initialize']) {
      service['initialize'](mockDependency);
    }
  });
  
  // Tests...
});
```

## Best Practices

### Do's

- ✅ Use `@Service()` for all service classes
- ✅ Inject dependencies through constructors
- ✅ Use string tokens for interfaces
- ✅ Document service dependencies
- ✅ Create proper tests with TestContextDI
- ✅ Use `@delay()` for circular dependencies

### Don'ts

- ❌ Create services with `new` directly
- ❌ Access the global container directly (except in root composition)
- ❌ Use optional dependencies when they're actually required
- ❌ Mix DI and non-DI initialization patterns
- ❌ Forget to register services with the container

## Troubleshooting

### Common Issues

**Service Not Found**
```
Error: Unable to resolve token: IMyService
```
Fix: Ensure the service is registered in `di-config.ts`

**Circular Dependency Error**
```
Error: Circular dependency detected: IServiceA -> IServiceB -> IServiceA
```
Fix: Use `@delay()` on one of the dependencies

**Missing Injectable Decorator**
```
Error: Cannot inject into a non-injectable constructor
```
Fix: Ensure the class has `@injectable()` or `@Service()` decorator

## Migration Resources

For more information about our TSyringe migration:

- [TSyringe Migration Plan](../README.md): Overall migration strategy
- [Phase Documentation](../phases/): Detailed phase-by-phase approach
- [Constructor Simplification](./constructor-simplification.md): Strategy for simplifying service constructors
- [Service Initialization Patterns](./service-initialization-patterns.md): Common patterns in the codebase 