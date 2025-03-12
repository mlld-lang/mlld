# Strategic Plan for ServiceMediator Removal

## Overview

This document outlines a strategic, phased approach to replacing the ServiceMediator pattern with a factory pattern for resolving circular dependencies in the Meld codebase. The ServiceMediator was implemented as a transitional solution during the TSyringe dependency injection migration, but it has several architectural drawbacks that we now need to address.

## Current Challenges

The ServiceMediator pattern has served us well during the DI migration, but it comes with significant drawbacks:

1. **Tight Coupling**: Multiple services are coupled to a single mediator, creating a central point of failure.
2. **Hidden Dependencies**: The true dependencies between services are obscured by the mediator.
3. **Null Check Proliferation**: Services must constantly check if the mediator and its services are initialized.
4. **Testing Complexity**: Testing requires mocking the entire mediator and all its methods.
5. **Maintenance Overhead**: Changes to one service interface can affect multiple components.

## Target Architecture: Factory Pattern

We will replace the ServiceMediator with a factory pattern that:

1. **Creates focused interfaces** that expose only the methods needed by each service
2. **Makes dependencies explicit** in service constructors
3. **Eliminates null checks** by ensuring dependencies exist when needed
4. **Simplifies testing** with smaller, more focused interfaces
5. **Reduces coupling** between services

## Key Files Reference

- **ServiceMediator**: `services/mediator/ServiceMediator.ts`
- **IServiceMediator**: `services/mediator/IServiceMediator.ts`
- **FileSystemService**: `services/fs/FileSystemService/FileSystemService.ts`
- **PathService**: `services/fs/PathService/PathService.ts`
- **ParserService**: `services/pipeline/ParserService/ParserService.ts`
- **ResolutionService**: `services/resolution/ResolutionService/ResolutionService.ts`
- **StateService**: `services/state/StateService/StateService.ts`
- **StateTrackingService**: `services/state/StateTrackingService/StateTrackingService.ts`
- **DI Container Config**: `core/di-config.ts`

## Implementation Strategy

The key to success is maintaining backward compatibility throughout the transition. We must ensure that all 1100+ tests continue to pass at each step of the implementation.

## Project Documentation

The following documents have been created to support this project:

### Planning Documents
- **[README-SERVICEMEDIATOR-REMOVAL.md](./README-SERVICEMEDIATOR-REMOVAL.md)**: Overview of the entire ServiceMediator removal project
- **[Phase 1 Summary](./phase1-summary.md)**: Summary of the work completed in Phase 1 and next steps

### Analysis Documents
- **[Circular Dependencies Analysis](./circular-dependencies-analysis.md)**: Comprehensive analysis of circular dependencies in the codebase
- **[FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md)**: Detailed implementation plan for the first circular dependency

### Phase 1: Preparation and Analysis (2 weeks) ✅

**Goal**: Thoroughly understand all circular dependencies and create a detailed implementation plan.

**Tasks**:
1. ✅ Create a comprehensive inventory of all circular dependencies in the codebase
   - FileSystemService ↔ PathService
   - ParserService ↔ ResolutionService
   - StateService ↔ StateTrackingService
   - Any others identified during analysis
2. ✅ Document all methods used through the ServiceMediator for each dependency pair
3. ✅ Identify test files that rely on ServiceMediator
4. ✅ Create minimal interface definitions for each service client
5. ✅ Design factory classes for each circular dependency
6. ✅ Update architecture documentation with the factory pattern approach

**Deliverables**:
- ✅ [Circular Dependencies Analysis](./circular-dependencies-analysis.md): Comprehensive analysis of all circular dependencies
- ✅ [FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md): Detailed implementation plan for the first circular dependency
- ✅ [Phase 1 Summary](./phase1-summary.md): Summary of the work completed and next steps

**Test Validation Checklist**:
- ✅ Verify inventory of circular dependencies is complete
- ✅ Confirm all ServiceMediator methods are documented
- ✅ Validate interface designs against actual service usage

**Exit Criteria**:
- ✅ Complete inventory of all circular dependencies
- ✅ Documented interface designs for all service clients
- ✅ Factory class designs for all circular dependencies
- ✅ Updated architecture documentation
- ✅ No changes to production code yet (all tests still pass)

**Current Status**: Phase 1 is complete. See [Phase 1 Summary](./phase1-summary.md) for details.

**Session Handoff Notes**:
- **What was completed**: [Summary of completed analysis work]
- **Current state**: [Description of the documented dependencies and interfaces]
- **Known issues**: [Any complex circular dependencies or edge cases discovered]
- **Next steps**: [Clear description of implementation priorities for Phase 2]

### Phase 2: Prototype Implementation (2 weeks) 🚧

**Goal**: Implement the factory pattern for one circular dependency pair while maintaining backward compatibility.

