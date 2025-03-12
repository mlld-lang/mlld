# ServiceMediator Removal - Phase 5 Implementation Plan

## Overview

This document outlines a methodical approach to completely remove the ServiceMediator from the codebase. We've successfully completed Phase 4 (ServiceMediator Deprecation) and are now ready to proceed with Phase 5 (ServiceMediator Removal). This phase will involve removing all ServiceMediator usage from the codebase, removing the ServiceMediator class and interface, and ensuring all tests pass without ServiceMediator.

## Current Status

- ✅ ServiceMediator class and methods are marked as deprecated
- ✅ Services prefer factories over ServiceMediator (with fallback to ServiceMediator)
- ✅ Logging is added when ServiceMediator methods are used
- ✅ Tests use factories where possible
- ✅ Factory pattern implemented for all circular dependencies:
  - ✅ FileSystemService ↔ PathService
  - ✅ ParserService ↔ ResolutionService
  - ✅ StateService ↔ StateTrackingService

## Goals

1. Remove all ServiceMediator usage from the codebase
2. Remove the ServiceMediator class and interface
3. Update DI configuration to remove ServiceMediator registration
4. Ensure all tests pass without ServiceMediator
5. Update documentation to reflect the new architecture

## Risk Assessment

### Potential Risks

1. **Test Failures**: Some tests might rely on ServiceMediator even if the production code doesn't
2. **Missed Dependencies**: Some services might use ServiceMediator in ways our search didn't find
3. **Integration Issues**: Services might interact differently without ServiceMediator
4. **Circular Dependencies**: New circular dependencies might emerge when removing ServiceMediator
5. **API Layer Dependencies**: High-level API code may still expect ServiceMediator methods to be available

### Mitigation Strategies

1. **Incremental Approach**: Remove ServiceMediator from one service at a time
2. **API-First Update**: Update API layer code before removing ServiceMediator from referenced services
3. **Comprehensive Testing**: Run tests after each change
4. **Rollback Plan**: Be prepared to revert changes if issues arise
5. **Logging**: Add temporary logging to track factory usage
6. **Dependency Analysis**: Carefully analyze each service's dependencies before making changes

***************************************
** MOST IMPORTANT THING ON THIS PAGE **
***************************************

Run ALL the tests EVERY time you make a change! 

ALL THE TESTS! EVERY TIME!

***************************************
** MOST IMPORTANT THING ON THIS PAGE **
***************************************

## Implementation Strategy

We've learned from initial test failures that we need to take a more careful approach that accounts for the dependencies in the API layer. Our revised strategy will:

1. ✅ Update high-level API code first (api/index.ts, api/run-meld.ts) to use factories instead of ServiceMediator
2. Only then remove ServiceMediator from individual services in a specific order
3. Maintain backward compatibility layers until all consumers are updated
4. Proceed with a more granular phase approach

## Service Inventory and Dependencies

Based on analysis of test failures, we need to be particularly careful about the following dependency relationships:

1. ✅ **API Layer → FileSystemService** - The API layer in api/index.ts and api/run-meld.ts directly calls `mediator.setFileSystemService()` and expects `services.filesystem.setMediator` to exist
2. **Core Circular Dependencies**:
   - ✅ ParserService ↔ ResolutionService  
   - ✅ FileSystemService ↔ PathService
   - 🚧 StateService ↔ StateTrackingService

## Revised Removal Order and Approach

We'll take an outside-in approach with specific dependency analysis to address StateService issues and API layer dependencies. The updated approach takes into account the deeper dependency relationships between services:

1. **Phase 5.1: API Layer Updates** ✅
   - ✅ Update api/index.ts and api/run-meld.ts to use the factory pattern instead of ServiceMediator
   - ✅ Add new helper methods for configuring services via factories
   - ✅ Identify explicit service dependencies in API layer
   - ✅ Maintain backward compatibility in the `main()` and `runMeld()` functions

2. **Phase 5.2: Service Tests Updates** 🚧
   - Update service-specific tests to use factories instead of ServiceMediator
   - Create helper utilities for common factory setup patterns
   - Maintain backward compatibility in services during this transition

