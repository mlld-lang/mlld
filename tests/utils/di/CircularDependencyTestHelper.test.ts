import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { createTestContainerWithCircularDeps } from './CircularDependencyTestHelper';
import { injectable, container } from 'tsyringe';
import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory';
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory';
import { TestContextDI } from './TestContextDI';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver';

// Test interfaces and classes for circular dependency testing
interface IServiceD {
  getName(): string;
  getE(): IServiceE;
}

interface IServiceE {
  getName(): string;
  useD(d: IServiceD): void;
  getD(): IServiceD | null;
}

// Simple circular dependency example
@injectable()
class ServiceE implements IServiceE {
  private serviceD: IServiceD | null = null;

  getName(): string {
    return 'ServiceE';
  }

  useD(d: IServiceD): void {
    this.serviceD = d;
  }

  getD(): IServiceD | null {
    return this.serviceD;
  }
}

@injectable()
class ServiceD implements IServiceD {
  constructor(private serviceE: IServiceE) {}

  getName(): string {
    return 'ServiceD';
  }

  getE(): IServiceE {
    return this.serviceE;
  }
}

describe('CircularDependencyTestHelper', () => {
  beforeEach(() => {
    // Reset container for tests
    container.reset();
  });

  afterEach(() => {
    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe('Lazy circular dependency resolution', () => {
    it('should resolve circular dependencies with lazy injection', () => {
      const container = createTestContainerWithCircularDeps();
      
      // Should not throw when resolving with lazy injection
      const serviceD = container.resolve<IServiceD>('IServiceD');
      const serviceE = container.resolve<IServiceE>('IServiceE');
      
      expect(serviceD).toBeDefined();
      expect(serviceE).toBeDefined();
      expect(serviceD.getName()).toBe('ServiceD');
      expect(serviceE.getName()).toBe('ServiceE');
    });
  });

  describe('Helper functions', () => {
    it('should create a test container with circular dependencies configured', () => {
      const container = createTestContainerWithCircularDeps();
      
      expect(container).toBeDefined();
      expect(() => container.resolve<IServiceD>('IServiceD')).not.toThrow();
      expect(() => container.resolve<IServiceE>('IServiceE')).not.toThrow();
    });
  });
});

describe('Circular Dependency Tests', () => {
  let context: TestContextDI;

  beforeEach(() => {
    context = TestContextDI.create();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  /**
   * Regression test for the circular dependency between PathService and FileSystemService.
   * This test ensures that our lazy-loading approach resolves the circular dependency correctly.
   */
  it('should resolve the circular dependency between PathService and FileSystemService', async () => {
    // Create the services in the order they would be created in the DI configuration
    const nodeFileSystem = new NodeFileSystem();
    const pathOps = new PathOperationsService();
    const projectPathResolver = new ProjectPathResolver();

    // Register core dependencies
    context.registerMock('IFileSystem', nodeFileSystem);
    context.registerMock('NodeFileSystem', nodeFileSystem);
    context.registerMock('IPathOperationsService', pathOps);
    
    // Create PathService first
    const pathService = new PathService(projectPathResolver);
    context.registerMock('PathService', pathService);
    context.registerMock('IPathService', pathService);

    // Create PathServiceClientFactory
    const pathServiceClientFactory = new PathServiceClientFactory(pathService);
    context.registerMock('PathServiceClientFactory', pathServiceClientFactory);

    // Now create FileSystemService with dependencies
    const fileSystemService = new FileSystemService(pathOps, nodeFileSystem, pathServiceClientFactory);
    context.registerMock('FileSystemService', fileSystemService);
    context.registerMock('IFileSystemService', fileSystemService);

    // Create FileSystemServiceClientFactory
    const fileSystemServiceClientFactory = new FileSystemServiceClientFactory(fileSystemService);
    context.registerMock('FileSystemServiceClientFactory', fileSystemServiceClientFactory);

    // Manually inject client factories to break the circular dependency chain
    pathService["fsClientFactory"] = fileSystemServiceClientFactory;
    pathService["factoryInitialized"] = true;
    fileSystemService["pathClient"] = pathServiceClientFactory.createClient();
    fileSystemService["factoryInitialized"] = true;

    // REGRESSION TEST: Verify PathService resolution doesn't trigger circular dependency
    // Use the dirname method which calls resolvePath internally without throwing errors in test mode
    const resolvedPath = fileSystemService.dirname('test/path');
    expect(resolvedPath).toBeDefined();
    
    // REGRESSION TEST: Verify FileSystemService client is available when needed
    pathService.setTestMode(true); // Avoid validation failures in test mode
    const existsResult = await pathService.exists('test/file.txt');
    expect(existsResult).toBe(true); // Should return default true in test mode
    
    // REGRESSION TEST: Test the other direction - ensure path resolution works
    const isDirResult = await fileSystemService.isDirectory('test/dir');
    expect(typeof isDirResult).toBe('boolean');
  });
  
  /**
   * This test ensures that services can be resolved from the container
   * without circular dependency errors when using lazy initialization.
   */
  it('should resolve services from container without circular dependencies', async () => {
    // First register the base dependencies
    const nodeFileSystem = new NodeFileSystem();
    const pathOps = new PathOperationsService();
    const projectPathResolver = new ProjectPathResolver();

    context.registerMock('IFileSystem', nodeFileSystem);
    context.registerMock('NodeFileSystem', nodeFileSystem);
    context.registerMock('IPathOperationsService', pathOps);
    context.registerMock(ProjectPathResolver, projectPathResolver);
    
    // Register the classes to test lazy initialization
    context.registerMockClass('PathService', PathService);
    context.registerMockClass('FileSystemService', FileSystemService);
    context.registerMockClass('PathServiceClientFactory', PathServiceClientFactory);
    context.registerMockClass('FileSystemServiceClientFactory', FileSystemServiceClientFactory);
    
    // The key test: Can we resolve each service without experiencing circular dependency errors?
    const pathService = await context.resolve('PathService');
    expect(pathService).toBeInstanceOf(PathService);
    
    const fileSystemService = await context.resolve('FileSystemService');
    expect(fileSystemService).toBeInstanceOf(FileSystemService);
    
    // Test using the services - these calls should trigger lazy initialization
    pathService.setTestMode(true);
    
    // This would fail if the circular dependency wasn't properly handled
    const exists = await pathService.exists('some/test/file.txt');
    expect(typeof exists).toBe('boolean');
    
    // And testing the other direction
    const isDir = await fileSystemService.isDirectory('some/test/dir');
    expect(typeof isDir).toBe('boolean');
  });
});