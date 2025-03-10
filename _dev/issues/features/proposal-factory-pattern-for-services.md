# Proposal: Factory pattern for services

Following #1, circular dependencies are managed through the ServiceMediator pattern, which acts as an intermediary between services with circular dependencies. We can do better than this!

## Why ServiceMediator isn't ideal

The ServiceMediator pattern was a practical transitional solution during our DI migration, but it comes with some architectural drawbacks:

1. **Tight Coupling**: Services with circular dependencies all become coupled to the mediator, creating a single point where many services depend on one central component.

2. **Hidden Dependencies**: When a service uses the mediator, it's not immediately clear which specific services it actually needs - making the true dependencies less obvious.

3. **Maintenance Overhead**: The mediator needs updating every time a service interface changes or a new circular dependency appears.

4. **Testing Headaches**: Testing becomes trickier because you have to mock the entire mediator and all its methods rather than just the specific dependencies you care about.

5. **Null Checks Everywhere**: Since services register with the mediator at different times, we need null checks before using any service from the mediator.

## How factories can help us

Here's why a factory approach would be better:

1. **Clear Dependencies**: Each service explicitly states what it needs, rather than depending on a catch-all mediator.

2. **Interface Segregation**: Services only get access to the specific methods they need, not the entire interface of another service.

3. **Simpler Testing**: With smaller, focused interfaces, testing becomes much easier - you only need to mock the specific functionality a service uses.

4. **Lazy Initialization**: Services can be initialized in any order since dependencies are resolved when actually needed.

5. **Better Maintainability**: Changes to one service interface won't ripple through all services connected to the mediator.

## Current approach vs. Factory pattern approach

Let's look at an example with the FileSystemService ↔ PathService circular dependency:

### Current Implementation with ServiceMediator:

```typescript
// FileSystemService needs PathService for path resolution
class FileSystemService {
  constructor(
    private pathOps: IPathOperationsService,
    private serviceMediator?: IServiceMediator
  ) {
    // Register with mediator
    if (this.serviceMediator) {
      this.serviceMediator.setFileSystemService(this);
    }
  }

  private resolvePath(filePath: string): string {
    // Must check if mediator exists
    if (this.serviceMediator) {
      return this.serviceMediator.resolvePath(filePath);
    }
    // Fall back logic or error
    return filePath;
  }
}

// PathService needs FileSystemService to check if paths exist
class PathService {
  constructor(private serviceMediator?: IServiceMediator) {
    // Register with mediator
    if (this.serviceMediator) {
      this.serviceMediator.setPathService(this);
    }
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    // Must check if mediator exists
    if (this.serviceMediator) {
      return this.serviceMediator.isDirectory(targetPath);
    }
    // Fall back logic or error
    return false;
  }
}

// Mediator implementation
class ServiceMediator {
  private fileSystemService?: IFileSystemService;
  private pathService?: IPathService;

  // Registration methods
  setFileSystemService(service: IFileSystemService): void {
    this.fileSystemService = service;
  }

  setPathService(service: IPathService): void {
    this.pathService = service;
  }

  // Mediator methods for FileSystem → Path
  resolvePath(path: string): string {
    // Must check if service exists
    if (!this.pathService) {
      throw new Error("PathService not initialized in mediator");
    }
    return this.pathService.resolvePath(path);
  }

  // Mediator methods for Path → FileSystem
  async isDirectory(path: string): Promise<boolean> {
    // Must check if service exists
    if (!this.fileSystemService) {
      throw new Error("FileSystemService not initialized in mediator");
    }
    return this.fileSystemService.isDirectory(path);
  }
}
```

### Proposed Factory Pattern Approach:

```typescript
// Define minimal interfaces for what each service needs
export interface IPathResolver {
  resolvePath(path: string): string;
  normalizePath(path: string): string;
}

export interface IFileSystemChecker {
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}

// Path resolver factory - creates path resolver for FileSystemService
@Service()
export class PathResolverFactory {
  constructor(@inject('IPathService') private pathService: IPathService) {}
  
  createResolver(): IPathResolver {
    return {
      resolvePath: (path) => this.pathService.resolvePath(path),
      normalizePath: (path) => this.pathService.normalizePath(path)
    };
  }
}

// FileSystem checker factory - creates checker for PathService
@Service()
export class FileSystemCheckerFactory {
  constructor(@inject('IFileSystemService') private fs: IFileSystemService) {}
  
  createChecker(): IFileSystemChecker {
    return {
      isDirectory: (path) => this.fs.isDirectory(path),
      exists: (path) => this.fs.exists(path)
    };
  }
}

// Updated FileSystemService - uses PathResolver directly
@Service()
export class FileSystemService implements IFileSystemService {
  private pathResolver: IPathResolver;
  
  constructor(
    @inject('IPathOperationsService') private pathOps: IPathOperationsService,
    @inject('PathResolverFactory') pathResolverFactory: PathResolverFactory,
    @inject('IFileSystem') fileSystem: IFileSystem | null = null
  ) {
    this.fs = fileSystem || new NodeFileSystem();
    this.pathResolver = pathResolverFactory.createResolver();
  }
  
  private resolvePath(filePath: string): string {
    // Direct call, no null checks needed
    return this.pathResolver.resolvePath(filePath);
  }
}

// Updated PathService - uses FileSystemChecker directly
@Service()
export class PathService implements IPathService {
  private fsChecker: IFileSystemChecker;
  
  constructor(
    @inject('FileSystemCheckerFactory') fsCheckerFactory: FileSystemCheckerFactory
  ) {
    this.fsChecker = fsCheckerFactory.createChecker();
  }
  
  async isDirectory(targetPath: string): Promise<boolean> {
    if (!targetPath) return false;
    try {
      const resolvedPath = this.resolvePath(targetPath);
      // Direct call, no null checks needed
      return this.fsChecker.isDirectory(resolvedPath);
    } catch (error) {
      logger.error('Error checking if path is directory', { path: targetPath, error });
      return false;
    }
  }
}
```

We'd follow the same pattern for other circular dependencies like ParserService ↔ ResolutionService.

## What's great about the Factory Pattern approach

1. **Explicit Dependencies**: Services say exactly what they need - no more mystery dependencies through the mediator.

2. **No More Null Checks**: The factory pattern gets rid of those pesky null checks. Since the factory creates components at initialization time, we know they exist.

3. **Focused Interfaces**: We only expose the specific methods needed through minimal interfaces instead of entire service interfaces.

4. **Testing is Way Easier**: You can mock smaller interfaces rather than an entire mediator with tons of methods.

5. **Less Coupling**: Services aren't coupled to a central mediator that knows about everything. Each service only connects to the specific factories it needs.

6. **Cleaner Code**: It's much more intuitive to read `pathResolver.resolvePath()` than `serviceMediator.resolvePath()`.

7. **Future-proof**: Adding new services or changing existing ones requires fewer changes across the codebase since dependencies are more localized.

## How this fits with our architecture

This approach keeps all the good parts of our current architecture:

1. **Interface-First Design**: We still use the interface-first approach, just with more focused interfaces for specific dependencies
2. **Dependency Injection**: Everything still uses the DI container
3. **Single Responsibility Principle**: Each factory has a specific job
4. **Testing Infrastructure**: Works perfectly with our TestContextDI

The main change is replacing the all-purpose ServiceMediator with smaller, focused factories that solve specific problems.

## How we can implement this (without breaking tests)

We can roll this out incrementally to keep our 1100+ tests passing:

### Step 1: Add new factory interfaces and implementations

```typescript
// Add these files without touching existing code
export interface IPathResolver { /* ... */ }
export class PathResolverFactory { /* ... */ }
```

### Step 2: Register factories in the DI container

