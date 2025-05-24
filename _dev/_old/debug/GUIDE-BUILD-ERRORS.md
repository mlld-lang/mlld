# Guide: Fixing Build Errors with Special Focus on Circular Dependencies

## Core Principles

1. **Understand Before Changing**
   - Thoroughly analyze what changed between working and broken states
   - Identify specific files and lines that introduced issues
   - Use `git diff` to trace changes between commits

2. **Keep Import Paths Stable**
   - **CRITICAL**: Avoid changing import paths unless absolutely necessary
   - Changing import paths can create circular dependencies even when just working with types
   - Use `import type` consistently to avoid runtime circularities
   - Prefer importing from more specific files rather than aggregator files

3. **Interface-First Approach**
   - Add interfaces to shared-types files rather than changing import structures
   - Expand existing interfaces instead of creating new ones 
   - Keep implementations separate from interface definitions

4. **Testing Strategy**
   - Test frequently with focused test runs on specific failing tests
   - Gradually expand test coverage as you fix issues
   - Run full tests only after focused tests pass

## Circular Dependency Warning Signs

1. **Out-of-Memory Errors**:
   - Node running out of memory during build or tests often indicates a circular dependency
   - TypeScript compiler gets stuck in an infinite loop resolving types

2. **Long Compilation Times**:
   - Sudden increases in compilation time suggest circular references

3. **Type-Only Changes Breaking Runtime**:
   - When changes to type definitions affect runtime behavior
   - When adding interfaces or types causes actual code execution issues

4. **Import Path Changes**:
   - Be extremely cautious when changing import paths, especially from:
     - Specific files (e.g., `./shared-types.js`) to
     - Index files (e.g., `./index.js`)

## Client Factory Pattern for Breaking Circular Dependencies

This codebase specifically uses the Client Factory Pattern to break circular dependencies:

1. **Identify Service Dependencies**:
   - When Service A needs methods from Service B and vice versa, use the client factory pattern
   - Create minimal client interfaces that expose only needed methods

2. **Follow the Naming Convention**:
   - Client Interfaces: `I[ServiceName]Client` (e.g., `IPathServiceClient`)
   - Factory Classes: `[ServiceName]ClientFactory` (e.g., `PathServiceClientFactory`)
   - Factory Methods: `createClient()` for consistent API

3. **Implementation Example**:
   ```typescript
   // For FileSystemService needing PathService methods:
   
   // 1. Create minimal client interface in shared-service-types.ts
   export interface IPathServiceClient {
     resolvePath(path: string): string;
     normalizePath(path: string): string;
   }
   
   // 2. Create factory that depends on the actual service
   @injectable()
   @Service()
   export class PathServiceClientFactory {
     constructor(@inject('IPathService') private pathService: IPathService) {}
     
     createClient(): IPathServiceClient {
       return {
         resolvePath: (path) => this.pathService.resolvePath(path),
         normalizePath: (path) => this.pathService.normalizePath(path)
       };
     }
   }
   
   // 3. Inject the factory instead of the service
   @injectable()
   @Service()
   export class FileSystemService implements IFileSystemService {
     private pathClient: IPathServiceClient;
     
     constructor(
       @inject('PathServiceClientFactory') pathClientFactory: PathServiceClientFactory
     ) {
       this.pathClient = pathClientFactory.createClient();
     }
     
     // Now use this.pathClient.resolvePath() instead of directly using pathService
   }
   ```

4. **When Adding New Methods**:
   - Add method to `shared-service-types.ts` for the full service interface
   - Add only what's needed to the client interface
   - Update the factory implementation

5. **Recent Examples in Codebase**:
   - OutputServiceClient was created to break dependency between OutputService and other services
   - DirectiveServiceClient for breaking DirectiveService circular dependencies
   - These patterns follow the same structure as the example above

## Critical Files for Circular Dependencies

In this codebase, pay special attention to these files when fixing circular dependencies:

1. **Core Type Definitions**:
   - `core/shared-service-types.ts`: Contains interfaces for breaking circular dependencies
   - `core/shared/types.ts`: Contains foundational types with no imports
   - `core/syntax/types/shared-types.js`: Base type definitions for AST nodes

2. **Common Circular Dependency Paths**:
   - FileSystemService ↔ PathService
   - ParserService ↔ ResolutionService
   - StateService ↔ StateTrackingService
   - InterpreterService ↔ DirectiveService

3. **Best Practice**: Add methods to interface definitions in `shared-service-types.ts` rather than changing import paths:
   ```typescript
   // In shared-service-types.ts - Example of adding methods
   export interface StateServiceLike {
     // Existing methods...
     
     // Add new methods here:
     /** Sets a text variable */
     setTextVar(name: string, value: string): void;
     /** Gets local text variables */
     getLocalTextVars(): Map<string, string>;
   }
   ```

