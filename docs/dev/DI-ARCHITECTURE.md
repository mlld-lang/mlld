# Meld Architecture

## INTRODUCTION

Meld is a specialized, directive-based scripting language designed for embedding small "@directives" inside an otherwise plain text (e.g., Markdown-like) document. The code in this repository implements:

• Meld grammar rules and token types (e.g., text directives, path directives, data directives).  
• The parsing layer that converts Meld content into an AST (Abstract Syntax Tree).  
• A directive interpretation layer that processes these AST nodes and manipulates internal "states" to store variables and more.  
• A resolution layer to handle variable references, path expansions, data manipulations, etc.  
• Testing utilities and an in-memory FS (memfs) to simulate filesystems for thorough testing.  

The main idea:  
1. Meld code is parsed to an AST.  
2. Each directive node is validated and interpreted, updating a shared "state" (variables, data structures, commands, etc.).  
3. Optional transformations (e.g., output formatting) generate final representations (Markdown, LLM-friendly XML, etc.).  

Below is an overview of the directory and service-level architecture, referencing code from this codebase.

## DEPENDENCY INJECTION ARCHITECTURE

Meld uses TSyringe for dependency injection, which brings the following benefits:

• Decoupled service creation from service usage
• Simplified testing with mock injections
• Clear dependencies between services
• Centralized service configuration

### DI Core Concepts

1. **Service Registration**: Services are registered with the DI container via the `@Service()` decorator, which handles automatic registration with the container.

2. **Dependency Injection**: Services declare their dependencies using constructor parameters with the `@inject()` decorator, allowing the container to provide the correct dependencies.

3. **Container Resolution**: The container automatically resolves dependencies when creating instances, managing the entire dependency tree.

4. **Interface-based Design**: Services follow an interface-first design pattern, where each service implements an interface (e.g., `IFileSystemService`) and dependencies are declared using interface tokens.

5. **Circular Dependency Handling**: Circular dependencies are managed through the ServiceMediator pattern, which acts as an intermediary between services with circular dependencies.

### DI Configuration

The core DI configuration is managed in `core/di-config.ts`, which:

1. Configures the global container
2. Registers core services with circular dependencies
3. Connects services via the ServiceMediator
4. Registers remaining services using class registrations

## DIRECTORY & FILE STRUCTURE

At a high level, the project is arranged as follows (select key entries included):

