# Enforce Consistent Interface-First Design

## Background
The architecture document emphasizes interface-first design as a core principle of the codebase, with services defined by interfaces (I[Name]Service) that are then implemented by concrete classes. While the TSyringe migration made progress toward this goal, there are inconsistencies in the implementation.

## Problem
The current interface-first implementation has several issues:
1. **Inconsistent Naming:** Some services follow the I[Name]Service pattern while others don't
2. **Interface Scope:** Some interfaces expose implementation details that should be private
3. **Incomplete Separation:** Some services still combine interface and implementation concerns
4. **Missing Interface Documentation:** Many interfaces lack comprehensive documentation
5. **Implicit Dependencies:** Not all interfaces explicitly declare their dependencies
6. **Test Utilities:** Test mocks don't fully leverage interfaces for type safety

## Proposed Solution
1. Standardize all service interfaces to follow the I[Name]Service pattern
2. Audit interface definitions to ensure they only expose necessary methods
3. Complete the separation of interfaces and implementations for all services
4. Improve interface documentation with examples and usage patterns
5. Explicitly declare dependencies in interfaces using the established pattern
6. Update test utilities to properly leverage interfaces for mocking

## Implementation Steps
1. Create a comprehensive audit of all service interfaces
2. Establish a coding standard for interface design
3. Refactor interfaces that don't follow naming conventions
4. Update interface documentation to be more comprehensive
5. Create interface validation utilities to ensure compliance
6. Update test mocks to align with interface definitions
7. Document the interface-first approach in the developer guide

## Success Criteria
- All service interfaces follow consistent I[Name]Service naming
- Interfaces only expose necessary public methods
- All interfaces have complete documentation with examples
- Dependency declarations are explicit and consistent
- Test mocks leverage interfaces for improved type safety
- Developers can easily understand service contracts through interfaces

## Estimated Complexity
Medium - Requires careful refactoring of interface definitions without breaking functionality

# Interface Standardization Implementation Guide

This document provides detailed guidance for implementing Phase 3 of the TSyringe Dependency Injection Cleanup Plan. The focus of this phase is to ensure consistent interface design and implementation across the codebase.

## Current Architecture

Our audit revealed that the codebase already follows a well-structured interface-first approach with two consistent naming patterns:

1. **Service Interfaces (I[Name]Service)**:
   - High-level interfaces used by application code
   - Examples: `IFileSystemService`, `IStateService`, `IDirectiveService`
   - Define the API contract that other services and application code rely on

2. **Implementation Interfaces (I[Name])**:
   - Lower-level interfaces implemented by concrete providers
   - Examples: `IFileSystem`, `IDirectiveHandler`, `IStateFactory`
   - Define contracts for implementation details that services rely on

This distinction is architecturally sound and should be preserved and documented.

## Current Issues

While the naming conventions are consistent, there are several issues to address:

1. **Missing interface documentation**:
   - Many interfaces lack thorough JSDoc comments
   - Method parameters and return values often lack descriptions
   - Complex methods would benefit from examples

2. **Interface scope issues**:
   - Some interfaces expose implementation details
   - Internal methods sometimes appear in public interfaces
   - Some services have methods that should be private

3. **Implicit dependencies**:
   - Dependencies are often not explicitly documented in interfaces
   - Makes it harder to understand service relationships
   - Complicates testing and mock creation

4. **Test mocks not leveraging interfaces**:
   - Some test mocks are implemented without respecting interface contracts
   - Creates type safety issues and can lead to inconsistent behavior

## Implementation Tasks

### 1. Document Interface Architecture

Create clear documentation of the existing interface architecture:

1. **Document the pattern**:
   - Service interfaces follow I[Name]Service pattern
   - Implementation interfaces follow I[Name] pattern
   - Explain the rationale for this distinction

2. **Provide examples**:
   - Show example pairs of service and implementation interfaces
   - Explain the relationship between them

3. **Update developer guide**:
   - Add section on interface design patterns
   - Include best practices for creating new interfaces

### 2. Improve Interface Documentation

Ensure all interfaces have comprehensive documentation:

1. **Add class-level JSDoc** to each interface explaining its purpose:
   ```typescript
   /**
    * Service responsible for file system operations.
    * Provides methods for reading, writing, and manipulating files and directories.
    * Abstracts underlying file system implementation to support both real and test environments.
    */
   export interface IFileSystemService {
   ```

2. **Add method-level JSDoc** with:
   - Description of what the method does
   - @param descriptions for each parameter
   - @returns description of the return value
   - @throws information when applicable
   - @example for complex methods

3. **Add interface property documentation**:
   ```typescript
   /** 
    * Whether the service is running in a test environment.
    * Used to determine appropriate behavior for file operations in tests.
    */
   readonly isTestEnvironment?: boolean;
   ```

### 3. Review Interface Scopes

1. **Identify implementation details** exposed in interfaces:
   - Internal helper methods
   - Properties only needed for implementation
   - Methods only used by the implementation class itself

2. **Move implementation-specific methods** out of the interface:
   - If a method is only used internally, remove it from the interface
   - Create protected/private methods in the implementation class
   
3. **Split interfaces** when appropriate:
   - For services with multiple responsibilities, consider creating separate interfaces
   - Example: `IFileSystemService` and `ICommandExecutionService` if those are distinct responsibilities

### 4. Explicitly Declare Dependencies

