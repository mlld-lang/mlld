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

#### Planned Migration Approach for Logger Services

The Logger migration will be more complex than SourceMapService due to:

1. **Multiple Exported Instances**: The main `logger` plus numerous service-specific loggers
2. **Factory Function**: The `createServiceLogger` function creates new instances
3. **Different Logger Types**: Both Winston logger and simple Logger class
4. **Extended Usage**: Imported in nearly every file in the codebase

Our migration approach will be:

1. **Create Interfaces**:
   ```typescript
   export interface ILogger {
     error(message: string, context?: Record<string, unknown>): void;
     warn(message: string, context?: Record<string, unknown>): void;
     info(message: string, context?: Record<string, unknown>): void;
     debug(message: string, context?: Record<string, unknown>): void;
     trace(message: string, context?: Record<string, unknown>): void;
     level: string;
   }
   ```

2. **Add TSyringe Decorators**:
   ```typescript
   @injectable()
   @singleton()
   @Service({
     providedIn: 'root'
   })
   class Logger implements ILogger {
     // Existing implementation
   }
   ```

3. **Transform Factory Function**:
   ```typescript
   @injectable()
   export class LoggerFactory {
     // Factory method that can be injected
     createServiceLogger(serviceName: string): ILogger {
       // Implementation
     }
   }
   ```

4. **Register in Container**:
   ```typescript
   // Register main logger
   container.register('Logger', { useValue: logger });
   container.register('ILogger', { useToken: 'Logger' });
   
   // Register service loggers
   container.register('StateLogger', { useValue: stateLogger });
   // Other service loggers...
   
   // Register factory
   container.register('LoggerFactory', { useClass: LoggerFactory });
   ```

5. **Maintain Backward Compatibility**: Keep all exports unchanged

## Best Practices

1. **Never Break Tests**: Always ensure tests pass after each change
2. **Gradual Adoption**: Update dependent services gradually, not all at once
3. **Preserve Behavior**: Maintain the same runtime behavior during migration
4. **Double-Check Singletons**: Make sure container-resolved instances match singleton behavior

## Migration Checklist

For each utility service:

- [x] Create interface defining the public API (SourceMapService)
- [x] Add TSyringe decorators without changing exports (SourceMapService)
- [x] Add dual-mode tests verifying both DI and direct instantiation (SourceMapService)
- [x] Document the migration strategy for the specific service (SourceMapService)
- [x] Update DI container registration in di-config.ts (SourceMapService completed)
- [x] Create interface for Logger (ILogger and ISimpleLogger)
- [x] Add TSyringe decorators to Logger classes
- [x] Transform createServiceLogger to be DI-compatible (LoggerFactory class)
- [x] Register all logger instances in the DI container
- [x] Extract CLIService interfaces to separate file
- [x] Create DefaultPromptService implementation
- [x] Apply TSyringe decorators to CLIService
- [x] Register CLIService in the DI container
- [ ] **Phase 4 Tasks:**
  - [ ] Gradually update consumers to support DI resolution
  - [ ] Eventually register the singleton with the container
  - [ ] Create DI-only mode opt-in mechanism for tests

## Completed Migrations

### SourceMapService

The SourceMapService was successfully migrated following these steps:

1. **Added Interface**: Created `ISourceMapService` to define the public API
2. **Added Decorators**: Applied `@injectable()`, `@singleton()`, and `@Service()` decorators
3. **Maintained Singleton**: Kept the exported `sourceMapService` instance unchanged
4. **Added DI Registration**: Updated di-config.ts to register both class and interface
5. **Verified Tests**: Confirmed tests pass in both DI and non-DI modes

Key insights from the SourceMapService migration:

1. The service had no dependencies, making it an easier first utility to migrate
2. Tests already had a framework for both DI and non-DI testing
3. Resolution in di-config.ts used the pattern:
   ```typescript
   container.register('SourceMapService', { useClass: SourceMapService });
   container.register('ISourceMapService', { useToken: 'SourceMapService' });
   ```
4. The `@Service({ providedIn: 'root' })` decorator properly set up the service for DI

### Logger Services

The Logger services were successfully migrated using a more complex approach:

1. **Added Interfaces**: 
   - Created `ILogger` for Winston loggers
   - Created `ISimpleLogger` for the simple logger implementation 
   - Created `ILoggerFactory` for the factory service

2. **Transformed Factory Function**: 
   - Converted the `createServiceLogger` function into a `LoggerFactory` class
   - Applied TSyringe decorators to make it injectable and singleton
   - Maintained backward compatibility with the original function

3. **Decorated Classes**: 
   - Applied `@injectable()`, `@singleton()`, and `@Service()` decorators to the Logger class

4. **Registered All Instances**: 
   - Registered the main logger as 'MainLogger' and 'ILogger'
   - Registered each service logger with a unique token (StateLogger, ParserLogger, etc.)
   - Registered the LoggerFactory for DI resolution
   - Registered the simple logger as 'SimpleLogger' and 'ISimpleLogger'

5. **Maintained Backward Compatibility**:
   - Kept all existing exported logger instances unchanged
   - Maintained the original createServiceLogger function that uses the factory

Key insights from the Logger services migration:

1. Factory functions can be transformed into injectable classes while maintaining the original function for backward compatibility
2. Multiple instances from the same module can be registered with unique tokens in the DI container
3. Both simple and complex logger implementations can use the same pattern
4. The interfaces clearly define the public API that other services can depend on

### CLIService Migration

The CLIService was successfully migrated as the final service in Phase 3:

1. **Interface Extraction**:
   - Moved interfaces to ICLIService.ts for better organization
   - Created a proper IPromptService interface for user interaction
   - Updated CLIOptions interface to match actual implementation

2. **Default Service Implementation**:
   - Created a DefaultPromptService class to handle user prompts
   - Extracted this from the inline implementation in the constructor
   - Registered this in the DI container for reuse

3. **Applied TSyringe Decorators**:
   - Added `@injectable()` and detailed `@Service()` decorator with dependencies
   - Used `@inject()` with six service dependencies
   - Applied `@delay()` to all dependencies to prevent circular dependency issues

4. **Maintained Dual-Mode Support**:
   - Used optional parameters that support both DI and manual initialization
   - Added an initialize() method for backward compatibility
   - Implemented an ensureInitialized() safety check before operations
   - Used non-null assertions (!) for services after initialization check

5. **DI Container Registration**:
   - Registered CLIService with both class and interface tokens
   - Registered DefaultPromptService as the implementation for IPromptService

Key insights from the CLIService migration:

1. Services with many dependencies benefit from clear organization of interfaces
2. The `@delay()` decorator is essential for services with many complex dependencies
3. An initialization guard pattern (ensureInitialized) helps prevent runtime errors
4. Extracting small helper classes can simplify the main service
5. Non-null assertions are a clean pattern when using an initialization guard