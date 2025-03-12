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

## Implementation Insights

During the actual implementation, we discovered several important insights that influenced our approach:

1. **Constructor Injection Challenges**: Direct constructor injection of factories can cause circular dependency issues in tests. The DI container may not have all factories registered when services are being constructed.

2. **Container Resolution**: Using `container.resolve()` in the constructor is more robust than constructor injection for factories. This allows services to attempt to resolve factories at runtime without requiring them to be available at construction time.

3. **Graceful Degradation**: Implementing proper error handling and fallback mechanisms is essential for backward compatibility. Services should gracefully fall back to the ServiceMediator when factories are not available or fail.

4. **Incremental Testing**: The implementation needs to be incremental with thorough testing at each step to ensure backward compatibility is maintained.

5. **Test Environment Considerations**: Test environments may not have all factories registered, so services need to be resilient to missing factories.

## Revised Implementation Steps

Based on our implementation experience, here are the revised implementation steps:

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
      normalizePath: (path) => this.pathService.normalizePath(path)
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
import { IPathServiceClient } from '@services/fs/PathService/interfaces/IPathServiceClient.js';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
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
   * @param fileSystem - File system implementation to use (optional, defaults to NodeFileSystem)
   * @param pathClientFactory - Factory for creating PathServiceClient instances (preferred over mediator)
   */
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

  /**
   * Resolves a path using the path client or service mediator
   * @private
   * @param filePath - The path to resolve
   * @returns The resolved path
   */
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
import { container } from 'tsyringe';
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
  private fsClientFactory?: FileSystemServiceClientFactory;

  /**
   * Creates a new PathService with dependencies injected.
   * 
   * @param serviceMediator Service mediator for resolving circular dependencies
   * @param projectPathResolver Resolver for project paths
   */
  constructor(
    @inject('IServiceMediator') private readonly serviceMediator: IServiceMediator,
    @inject(ProjectPathResolver) private readonly projectPathResolver: ProjectPathResolver
  ) {
    const homeEnv = process.env.HOME || process.env.USERPROFILE;
    if (!homeEnv && !this.testMode) {
      throw new Error('Unable to determine home directory: HOME or USERPROFILE environment variables are not set');
    }
    this.homePath = homeEnv || '';
    this.projectPath = process.cwd();
    
    // Register this service with the mediator
    this.serviceMediator.setPathService(this);
    
    // Try to resolve the factory from the container
    try {
      this.fsClientFactory = container.resolve('FileSystemServiceClientFactory');
      this.initializeFileSystemClient();
    } catch (error) {
      // Factory not available, will use mediator
      logger.debug('FileSystemServiceClientFactory not available, using ServiceMediator for filesystem operations');
    }
  }

  /**
   * Initialize the FileSystemServiceClient using the factory
   * This is called automatically in the constructor if the factory is available
   */
  private initializeFileSystemClient(): void {
    if (!this.fsClientFactory) {
      return;
    }
    
    try {
      this.fsClient = this.fsClientFactory.createClient();
      logger.debug('Successfully created FileSystemServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create FileSystemServiceClient, falling back to ServiceMediator', { error });
      this.fsClient = undefined;
    }
  }

  /**
   * Check if a path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return false;
    }
    
    try {
      const resolvedPath = this.resolvePath(targetPath);
      
      // Try factory client first if available
      if (this.fsClient) {
        try {
          return await this.fsClient.exists(resolvedPath);
        } catch (error) {
          logger.warn('Error using fsClient.exists, falling back to ServiceMediator', { 
            error, 
            path: resolvedPath 
          });
        }
      }
      
      // Fall back to mediator
      return this.serviceMediator.exists(resolvedPath);
    } catch (error) {
      logger.error('Error checking path existence', { path: targetPath, error });
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  async isDirectory(targetPath: string): Promise<boolean> {
    if (!targetPath) {
      return false;
    }
    
    try {
      const resolvedPath = this.resolvePath(targetPath);
      
      // Try factory client first if available
      if (this.fsClient) {
        try {
          return await this.fsClient.isDirectory(resolvedPath);
        } catch (error) {
          logger.warn('Error using fsClient.isDirectory, falling back to ServiceMediator', { 
            error, 
            path: resolvedPath 
          });
        }
      }
      
      // Fall back to mediator
      return this.serviceMediator.isDirectory(resolvedPath);
    } catch (error) {
      logger.error('Error checking if path is directory', { path: targetPath, error });
      return false;
    }
  }

  // Rest of the implementation remains unchanged
}
```

### 6. Update TestContextDI to Register Factory Mocks

```typescript
// tests/utils/di/TestContextDI.ts
// Add to the registerServices method
private registerFactories(): void {
  // Register PathServiceClientFactory mock
  const mockPathServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockPathClient: IPathServiceClient = {
        resolvePath: vi.fn().mockImplementation((path: string) => path),
        normalizePath: vi.fn().mockImplementation((path: string) => path)
      };
      return mockPathClient;
    })
  };
  
  // Register FileSystemServiceClientFactory mock
  const mockFileSystemServiceClientFactory = {
    createClient: vi.fn().mockImplementation(() => {
      const mockFileSystemClient: IFileSystemServiceClient = {
        exists: vi.fn().mockImplementation(async (path: string) => {
          try {
            return await this.fs.exists(path);
          } catch (error) {
            return false;
          }
        }),
        isDirectory: vi.fn().mockImplementation(async (path: string) => {
          try {
            const stats = await this.fs.stat(path);
            return stats.isDirectory();
          } catch (error) {
            return false;
          }
        })
      };
      return mockFileSystemClient;
    })
  };
  
  this.container.registerMock('PathServiceClientFactory', mockPathServiceClientFactory);
  this.container.registerMock('FileSystemServiceClientFactory', mockFileSystemServiceClientFactory);
}
```

## Implementation Sequence

To ensure a smooth transition, we implemented the changes in the following sequence:

1. Created client interfaces
2. Created factory classes
3. Updated DI container configuration
4. Updated FileSystemService to use factory while maintaining ServiceMediator compatibility
5. Tested the changes to ensure FileSystemService worked correctly
6. Updated PathService to use container.resolve() for the factory while maintaining ServiceMediator compatibility
7. Updated TestContextDI to register factory mocks
8. Ran all tests to verify functionality

## Backward Compatibility

Throughout the implementation, we maintained backward compatibility by:

1. Keeping the ServiceMediator registration and usage
2. Adding the factory pattern as an alternative
3. Preferring the factory pattern when available
4. Falling back to the ServiceMediator when the factory is not available or fails
5. Adding comprehensive error handling and logging

## Testing Strategy

We used a comprehensive testing approach:

1. **Incremental Testing**: Test after each small change
2. **Regression Tests**: Run all existing tests to ensure no regressions
3. **Compatibility Tests**: Verify both factory and mediator approaches work
4. **Error Handling Tests**: Verify graceful degradation when factories are not available

## Lessons Learned

1. **Avoid Constructor Injection for Factories**: Use container.resolve() instead to avoid circular dependency issues
2. **Implement Robust Error Handling**: Always include try/catch blocks when using factories
3. **Provide Fallback Mechanisms**: Always fall back to ServiceMediator when factories are not available
4. **Update Test Environment**: Ensure TestContextDI registers factory mocks
5. **Make Small, Incremental Changes**: Test after each change to catch issues early

## Next Steps

1. Document the implementation pattern for other teams
2. Create a pull request for review
3. Proceed with the ParserService ↔ ResolutionService implementation
4. Plan for the eventual removal of the ServiceMediator 