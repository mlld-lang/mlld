# FileSystemService ↔ PathService Factory Pattern Implementation Plan

## Overview

This document outlines the detailed implementation plan for replacing the ServiceMediator pattern with a factory pattern for the circular dependency between FileSystemService and PathService. This implementation will serve as a prototype for the broader effort to remove the ServiceMediator pattern from the codebase.

## Current Architecture

Currently, FileSystemService and PathService have a circular dependency:

- **FileSystemService** needs **PathService** for path resolution and normalization
- **PathService** needs **FileSystemService** to check if paths exist and if they are directories

This circular dependency is currently managed through the ServiceMediator:

```
FileSystemService → ServiceMediator → PathService
PathService → ServiceMediator → FileSystemService
```

## Target Architecture

We will replace this with a factory pattern:

```
FileSystemService → PathServiceClientFactory → IPathServiceClient
PathService → FileSystemServiceClientFactory → IFileSystemServiceClient
```

## Implementation Steps

### 1. Create Client Interfaces

#### 1.1 Create IPathServiceClient Interface

```typescript
// services/fs/PathService/interfaces/IPathServiceClient.ts
/**
 * Client interface for PathService functionality needed by FileSystemService
 * This interface is used to break the circular dependency between FileSystemService and PathService
 */
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

#### 1.2 Create IFileSystemServiceClient Interface

```typescript
// services/fs/FileSystemService/interfaces/IFileSystemServiceClient.ts
/**
 * Client interface for FileSystemService functionality needed by PathService
 * This interface is used to break the circular dependency between PathService and FileSystemService
 */
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

### 2. Create Factory Classes

#### 2.1 Create PathServiceClientFactory

```typescript
// services/fs/PathService/factories/PathServiceClientFactory.ts
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IPathService } from '../IPathService.js';
import { IPathServiceClient } from '../interfaces/IPathServiceClient.js';

/**
 * Factory for creating path service clients
 * This factory is used to break the circular dependency between FileSystemService and PathService
 */
@injectable()
@Service({
  description: 'Factory for creating path service clients'
})
export class PathServiceClientFactory {
  /**
   * Creates a new PathServiceClientFactory
   * @param pathService - The path service to create clients for
   */
  constructor(@inject('IPathService') private pathService: IPathService) {}
  
  /**
   * Creates a client for the path service
   * @returns A client that provides path service functionality
   */
  createClient(): IPathServiceClient {
    return {
      resolvePath: (path) => this.pathService.resolvePath(path),
      normalizePath: (path) => this.pathService.resolvePath(path) // Using resolvePath as normalizePath
    };
  }
}
```

#### 2.2 Create FileSystemServiceClientFactory

```typescript
// services/fs/FileSystemService/factories/FileSystemServiceClientFactory.ts
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IFileSystemService } from '../IFileSystemService.js';
import { IFileSystemServiceClient } from '../interfaces/IFileSystemServiceClient.js';

/**
 * Factory for creating file system service clients
 * This factory is used to break the circular dependency between PathService and FileSystemService
 */
@injectable()
@Service({
  description: 'Factory for creating file system service clients'
})
export class FileSystemServiceClientFactory {
  /**
   * Creates a new FileSystemServiceClientFactory
   * @param fileSystemService - The file system service to create clients for
   */
  constructor(@inject('IFileSystemService') private fileSystemService: IFileSystemService) {}
  
  /**
   * Creates a client for the file system service
   * @returns A client that provides file system service functionality
   */
  createClient(): IFileSystemServiceClient {
    return {
      exists: (path) => this.fileSystemService.exists(path),
      isDirectory: (path) => this.fileSystemService.isDirectory(path)
    };
  }
}
```

### 3. Update DI Container Configuration

```typescript
// core/di-config.ts
// Register factories
container.register('PathServiceClientFactory', { useClass: PathServiceClientFactory });
container.register('FileSystemServiceClientFactory', { useClass: FileSystemServiceClientFactory });
```