**Tasks**:
1. Implement the factory pattern for FileSystemService ↔ PathService:
   - Create `IPathServiceClient` and `IFileSystemServiceClient` interfaces
   - Implement `PathServiceClientFactory` and `FileSystemServiceClientFactory` classes
   - Register factories in the DI container
   - Update services to use factories while maintaining ServiceMediator compatibility
   - Add comprehensive unit tests for the new factories
2. Run all tests to verify functionality
3. Fix any issues that arise
4. Document the implementation pattern and lessons learned

**Implementation Plan**:
- Detailed implementation steps are documented in [FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md)

**Test Validation Checklist**:
1. Run unit tests for the updated FileSystemService and PathService
2. Run integration tests for all dependent services
3. Verify that both factory and mediator approaches work
4. Document any test failures and their resolutions

**Exit Criteria**:
- Factory pattern implemented for FileSystemService ↔ PathService
- All tests pass with the new implementation
- Services can use either factories or ServiceMediator
- Implementation pattern documented for other teams

**Current Status**: Phase 2 is in progress. Implementation is following the plan outlined in [FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md).

**Session Handoff Notes**:
- **What was completed**: Phase 1 analysis is complete, see [Phase 1 Summary](./phase1-summary.md)
- **Current state**: All circular dependencies have been documented in [Circular Dependencies Analysis](./circular-dependencies-analysis.md)
- **Known issues**: The StateService ↔ StateTrackingService dependency is less direct and may require a different approach
- **Next steps**: Proceed with Phase 2 implementation following the [FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md)

### Phase 3: Incremental Implementation (4 weeks)

**Goal**: Implement the factory pattern for all remaining circular dependencies.

**Implementation Sequence**:

1. **FileSystemService ↔ PathService** (already covered in Phase 2)

2. **ParserService ↔ ResolutionService**
   - Task 3.1: Create interfaces and factories
   - Task 3.2: Update ParserService to use factories
   - Task 3.3: Update ResolutionService to use factories
   - Task 3.4: Test and validate

3. **StateService ↔ StateTrackingService**
   - Task 3.5: Create interfaces and factories
   - Task 3.6: Update StateService to use factories
   - Task 3.7: Update StateTrackingService to use factories
   - Task 3.8: Test and validate

4. **Any other identified circular dependencies**
   - Follow the same pattern

**Test Validation Checklist** (after each service update):
1. Run unit tests for the updated service
2. Run integration tests for dependent services
3. Verify that both factory and mediator approaches work
4. Document any test failures and their resolutions

**Exit Criteria**:
- Factory pattern implemented for all circular dependencies
- All services can use either factories or ServiceMediator
- All tests pass with the new implementations
- Documentation updated for all implementations

**Session Handoff Notes**:
- **What was completed**: [Summary of completed implementations]
- **Current state**: [Description of which services now use the factory pattern]
- **Known issues**: [Any issues or edge cases discovered]
- **Next steps**: [Clear description of remaining implementation tasks]

### Phase 4: ServiceMediator Deprecation (2 weeks)

**Goal**: Mark ServiceMediator as deprecated and ensure all services primarily use factories.

**Tasks**:
1. Add deprecation notices to all ServiceMediator methods
2. Update services to prefer factories over ServiceMediator
3. Add logging when ServiceMediator methods are used
4. Update tests to use factories instead of ServiceMediator where possible
5. Run all tests and fix any issues

**Test Validation Checklist**:
1. Run the full test suite to verify functionality
2. Check logs to ensure ServiceMediator methods are properly flagged
3. Verify that services prefer factories over ServiceMediator
4. Document any test failures and their resolutions

**Exit Criteria**:
- ServiceMediator marked as deprecated
- All services prefer factories over ServiceMediator
- All tests pass with the updated implementation
- No new code uses ServiceMediator

**Session Handoff Notes**:
- **What was completed**: [Summary of deprecation work]
- **Current state**: [Description of ServiceMediator usage status]
- **Known issues**: [Any remaining dependencies on ServiceMediator]
- **Next steps**: [Clear description of removal strategy]

### Phase 5: ServiceMediator Removal (2 weeks)

**Goal**: Remove ServiceMediator from the codebase.

**Tasks**:
1. Remove ServiceMediator usage from one service at a time
2. Run tests after each removal
3. Fix any issues that arise
4. Remove ServiceMediator class and interface once all services are migrated
5. Update DI configuration to remove ServiceMediator registration
6. Run comprehensive test suite
7. Update documentation to reflect the removal

**Test Validation Checklist**:
1. Run unit tests after each service update
2. Run the full test suite after removing ServiceMediator
3. Verify that all services function correctly without ServiceMediator
4. Document any test failures and their resolutions

**Exit Criteria**:
- ServiceMediator completely removed from the codebase
- All services use factories exclusively
- All tests pass without ServiceMediator
- Documentation updated to reflect the new architecture

