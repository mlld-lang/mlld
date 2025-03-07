# Phase 3: Incremental Service Migration

This phase focuses on methodically updating services one at a time to fully support dependency injection while still maintaining dual-mode support for backward compatibility.

## Objectives

1. Decorate all services with the `@Service()` decorator
2. Implement proper constructor injection for dependencies
3. Update related tests to work with both modes
4. Track migration progress service by service

## Tasks

### 1. Service Prioritization and Dependency Mapping

**Objective**: Identify service dependencies and create a migration order.

**Implementation**:
- [ ] Map service dependencies to identify natural layers
- [ ] Create a prioritized list starting with foundational services
- [ ] Identify services with circular dependencies for special handling
- [ ] Group related services that should be migrated together

**Success Criteria**:
- Clear understanding of service dependencies
- Prioritized migration order that minimizes disruption
- Identification of potential challenges

### 2. Foundational Services Migration

**Objective**: Update foundation services with minimal dependencies.

**Implementation**:
- [ ] Apply `@Service()` decorator to each service
- [ ] Implement proper constructor injection
- [ ] Update tests to work with both DI and non-DI modes
- [ ] Document any service-specific patterns

**Target Services**:
- [ ] LoggingService
- [ ] PathOperationsService
- [ ] ConfigurationService
- [ ] Other foundational services

**Example Implementation**:
```typescript
@Service({
  description: 'Service for handling path operations',
  dependencies: [
    { token: 'IFileSystemService', name: 'fileSystem' }
  ]
})
export class PathOperationsService implements IPathOperationsService {
  private fileSystem: IFileSystemService;

  constructor(@inject('IFileSystemService') fileSystem?: IFileSystemService) {
    this.initializeFromParams(fileSystem);
  }

  private initializeFromParams(fileSystem?: IFileSystemService): void {
    if (fileSystem) {
      // DI mode
      this.initializeDIMode(fileSystem);
    } else {
      // Legacy mode
      this.initializeLegacyMode();
    }
  }

  private initializeDIMode(fileSystem: IFileSystemService): void {
    this.fileSystem = fileSystem;
  }

  private initializeLegacyMode(): void {
    this.fileSystem = new FileSystemService();
  }

  // Methods...
}
```

**Success Criteria**:
- Foundation services fully support DI
- Tests pass in both DI and non-DI modes
- Clear pattern established for service migration

### 3. Intermediate Services Migration

**Objective**: Update services with moderate dependency complexity.

**Implementation**:
- [ ] Apply `@Service()` decorator with detailed metadata
- [ ] Use TSyringe's `@inject()` for all dependencies
- [ ] Handle circular dependencies with `@delay()`
- [ ] Update tests to support both modes

**Target Services**:
- [ ] FileSystemService
- [ ] ValidationService
- [ ] EventService
- [ ] Other intermediate services

**Success Criteria**:
- Intermediate services fully support DI
- Circular dependencies are properly handled
- Tests pass in both modes

### 4. Complex Services Migration

**Objective**: Update services with complex dependency graphs.

**Implementation**:
- [ ] Apply `@Service()` decorator with comprehensive metadata
- [ ] Handle complex initialization patterns
- [ ] Address circular dependencies with delayed resolution
- [ ] Update tests with appropriate mock registrations

**Target Services**:
- [ ] DirectiveService
- [ ] InterpreterService
- [ ] StateService
- [ ] ResolutionService

**Handling Circular Dependencies**:
```typescript
@Service({
  description: 'Service for processing directives',
  dependencies: [
    { token: 'IStateService', name: 'stateService' },
    { token: 'IInterpreterService', name: 'interpreterService', circular: true }
  ]
})
export class DirectiveService implements IDirectiveService {
  private stateService: IStateService;
  private interpreterService: IInterpreterService;

  constructor(
    @inject('IStateService') stateService?: IStateService,
    @delay() @inject('IInterpreterService') interpreterService?: IInterpreterService
  ) {
    this.initializeFromParams(stateService, interpreterService);
  }

  // Initialization methods...
}
```

**Success Criteria**:
- Complex services fully support DI
- Circular dependencies are properly handled
- Tests pass in both modes

### 5. Migration Tracking

**Objective**: Track migration progress and identify remaining work.

**Implementation**:
- [ ] Create a spreadsheet or document tracking migration status
- [ ] Record issues encountered during migration
- [ ] Document any service-specific patterns or exceptions
- [ ] Update the main README with progress

**Success Criteria**:
- Clear visibility into migration progress
- Documentation of challenges and solutions
- Updated README reflecting current status

## Current Status

- Created service dependency map and migration order
- Migrated foundation services with minimal dependencies:
  - ✅ PathOperationsService (already complete)
  - ✅ ProjectPathResolver
  - ✅ StateFactory
  - ✅ StateEventService
  - ✅ StateService
  - ✅ ValidationService (already complete)
- Migrated core pipeline services:
  - ✅ FileSystemService (already complete)
  - ✅ ParserService
  - ✅ InterpreterService
- Started tracking migration progress by service

### Notes on InterpreterService Migration

The InterpreterService already had most of the DI infrastructure in place:
- It already used the `@inject()` decorator for constructor parameters
- It had the `@Service()` decorator with proper metadata
- It already handled circular dependencies with DirectiveService using setTimeout

To complete the migration, we:
1. Added the `@injectable()` decorator to the class
2. Updated the unit tests to support both DI and non-DI modes
3. Updated integration tests to run in both modes, verifying the service works correctly
4. Verified DI container properly resolved circular dependencies between InterpreterService and DirectiveService

The InterpreterService required special handling due to its circular dependency with DirectiveService. It uses setTimeout in its constructor to delay the assignment of dependencies, allowing the circular dependency to be resolved.

## Next Steps

1. Continue with Core Pipeline services:
   - [x] DirectiveService
   - [ ] OutputService
   - [ ] ResolutionService
2. Document patterns as we go for service-specific requirements
3. Track progress and update documentation regularly

### Notes on DirectiveService Migration

The DirectiveService already had most of the TSyringe infrastructure in place:
- It was already using the `@inject()` decorator for parameters
- It had the `@Service()` decorator with appropriate metadata

To complete the migration, we:
1. Added the `@injectable()` decorator to the class
2. Marked the InterpreterService dependency as circular in the metadata
3. Updated the test to properly support both DI and non-DI modes
4. Used setTimeout for the circular dependency with InterpreterService (similar to how InterpreterService handles it)

The DirectiveService has a circular dependency with InterpreterService, which required special handling. Each service has to set up the other's reference in a setTimeout call to allow both to be fully initialized.

## Related Documents

- [Service Initialization Patterns](../reference/service-initialization-patterns.md)
- [Constructor Simplification](../reference/constructor-simplification.md)
- [DI Documentation](../reference/di-documentation.md) 