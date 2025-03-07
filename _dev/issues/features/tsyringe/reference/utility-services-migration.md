# Utility Services Migration Guide

This guide outlines the specific approach for migrating utility services like `SourceMapService` and `Logger` to TSyringe dependency injection.

## The Challenge

Utility services in the Meld codebase present unique migration challenges:

1. **Widespread Usage**: They are used extensively throughout the codebase as singletons
2. **Imported Directly**: Most code imports the exported singleton instances directly
3. **No Initialization Pattern**: Unlike regular services, they don't follow the standard initialize() pattern
4. **Test Expectations**: Tests rely on specific singleton behavior with reset() methods

## Failed Migration Approaches

Our initial attempts to migrate these services failed because:

1. Replacing the exported singleton instances broke countless tests
2. Changing the import patterns would require updating nearly every file in the codebase
3. Using the container to resolve instances created mismatches with existing singleton instances

## Successful Migration Strategy

The correct approach for utility services involves these steps:

### Phase 1: Add DI Support Without Breaking Compatibility

1. **Add Interface**: Create an interface defining the service's public API
   ```typescript
   export interface ISourceMapService {
     registerSource(filePath: string, content: string): void;
     addMapping(source: SourceLocation, line: number, col: number): void;
     // ...other methods
   }
   ```

2. **Decorate the Class**: Add TSyringe decorators without changing the exported singleton
   ```typescript
   @injectable()
   @singleton()
   @Service({
     providedIn: 'root'
   })
   export class SourceMapService implements ISourceMapService {
     // Existing implementation
   }
   
   // Keep the original singleton export
   export const sourceMapService = new SourceMapService();
   ```

3. **Update Tests**: Create dual-mode tests that verify both DI and direct instantiation
   ```typescript
   describe('SourceMapService', () => {
     // Test for non-DI mode
     describe('non-DI mode', () => {
       // Original tests using sourceMapService singleton
     });
     
     // Test for DI mode
     describe('DI mode', () => {
       let testContext: TestContextDI;
       let sourceMapService: ISourceMapService;
       
       beforeEach(async () => {
         testContext = new TestContextDI();
         await testContext.initialize();
         sourceMapService = container.resolve<ISourceMapService>(SourceMapService);
       });
       
       // Tests using container-resolved instance
     });
   });
   ```

### Phase 2: Gradual Update of Consumers

1. **Update Service Consumers**: Gradually update services that consume utility services to use DI
   ```typescript
   @Service({
     providedIn: 'root',
     dependencies: [
       { token: 'ISourceMapService', name: 'sourceMapService' }
     ]
   })
   export class ErrorService {
     constructor(@inject('ISourceMapService') private sourceMapService: ISourceMapService) {}
     
     // Methods using sourceMapService
   }
   ```

2. **Maintain Dual Support**: Ensure all services can still work with both modes
   ```typescript
   constructor(
     @inject('ISourceMapService') sourceMapService?: ISourceMapService
   ) {
     // Use injected instance if available, otherwise use singleton
     this.sourceMapService = sourceMapService || sourceMapServiceSingleton;
   }
   ```

### Phase 3: Complete Migration

After all consumers have been updated to support DI resolution:

1. **Register Singleton**: Register the existing singleton instance with the container
   ```typescript
   // In di-config.ts
   container.registerInstance<ISourceMapService>('ISourceMapService', sourceMapService);
   ```

2. **Update Exports**: Eventually, you can change the export to leverage the container
   ```typescript
   // Export for backward compatibility
   export const sourceMapService = container.resolve<ISourceMapService>(SourceMapService);
   ```

## Implementation Notes

### For SourceMapService

1. Core utility singleton used for tracking original source locations
2. Contains internal state that must be preserved across tests with reset()
3. Required by error handling code throughout the codebase

### For Logger Services

1. Multiple logger instances exported as singletons
2. Used by nearly every file in the codebase
3. Requires special handling for the createServiceLogger factory function

## Best Practices

1. **Never Break Tests**: Always ensure tests pass after each change
2. **Gradual Adoption**: Update dependent services gradually, not all at once
3. **Preserve Behavior**: Maintain the same runtime behavior during migration
4. **Double-Check Singletons**: Make sure container-resolved instances match singleton behavior

## Migration Checklist

For each utility service:

- [ ] Create interface defining the public API
- [ ] Add TSyringe decorators without changing exports
- [ ] Add dual-mode tests verifying both DI and direct instantiation
- [ ] Document the migration strategy for the specific service
- [ ] Gradually update consumers to support DI resolution
- [ ] Eventually register the singleton with the container