**Session Handoff Notes**:
- **What was completed**: [Summary of removal work]
- **Current state**: [Description of the final architecture]
- **Known issues**: [Any issues discovered during final testing]
- **Next steps**: [Any follow-up tasks or optimizations]

## Detailed Implementation Example

### FileSystemService ↔ PathService Implementation

#### Step 1: Create Minimal Interfaces

```typescript
// services/fs/PathService/interfaces/IPathServiceClient.ts
export interface IPathServiceClient {
  resolvePath(path: string): string;
  normalizePath(path: string): string;
}

// services/fs/FileSystemService/interfaces/IFileSystemServiceClient.ts
export interface IFileSystemServiceClient {
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}
```

#### Step 2: Implement Factories

```typescript
// services/fs/PathService/factories/PathServiceClientFactory.ts
@injectable()
@Service({
  description: 'Factory for creating path service clients'
})
export class PathServiceClientFactory {
  constructor(@inject('IPathService') private pathService: IPathService) {}
  
  createClient(): IPathServiceClient {
    return {
      resolvePath: (path) => this.pathService.resolvePath(path),
      normalizePath: (path) => this.pathService.normalizePath(path)
    };
  }
}

// services/fs/FileSystemService/factories/FileSystemServiceClientFactory.ts
@injectable()
@Service({
  description: 'Factory for creating file system service clients'
})
export class FileSystemServiceClientFactory {
  constructor(@inject('IFileSystemService') private fs: IFileSystemService) {}
  
  createClient(): IFileSystemServiceClient {
    return {
      isDirectory: (path) => this.fs.isDirectory(path),
      exists: (path) => this.fs.exists(path)
    };
  }
}
```

#### Step 3: Register Factories in DI Container

```typescript
// In di-config.ts
container.register('PathServiceClientFactory', { useClass: PathServiceClientFactory });
container.register('FileSystemServiceClientFactory', { useClass: FileSystemServiceClientFactory });
```

#### Step 4: Update Services to Use Factories

```typescript
// Update FileSystemService
export class FileSystemService implements IFileSystemService {
  private pathClient?: IPathServiceClient;
  
  constructor(
    @inject('IPathOperationsService') private pathOps: IPathOperationsService,
    @inject('IServiceMediator') private serviceMediator?: IServiceMediator,
    @inject('PathServiceClientFactory') pathClientFactory?: PathServiceClientFactory,
    @inject('IFileSystem') private fs: IFileSystem = new NodeFileSystem()
  ) {
    // Register with mediator for backward compatibility
    if (this.serviceMediator) {
      this.serviceMediator.setFileSystemService(this);
    }
    
    // Use factory if available (new approach)
    if (pathClientFactory) {
      this.pathClient = pathClientFactory.createClient();
    }
  }
  
  private resolvePath(filePath: string): string {
    // Try new approach first
    if (this.pathClient) {
      return this.pathClient.resolvePath(filePath);
    }
    
    // Fall back to mediator for backward compatibility
    if (this.serviceMediator) {
      return this.serviceMediator.resolvePath(filePath);
    }
    
    // Last resort fallback
    return filePath;
  }
}

// Update PathService similarly
```

## Risk Mitigation Strategies

1. **Incremental Implementation**: Implement one circular dependency at a time
2. **Backward Compatibility**: Maintain ServiceMediator support during transition
3. **Comprehensive Testing**: Run all tests after each change
4. **Logging**: Add logging to track usage of deprecated methods
5. **Rollback Plan**: Be prepared to revert changes if issues arise
6. **Documentation**: Keep documentation updated throughout the process

## Testing Strategy

1. **Unit Tests**: Create unit tests for each new factory
2. **Integration Tests**: Ensure services work together with the new factories
3. **Regression Tests**: Run the full test suite after each change
4. **Compatibility Tests**: Verify both factory and mediator approaches work during transition
5. **Performance Tests**: Measure any performance impact of the changes

## Timeline and Resources

- **Total Duration**: 12 weeks
- **Resources Required**: 
  - 1-2 developers familiar with the codebase
  - Code reviewers for each phase
  - Test environment for continuous integration

## Success Metrics

1. **Code Quality**: Reduction in null checks and conditional logic
2. **Test Stability**: All tests pass throughout the transition
3. **Architectural Improvement**: Clearer dependencies between services
4. **Maintainability**: Easier to understand and modify service relationships
5. **Complete Removal**: ServiceMediator completely removed from the codebase

## Conclusion

This phased approach to replacing the ServiceMediator with a factory pattern will improve the architecture of the Meld codebase while maintaining stability throughout the transition. By focusing on one circular dependency at a time and maintaining backward compatibility, we can ensure that all tests continue to pass at each step of the implementation.

The factory pattern provides a more modular, maintainable solution to circular dependencies that aligns with our architectural goals and dependency injection approach. Once implemented, it will make the codebase easier to understand, test, and maintain. 