3. **Phase 5.3: Low-Risk Service Removal** ✅
   - ✅ ParserService - Simplest to remove, minimal dependencies
   - ✅ VariableReferenceResolver - Depends on ResolutionService but can be updated independently
   
4. **Phase 5.4: Mid-Risk Service Removal** ✅
   - ✅ FileSystemService - Explicit API layer dependencies that must be addressed first
   - ✅ PathService - Related to FileSystemService, requires careful coordination
   
5. **Phase 5.5: High-Risk Service Removal** 🚧
   - 🚧 StateService - Complex integration with API layer and other services:
     - Issues found: The API layer explicitly sets `services.filesystem.setMediator(mediator)` and expects StateService to work with ServiceMediator
     - Has many dependencies with other services through ServiceMediator
     - Is used extensively in `createChildState()` and `clone()` methods
   - ResolutionService - Most complex, remove last

6. **Phase 5.6: Final Cleanup**
   - Remove ServiceMediator class and interface
   - Update DI configuration
   - Remove any lingering references to ServiceMediator

## Progress Summary

As of the latest update, we have successfully completed the following:

1. **API Layer Updates (Phase 5.1)**:
   - Updated `api/index.ts` to use service factories instead of ServiceMediator
   - Updated `api/run-meld.ts` to use service factories instead of ServiceMediator
   - Maintained backward compatibility by still initializing ServiceMediator
   - Added proper error handling for cases where factories are not available
   - All tests pass with these changes

2. **FileSystemService Updates**:
   - Kept the `setMediator` method for backward compatibility but marked it as deprecated
   - Updated to use `PathServiceClient` for path resolution instead of `ServiceMediator`
   - Properly initialized the factory and client
   - All tests pass with these changes

3. **PathService Updates**:
   - Kept the constructor parameter for `ServiceMediator` for backward compatibility
   - Updated to use `FileSystemServiceClient` for file system operations instead of `ServiceMediator`
   - Properly initialized the factory and client
   - All tests pass with these changes

4. **VariableReferenceResolver Updates**:
   - Added a third parameter to the constructor for `ServiceMediator` and marked it as deprecated
   - Updated to use `ParserServiceClient` instead of `ServiceMediator` for parsing
   - Properly initialized the factory and client
   - All tests pass with these changes

5. **ResolutionService Updates**:
   - Kept the constructor parameter for `ServiceMediator` for backward compatibility but marked it as deprecated
   - Updated to use various service clients instead of `ServiceMediator` for different operations
   - Added support for `FileSystemServiceClient` for file operations
   - All tests pass with these changes

These changes represent significant progress in our implementation plan. We've successfully updated the API layer to use factories instead of ServiceMediator while maintaining backward compatibility. This is a critical step as the API layer is a high-level component that interacts with many services.

## Detailed Implementation Plan

### Phase 5.1: API Layer Updates - COMPLETED ✅

#### Tasks:
1. ✅ Update api/index.ts to use service factories instead of ServiceMediator
   - ✅ Replace `mediator.setFileSystemService(services.filesystem)` and similar calls with factory pattern
   - ✅ Implement backward compatibility pattern to handle both new and old approaches
   - ✅ Add proper error handling for cases where factories are not available

2. ✅ Update api/run-meld.ts to use service factories
   - ✅ Replace the direct ServiceMediator access (`services.filesystem['serviceMediator']`)
   - ✅ Update initialization code to use factory pattern
   - ✅ Maintain backward compatibility during transition

3. ✅ Run tests to verify API functionality with the new approach
   - ✅ All API integration tests pass with the updated code

#### Testing:
```
npm test
```

#### Summary:
The API layer has been successfully updated to use service factories instead of ServiceMediator. We've maintained backward compatibility by still initializing ServiceMediator for services that might still depend on it. All tests are passing, which indicates that the changes are working correctly.

### Phase 5.2: Service Tests Updates

#### Tasks:
1. Update FileSystemService tests to use factory pattern instead of ServiceMediator
   - Replace mock ServiceMediator with mock PathServiceClientFactory
   - Update test setup to correctly initialize factories
   - Run tests to verify functionality

2. Update PathService tests to use factory pattern
   - Replace mock ServiceMediator with mock FileSystemServiceClientFactory
   - Update test setup to correctly initialize factories
   - Run tests to verify functionality