### 4. Update FileSystemService to Use Factory

```typescript
// services/fs/FileSystemService/FileSystemService.ts
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IFileSystemService } from './IFileSystemService.js';
import { IPathOperationsService } from './IPathOperationsService.js';
import { IFileSystem } from './IFileSystem.js';
import { NodeFileSystem } from './NodeFileSystem.js';
import { IServiceMediator } from '@services/mediator/IServiceMediator.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import { filesystemLogger as logger } from '@core/utils/logger.js';

@injectable()
@Service({
  description: 'Service for file system operations'
})
export class FileSystemService implements IFileSystemService {
  private fs: IFileSystem;
  private serviceMediator?: IServiceMediator;
  private pathClient?: IPathServiceClient;

  /**
   * Creates a new instance of the FileSystemService
   * 
   * @param pathOps - Service for handling path operations and normalization
   * @param serviceMediator - Service mediator for resolving circular dependencies with PathService
   * @param pathClientFactory - Factory for creating path service clients
   * @param fileSystem - File system implementation to use
   */
  constructor(
    @inject('IPathOperationsService') private readonly pathOps: IPathOperationsService,
    @inject('IServiceMediator') private readonly serviceMediator: IServiceMediator,
    @inject('PathServiceClientFactory') pathClientFactory?: PathServiceClientFactory,
    @inject('IFileSystem') private fs: IFileSystem = new NodeFileSystem()
  ) {
    // Register this service with the mediator for backward compatibility
    if (this.serviceMediator) {
      this.serviceMediator.setFileSystemService(this);
    }
    
    // Use factory if available (new approach)
    if (pathClientFactory) {
      this.pathClient = pathClientFactory.createClient();
    }
  }

  /**
   * Resolves a path using the path client or service mediator
   * @private
   * @param filePath - The path to resolve
   * @returns The resolved path
   */
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

  // Rest of the implementation remains unchanged
}
```

### 5. Update PathService to Use Factory

```typescript
// services/fs/PathService/PathService.ts
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IPathService, PathOptions, StructuredPath } from './IPathService.js';
import { ProjectPathResolver } from '../ProjectPathResolver.js';
import { IServiceMediator } from '@services/mediator/index.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { pathLogger as logger } from '@core/utils/logger.js';

/**
 * Service for validating and normalizing paths
 */
@injectable()
@Service({
  description: 'Service for validating and normalizing paths according to Meld rules'
})
export class PathService implements IPathService {
  private testMode: boolean = false;
  private homePath: string;
  private projectPath: string;
  private projectPathResolved: boolean = false;
  private fsClient?: IFileSystemServiceClient;

  /**
   * Creates a new PathService with dependencies injected.
   * 
   * @param serviceMediator Service mediator for resolving circular dependencies
   * @param projectPathResolver Resolver for project paths
   * @param fsClientFactory Factory for creating file system service clients
   */
  constructor(
    @inject('IServiceMediator') private readonly serviceMediator: IServiceMediator,
    @inject(ProjectPathResolver) private readonly projectPathResolver: ProjectPathResolver,
    @inject('FileSystemServiceClientFactory') fsClientFactory?: FileSystemServiceClientFactory
  ) {
    const homeEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeEnv && !this.testMode) {
      throw new Error('Unable to determine home directory: HOME or USERPROFILE environment variables are not set');
    }
    this.homePath = homeEnv || '';
    this.projectPath = process.cwd();
    
    // Register this service with the mediator for backward compatibility
    this.serviceMediator.setPathService(this);
    
    // Use factory if available (new approach)
    if (fsClientFactory) {
      this.fsClient = fsClientFactory.createClient();
    }
  }

  // Update validatePath method to use fsClient
  async validatePath(
    filePath: string | StructuredPath, 
    options: PathOptions = {}
  ): Promise<string> {
    // ... existing code ...
    
    // Check existence if required
    if (options.mustExist) {
      let exists = false;
      
      // Try new approach first
      if (this.fsClient) {
        exists = await this.fsClient.exists(resolvedPath);
      }
      // Fall back to mediator for backward compatibility
      else if (this.serviceMediator) {
        exists = await this.serviceMediator.exists(resolvedPath);
      } 
      // Legacy fallback
      else if ((this as any).fs) {
        exists = await (this as any).fs.exists(resolvedPath);
      } 
      else {
        // No file system available, can't check existence
        logger.warn('Cannot check path existence: no file system service available', {
          path: pathToProcess,
          resolvedPath
        });
        
        throw new Error('Cannot validate path existence: no file system service available');
      }
      
      if (!exists) {
        throw new PathValidationError(
          PathErrorMessages.FILE_NOT_FOUND,
          {
            code: PathErrorCode.FILE_NOT_FOUND,
            path: pathToProcess,
            resolvedPath: resolvedPath
          },
          options.location
        );
      }
    }
    
    // ... rest of existing code ...
  }

  // Rest of the implementation remains unchanged
}
```

