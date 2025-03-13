# ServiceMediator Removal Project

## Overview

This project aims to replace the ServiceMediator pattern with a factory pattern for resolving circular dependencies in the Meld codebase. The ServiceMediator was implemented as a transitional solution during the TSyringe dependency injection migration, but it has several architectural drawbacks that we now need to address.

## Motivation

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

## Implementation Progress

### FileSystemService ↔ PathService Implementation

We have successfully implemented the factory pattern for the FileSystemService ↔ PathService circular dependency:

1. **Created Client Interfaces**:
   - `IPathServiceClient`: Provides path resolution and normalization methods needed by FileSystemService
   - `IFileSystemServiceClient`: Provides file existence and directory checking methods needed by PathService

2. **Created Factory Classes**:
   - `PathServiceClientFactory`: Creates clients that delegate to PathService
   - `FileSystemServiceClientFactory`: Creates clients that delegate to FileSystemService

3. **Updated Services**:
   - FileSystemService now uses PathServiceClientFactory when available, with fallback to ServiceMediator
   - PathService now uses FileSystemServiceClientFactory when available, with fallback to ServiceMediator

4. **Updated Test Environment**:
   - TestContextDI now registers mock factories to support testing

### Implementation Insights

During implementation, we discovered several important insights:

1. **Constructor Injection Challenges**: Direct constructor injection of factories can cause circular dependency issues in tests. The DI container may not have all factories registered when services are being constructed.

2. **Container Resolution**: Using `container.resolve()` in the constructor is more robust than constructor injection for factories. This allows services to attempt to resolve factories at runtime without requiring them to be available at construction time.

3. **Graceful Degradation**: Implementing proper error handling and fallback mechanisms is essential for backward compatibility. Services should gracefully fall back to the ServiceMediator when factories are not available or fail.

4. **Incremental Testing**: The implementation needs to be incremental with thorough testing at each step to ensure backward compatibility is maintained.

5. **Test Environment Considerations**: Test environments may not have all factories registered, so services need to be resilient to missing factories.

## Project Documents

### Planning Documents

- [Strategic Plan for ServiceMediator Removal](./RM-SERVICEMEDIATOR.md) - The overall strategic plan for the project
- [Phase 1 Summary](./phase1-summary.md) - Summary of the work completed in Phase 1 and next steps

### Analysis Documents

- [Circular Dependencies Analysis](./circular-dependencies-analysis.md) - Comprehensive analysis of circular dependencies in the codebase
- [FileSystemService ↔ PathService Implementation Plan](./filesystem-path-factory-implementation-plan.md) - Detailed implementation plan for the first circular dependency

### Architecture Documents

- [DI Architecture](../../docs/dev/DI-ARCHITECTURE.md) - Overview of the dependency injection architecture in Meld

## Implementation Phases

The project is divided into five phases:

### Phase 1: Preparation and Analysis ✅

- Identify all circular dependencies in the codebase
- Document methods used through the ServiceMediator
- Design minimal client interfaces
- Create implementation plan

### Phase 2: Prototype Implementation (In Progress)

- Implement factory pattern for FileSystemService ↔ PathService ✅
- Create client interfaces and factories ✅
- Update services to use factories ✅
- Run tests to verify functionality ✅
- Document implementation pattern and lessons learned ✅
- Next: Implement factory pattern for ParserService ↔ ResolutionService 🚧

### Phase 3: Incremental Implementation

- Implement factory pattern for ParserService ↔ ResolutionService
- Implement factory pattern for StateService ↔ StateTrackingService
- Implement factory pattern for any other identified circular dependencies
- Run tests after each implementation

### Phase 4: ServiceMediator Deprecation

- Mark ServiceMediator as deprecated
- Update services to prefer factories over ServiceMediator
- Add logging when ServiceMediator methods are used
- Update tests to use factories instead of ServiceMediator

### Phase 5: ServiceMediator Removal

- Remove ServiceMediator usage from services
- Remove ServiceMediator class and interface
- Update DI configuration
- Run comprehensive test suite
- Update documentation

## Benefits

The factory pattern approach will bring several benefits to the codebase:

1. **Clear Dependencies**: Services explicitly state what they need through focused interfaces
2. **Interface Segregation**: Services only get access to the specific methods they need
3. **No Null Checks**: Factory creates clients at initialization time, eliminating null checks
4. **Simpler Testing**: Small, focused interfaces are easier to mock
5. **Reduced Tight Coupling**: Services are coupled only to minimal interfaces, not to a central mediator
6. **Improved Code Readability**: Code intent becomes clearer when using direct method calls
7. **Better Maintainability**: Changes to service interfaces won't affect all dependent services

## Backward Compatibility

Throughout the implementation, we will maintain backward compatibility by:

1. Keeping the ServiceMediator registration and usage
2. Adding the factory pattern as an alternative
3. Preferring the factory pattern when available
4. Falling back to the ServiceMediator when the factory is not available
5. Adding comprehensive error handling and logging

This approach ensures that existing code continues to work while we transition to the new pattern.

## Contributing

If you're working on this project, please follow these guidelines:

1. Make small, focused commits that address specific issues
2. Include comprehensive tests with each change
3. Document architectural decisions and their rationale
4. Run the full test suite after each significant change
5. Update documentation alongside code changes

## Current Status

- Phase 1 (Preparation and Analysis) is complete ✅
- Phase 2 (Prototype Implementation) is in progress 🚧
  - FileSystemService ↔ PathService implementation is complete ✅
  - ParserService ↔ ResolutionService implementation is next 🚧
- See [Phase 1 Summary](./phase1-summary.md) for details on current status and next steps 