```typescript
// In di-config.ts, add these registrations (don't remove anything yet)
container.register('PathResolverFactory', { useClass: PathResolverFactory });
container.register('FileSystemCheckerFactory', { useClass: FileSystemCheckerFactory });
```

### Step 3: Update services to use factories while keeping mediator support

```typescript
export class FileSystemService {
  private pathResolver?: IPathResolver;
  
  constructor(
    pathOps: IPathOperationsService,
    serviceMediator?: IServiceMediator,
    pathResolverFactory?: PathResolverFactory
  ) {
    // Keep mediator for backward compatibility
    if (serviceMediator) {
      this.serviceMediator = serviceMediator;
      serviceMediator.setFileSystemService(this);
    }
    
    // Use factory if available (new approach)
    if (pathResolverFactory) {
      this.pathResolver = pathResolverFactory.createResolver();
    }
  }
  
  private resolvePath(filePath: string): string {
    // Try new approach first
    if (this.pathResolver) {
      return this.pathResolver.resolvePath(filePath);
    }
    
    // Fall back to mediator for backward compatibility
    if (this.serviceMediator) {
      logger.debug('Using mediator for path resolution (legacy mode)');
      return this.serviceMediator.resolvePath(filePath);
    }
    
    // Last resort fallback
    return filePath;
  }
}
```

### Step 4: Run tests, fix any issues

### Step 5: Gradually phase out ServiceMediator once all services use factories

## A concrete example for FileSystemService ↔ PathService

Here's a detailed example for this specific circular dependency:

### 1. Create the new interfaces and factories

**services/fs/PathService/interfaces/IPathResolver.ts**:
```typescript
/**
 * Minimal interface for path resolution functionality
 * Used to break circular dependency with FileSystemService
 */
export interface IPathResolver {
  /**
   * Resolves a path to an absolute path
   * @param path The path to resolve
   * @returns The resolved absolute path
   */
  resolvePath(path: string): string;
  
  /**
   * Normalizes a path according to platform conventions
   * @param path The path to normalize
   * @returns The normalized path
   */
  normalizePath(path: string): string;
}
```

**services/fs/PathService/factories/PathResolverFactory.ts**:
```typescript
import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { IPathService } from '../IPathService';
import { IPathResolver } from '../interfaces/IPathResolver';
import { pathLogger as logger } from '@core/utils/logger';

/**
 * Factory that creates path resolvers for other services
 * Helps break circular dependency between FileSystemService and PathService
 */
@injectable()
@Service({
  description: 'Factory for creating path resolvers'
})
export class PathResolverFactory {
  constructor(@inject('IPathService') private pathService: IPathService) {}
  
  /**
   * Creates a path resolver that delegates to PathService
   * @returns An IPathResolver implementation
   */
  createResolver(): IPathResolver {
    logger.debug('Creating path resolver');
    return {
      resolvePath: (path) => this.pathService.resolvePath(path),
      normalizePath: (path) => this.pathService.normalizePath(path)
    };
  }
}
```

We'd create similar interfaces and factories for the FileSystemChecker.

### 2. Update DI Configuration

```typescript
// In di-config.ts, add after existing service registrations:

// Register factories for breaking circular dependencies
container.register('PathResolverFactory', { useClass: PathResolverFactory });
container.register('FileSystemCheckerFactory', { useClass: FileSystemCheckerFactory });
```

### 3. Update the services to use factories

Update both services to use the factories while maintaining backward compatibility with ServiceMediator.

## In conclusion

This factory pattern approach gives us a more modular, maintainable architecture that:

1. **Simplifies everything** by replacing a big monolithic mediator with focused factories
2. **Makes testing easier** by providing smaller interfaces to mock
3. **Makes the code clearer** by making dependencies explicit
4. **Gets rid of null checks** and related error handling
5. **Maintains compatibility** during the transition

Best of all, we can implement this step by step without breaking existing functionality, keeping all our tests passing throughout the transition.

What do you think? Should we give this approach a try?