### 6. Create Unit Tests for Factories

#### 6.1 Test for PathServiceClientFactory

```typescript
// services/fs/PathService/factories/PathServiceClientFactory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathServiceClientFactory } from './PathServiceClientFactory.js';
import { IPathService } from '../IPathService.js';

describe('PathServiceClientFactory', () => {
  let mockPathService: IPathService;
  let factory: PathServiceClientFactory;
  
  beforeEach(() => {
    // Create mock path service
    mockPathService = {
      resolvePath: vi.fn().mockReturnValue('/resolved/path'),
      // ... other required methods with mock implementations
    } as unknown as IPathService;
    
    // Create factory with mock service
    factory = new PathServiceClientFactory(mockPathService);
  });
  
  it('should create a client that delegates to the path service', () => {
    // Create client
    const client = factory.createClient();
    
    // Test resolvePath
    const result = client.resolvePath('/some/path');
    
    // Verify delegation
    expect(mockPathService.resolvePath).toHaveBeenCalledWith('/some/path');
    expect(result).toBe('/resolved/path');
  });
  
  it('should create a client with normalizePath that uses resolvePath', () => {
    // Create client
    const client = factory.createClient();
    
    // Test normalizePath
    const result = client.normalizePath('/some/path');
    
    // Verify delegation to resolvePath
    expect(mockPathService.resolvePath).toHaveBeenCalledWith('/some/path');
    expect(result).toBe('/resolved/path');
  });
});
```

#### 6.2 Test for FileSystemServiceClientFactory

```typescript
// services/fs/FileSystemService/factories/FileSystemServiceClientFactory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileSystemServiceClientFactory } from './FileSystemServiceClientFactory.js';
import { IFileSystemService } from '../IFileSystemService.js';

describe('FileSystemServiceClientFactory', () => {
  let mockFileSystemService: IFileSystemService;
  let factory: FileSystemServiceClientFactory;
  
  beforeEach(() => {
    // Create mock file system service
    mockFileSystemService = {
      exists: vi.fn().mockResolvedValue(true),
      isDirectory: vi.fn().mockResolvedValue(false),
      // ... other required methods with mock implementations
    } as unknown as IFileSystemService;
    
    // Create factory with mock service
    factory = new FileSystemServiceClientFactory(mockFileSystemService);
  });
  
  it('should create a client that delegates exists to the file system service', async () => {
    // Create client
    const client = factory.createClient();
    
    // Test exists
    const result = await client.exists('/some/path');
    
    // Verify delegation
    expect(mockFileSystemService.exists).toHaveBeenCalledWith('/some/path');
    expect(result).toBe(true);
  });
  
  it('should create a client that delegates isDirectory to the file system service', async () => {
    // Create client
    const client = factory.createClient();
    
    // Test isDirectory
    const result = await client.isDirectory('/some/path');
    
    // Verify delegation
    expect(mockFileSystemService.isDirectory).toHaveBeenCalledWith('/some/path');
    expect(result).toBe(false);
  });
});
```

