# Direct Container Resolution Pattern

## Overview

The Direct Container Resolution pattern provides an elegant solution for handling circular dependencies in dependency injection systems. It leverages lazy loading and direct access to the DI container to break circular dependency chains while maintaining the benefits of dependency injection.

## Problem

Circular dependencies occur when two or more services depend on each other, either directly or indirectly, creating a cycle that cannot be resolved in the standard DI initialization flow. For example:

```
Service A → depends on → Service B → depends on → Service C → depends on → Service A
```

This creates a situation where the container cannot fully initialize any of the services because each one is waiting for another in the cycle to be initialized first.

## Traditional Approaches

1. **Service Mediator**: Using a mediator service to break the cycle by having services communicate through it rather than directly.
   - **Drawbacks**: Adds complexity, couples all services to the mediator, requires maintaining the mediator as services evolve.

2. **Restructuring**: Refactoring the architecture to eliminate the circular dependency.
   - **Drawbacks**: Not always feasible, may compromise separation of concerns, can lead to extensive refactoring.

3. **Interface Segregation**: Breaking interfaces into smaller, more focused ones to avoid circular dependencies.
   - **Drawbacks**: May lead to interface proliferation, doesn't always solve deep circular dependencies.

## The Direct Container Resolution Pattern

This pattern resolves circular dependencies by:

1. Not injecting the circular dependency directly through the constructor
2. Instead, accessing the container directly to resolve the dependency when needed
3. Using lazy loading to defer resolution until the dependency is actually required
4. Implementing robust fallbacks in case resolution fails

### Implementation Example

```typescript
import { container } from 'tsyringe';

class ServiceA {
  private serviceB?: IServiceB;

  constructor(
    // Other non-circular dependencies
    @inject('IDependencyX') private dependencyX: IDependencyX
  ) {}

  private getServiceB(): IServiceB | undefined {
    if (!this.serviceB) {
      try {
        // Direct container resolution - only when needed
        const factory = container.resolve(ServiceBFactory);
        this.serviceB = factory.createClient();
        logger.debug('Created ServiceB client using direct container resolution');
      } catch (error) {
        logger.warn('Failed to create ServiceB client', { error });
        return undefined;
      }
    }
    return this.serviceB;
  }

  public doSomething(): void {
    // Use the dependency if available
    const serviceB = this.getServiceB();
    if (serviceB) {
      // Use serviceB
      serviceB.doSomething();
    } else {
      // Fallback implementation
      this.fallbackImplementation();
    }
  }

  private fallbackImplementation(): void {
    // Implement fallback logic here
  }
}
```

## Benefits

1. **Breaks Circular Dependencies**: Effectively breaks the circular dependency chain without compromising architecture.
2. **Preserves DI Benefits**: Maintains the benefits of the DI system for all other dependencies.
3. **Lazy Loading**: Only resolves dependencies when actually needed, improving performance.
4. **Graceful Degradation**: Allows systems to function even when resolution fails.
5. **Minimal Changes**: Requires minimal changes to existing code compared to other approaches.
6. **Testability**: Remains testable with appropriate mocking of the container.

## When to Use

Use the Direct Container Resolution pattern when:

1. You have circular dependencies that cannot be easily eliminated through restructuring
2. The dependency is only needed in specific scenarios, not throughout the entire service
3. Standard constructor injection would create initialization issues
4. You need a pragmatic solution without extensive refactoring
5. You can implement robust fallbacks for when resolution fails

## Implementation Considerations

1. **Error Handling**: Always implement proper error handling for when resolution fails.
2. **Caching**: Cache the resolved dependency to avoid resolving it multiple times.
3. **Fallbacks**: Provide graceful fallbacks for when the dependency cannot be resolved.
4. **Testing**: Use dependency injection in tests to provide mock implementations.
5. **Documentation**: Document the use of this pattern to make it clear to future developers.

## Example Use Case

In the Meld project, we used this pattern to resolve circular dependencies between the OutputService and the VariableReferenceResolverClientFactory. The OutputService needs field access capabilities provided by the VariableReferenceResolver, but there's a circular dependency chain between these components.

By using direct container resolution with lazy loading, we were able to:

1. Break the circular dependency
2. Implement enhanced field access capabilities
3. Maintain backward compatibility
4. Provide robust fallbacks
5. Keep the code maintainable