project-root/  
 ├─ api/                    ← High-level API and tests  
 │   ├─ api.test.ts  
 │   └─ index.ts  
 ├─ bin/                    ← CLI entry point  
 │   └─ meld.ts  
 ├─ cli/                    ← CLI implementation  
 │   ├─ cli.test.ts  
 │   └─ index.ts  
 ├─ core/                   ← Core utilities and types  
 │   ├─ config/            ← Configuration (logging, etc.)  
 │   ├─ errors/            ← Error class definitions  
 │   │   ├─ MeldError.ts
 │   │   ├─ ServiceInitializationError.ts   ← Service initialization errors
 │   │   └─ ... other errors
 │   ├─ types/             ← Core type definitions  
 │   │   ├─ dependencies.ts  ← Service dependency definitions
 │   │   └─ index.ts
 │   ├─ utils/             ← Logging and utility modules  
 │   │   ├─ logger.ts
 │   │   ├─ serviceValidation.ts  ← Service validation utilities
 │   │   └─ simpleLogger.ts
 │   └─ ServiceProvider.ts ← DI service provider & helpers
 ├─ services/              ← Core service implementations  
 │   ├─ pipeline/          ← Main transformation pipeline  
 │   │   ├─ ParserService/     ← Initial parsing  
 │   │   ├─ InterpreterService/← Pipeline orchestration  
 │   │   ├─ DirectiveService/  ← Directive handling  
 │   │   │   ├─ handlers/  
 │   │   │   │   ├─ definition/   ← Handlers for definition directives  
 │   │   │   │   └─ execution/    ← Handlers for execution directives  
 │   │   │   └─ errors/  
 │   │   └─ OutputService/    ← Final output generation  
 │   ├─ state/             ← State management  
 │   │   ├─ StateService/      ← Core state management  
 │   │   └─ StateEventService/ ← Core event system  
 │   ├─ resolution/        ← Resolution and validation  
 │   │   ├─ ResolutionService/ ← Variable/path resolution  
 │   │   ├─ ValidationService/ ← Directive validation  
 │   │   └─ CircularityService/← Circular dependency detection  
 │   ├─ fs/                ← File system operations  
 │   │   ├─ FileSystemService/ ← File operations  
 │   │   ├─ PathService/      ← Path handling  
 │   │   └─ PathOperationsService/ ← Path utilities  
 │   ├─ mediator/          ← Circular dependency handling
 │   │   ├─ IServiceMediator.ts ← Mediator interface
 │   │   └─ ServiceMediator.ts ← Mediator implementation
 │   └─ cli/               ← Command line interface  
 │       └─ CLIService/    ← CLI entry point  
 ├─ tests/                  ← Test infrastructure   
 │   ├─ fixtures/          ← Test fixture data  
 │   ├─ mocks/             ← Test mock implementations  
 │   └─ utils/             ← Test utilities and helpers  
 │       ├─ debug/         ← Test debug utilities  
 │       │   ├─ StateDebuggerService/  
 │       │   ├─ StateVisualizationService/  
 │       │   ├─ StateHistoryService/  
 │       │   └─ StateTrackingService/  
 │       ├─ di/            ← DI test utilities
 │       │   ├─ TestContainerHelper.ts ← Container management for tests
 │       │   └─ TestContextDI.ts ← DI-enabled test context
 │       ├─ FixtureManager.ts  
 │       ├─ MemfsTestFileSystem.ts  
 │       ├─ ProjectBuilder.ts  
 │       ├─ TestContext.ts  
 │       └─ TestSnapshot.ts  
 ├─ docs/                   ← Documentation  
 ├─ package.json  
 ├─ tsconfig.json  
 ├─ tsup.config.ts  
 └─ vitest.config.ts  

Key subfolders:  
• services/pipeline/: Core transformation pipeline services (parsing, interpretation, directives, output)  
• services/state/: State management and event services  
• services/resolution/: Resolution, validation, and circularity detection services  
• services/fs/: File system, path handling, and operations services  
• services/mediator/: Handles circular dependencies between services
• services/cli/: Command line interface services  
• core/: Central types, errors, utilities, and DI service provider used throughout the codebase  
• tests/utils/: Test infrastructure including debug utilities, memfs implementation, fixture management, and test helpers  
• tests/utils/di/: DI-specific test utilities
• api/: High-level public API for using Meld programmatically  
• cli/: Command line interface for Meld  

## CORE LIBRARIES & THEIR ROLE

### meld-ast 
   • parse(content: string): MeldNode[]  
   • Basic parsing that identifies directives vs. text nodes.  
   • Produces an AST which other services manipulate.  

### llmxml 
   • Converts content to an LLM-friendly XML format or can parse partially.  
   • OutputService may call it if user requests "llm" format.  

### meld-spec
   • Contains interface definitions for MeldNode, DirectiveNode, TextNode, etc.  
   • Contains directive kind enumerations.  

### tsyringe
   • Provides the dependency injection container
   • Manages service creation and resolution
   • Handles dependencies between services

## HIGH-LEVEL FLOW

Below is a simplified flow of how Meld content is processed:

   ┌─────────────────────────────┐
   │   Meld Source Document      │
   └─────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────┐
   │ ParserService.parse(...)    │
   │   → uses meld-ast to parse  │
   └─────────────────────────────┘
                │ AST (MeldNode[])
                ▼
   ┌─────────────────────────────────────────────────┐
   │ InterpreterService.interpret(nodes, options)    │
   │   → For each node, pass to DirectiveService     │
   │   → Handles node transformations                │
   └─────────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ DirectiveService                         │
   │   → Routes to correct directive handler  │
   │   → Handlers can provide replacements    │
   └──────────────────────────────────────────┘
                │
                ▼
   ┌───────────────────────────────────────────────┐
   │ StateService + ResolutionService + Others     │
   │   → Stores variables and transformed nodes    │
   │   → Path expansions, data lookups, etc.       │
   └───────────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────────────────────┐
   │ OutputService                            │
   │   → Uses transformed nodes for output    │
   │   → Generates clean, directive-free      │
   │     markdown, LLM XML, or other formats  │
   └──────────────────────────────────────────┘