## Step-By-Step Fix Process

1. **Revert to Last Working State**
   ```bash
   git checkout -b fix-issue last-working-commit
   ```

2. **Implement Changes Incrementally**
   - Add interfaces in shared type files
   - Keep import paths unchanged
   - Update types without changing import structures

3. **Test Focused Components**
   ```bash
   npm test -- specific/failing/test.ts
   ```

4. **Check for Circular References**
   - Use browser dev tools to debug node memory issues
   - Check for import cycles with TSC diagnostic flags

5. **Fix in Isolated Small Batches**
   - Make changes to type definitions first
   - Test after each batch of changes
   - Only move to next batch when current one passes all tests

## Testing Strategy for This Codebase

1. **Use TestContextDI for DI Testing**:
   ```typescript
   import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
   
   describe('MyService', () => {
     let context: TestContextDI;
     
     beforeEach(() => {
       context = TestContextDI.create();
     });
     
     afterEach(async () => {
       await context.cleanup();
     });
     
     it('should work correctly', async () => {
       // Register any mocks needed
       context.registerMock('IDependencyService', mockDependency);
       
       // Get the service from the container
       const service = context.container.resolve('IServiceName');
       
       // Test and assertions...
     });
   });
   ```

2. **Testing Client Factory Pattern**:
   ```typescript
   it('should use client factory correctly', async () => {
     // Create a mock for the service that would cause a circular dependency
     const mockPathService = {
       resolvePath: jest.fn().mockReturnValue('/resolved/path'),
       normalizePath: jest.fn().mockReturnValue('normalized/path')
     };
     
     // Register the mock service
     context.registerMock('IPathService', mockPathService);
     
     // Get the service under test
     const fileSystem = context.container.resolve('IFileSystemService');
     
     // Call a method that uses the client
     const result = await fileSystem.readFile('/some/path');
     
     // Verify the client was used correctly
     expect(mockPathService.resolvePath).toHaveBeenCalledWith('/some/path');
   });
   ```

3. **Targeted Test Execution**:
   - Start with specific failing test files:
   ```bash
   npm test -- services/pipeline/OutputService/OutputService.test.ts
   ```
   
   - Once passing, expand to related services:
   ```bash
   npm test -- services/pipeline/
   ```
   
   - Finally run full test suite:
   ```bash
   npm test
   ```

4. **Memory Issues During Testing**:
   - If you encounter OOM errors during testing, run with increased memory:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm test -- services/pipeline/OutputService/OutputService.test.ts
   ```
   
   - Use focused tests with minimal dependencies first:
   ```bash
   npm test -- -t "specific test name" services/pipeline/OutputService/OutputService.test.ts
   ```

## Project-Specific Import Path Recommendations

This codebase has several critical import paths that should remain stable:

1. **Always import types from specific files rather than index files**:
   ```typescript
   // GOOD - Import directly from shared-types.js
   import type { MeldNode } from './syntax/types/shared-types.js';
   
   // AVOID - Importing from index files can create circular dependencies
   import type { MeldNode } from './syntax/types/index.js';
   ```

2. **Use consistent extension pattern**:
   ```typescript
   // GOOD - Always include .js extension for ESM compatibility
   import type { DirectiveNode } from './IDirectiveNode.js';
   
   // AVOID - Missing extensions can cause build issues
   import type { DirectiveNode } from './IDirectiveNode';
   ```

3. **Prefer defined interfaces over direct imports**:
   ```typescript
   // GOOD - Use shared interfaces to break circular dependencies
   constructor(@inject('IStateService') private state: StateServiceLike)
   
   // AVOID - Direct class or implementation references
   constructor(@inject(StateService) private state: StateService) 
   ```

## Specific Circular Dependency Patterns to Avoid

1. **Barrel File Cycles**:
   - Avoid creating cycles between index.ts files and their imported modules
   - Don't re-export from index files that import from the module you're exporting

2. **Interface -> Implementation -> Interface Cycles**:
   - Keep interfaces in separate files from implementations
   - Use shared interface-only files that both implementation files can import

3. **Type-Only vs Runtime Imports**:
   - Always use `import type` for interfaces and types
   - Keep runtime imports separate from type imports

4. **State Management Cycles**:
   - Use the Client Factory pattern for services that need to interact bidirectionally
   - Create minimal interfaces for cross-service communication

Remember that the key to successfully fixing build errors is incremental progress with thorough testing at each step. Don't try to fix everything at once, and always maintain a version that you can go back to if your changes make things worse.
