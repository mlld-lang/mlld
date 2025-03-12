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

## Revised Implementation Strategy

We've learned from initial test failures that we need to take a more careful approach that accounts for the dependencies in the API layer. Our revised strategy will:

1. Update high-level API code first (api/index.ts, api/run-meld.ts) to use factories instead of ServiceMediator
2. Only then remove ServiceMediator from individual services in a specific order
3. Maintain backward compatibility layers until all consumers are updated
4. Proceed with a more granular phase approach

## Service Inventory and Dependencies

Based on analysis of test failures, we need to be particularly careful about the following dependency relationships:

1. **API Layer → FileSystemService** - The API layer in api/index.ts and api/run-meld.ts directly calls `mediator.setFileSystemService()` and expects `services.filesystem.setMediator` to exist
2. **Core Circular Dependencies**:
   - ParserService ↔ ResolutionService  
   - FileSystemService ↔ PathService
   - StateService ↔ StateTrackingService

## Revised Removal Order and Approach

We'll take an outside-in approach with specific dependency analysis to address StateService issues and API layer dependencies. The updated approach takes into account the deeper dependency relationships between services:

1. **Phase 5.1: API Layer Updates**
   - Update api/index.ts and api/run-meld.ts to use the factory pattern instead of ServiceMediator
   - Add new helper methods for configuring services via factories
   - Identify explicit service dependencies in API layer
   - Maintain backward compatibility in the `main()` and `runMeld()` functions

2. **Phase 5.2: Service Tests Updates**
   - Update service-specific tests to use factories instead of ServiceMediator
   - Create helper utilities for common factory setup patterns
   - Maintain backward compatibility in services during this transition

3. **Phase 5.3: Low-Risk Service Removal**
   - ParserService - Simplest to remove, minimal dependencies
   - ✅ VariableReferenceResolver - Depends on ResolutionService but can be updated independently
   
4. **Phase 5.4: Mid-Risk Service Removal**
   - ✅ FileSystemService - Explicit API layer dependencies that must be addressed first
   - ✅ PathService - Related to FileSystemService, requires careful coordination
   
5. **Phase 5.5: High-Risk Service Removal**
   - StateService - Complex integration with API layer and other services:
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

1. **FileSystemService Updates**:
   - Kept the `setMediator` method for backward compatibility but marked it as deprecated
   - Updated to use `PathServiceClient` for path resolution instead of `ServiceMediator`
   - Properly initialized the factory and client
   - All tests pass with these changes

2. **PathService Updates**:
   - Kept the constructor parameter for `ServiceMediator` for backward compatibility
   - Updated to use `FileSystemServiceClient` for file system operations instead of `ServiceMediator`
   - Properly initialized the factory and client
   - All tests pass with these changes

3. **VariableReferenceResolver Updates**:
   - Added a third parameter to the constructor for `ServiceMediator` and marked it as deprecated
   - Updated to use `ParserServiceClient` instead of `ServiceMediator` for parsing
   - Properly initialized the factory and client
   - All tests pass with these changes

4. **ResolutionService Updates**:
   - Kept the constructor parameter for `ServiceMediator` for backward compatibility but marked it as deprecated
   - Updated to use various service clients instead of `ServiceMediator` for different operations
   - Added support for `FileSystemServiceClient` for file operations
   - All tests pass with these changes

These changes represent significant progress in Phase 5.3 of our implementation plan. We're maintaining backward compatibility while systematically removing `ServiceMediator` dependencies.

## Detailed Implementation Plan

### Phase 5.1: API Layer Updates

#### Tasks:
1. Update api/index.ts to use service factories instead of ServiceMediator
   - Replace `mediator.setFileSystemService(services.filesystem)` and similar calls with factory pattern
   - Implement backward compatibility pattern to handle both new and old approaches
   - Add proper error handling for cases where factories are not available

2. Update api/run-meld.ts to use service factories
   - Replace the direct ServiceMediator access (`services.filesystem['serviceMediator']`)
   - Update initialization code to use factory pattern
   - Maintain backward compatibility during transition

3. Add tests to verify API functionality with the new approach
   - Ensure all API integration tests pass with the updated code
   - Add specific tests for factory pattern usage

