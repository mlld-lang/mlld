/**
 * Regression test for the circular dependency issue in PathService and FileSystemService.
 * This test ensures that the issue discovered in PR #4 does not recur.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js'; 
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import { container } from 'tsyringe';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver.js';

describe('Circular Dependency Regression Tests', () => {
  let context: TestContextDI;

  beforeEach(() => {
    context = TestContextDI.create();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  /**
   * This test reproduces exactly the issue seen in PR #4 and ensures our
   * lazy-loading solution prevents it from happening again.
   * 
   * The issue was:
   * 1. PathService needed FileSystemServiceClientFactory
   * 2. FileSystemServiceClientFactory needed FileSystemService
   * 3. FileSystemService needed PathServiceClientFactory
   * 4. PathServiceClientFactory needed PathService
   * 
   * Our solution was to make initialization lazy, so services don't try to
   * resolve their dependencies until actually needed.
   */
  it('should allow complex circular dependencies with lazy loading', async () => {
    // Create services with circular dependencies in the same order as di-config.ts
    const nodeFileSystem = new NodeFileSystem();
    const pathOps = new PathOperationsService();
    const projectPathResolver = new ProjectPathResolver();
    const urlContentResolver = new URLContentResolver();
    
    // Register core dependencies
    context.registerMock('IFileSystem', nodeFileSystem);
    context.registerMock('NodeFileSystem', nodeFileSystem);
    context.registerMock('IPathOperationsService', pathOps);
    context.registerMock(ProjectPathResolver, projectPathResolver);
    context.registerMock('IURLContentResolver', urlContentResolver);
    
    // Now register the full service classes that will have circular dependencies
    context.registerMockClass('PathService', PathService);
    context.registerMockClass('FileSystemService', FileSystemService);
    context.registerMockClass('PathServiceClientFactory', PathServiceClientFactory);
    context.registerMockClass('FileSystemServiceClientFactory', FileSystemServiceClientFactory);
    
    // CRITICAL TEST: These two services have circular dependencies
    // If the lazy loading fix isn't working, this will fail
    const pathService = await context.resolve<PathService>('PathService');
    const fileSystemService = await context.resolve<FileSystemService>('FileSystemService');
    
    // Verify we got actual instances
    expect(pathService).toBeInstanceOf(PathService);
    expect(fileSystemService).toBeInstanceOf(FileSystemService);
    
    // Verify PathService can handle a filesystem client request
    pathService.setTestMode(true);
    const exists = await pathService.exists('test-file.txt');
    expect(typeof exists).toBe('boolean');
    
    // Verify FileSystemService can handle a path client request
    const isDir = await fileSystemService.isDirectory('test-dir');
    expect(typeof isDir).toBe('boolean');
  });
  
  /**
   * This regression test confirms that we can resolve services with circular 
   * dependencies from a manually configured container.
   */
  it('should resolve services with circular dependencies from a manually configured container', async () => {
    // Create a child container for this test to isolate it
    const childContainer = container.createChildContainer();
    
    // Create the basic services
    const nodeFileSystem = new NodeFileSystem();
    const pathOps = new PathOperationsService();
    const projectPathResolver = new ProjectPathResolver();
    const urlContentResolver = new URLContentResolver();
    
    // Register core services directly to simulate our di-config
    childContainer.registerInstance('IFileSystem', nodeFileSystem);
    childContainer.registerInstance('NodeFileSystem', nodeFileSystem);
    childContainer.registerInstance('IPathOperationsService', pathOps);
    childContainer.registerInstance(ProjectPathResolver, projectPathResolver);
    childContainer.registerInstance('IURLContentResolver', urlContentResolver);
    
    // Register the services with circular dependencies
    childContainer.register('PathService', { useClass: PathService });
    childContainer.register('IPathService', { useToken: 'PathService' });
    
    childContainer.register('FileSystemService', { useClass: FileSystemService });
    childContainer.register('IFileSystemService', { useToken: 'FileSystemService' });
    
    childContainer.register('PathServiceClientFactory', { useClass: PathServiceClientFactory });
    childContainer.register('FileSystemServiceClientFactory', { useClass: FileSystemServiceClientFactory });
    
    // If the lazy loading approach isn't working, these will fail with circular dependency errors
    const pathService = childContainer.resolve<PathService>('PathService');
    const fileSystemService = childContainer.resolve<FileSystemService>('FileSystemService');
    const pathFactory = childContainer.resolve<PathServiceClientFactory>('PathServiceClientFactory');
    const fsFactory = childContainer.resolve<FileSystemServiceClientFactory>('FileSystemServiceClientFactory');
    
    // Verify we got actual instances
    expect(pathService).toBeInstanceOf(PathService);
    expect(fileSystemService).toBeInstanceOf(FileSystemService);
    expect(pathFactory).toBeInstanceOf(PathServiceClientFactory);
    expect(fsFactory).toBeInstanceOf(FileSystemServiceClientFactory);
    
    // Test basic functionality
    pathService.setTestMode(true);
    const projectPath = pathService.resolveProjectPath('test.txt');
    expect(projectPath).toBeDefined();
  });
}); 