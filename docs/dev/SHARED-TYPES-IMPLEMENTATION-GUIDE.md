# Shared Types Implementation Guide

This guide provides practical steps for implementing the shared types pattern to resolve circular dependencies in the Meld codebase.

## Overview

The shared types pattern centralizes common type definitions to break circular dependencies between modules. By creating foundation types with no dependencies, we establish a one-way dependency flow that eliminates circular references.

## Implementation Steps

### 1. Identify Circular Dependencies

Before implementing shared types, identify circular dependencies in your codebase:

```bash
# Find imports between two services with potential circular dependencies
grep -r "import.*from.*IFileSystemService" services/fs/PathService/
grep -r "import.*from.*IPathService" services/fs/FileSystemService/
```

Common circular dependency patterns:
- Service A imports from Service B, Service B imports from Service A
- Three or more services with circular import chains

### 2. Create Shared Types Foundation

Create a shared types file for the core types used across multiple modules:

```typescript
// core/shared-types.ts
/**
 * Shared base types with no dependencies
 */
export interface BaseNode {
  type: string;
  location?: SourceLocation;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}
```

For service-specific types, create a shared service types file:

```typescript
// core/shared-service-types.ts
import type { MeldNode } from './shared-types.js';

export interface StateServiceLike {
  getDataVar(name: string): unknown;
  getTextVar(name: string): string | undefined;
  // Minimal interface needed by other services
}
```

### 3. Update Interface Files

Modify interface files to use shared types instead of importing from other interfaces:

```typescript
// Before: Direct import creating circular dependency
import { IPathService } from '@services/fs/PathService/IPathService.js';

export interface IFileSystemService {
  initialize(pathService: IPathService): void;
  // Methods...
}

// After: Using shared type
import { PathServiceLike } from '@core/shared-service-types.js';

export interface IFileSystemService {
  initialize(pathService: PathServiceLike): void;
  // Methods...
}
```

### 4. Implement Client Interfaces

Create minimal client interfaces that expose only what dependent services need:

```typescript
// services/fs/FileSystemService/interfaces/IFileSystemServiceClient.ts
export interface IFileSystemServiceClient {
  fileExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  // Only methods needed by clients
}
```

### 5. Update Factory Implementations

Implement factories using the shared types:

```typescript
@injectable()
export class FileSystemServiceClientFactory implements ClientFactory<IFileSystemServiceClient> {
  constructor(
    // Use abstract type from shared types
    @inject('FileSystemService') private fileSystem: FileSystemLike
  ) {}
  
  createClient(): IFileSystemServiceClient {
    return {
      fileExists: (path) => this.fileSystem.fileExists(path),
      readFile: (path) => this.fileSystem.readFile(path)
    };
  }
}
```

### 6. Update Service Implementations

Modify service implementations to use factory pattern and shared types:

```typescript
@injectable()
export class FileSystemService implements IFileSystemService {
  private pathService?: PathServiceLike;
  
  constructor(
    @inject(PathServiceClientFactory) private pathServiceFactory?: ClientFactory<IPathServiceClient>
  ) {}
  
  initialize(options?: ServiceOptions): void {
    if (this.pathServiceFactory) {
      this.pathService = this.pathServiceFactory.createClient() as PathServiceLike;
    }
  }
  
  // Methods that use this.pathService
}
```

### 7. Consistent Export Patterns

Use consistent export patterns in your interface files:

```typescript
// Use named exports for interfaces
export interface IPathService { /*...*/ }

// Export types explicitly
export type PathOptions = { /*...*/ };

// Use export * carefully, and only from non-circular modules
export * from './constants.js';
```

### 8. Apply Interface Segregation Principle

Break large interfaces into smaller, focused ones:

```typescript
// Before: One large interface
export interface IStateService {
  // 50+ methods
}

// After: Multiple focused interfaces
export interface IStateReadService {
  // Read-only methods
}

export interface IStateWriteService {
  // Write-only methods
}

export interface IStateService extends IStateReadService, IStateWriteService {
  // Additional methods
}
```

## Working Examples

See the following files for implementation examples:

- `core/shared-types.ts` - Core AST node types
- `core/shared-service-types.ts` - Common service interface types
- `_dev/issues/outbox/service-interface-example.ts` - Example implementation

## Testing Your Changes

After implementing shared types, test thoroughly:

1. Run specific service tests: `npm test services/fs/FileSystemService/FileSystemService.test.ts`
2. Run integration tests: `npm test services/pipeline/OutputService/OutputService.test.ts`
3. Run build to check for type errors: `npm run build`

## Common Issues and Solutions

1. **Type Mismatch in Factory Pattern**
   - Issue: TypeScript error when casting client to service interface
   - Solution: Use common interface from shared types as intermediary

2. **Incomplete Shared Types**
   - Issue: Shared types missing methods needed by dependent services
   - Solution: Review all usage and ensure shared interfaces are complete

3. **Build Errors with Interface Exports**
   - Issue: "No matching export in X for import Y"
   - Solution: Update from `export type` to `export interface` in interface files

4. **Circular Dependencies Still Present**
   - Issue: Circular references still exist after changes
   - Solution: Review dependency chain and ensure all imports use shared types

## Best Practices

1. **Keep Shared Types Minimal**
   - Include only what's needed by multiple modules
   - Use interface extension for specialized requirements

2. **Document Shared Interfaces**
   - Clearly document the purpose of each interface
   - Note which services depend on each shared type

3. **Use Consistent Naming Patterns**
   - Use `ServiceLike` suffix for shared service interfaces
   - Use `IServiceClient` for client interfaces

4. **Test Incrementally**
   - Update and test one service pair at a time
   - Ensure tests pass after each change

## Future-Proofing

As the codebase evolves:

1. Review and update shared types when adding new services
2. Periodically audit for new circular dependencies
3. Maintain the hierarchy: shared types → interfaces → implementations
4. Document your dependency patterns in architecture docs