#### Testing:
```
npm test api/
```

#### Rollback Plan:
If issues arise, revert changes to api/index.ts and api/run-meld.ts and investigate further.

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

#### Testing:
1. Run StateService tests:
   ```
   npm test services/state/StateService/StateService.test.ts
   ```
2. Run related tests:
   ```
   npm test services/state
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
2. Run related tests:
   ```
   npm test services/resolution
   ```

#### Rollback Plan:
If issues arise, revert changes to ResolutionService.ts and investigate further.

### Phase 5.7: Remove ServiceMediator Registration

#### Tasks:
1. Update DI configuration in core/di-config.ts to remove ServiceMediator registration
2. Run full test suite to verify functionality

#### Testing:
```
npm test
```

#### Rollback Plan:
If issues arise, revert changes to core/di-config.ts and investigate further.

### Phase 5.8: Remove ServiceMediator Files

#### Tasks:
1. Remove ServiceMediator files:
   - services/mediator/ServiceMediator.ts
   - services/mediator/IServiceMediator.ts
   - services/mediator/index.js
2. Run full test suite to verify functionality

#### Testing:
```
npm test
```

#### Rollback Plan:
If issues arise, restore the removed files and investigate further.

### Phase 5.9: Update Documentation

#### Tasks:
1. Update architecture documentation to reflect the removal of ServiceMediator
2. Update developer guides to focus on the factory pattern for circular dependencies
3. Update any examples that might reference ServiceMediator

## Implementation Details for Each Service

### ParserService Implementation

```typescript
// Before
constructor(@inject('IServiceMediator') mediator?: IServiceMediator) {
  this.mediator = mediator;
  
  if (this.mediator) {
    this.mediator.setParserService(this);
  }
  
  // We'll initialize the factory lazily to avoid circular dependencies
  if (process.env.DEBUG === 'true') {
    console.log('ParserService: Initialized with', {
      hasMediator: !!this.mediator
    });
  }
}

// After
constructor() {
  // We'll initialize the factory lazily to avoid circular dependencies
  if (process.env.DEBUG === 'true') {
    console.log('ParserService: Initialized');
  }
}
```

```typescript
// Before - resolveVariableReference method
async resolveVariableReference(node: any, context: ResolutionContext): Promise<any> {
  try {
    // Ensure factory is initialized
    this.ensureFactoryInitialized();
    
    // Try to use the resolution client
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolve(node, context);
      } catch (error) {
        logger.warn('Error using resolutionClient.resolve', { 
          error, 
          node 
        });
      }
    }
    
    // Fall back to mediator
    if (!this.mediator) {
      logger.warn('No mediator available for variable transformation');
      return node;
    }
    
    // Use the mediator to resolve the variable
    const result = await this.mediator.resolveVariableReference(node, {
      context,
      allowUndefined: true
    });

    // Create a text node with the resolved value
    return {
      type: 'text',
      value: String(result),
      location: node.location
    };
  } catch (error) {
    logger.warn('Failed to transform variable node', { error, node });
    return node;
  }
}

// After - resolveVariableReference method
async resolveVariableReference(node: any, context: ResolutionContext): Promise<any> {
  try {
    // Ensure factory is initialized
    this.ensureFactoryInitialized();
    
    // Try to use the resolution client
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolve(node, context);
      } catch (error) {
        logger.warn('Error using resolutionClient.resolve', { 
          error, 
          node 
        });
      }
    }
    
    // If we get here, we couldn't resolve the variable
    logger.warn('No resolution client available for variable transformation');
    return node;
  } catch (error) {
    logger.warn('Failed to transform variable node', { error, node });
    return node;
  }
}
```

### FileSystemService Implementation

```typescript
// Before
constructor(
  @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
  @inject('IServiceMediator') private readonly serviceMediator: IServiceMediator,
  @inject('IFileSystem') fileSystem?: IFileSystem,
  @inject('PathServiceClientFactory') private readonly pathClientFactory?: PathServiceClientFactory
) {
  // Set file system implementation
  this.fs = fileSystem || new NodeFileSystem();
  
  // Register this service with the mediator for backward compatibility
  if (this.serviceMediator) {
    this.serviceMediator.setFileSystemService(this);
  }
  
  // Use factory if available (new approach)
  if (this.pathClientFactory && typeof this.pathClientFactory.createClient === 'function') {
    try {
      this.pathClient = this.pathClientFactory.createClient();
      logger.debug('Successfully created PathServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create PathServiceClient, falling back to ServiceMediator', { error });
    }
  } else {
    logger.debug('PathServiceClientFactory not available or invalid, using ServiceMediator for path operations');
  }
}

