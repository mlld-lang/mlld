# TSyringe DI Migration - Phase 4 Implementation Plan

## Overview

Phase 4 focuses on implementing constructor injection for services with complex dependencies and handling circular dependencies with tsyringe's `@delay` decorator. Building on the foundation of Phases 1-3, we'll target more sophisticated services in the Meld pipeline.

## Target Services for Phase 4

Based on the migration plan and current progress, we'll focus on these services:

1. **DirectiveService**: Has complex dependencies including circular relationship with InterpreterService
2. **InterpreterService**: Works closely with DirectiveService, creating a circular dependency
3. **ResolutionService**: Complex service with multiple dependencies
4. **OutputService**: Service that depends on multiple other services

## Implementation Steps

### 1. Circular Dependency Handling

1. **Update DirectiveService**:
   - Apply `@Service()` decorator
   - Convert to constructor injection pattern
   - Use `@delay()` for circular dependencies with InterpreterService
   - Update tests with TestContextDI to support DI testing

2. **Update InterpreterService**:
   - Apply `@Service()` decorator
   - Convert to constructor injection
   - Handle circular dependency with DirectiveService
   - Update tests with TestContextDI

3. **Create Common Testing Pattern**:
   ```typescript
   describe('ServiceName', () => {
     describe.each([
       { useDI: true, name: 'with DI' },
       { useDI: false, name: 'without DI' },
     ])('$name', ({ useDI }) => {
       let context: TestContextDI;
       let service: ServiceType;
       
       beforeEach(async () => {
         context = useDI
           ? await TestContextDI.withDI()
           : await TestContextDI.withoutDI();
         
         service = useDI
           ? context.container.resolve<ServiceType>('ServiceType')
           : new ServiceType();
           
         // Initialize if not using DI
         if (!useDI) {
           service.initialize(
             // dependencies...
           );
         }
       });
       
       afterEach(async () => {
         await context.cleanup();
       });
       
       // Test cases...
     });
   });
   ```

### 2. Complex Services with Multiple Dependencies

1. **Update ResolutionService**:
   - Apply `@Service()` decorator with detailed metadata
   - Implement constructor injection for all dependencies
   - Maintain backward compatibility with initialize()
   - Update tests to work with DI

2. **Update OutputService**:
   - Apply `@Service()` decorator with metadata
   - Implement constructor injection
   - Update tests to work with DI

### 3. Validation and Testing

For each service:

1. Run tests with both `USE_DI=true` and `USE_DI=false`
2. Verify initialization works in both modes
3. Test circular dependency resolution
4. Ensure service functionality remains unchanged

## Challenges and Solutions

### Circular Dependencies

1. **Solution**: Use tsyringe's `@delay()` decorator on circular dependencies
   ```typescript
   constructor(
     @inject('IValidationService') validationService: IValidationService,
     @inject('IStateService') stateService: IStateService,
     @delay() @inject('IInterpreterService') interpreterService: IInterpreterService
   ) {
     // Implementation...
   }
   ```

### Lazy Initialization

1. **Solution**: Use `setTimeout` to ensure services are fully initialized before use
   ```typescript
   constructor(
     // dependencies...
     @delay() @inject('ICircularDependencyService') circularDependency: ICircularDependencyService
   ) {
     setTimeout(() => {
       this.circularDependency = circularDependency;
     }, 0);
   }
   ```

### Test Infrastructure

1. **Solution**: Use the TestContextDI helper from Phase 2
   ```typescript
   // Create test context with appropriate DI setting
   context = useDI 
     ? TestContextDI.withDI() 
     : TestContextDI.withoutDI();

   // Get service instance using the appropriate mode
   service = useDI
     ? context.container.resolve<IServiceName>('IServiceName')
     : createService(ServiceName);
   ```

## Exit Criteria

- All services have been decorated with `@Service()`
- Constructor injection is implemented for all targeted services
- Circular dependencies are properly handled
- All tests pass with both `USE_DI=true` and `USE_DI=false`
- Services maintain backward compatibility with non-DI initialization

## Next Steps for Phase 5

- Address remaining services not covered in Phase 4
- Start transitioning away from dual-mode initialization
- Refine DI testing patterns
- Begin preparation for removing the feature flag