3. Update other service tests similarly
   - Focus on tests that directly interact with ServiceMediator
   - Create helper utilities for common factory setup patterns
   - Ensure all tests pass with the updated approach

#### Current Next Steps

- Complete the implementation updates for ResolutionService to fully remove ServiceMediator
- Update the StateService to remove ServiceMediator
- Proceed with the final cleanup phase to remove the ServiceMediator class and interface

#### Testing:
```
npm test services/fs/FileSystemService/FileSystemService.test.ts
npm test services/fs/PathService/PathService.test.ts
```

#### Rollback Plan:
If issues arise, revert changes to specific test files and investigate further.

### Phase 5.3: ParserService Removal - COMPLETED

#### Tasks:
1. ✅ Remove IServiceMediator import
2. ✅ Remove ServiceMediator injection in constructor
3. ✅ Remove setMediator method
4. ✅ Update resolveVariableReference method to only use ResolutionServiceClient
5. ✅ Remove any other references to mediator
6. ✅ Update API layer (api/index.ts and api/run-meld.ts) to not set ParserService in ServiceMediator
7. ✅ Update DI configuration (core/di-config.ts) to not pass ServiceMediator to ParserService constructor
8. ✅ Update DI configuration to not set ParserService in ServiceMediator

#### Testing:
1. ✅ Run ParserService tests:
   ```
   npm test services/pipeline/ParserService/ParserService.test.ts
   ```
2. ✅ Run related tests:
   ```
   npm test services/pipeline/ParserService
   ```
3. ✅ Run all tests to ensure no regressions:
   ```
   npm test
   ```

#### Summary:
The ParserService was already updated to use the factory pattern and no longer had any direct dependencies on ServiceMediator. We only needed to:
1. Update the API layer (api/index.ts and run-meld.ts) to not set the ParserService in the ServiceMediator
2. Update the DI configuration (core/di-config.ts) to not pass ServiceMediator to the ParserService constructor
3. Update the DI configuration to not set the ParserService in the ServiceMediator

All tests are passing, which means we've successfully removed the ServiceMediator dependency from the ParserService.

### Phase 5.3: VariableReferenceResolver Removal - COMPLETED

#### Tasks:
1. ✅ Remove IServiceMediator import
2. ✅ Remove ServiceMediator references
3. ✅ Update resolveNestedVariableReference method to only use ResolutionServiceClient
4. ✅ Ensure it only uses the factory pattern

#### Testing:
1. ✅ Run VariableReferenceResolver tests:
   ```
   npm test services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts
   ```
2. ✅ Run related tests:
   ```
   npm test services/resolution/ResolutionService/resolvers
   ```

#### Rollback Plan:
If issues arise, revert changes to VariableReferenceResolver.ts and investigate further.

### Phase 5.3: FileSystemService Removal - COMPLETED

#### Tasks:
1. ✅ Remove IServiceMediator import
2. ✅ Remove ServiceMediator injection in constructor
3. ✅ Remove setMediator method
4. ✅ Update resolvePath method to only use PathServiceClient
5. ✅ Remove any other references to serviceMediator

#### Testing:
1. ✅ Run FileSystemService tests:
   ```
   npm test services/fs/FileSystemService/FileSystemService.test.ts
   ```
2. ✅ Run related tests:
   ```
   npm test services/fs/FileSystemService
   ```

#### Rollback Plan:
If issues arise, revert changes to FileSystemService.ts and investigate further.

### Phase 5.4: PathService Removal - COMPLETED

#### Tasks:
1. ✅ Remove IServiceMediator import
2. ✅ Remove ServiceMediator injection in constructor
3. ✅ Update exists and isDirectory methods to only use FileSystemServiceClient
4. ✅ Remove any other references to serviceMediator

#### Testing:
1. ✅ Run PathService tests:
   ```
   npm test services/fs/PathService/PathService.test.ts
   ```
2. ✅ Run related tests:
   ```
   npm test services/fs/PathService
   ```

#### Rollback Plan:
If issues arise, revert changes to PathService.ts and investigate further.

### Phase 5.5: StateService Removal

