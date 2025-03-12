# Circular Dependencies Analysis

## Overview

This document provides a comprehensive analysis of circular dependencies in the Meld codebase that are currently managed through the ServiceMediator pattern. The analysis identifies all circular dependency relationships, the specific methods used through the ServiceMediator, and the interfaces needed for the factory pattern implementation.

## Identified Circular Dependencies

Based on code analysis, we have identified three major circular dependency relationships:

1. **FileSystemService ↔ PathService**
2. **ParserService ↔ ResolutionService**
3. **StateService ↔ StateTrackingService**

## 1. FileSystemService ↔ PathService

### Dependency Direction

- **FileSystemService → PathService**: FileSystemService needs PathService for path resolution and normalization
- **PathService → FileSystemService**: PathService needs FileSystemService to check if paths exist and if they are directories

### Methods Used Through ServiceMediator

#### FileSystemService uses from PathService:

```typescript
// In FileSystemService.ts
private resolvePath(filePath: string): string {
  return this.serviceMediator.resolvePath(filePath);
}
```

The FileSystemService uses these methods from PathService through the mediator:
- `resolvePath(path: string): string`
- `normalizePath(path: string): string`

#### PathService uses from FileSystemService:

```typescript
// In PathService.ts - validatePath method
if (options.mustExist) {
  // Get the file system service from mediator if available
  let exists = false;
  
  if (this.serviceMediator) {
    exists = await this.serviceMediator.exists(resolvedPath);
  }
  // ...
}
```

The PathService uses these methods from FileSystemService through the mediator:
- `exists(path: string): Promise<boolean>`
- `isDirectory(path: string): Promise<boolean>`

### Proposed Client Interfaces

#### IPathServiceClient

```typescript
export interface IPathServiceClient {
  /**
   * Resolves a path according to Meld path resolution rules
   * @param path - The path to resolve
   * @returns The resolved path
   */
  resolvePath(path: string): string;
  
  /**
   * Normalizes a path according to Meld path normalization rules
   * @param path - The path to normalize
   * @returns The normalized path
   */
  normalizePath(path: string): string;
}
```

#### IFileSystemServiceClient

```typescript
export interface IFileSystemServiceClient {
  /**
   * Checks if a path exists in the filesystem
   * @param path - The path to check
   * @returns A promise that resolves to true if the path exists, false otherwise
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * Checks if a path is a directory
   * @param path - The path to check
   * @returns A promise that resolves to true if the path is a directory, false otherwise
   */
  isDirectory(path: string): Promise<boolean>;
}
```

## 2. ParserService ↔ ResolutionService

### Dependency Direction

- **ParserService → ResolutionService**: ParserService needs ResolutionService to resolve variables during parsing
- **ResolutionService → ParserService**: ResolutionService needs ParserService to parse content with variables

### Methods Used Through ServiceMediator

#### ParserService uses from ResolutionService:

```typescript
// In ParserService.ts (inferred from ServiceMediator.ts)
async resolveVariableForParser(variable: string, context: ResolutionContext): Promise<string> {
  if (!this.resolutionService) {
    throw new Error('ResolutionService not initialized in mediator');
  }

  // First, ensure this variable passes validation in the given context
  try {
    await this.resolutionService.validateResolution(variable, context);
  } catch (error) {
    // Log and rethrow validation errors
    console.error('Validation error in resolveVariableForParser:', error);
    throw error;
  }

  return this.resolutionService.resolveInContext(variable, context);
}
```

The ParserService uses these methods from ResolutionService through the mediator:
- `validateResolution(variable: string, context: ResolutionContext): Promise<void>`
- `resolveInContext(variable: string, context: ResolutionContext): Promise<string>`

#### ResolutionService uses from ParserService:

```typescript
// In ResolutionService.ts - detectCircularReferences method
const checkReferences = async (text: string, currentRef?: string) => {
  // Parse the text to get variable references
  const nodes = await this.parseForResolution(text);
  // ...
}

// In ServiceMediator.ts
async parseForResolution(content: string, filePath?: string): Promise<any[]> {
  if (!this.parserService) {
    throw new Error('ParserService not initialized in mediator');
  }
  // If filePath is provided, use parseWithLocations, otherwise use parse
  return filePath 
    ? this.parserService.parseWithLocations(content, filePath)
    : this.parserService.parse(content);
}
```

The ResolutionService uses these methods from ParserService through the mediator:
- `parse(content: string): any[]`
- `parseWithLocations(content: string, filePath: string): any[]`

### Proposed Client Interfaces

#### IResolutionServiceClient