// After
constructor(
  @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
  @inject('IFileSystem') fileSystem?: IFileSystem,
  @inject('PathServiceClientFactory') private readonly pathClientFactory?: PathServiceClientFactory
) {
  // Set file system implementation
  this.fs = fileSystem || new NodeFileSystem();
  
  // Initialize path client if factory is available
  if (this.pathClientFactory && typeof this.pathClientFactory.createClient === 'function') {
    try {
      this.pathClient = this.pathClientFactory.createClient();
      logger.debug('Successfully created PathServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create PathServiceClient', { error });
    }
  }
}
```

```typescript
// Before - resolvePath method
private resolvePath(filePath: string): string {
  // Try new approach first (factory pattern)
  if (this.pathClient && typeof this.pathClient.resolvePath === 'function') {
    try {
      return this.pathClient.resolvePath(filePath);
    } catch (error) {
      logger.warn('Error using pathClient.resolvePath, falling back to ServiceMediator', { 
        error, 
        path: filePath 
      });
    }
  }
  
  // Fall back to mediator for backward compatibility
  if (this.serviceMediator) {
    return this.serviceMediator.resolvePath(filePath);
  }
  
  // Last resort fallback
  logger.warn('No path resolution service available, returning unresolved path', { path: filePath });
  return filePath;
}

// After - resolvePath method
private resolvePath(filePath: string): string {
  // Try to use the path client
  if (this.pathClient && typeof this.pathClient.resolvePath === 'function') {
    try {
      return this.pathClient.resolvePath(filePath);
    } catch (error) {
      logger.warn('Error using pathClient.resolvePath', { 
        error, 
        path: filePath 
      });
    }
  }
  
  // Last resort fallback
  logger.warn('No path resolution service available, returning unresolved path', { path: filePath });
  return filePath;
}
```

## Timeline and Resources

### Timeline

| Phase | Estimated Duration | Dependencies |
|-------|-------------------|--------------|
| 5.1: ParserService Removal | 1 day | None |
| 5.2: VariableReferenceResolver Removal | 1 day | None |
| 5.3: FileSystemService Removal | 1 day | None |
| 5.4: PathService Removal | 1 day | FileSystemService Removal |
| 5.5: StateService Removal | 2 days | None |
| 5.6: ResolutionService Removal | 2 days | ParserService, VariableReferenceResolver Removal |
| 5.7: Remove ServiceMediator Registration | 0.5 day | All service removals |
| 5.8: Remove ServiceMediator Files | 0.5 day | ServiceMediator Registration Removal |
| 5.9: Update Documentation | 1 day | Complete removal |
| **Total** | **10 days** | |

### Resources Required

- 1-2 developers familiar with the codebase
- Code reviewers for each phase
- Test environment for continuous integration

## Success Metrics

1. **Code Quality**: Reduction in code complexity and improved maintainability
2. **Test Stability**: All tests pass without ServiceMediator
3. **Architectural Improvement**: Clearer dependencies between services
4. **Maintainability**: Easier to understand and modify service relationships
5. **Complete Removal**: ServiceMediator completely removed from the codebase

## Conclusion

This phased approach to removing the ServiceMediator will improve the architecture of the Meld codebase while maintaining stability throughout the transition. By focusing on one service at a time and maintaining comprehensive testing, we can ensure that all tests continue to pass at each step of the implementation.

The factory pattern provides a more modular, maintainable solution to circular dependencies that aligns with our architectural goals and dependency injection approach. Once implemented, it will make the codebase easier to understand, test, and maintain.