### 7. Create Integration Tests

```typescript
// tests/integration/fs/FileSystemPathIntegration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';

describe('FileSystem and Path Service Integration with Factory Pattern', () => {
  let context: TestContextDI;
  let fileSystemService: IFileSystemService;
  let pathService: IPathService;
  
  beforeEach(async () => {
    // Create isolated test context
    context = TestContextDI.createIsolated();
    
    // Initialize context
    await context.initialize();
    
    // Resolve services from container
    fileSystemService = context.container.resolve('IFileSystemService');
    pathService = context.container.resolve('IPathService');
    
    // Create test files
    await fileSystemService.writeFile('/test/file.txt', 'test content');
    await fileSystemService.ensureDir('/test/dir');
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should resolve paths correctly using factory pattern', async () => {
    // Test path resolution
    const resolvedPath = pathService.resolvePath('/test/file.txt');
    
    // Verify path is resolved correctly
    expect(resolvedPath).toContain('/test/file.txt');
    
    // Verify file exists using resolved path
    const exists = await fileSystemService.exists(resolvedPath);
    expect(exists).toBe(true);
  });
  
  it('should validate paths correctly using factory pattern', async () => {
    // Test path validation for existing file
    const validatedPath = await pathService.validatePath('/test/file.txt', { mustExist: true });
    
    // Verify path is validated correctly
    expect(validatedPath).toContain('/test/file.txt');
    
    // Test path validation for non-existing file
    await expect(
      pathService.validatePath('/test/nonexistent.txt', { mustExist: true })
    ).rejects.toThrow();
  });
  
  it('should check directory status correctly using factory pattern', async () => {
    // Test isDirectory for directory
    const isDir = await fileSystemService.isDirectory('/test/dir');
    expect(isDir).toBe(true);
    
    // Test isDirectory for file
    const isFile = await fileSystemService.isDirectory('/test/file.txt');
    expect(isFile).toBe(false);
  });
});
```

## Implementation Sequence

To ensure a smooth transition, we will implement the changes in the following sequence:

1. Create client interfaces
2. Create factory classes
3. Write unit tests for factories
4. Update DI container configuration
5. Update FileSystemService to use factory while maintaining ServiceMediator compatibility
6. Update PathService to use factory while maintaining ServiceMediator compatibility
7. Write integration tests
8. Run all tests to verify functionality
9. Document the implementation

## Backward Compatibility

Throughout the implementation, we will maintain backward compatibility by:

1. Keeping the ServiceMediator registration and usage
2. Adding the factory pattern as an alternative
3. Preferring the factory pattern when available
4. Falling back to the ServiceMediator when the factory is not available

This approach ensures that existing code continues to work while we transition to the new pattern.

## Testing Strategy

We will use a comprehensive testing approach:

1. **Unit Tests**: Test each factory in isolation
2. **Integration Tests**: Test the interaction between FileSystemService and PathService
3. **Regression Tests**: Run all existing tests to ensure no regressions
4. **Compatibility Tests**: Verify both factory and mediator approaches work

## Risk Mitigation

1. **Incremental Implementation**: Implement one step at a time
2. **Comprehensive Testing**: Test after each significant change
3. **Backward Compatibility**: Maintain ServiceMediator support during transition
4. **Rollback Plan**: Be prepared to revert changes if issues arise

## Success Criteria

The implementation will be considered successful when:

1. All tests pass with the factory pattern implementation
2. The code is more maintainable and easier to understand
3. The circular dependency is properly managed through the factory pattern
4. The implementation pattern is documented for other teams

## Next Steps After Implementation

1. Document the implementation pattern for other teams
2. Create a pull request for review
3. Proceed with the ParserService ↔ ResolutionService implementation
4. Plan for the eventual removal of the ServiceMediator 