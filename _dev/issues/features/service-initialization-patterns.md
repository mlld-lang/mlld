# Service Initialization Patterns

## Common Patterns

As we refactor service constructors and initialization logic, we're documenting patterns discovered in the codebase.

### Dual-Mode Constructor Pattern

The most common pattern is a service constructor that must work in both DI and non-DI modes.

```typescript
/**
 * Improved constructor pattern that separates concerns
 */
constructor(
  @inject(SomeFactory) factory?: SomeFactory,
  @inject('ISomeService') dependency1?: ISomeService,
  @inject('IAnotherService') dependency2?: IAnotherService,
  optionalParam?: SomeType
) {
  this.initializeFromParams(factory, dependency1, dependency2, optionalParam);
}

/**
 * Helper that decides which initialization path to take
 */
private initializeFromParams(
  factory?: SomeFactory,
  dependency1?: ISomeService | SomeOtherType, // Could have ambiguous type in legacy mode
  dependency2?: IAnotherService,
  optionalParam?: SomeType
): void {
  if (factory) {
    this.initializeDIMode(factory, dependency1 as ISomeService, dependency2, optionalParam);
  } else {
    this.initializeLegacyMode(dependency1, dependency2, optionalParam);
  }
}

/**
 * Clean DI mode initialization with explicit dependencies
 */
private initializeDIMode(
  factory: SomeFactory,
  dependency1?: ISomeService, 
  dependency2?: IAnotherService,
  optionalParam?: SomeType
): void {
  this.factory = factory;
  this.dependency1 = dependency1;
  this.dependency2 = dependency2;
  // Additional initialization
}

/**
 * Legacy non-DI mode that handles parameter overloading
 */
private initializeLegacyMode(
  param1?: ISomeService | SomeOtherType,
  param2?: IAnotherService,
  param3?: SomeType
): void {
  // Create default dependencies
  this.factory = new SomeFactory();

  // Handle parameter overloading scenarios
  if (condition1) {
    // One legacy signature pattern
  } else if (condition2) {
    // Another legacy signature pattern
  } else {
    // Default case
  }
}
```

### Benefits of This Pattern

1. **Improved Readability**: The constructor itself is very simple
2. **Better Organization**: Different initialization paths are clearly separated
3. **Clear Documentation**: Each method has a clear purpose
4. **Easier Maintenance**: Changes to one path don't affect others
5. **Preserved Behavior**: Functionally identical to complex conditional logic
6. **Migration Path**: Makes it easier to eventually remove legacy mode

## Examples

### StateService

The StateService was refactored to use this pattern. The key improvements were:

1. Moving complex conditional logic out of the constructor
2. Separating DI and legacy non-DI mode initialization into their own methods
3. Making parameter overloading logic more explicit
4. Improving documentation throughout

## Other Patterns

### Initialization Order

Many services follow a specific initialization order:

1. Store dependencies
2. Create helper objects
3. Set up event handlers
4. Initialize state
5. Register with tracking services (if applicable)

### Default Services

When running in non-DI mode, services often create their own default dependencies:

```typescript
// Create default services in non-DI mode
this.factory = new SomeFactory();
this.logger = new SimpleLogger();
```

### Service Inheritance

When services have parent-child relationships, they often inherit services:

```typescript
// If parent has services, inherit them
if (parentService) {
  if (!this.eventService && parentService.eventService) {
    this.eventService = parentService.eventService;
  }
}
```

### Post-Initialization Methods

Some services have additional initialization methods that can be called after construction:

```typescript
initialize(dependency?: IDependency): void {
  if (dependency) {
    this.dependency = dependency;
  }
  // Do additional setup
}
```

## Adding to This Document

As we refactor more services, we should update this document with additional patterns discovered.