This flow is orchestrated through DI, where the container resolves all required services and their dependencies automatically. The DI container handles service creation, ensuring each service gets the dependencies it needs to function properly.

## MAJOR SERVICES (OVERVIEW)

Below are the key "services" in the codebase. Each follows the single responsibility principle and is registered with the DI container via the `@Service()` decorator:

### CLIService
   - Provides command-line interface for running Meld
   - Handles file watching and reprocessing
   - Manages format selection and output options
   - Routes to appropriate services based on CLI flags
   - Dependencies: ParserService, InterpreterService, OutputService, FileSystemService, PathService, StateService

### ParserService  
   - Wraps the meld-ast parse(content) function  
   - Adds location information with file paths (parseWithLocations)  
   - Produces an array of MeldNode objects  
   - Dependencies: ServiceMediator (for circular dependency with ResolutionService)

### DirectiveService  
   - Routes directives to the correct directive handler  
   - Validates directives using ValidationService  
   - Calls ResolutionService for variable resolution  
   - Updates StateService with directive execution results
   - Supports node transformation through DirectiveResult interface
   - Handlers can provide replacement nodes for transformed output
   - Dependencies: ValidationService, StateService, PathService, FileSystemService, ParserService, InterpreterService, CircularityService, ResolutionService

### InterpreterService  
   - Orchestrates the main interpret(nodes) pipeline  
   - For each AST node:
       a) If it's text, store it or pass it along  
       b) If it's a directive:
          - Calls DirectiveService for processing
          - Handles node transformations if provided
          - Updates state with transformed nodes
   - Maintains the top-level process flow
   - Supports transformation mode through feature flags
   - Dependencies: DirectiveService, StateService, ParserService, FileSystemService, PathService, CircularityService

### StateService  
   - Stores variables in maps:
       • textVars (for @text)  
       • dataVars (for @data)  
       • pathVars (for @path)  
       • commands (for @define)  
   - Tracks both original and transformed MeldNodes
   - Provides transformation capabilities for directive processing
   - Maintains transformation state during cloning
   - Provides child states for nested imports  
   - Supports immutability toggles  
   - Dependencies: StateFactory, StateEventService, StateTrackingService, ServiceMediator

### ResolutionService  
   - Handles all variable interpolation:
       • Variables ("{{var}}", "{{data.field}}")
       • Path expansions ("$HOMEPATH/path")  
       • Command references  
   - Context-aware resolution  
   - Circular reference detection  
   - Sub-fragment parsing support  
   - Dependencies: StateService, FileSystemService, ParserService, PathService, ServiceMediator

### CircularityService  
   - Prevents infinite import loops  
   - Detects circular variable references  
   - Maintains dependency graphs  
   - Dependencies: ResolutionService

### PathService  
   - Validates and normalizes paths  
   - Enforces path security constraints  
   - Handles path joining and manipulation  
   - Supports test mode for path operations  
   - Dependencies: ServiceMediator (for circular dependency with FileSystemService)

### ValidationService  
   - Validates directive syntax and constraints  
   - Provides extensible validator registration  
   - Throws MeldDirectiveError on validation failures  
   - Tracks available directive kinds  
   - Dependencies: ResolutionService

###  FileSystemService  
    - Abstracts file operations (read, write)  
    - Supports both real and test filesystems  
    - Handles path resolution and validation  
    - Dependencies: PathOperationsService, ServiceMediator (for circular dependency with PathService), IFileSystem