1. **Document dependency relationships** in interface JSDoc:
   ```typescript
   /**
    * Service that resolves variables in Meld content.
    * 
    * Dependencies:
    * - IStateService: For variable retrieval
    * - IParserService: For parsing code fragments
    */
   ```

2. **Add initialization methods to interfaces** that clearly show dependencies:
   ```typescript
   /**
    * Initialize the service with its dependencies
    */
   initialize(
     stateService: IStateService,
     parserService: IParserService
   ): void;
   ```

3. **Document method-level dependencies**:
   ```typescript
   /**
    * Resolves a variable in the given context.
    * Uses IStateService to retrieve the variable value.
    */
   resolveVariable(name: string, context: ResolutionContext): Promise<string>;
   ```

### 5. Update Test Mocks

1. **Create properly typed mock factories**:
   ```typescript
   export function createFileSystemServiceMock(): IFileSystemService {
     return {
       readFile: vi.fn().mockResolvedValue(''),
       writeFile: vi.fn().mockResolvedValue(undefined),
       // ... other methods required by the interface
     };
   }
   ```

2. **Update existing test mocks** to implement the standardized interfaces

3. **Use vitest-mock-extended** for complex interfaces:
   ```typescript
   import { mock } from 'vitest-mock-extended';
   
   const mockFileSystem = mock<IFileSystemService>();
   mockFileSystem.readFile.mockResolvedValue('file content');
   ```

## Implementation Guidelines

### Priority Order

1. Start with core service interfaces that many other services depend on:
   - IStateService
   - IFileSystemService
   - IPathService
   - IResolutionService

2. Move to pipeline services:
   - IParserService
   - IDirectiveService
   - IInterpreterService
   - IOutputService

3. Complete with utility and specialized services:
   - IValidationService
   - ICircularityService
   - Other specialized services

### Implementation Steps For Each Interface

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/interface-documentation-[service-name]
   ```

2. **Improve documentation**:
   - Add class-level JSDoc
   - Add method-level JSDoc
   - Add examples for complex methods

3. **Review scope**:
   - Remove implementation details
   - Move internal methods to implementation class
   - Consider splitting interfaces if needed

4. **Explicitly document dependencies**:
   - Add or update interface-level dependency documentation
   - Document method-level dependencies
   - Add initialization methods if missing

5. **Update tests**:
   - Update mock implementations
   - Fix failing tests
   - Improve test type safety

6. **Submit PR**:
   - Include thorough description of changes
   - Link to this implementation guide
   - Request review from team

## Example: Documenting IFileSystem

### Before:

```typescript
// In IFileSystem.ts
export interface IFileSystem {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;
  
  // Directory operations
  readDir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  
  // File watching
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;

  // Command execution
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  
  // Optional testing property
  isTestEnvironment?: boolean;
}
```

### After:

```typescript
/**
 * Interface for filesystem implementations that provide direct access to the underlying
 * file system operations. This is used by FileSystemService to abstract the 
 * actual filesystem implementation, allowing for both real and test environments.
 * 
 * @remarks
 * This interface represents the low-level implementation of file operations.
 * For application code, use IFileSystemService instead, which provides additional
 * validation, path resolution, and error handling.
 */
export interface IFileSystem {
  /**
   * Reads a file from the filesystem.
   * 
   * @param path - The path to the file to read
   * @returns A promise that resolves with the file content as a string
   * @throws If the file does not exist or cannot be read
   * 
   * @example
   * ```ts
   * const content = await fileSystem.readFile('/path/to/file.txt');
   * ```
   */
  readFile(path: string): Promise<string>;
  
  /**
   * Writes content to a file on the filesystem.
   * Creates the file if it doesn't exist, and overwrites it if it does.
   * 
   * @param path - The path to the file to write
   * @param content - The content to write to the file
   * @throws If the file cannot be written
   * 
   * @example
   * ```ts
   * await fileSystem.writeFile('/path/to/file.txt', 'Hello, world!');
   * ```
   */
  writeFile(path: string, content: string): Promise<void>;
  
  // ... other well-documented methods
  
  /**
   * Indicates whether the filesystem implementation is running in a test environment.
   * Used to modify behavior for testing purposes.
   */
  isTestEnvironment?: boolean;
}
```

## Checklist

Use this checklist to track progress for each interface:

- [ ] Class-level JSDoc added with purpose and dependencies
- [ ] Method-level JSDoc added with params, returns, throws
- [ ] Examples added for complex methods
- [ ] Implementation details removed from interface
- [ ] Dependencies explicitly documented
- [ ] Test mocks updated to match interface
- [ ] Tests passing
- [ ] PR submitted

## Exit Criteria

The interface standardization phase will be considered complete when:

1. All interfaces have comprehensive documentation
2. No implementation details are exposed in interfaces
3. All dependencies are explicitly documented in interfaces
4. All test mocks properly implement the interfaces
5. Interface design patterns are documented for developers
6. All tests pass with the improved interfaces

## Impact Analysis

This phase will have a significant impact on the codebase, but will improve maintainability in the long term:

- **Code Change Volume**: Medium (affects many files, but mostly documentation)
- **Risk Level**: Low (documentation improvements and scope changes are low risk)
- **Benefits**: Improved readability, discoverability, and maintainability
- **Prerequisite for**: Phase 4 (Dual-Mode DI Removal) 