#### Tasks:
1. Remove IServiceMediator import
2. Remove ServiceMediator injection in constructor
3. Update methods to only use StateTrackingServiceClient
4. Remove any other references to serviceMediator

#### Implementation Details:
```typescript
// Before
constructor(
  @inject(StateFactory) private readonly stateFactory: StateFactory,
  @inject('IStateEventService') private readonly eventService: IStateEventService,
  @inject('IStateTrackingService') private readonly stateTrackingService: IStateTrackingService,
  @inject('IServiceMediator') private readonly serviceMediator?: IServiceMediator,
  @inject('StateTrackingServiceClientFactory') private readonly stateTrackingClientFactory?: StateTrackingServiceClientFactory
) {
  // Register with mediator for backward compatibility
  if (this.serviceMediator) {
    this.serviceMediator.setStateService(this);
  }
  
  // Initialize factory lazily to avoid circular dependencies
  if (process.env.DEBUG === 'true') {
    console.log('StateService: Initialized with', {
      hasMediator: !!this.serviceMediator,
      hasFactory: !!this.stateTrackingClientFactory
    });
  }
}

// After
constructor(
  @inject(StateFactory) private readonly stateFactory: StateFactory,
  @inject('IStateEventService') private readonly eventService: IStateEventService,
  @inject('IStateTrackingService') private readonly stateTrackingService: IStateTrackingService,
  @inject('StateTrackingServiceClientFactory') private readonly stateTrackingClientFactory?: StateTrackingServiceClientFactory
) {
  // Initialize factory lazily to avoid circular dependencies
  if (process.env.DEBUG === 'true') {
    console.log('StateService: Initialized with', {
      hasFactory: !!this.stateTrackingClientFactory
    });
  }
}
```

```typescript
// Before - createChildState method
createChildState(): IStateService {
  // Try to use the factory first
  this.ensureFactoryInitialized();
  
  if (this.stateTrackingClient) {
    try {
      // Create a new state with the same factories
      const childState = this.stateFactory.createState();
      
      // Copy variables to the child state
      this.copyVariablesToState(childState);
      
      // Register the child state with the tracking service
      this.stateTrackingClient.registerChildState(childState);
      
      return childState;
    } catch (error) {
      logger.warn('Error using stateTrackingClient.registerChildState, falling back to ServiceMediator', { 
        error
      });
    }
  }
  
  // Fall back to mediator
  if (!this.serviceMediator) {
    // If no mediator, create a basic child state without tracking
    const childState = this.stateFactory.createState();
    this.copyVariablesToState(childState);
    return childState;
  }
  
  // Create a new state with the same factories
  const childState = this.stateFactory.createState();
  
  // Copy variables to the child state
  this.copyVariablesToState(childState);
  
  // Register the child state with the tracking service via mediator
  this.serviceMediator.registerChildState(childState);
  
  return childState;
}

// After - createChildState method
createChildState(): IStateService {
  // Ensure factory is initialized
  this.ensureFactoryInitialized();
  
  // Create a new state with the same factories
  const childState = this.stateFactory.createState();
  
  // Copy variables to the child state
  this.copyVariablesToState(childState);
  
  // Register the child state with the tracking service if client is available
  if (this.stateTrackingClient) {
    try {
      this.stateTrackingClient.registerChildState(childState);
    } catch (error) {
      logger.warn('Error using stateTrackingClient.registerChildState', { error });
    }
  } else {
    logger.warn('No StateTrackingClient available for child state registration');
  }
  
  return childState;
}
```

#### Testing:
1. Run StateService tests:
   ```
   npm test services/state/StateService/StateService.test.ts
   ```
2. Run related tests:
   ```
   npm test services/state
   ```
3. Run all tests to ensure no regressions:
   ```
   npm test
   ```

#### Rollback Plan:
If issues arise, revert changes to StateService.ts and investigate further.

### Phase 5.6: ResolutionService Removal

#### Tasks:
1. Remove IServiceMediator import
2. Remove ServiceMediator injection in constructor
3. Update methods to only use ParserServiceClient and other factory clients
4. Remove any other references to serviceMediator

#### Testing:
1. Run ResolutionService tests:
   ```
   npm test services/resolution/ResolutionService/ResolutionService.test.ts
   ```