```typescript
export interface IResolutionServiceClient {
  /**
   * Validates that a variable can be resolved in the given context
   * @param variable - The variable to validate
   * @param context - The resolution context
   * @returns A promise that resolves when validation is successful
   */
  validateResolution(variable: string, context: ResolutionContext): Promise<void>;
  
  /**
   * Resolves a variable in the given context
   * @param variable - The variable to resolve
   * @param context - The resolution context
   * @returns A promise that resolves to the resolved value
   */
  resolveInContext(variable: string, context: ResolutionContext): Promise<string>;
}
```

#### IParserServiceClient

```typescript
export interface IParserServiceClient {
  /**
   * Parses content into an AST
   * @param content - The content to parse
   * @returns The parsed AST
   */
  parse(content: string): any[];
  
  /**
   * Parses content into an AST with location information
   * @param content - The content to parse
   * @param filePath - The file path for location information
   * @returns The parsed AST with location information
   */
  parseWithLocations(content: string, filePath: string): any[];
}
```

## 3. StateService ↔ StateTrackingService

### Dependency Direction

- **StateService → StateTrackingService**: StateService needs StateTrackingService to register states and relationships
- **StateTrackingService → StateService**: StateTrackingService needs to access state information (less direct dependency)

### Methods Used Through ServiceMediator

The StateService and StateTrackingService relationship is different from the other circular dependencies. The StateService directly uses the StateTrackingService, but the reverse dependency is less direct. The StateTrackingService primarily needs to be aware of state changes, which is currently handled through direct method calls rather than through the ServiceMediator.

#### StateService uses from StateTrackingService:

```typescript
// In StateService.ts - initializeState method
if (this.trackingService) {
  const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;
  
  // Register the state with the pre-generated ID
  this.trackingService.registerState({
    id: this.currentState.stateId,
    parentId,
    filePath: this.currentState.filePath,
    createdAt: Date.now(),
    transformationEnabled: this._transformationEnabled,
    source: 'child'
  });
  
  // Explicitly register parent-child relationship if parent exists
  if (parentState && parentId) {
    this.trackingService.registerRelationship({
      sourceId: parentId,
      targetId: this.currentState.stateId,
      type: 'parent-child',
      timestamp: Date.now(),
      source: 'child'
    });
  }
}
```

The StateService uses these methods from StateTrackingService:
- `registerState(metadata: StateMetadata): void`
- `registerRelationship(relationship: StateRelationship): void`
- `addRelationship(sourceId: string, targetId: string, type: string): void`

#### StateTrackingService uses from StateService:

The StateTrackingService doesn't directly call methods on StateService through the ServiceMediator. Instead, it receives state information through method parameters when StateService calls its methods.

### Proposed Client Interfaces

#### IStateTrackingServiceClient

```typescript
export interface IStateTrackingServiceClient {
  /**
   * Registers a state with the tracking service
   * @param metadata - The state metadata
   */
  registerState(metadata: StateMetadata): void;
  
  /**
   * Registers a relationship between states
   * @param relationship - The relationship details
   */
  registerRelationship(relationship: StateRelationship): void;
  
  /**
   * Adds a relationship between two states
   * @param sourceId - The source state ID
   * @param targetId - The target state ID
   * @param type - The relationship type
   */
  addRelationship(sourceId: string, targetId: string, type: string): void;
}
```

#### IStateServiceClient

Since the StateTrackingService doesn't directly call methods on StateService through the ServiceMediator, we may not need an IStateServiceClient interface. However, for completeness and future-proofing, we could define:

```typescript
export interface IStateServiceClient {
  /**
   * Gets the current state ID
   * @returns The current state ID
   */
  getStateId(): string | undefined;
  
  /**
   * Gets the current file path
   * @returns The current file path
   */
  getCurrentFilePath(): string | undefined;
  
  /**
   * Checks if transformation is enabled
   * @returns True if transformation is enabled, false otherwise
   */
  isTransformationEnabled(): boolean;
}
```

## Implementation Strategy

Based on this analysis, we recommend implementing the factory pattern in the following order:

1. **FileSystemService ↔ PathService**: This is the most straightforward circular dependency and a good candidate for the initial implementation.
2. **ParserService ↔ ResolutionService**: This dependency involves more complex interactions but is well-defined.
3. **StateService ↔ StateTrackingService**: This dependency is less direct and may require a different approach.

For each implementation, we will:
1. Create the client interfaces
2. Implement the factory classes
3. Update the services to use the factories
4. Run tests to verify functionality
5. Document the implementation

## Next Steps

1. Create a detailed implementation plan for the FileSystemService ↔ PathService factory pattern
2. Implement and test the FileSystemService ↔ PathService factory pattern
3. Document the implementation pattern for other teams
4. Proceed with the ParserService ↔ ResolutionService implementation 