### OutputService  
    - Converts final AST and state to desired format
    - Uses transformed nodes when available
    - Supports markdown and LLM XML output  
    - Integrates with llmxml for LLM-friendly formatting  
    - Handles format-specific transformations
    - Provides clean output without directive definitions
    - Dependencies: StateService, ResolutionService

### ServiceMediator
    - Breaks circular dependencies between services
    - Acts as an intermediary for services that need to call each other
    - Provides proxy methods to access functionality from circular dependencies
    - Manages references to services with circular dependencies
    - No direct dependencies, but stores references to services that register with it

## TESTING INFRASTRUCTURE

All tests are heavily reliant on a memory-based filesystem (memfs) for isolation and speed. The major testing utilities include:

### TestContainerHelper
   - Manages DI containers for tests
   - Provides isolated container creation
   - Supports mock registration and service resolution
   - Handles container cleanup between tests
   - Detects container state leaks

### TestContextDI
   - Central test harness that extends TestContext with DI support
   - Creates a DI container for each test
   - Provides mock service registration
   - Supports child context creation
   - Ensures proper cleanup after tests
   - Resolves services from the container for testing

### MemfsTestFileSystem  
   - Thin wrapper around memfs  
   - Offers readFile, writeFile, mkdir, etc. with in-memory data  
   - Provides an ephemeral environment for all test IO  

### TestContext  
   - Base class for testing environment
   - Provides references to all major services
   - Allows writing files, snapshotting the FS, and comparing  

### TestSnapshot  
   - Takes "snapshots" of the current Memfs FS, storing a Map<filePath, content>  
   - Compares snapshots to detect added/removed/modified files  

### ProjectBuilder  
   - Creates mock "projects" in the in-memory FS from JSON structure  
   - Useful for complex, multi-file tests or large fixture-based testing  

### Node Factories  
   - Provides helper functions for creating AST nodes in tests  
   - Supports creating directive, text, and code fence nodes  
   - Includes location utilities for source mapping  

Testing Organization:
• tests/utils/: Core test infrastructure (MemFS, snapshots, contexts)  
• tests/utils/di/: DI-specific test utilities
• tests/mocks/: Minimal mocks and test doubles  
• tests/fixtures/: JSON-based test data  
• tests/services/: Service-specific integration tests  

Testing Approach:
• Each test uses TestContextDI to create a fresh container
• Direct service resolution from the container
• Mock registration for dependencies
• Isolated container state between tests
• Factory functions for creating test nodes and data
• Snapshots for tracking filesystem changes  

## DEBUGGING INFRASTRUCTURE

The codebase includes specialized debugging services located in `tests/utils/debug/` that help diagnose and troubleshoot state-related issues:

### StateDebuggerService
   - Provides debug session management and diagnostics
   - Tracks state operations and transformations
   - Offers operation tracing and analysis
   - Helps identify state manipulation issues

### StateVisualizationService
   - Generates visual representations of state
   - Creates Mermaid/DOT graphs of state relationships
   - Visualizes state metrics and transformations
   - Aids in understanding complex state changes

### StateHistoryService
   - Records chronological state changes
   - Maintains operation history
   - Tracks transformation chains
   - Enables state change replay and analysis

### StateTrackingService
   - Monitors state relationships and dependencies
   - Tracks state lineage and inheritance
   - Records metadata about state changes
   - Helps debug scope and inheritance issues

Debugging Approach:
• Services can be enabled selectively in tests
• Debug output includes detailed state snapshots
• Visual representations help understand complex states
• History tracking enables step-by-step analysis

These debugging services are particularly useful for:
• Troubleshooting complex state transformations
• Understanding directive processing chains
• Analyzing variable resolution paths
• Debugging scope inheritance issues
• Visualizing state relationships

## SERVICE RELATIONSHIPS AND DEPENDENCY INJECTION

Services in Meld follow a dependency graph managed through the DI container:

1. Base Services:
   - FileSystemService (depends on PathOperationsService, ServiceMediator)
   - PathService (depends on ServiceMediator)

2. State Management:
   - StateEventService (no dependencies)
   - StateService (depends on StateFactory, StateEventService, StateTrackingService, ServiceMediator)

3. Core Pipeline:
   - ParserService (depends on ServiceMediator)
   - ResolutionService (depends on StateService, FileSystemService, PathService, ServiceMediator)
   - ValidationService (depends on ResolutionService)
   - CircularityService (depends on ResolutionService)

4. Pipeline Orchestration:
   - DirectiveService (depends on multiple services)
   - InterpreterService (orchestrates others)

5. Output Generation:
   - OutputService (depends on StateService, ResolutionService)

6. Debug Support:
   - DebuggerService (optional, depends on all)

### Circular Dependencies

The codebase handles circular dependencies through the ServiceMediator pattern:

1. **FileSystemService ↔ PathService**:
   - FileSystemService needs PathService for path resolution
   - PathService needs FileSystemService to check if paths exist

2. **ParserService ↔ ResolutionService**:
   - ParserService needs ResolutionService to resolve variables
   - ResolutionService needs ParserService to parse content with variables

3. **StateService ↔ StateTrackingService**:
   - Complex relationship for state tracking and management

The ServiceMediator acts as an intermediary, storing references to these services and providing proxy methods to access functionality without direct circular references.

### Service Initialization

Services are initialized through the DI container, which handles creating all dependencies. The key initialization steps are:

1. The ServiceMediator is registered first to handle circular dependencies
2. Services with circular dependencies are created manually and connected through the mediator
3. These services are registered with the container
4. Remaining services are registered using class registrations
5. The DI container handles resolving services as needed during runtime

This initialization process is centralized in `core/di-config.ts`.

## EXAMPLE USAGE SCENARIO

1) Input: A .meld file with lines like:  
   @text greeting = "Hello"  
   @data config = { "value": 123 }  
   @import [ path = "other.meld" ]  

2) We load the file from disk.  
3) ParserService → parse the content → AST.  
4) InterpreterService → interpret(AST).  
   a) For each directive, DirectiveService → validation → resolution → update StateService.  
   b) If an import is encountered, CircularityService ensures no infinite loops.  
5) Once done, the final StateService has textVars.greeting = "Hello", dataVars.config = { value: 123 }, etc.  
6) OutputService can generate the final text or an LLM-XML representation.  

With DI, this flow is orchestrated through the container, which resolves all the required services and their dependencies automatically.

## ERROR HANDLING

• MeldDirectiveError thrown if a directive fails validation or interpretation.  
• MeldParseError if the parser cannot parse content.  
• PathValidationError for invalid paths.  
• ResolutionError for variable resolution issues.  
• MeldError as a base class for other specialized errors.  
• ServiceInitializationError for DI-related initialization failures.

These errors typically bubble up to the caller or test.  

## CONCLUSION

This codebase implements the entire Meld language pipeline:  
• Parsing Meld documents into an AST.  
• Validating & interpreting directives.  
• Storing data in a hierarchical state.  
• Resolving references (text, data, paths, commands).  
• (Optionally) generating final formatted output.  

The codebase uses TSyringe for dependency injection, which helps manage the complex relationships between services. The ServiceMediator pattern is used to handle circular dependencies between core services.

The test environment includes robust DI support with TestContextDI, allowing for isolated container testing, mock registration, and service resolution. The system adheres to SOLID design principles with interface-first design and clear separation of concerns.

# Dependency Injection in Meld

This document provides guidance on working with the dependency injection (DI) system in the Meld codebase.

## Overview

Meld uses [TSyringe](https://github.com/microsoft/tsyringe) for dependency injection. All services are registered and resolved through the DI container, which simplifies service initialization and testing.

## Core Concepts

### 1. Service Registration

Services are automatically registered with the DI container when they are decorated with the `@Service()` decorator:

```typescript
import { Service } from '@core/ServiceProvider';

@Service({
  description: 'Service that provides file system operations'
})
export class FileSystemService implements IFileSystemService {
  // Implementation...
}
```

The `@Service()` decorator registers the class with the container and adds some metadata for documentation purposes.

### 2. Dependency Injection

Services can inject their dependencies through constructor parameters:

```typescript
import { inject } from 'tsyringe';

@Service()
export class ResolutionService implements IResolutionService {
  constructor(
    @inject('IStateService') private stateService: IStateService,
    @inject('IFileSystemService') private filesystem: IFileSystemService,
    @inject('IParserService') private parser: IParserService,
    @inject('IPathService') private pathService: IPathService
  ) {}
  
  // Implementation...
}
```

### 3. Creating Services

Services should be created using the DI container, not with `new`:

```typescript
// CORRECT: Let the DI container create the service
import { container } from 'tsyringe';
const service = container.resolve(ServiceClass);

// CORRECT: Use the ServiceProvider helper
import { createService } from '@core/ServiceProvider';
const service = createService(ServiceClass);

// INCORRECT: Don't use 'new' directly
const service = new ServiceClass(); // Avoid this
```

## Best Practices

### Service Design

1. **Interface-First Design**: Define an interface for your service before implementing it
2. **Explicit Dependencies**: Always specify dependencies in the constructor
3. **Private Injection**: Use `private` in constructor parameters to store the dependencies
4. **Explicit Return Types**: Always provide return types for methods
5. **Proper Initialization**: Services should be fully initialized after construction

### Example Service

```typescript
import { inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';

// 1. Define the interface
export interface IExampleService {
  process(data: string): Promise<string>;
  getStatus(): string;
}

// 2. Implement the service
@Service({
  description: 'Example service that demonstrates best practices'
})
export class ExampleService implements IExampleService {
  // 3. Constructor injection with explicit dependencies
  constructor(
    @inject('IDependencyService') private dependency: IDependencyService,
    @inject('ILoggerService') private logger: ILoggerService
  ) {}

  // 4. Explicit return type
  async process(data: string): Promise<string> {
    this.logger.log('Processing data...');
    return this.dependency.transform(data);
  }

  getStatus(): string {
    return 'Ready';
  }
}
```

## Testing with DI

### Using TestContextDI

The `TestContextDI` class provides utilities for testing with DI:

```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('MyService', () => {
  let context: TestContextDI;
  
  beforeEach(() => {
    // Create a test context with DI
    context = TestContextDI.create();
  });
  
  afterEach(async () => {
    // Clean up resources
    await context.cleanup();
  });
  
  it('should process data correctly', async () => {
    // Register a mock dependency
    const mockDependency = { transform: vi.fn().mockReturnValue('transformed') };
    context.registerMock('IDependencyService', mockDependency);
    
    // Get the service from the container
    const service = context.container.resolve('IExampleService');
    
    // Test the service
    const result = await service.process('input');
    expect(result).toBe('transformed');
    expect(mockDependency.transform).toHaveBeenCalledWith('input');
  });
});
```

### Mocking Services

To register mock implementations:

```typescript
// Register a mock instance
context.registerMock('IServiceName', mockImplementation);

// Register a mock class
context.container.registerMockClass('IServiceName', MockClass);
```

## Common Patterns

### Dual-Mode Constructor Pattern

Meld services need to support both DI and non-DI modes. The recommended pattern is:

```typescript
/**
 * Constructor with DI annotations
 */
constructor(
  @inject(SomeFactory) factory?: SomeFactory,
  @inject('IService1') service1?: IService1,
  @inject('IService2') service2?: IService2
) {
  this.initializeFromParams(factory, service1, service2);
}

/**
 * Helper that chooses initialization path
 */
private initializeFromParams(
  factory?: SomeFactory,
  service1?: IService1,
  service2?: IService2
): void {
  if (factory) {
    this.initializeDIMode(factory, service1, service2);
  } else {
    this.initializeLegacyMode(service1, service2);
  }
}

/**
 * DI mode initialization
 */
private initializeDIMode(
  factory: SomeFactory,
  service1?: IService1,
  service2?: IService2
): void {
  this.factory = factory;
  this.service1 = service1;
  this.service2 = service2;
  // Additional initialization
}

/**
 * Legacy mode initialization
 */
private initializeLegacyMode(
  service1?: IService1,
  service2?: IService2
): void {
  // Create default dependencies
  this.factory = new SomeFactory();
  
  // Additional initialization
}
```

This pattern:
1. Keeps the constructor simple
2. Clearly separates DI and non-DI initialization logic
3. Makes maintenance easier
4. Preserves dual-mode functionality
5. Provides a clear path to eventually remove legacy mode

See `_dev/issues/features/service-initialization-patterns.md` for more examples.

### Factory Pattern

For services that need complex initialization or multiple instances:

```typescript
@Service()
export class ServiceFactory {
  constructor(
    @inject('IDependencyA') private depA: IDependencyA,
    @inject('IDependencyB') private depB: IDependencyB
  ) {}
  
  createService(config: ServiceConfig): IService {
    // Create a specialized instance with the given config
    // The factory can use its injected dependencies
    return new SpecializedService(this.depA, this.depB, config);
  }
}
```

### Service Providers

For centralized service registration:

```typescript
// In a central di-config.ts file:
import { container } from 'tsyringe';

// Register core services
container.register('FileSystemService', { useClass: FileSystemService });
container.register('IFileSystemService', { useToken: 'FileSystemService' });
```

## Dependency Resolution Patterns

### Circular Dependency Challenges

Circular dependencies occur when two or more services depend on each other, creating a dependency cycle:

- **FileSystemService ↔ PathService**: FileSystemService needs PathService for path resolution, while PathService needs FileSystemService to check if paths exist
- **ParserService ↔ ResolutionService**: ParserService needs ResolutionService to resolve variables, while ResolutionService needs ParserService to parse content
- **StateService ↔ StateTrackingService**: Complex bidirectional relationship for state tracking and management

### Service Mediator Pattern (Transitional Approach)

Initially, Meld used a ServiceMediator pattern to handle circular dependencies:

```typescript
@Service()
export class ServiceMediator implements IServiceMediator {
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;
  
  // Registration methods
  setFileSystemService(service: IFileSystemService): void {
    this.fileSystemService = service;
  }
  
  setPathService(service: IPathService): void {
    this.pathService = service;
  }
  
  // Proxy methods for FileSystem → Path
  resolvePath(path: string): string {
    if (!this.pathService) {
      throw new Error("PathService not initialized");
    }
    return this.pathService.resolvePath(path);
  }
  
  // Proxy methods for Path → FileSystem
  async isDirectory(path: string): Promise<boolean> {
    if (!this.fileSystemService) {
      throw new Error("FileSystemService not initialized");
    }
    return this.fileSystemService.isDirectory(path);
  }
}
```

Services would inject the mediator and register themselves:

```typescript
@Service()
export class FileSystemService implements IFileSystemService {
  constructor(
    @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
    @inject('ServiceMediator') private serviceMediator?: IServiceMediator
  ) {
    if (this.serviceMediator) {
      this.serviceMediator.setFileSystemService(this);
    }
  }
  
  private resolvePath(filePath: string): string {
    if (this.serviceMediator) {
      return this.serviceMediator.resolvePath(filePath);
    }
    return filePath;
  }
}
```

While this approach works, it has several drawbacks:
- **Tight Coupling**: All services with circular dependencies become coupled to the mediator
- **Hidden Dependencies**: Not clear which specific services a service actually needs
- **Null Checks Everywhere**: Services must check if the mediator exists and if requested services are registered
- **Testing Complexity**: Need to mock the entire mediator with all its methods
- **Maintenance Burden**: The mediator needs updating for every new circular dependency

### Client Factory Pattern (Recommended Approach)

The recommended pattern for handling circular dependencies is the Client Factory pattern:

1. Create minimal client interfaces that expose only the methods needed by the dependent service
2. Use factories to create these client interfaces
3. Inject the factories rather than the actual services

#### Example Implementation

For the FileSystemService ↔ PathService circular dependency:

```typescript
// Minimal interface for what FileSystemService needs from PathService
export interface IPathServiceClient {
  resolvePath(path: string): string;
  normalizePath(path: string): string;
}

// Factory to create a client for PathService functionality
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

// Updated FileSystemService that depends on the factory
@injectable()
@Service({
  description: 'Service for file system operations'
})
export class FileSystemService implements IFileSystemService {
  private pathClient: IPathServiceClient;
  
  constructor(
    @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
    @inject('PathServiceClientFactory') pathClientFactory: PathServiceClientFactory,
    @inject('IFileSystem') fileSystem: IFileSystem | null = null
  ) {
    this.fs = fileSystem || new NodeFileSystem();
    this.pathClient = pathClientFactory.createClient();
  }
  
  // Use the client interface directly
  private resolvePath(filePath: string): string {
    return this.pathClient.resolvePath(filePath);
  }
}
```

Similarly, implement the reverse direction with a `FileSystemServiceClient` and `FileSystemServiceClientFactory`.

#### Benefits of Client Factory Pattern

1. **Clear Dependencies**: Services explicitly state what they need through focused interfaces
2. **Interface Segregation**: Services only get access to the specific methods they need
3. **No Null Checks**: Factory creates clients at initialization time, eliminating null checks
4. **Simpler Testing**: Small, focused interfaces are easier to mock
5. **Reduced Tight Coupling**: Services are coupled only to minimal interfaces, not to a central mediator
6. **Improved Code Readability**: Code intent becomes clearer when using direct method calls
7. **Better Maintainability**: Changes to service interfaces won't affect all dependent services

#### Naming Conventions

For consistency across the codebase, we follow these naming conventions:

- Client Interfaces: `I[ServiceName]Client` (e.g., `IPathServiceClient`)
- Factory Classes: `[ServiceName]ClientFactory` (e.g., `PathServiceClientFactory`)
- Factory Methods: `createClient()` for consistent API

#### Testing with Client Factories

Testing becomes more straightforward with the client factory pattern:

```typescript
describe('FileSystemService', () => {
  let context: TestContextDI;
  let service: IFileSystemService;
  
  beforeEach(() => {
    context = TestContextDI.create();
    
    // Create a mock client
    const mockPathClient = {
      resolvePath: vi.fn().mockReturnValue('/resolved/path'),
      normalizePath: vi.fn().mockReturnValue('normalized/path')
    };
    
    // Create a mock factory that returns our mock client
    const mockPathClientFactory = {
      createClient: vi.fn().mockReturnValue(mockPathClient)
    };
    
    // Register the mock factory
    context.registerMock('PathServiceClientFactory', mockPathClientFactory);
    
    // Resolve the service
    service = context.resolveSync('IFileSystemService');
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should resolve paths using the path client', async () => {
    // Test that calling methods on the service uses the client correctly
    await service.readFile('some/path');
    
    // Verify the path client was used
    expect(mockPathClient.resolvePath).toHaveBeenCalledWith('some/path');
  });
});
```

#### Implementation Strategy

The client factory pattern is being implemented incrementally to maintain backward compatibility:

1. First, create and register client interfaces and factories
2. Update services to use factories while maintaining mediator compatibility
3. Run tests to ensure functionality is preserved
4. Gradually remove ServiceMediator usage once all services use factories
5. Finally, remove the ServiceMediator class and interface completely

This approach allows for a smooth transition without breaking existing functionality.

## Troubleshooting

### Circular Dependencies

If you have circular dependencies, use `@inject(token)` with a string token instead of a direct class reference:

```typescript
// Instead of this (can cause circular dependency issues):
constructor(@inject(DependentService) private dependent: DependentService)

// Do this:
constructor(@inject('IDependentService') private dependent: IDependentService)
```

### Missing Dependencies

If a service fails to resolve with "unregistered dependency token" errors:

1. Check that the service is decorated with `@Service()`
2. Verify that the injected token is registered in the container
3. Check for typos in the injection token string
4. Make sure the services are imported and executed before use

### Testing Issues

If tests fail with DI errors:

1. Use `TestContextDI` to create a clean container for each test
2. Register all required mock dependencies before resolving the service
3. Clean up after tests with `context.cleanup()` 