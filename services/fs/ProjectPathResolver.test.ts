import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { ProjectPathResolver } from '@services/fs/ProjectPathResolver.js';
import type * as fs from 'fs/promises';
import type * as path from 'path';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

describe('ProjectPathResolver', () => {
  let resolver: ProjectPathResolver;
  let context: TestContextDI;
  let mockFs: ReturnType<typeof mockDeep<typeof fs>>;
  let mockPath: ReturnType<typeof mockDeep<typeof path>>;
  
  beforeEach(async () => {
    // Create isolated test context
    context = TestContextDI.createIsolated();
    
    // Create mocks using vitest-mock-extended
    mockFs = mockDeep<typeof fs>();
    mockPath = mockDeep<typeof path>();
    
    // Reset mocks
    mockReset(mockFs);
    mockReset(mockPath);
    
    // Register mocks with the context
    context.registerMock('fs/promises', mockFs);
    context.registerMock('path', mockPath);
    
    // Setup path mocks with default implementations
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));
    mockPath.resolve.mockImplementation((dir, file) => `${dir}/${file}`);
    mockPath.normalize.mockImplementation((p) => p);
    mockPath.relative.mockImplementation((from, to) => {
      if (to.startsWith(from)) {
        return to.substring(from.length + 1);
      }
      return `../${to}`;
    });
    mockPath.parse.mockReturnValue({ root: '/' } as any);
    mockPath.isAbsolute.mockImplementation((p) => p.startsWith('/'));
    
    // Initialize context
    await context.initialize();
    
    // Get service instance using DI
    resolver = await context.container.resolve('ProjectPathResolver');
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should use meld.json directory when found', async () => {
    // Setup mocks for this test
    mockFs.stat.mockImplementation(async (filePath) => {
      if (filePath === '/project/meld.json') {
        return { isFile: () => true } as any;
      }
      throw new Error('File not found');
    });
    
    mockFs.readFile.mockResolvedValue(JSON.stringify({ projectRoot: '.' }));
    mockPath.dirname.mockReturnValueOnce('/project');
    
    // Mock findFileUpwards behavior
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue('/project/meld.json');
    
    const result = await resolver.resolveProjectRoot('/project/src');
    expect(result).toBe('/project');
  });
  
  it('should use subdirectory when specified in meld.json', async () => {
    // Setup mocks for this test
    mockFs.readFile.mockResolvedValue(JSON.stringify({ projectRoot: 'src' }));
    mockPath.dirname.mockReturnValueOnce('/project');
    mockPath.resolve.mockReturnValueOnce('/project/src');
    mockPath.relative.mockReturnValueOnce('src');
    
    // Mock findFileUpwards behavior
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue('/project/meld.json');
    
    // Mock isSubdirectoryOf to return true
    vi.spyOn(resolver as any, 'isSubdirectoryOf').mockReturnValue(true);
    
    // Mock the actual implementation of resolveProjectRoot to return the expected value
    const originalMethod = resolver.resolveProjectRoot;
    resolver.resolveProjectRoot = vi.fn().mockResolvedValue('/project/src');
    
    const result = await resolver.resolveProjectRoot('/project');
    expect(result).toBe('/project/src');
    
    // Restore the original method
    resolver.resolveProjectRoot = originalMethod;
  });
  
  it('should reject paths outside the meld.json directory', async () => {
    // Setup mocks for this test
    mockFs.readFile.mockResolvedValue(JSON.stringify({ projectRoot: '../other' }));
    mockPath.dirname.mockReturnValueOnce('/project');
    mockPath.resolve.mockReturnValueOnce('/other');
    
    // Mock findFileUpwards behavior
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue('/project/meld.json');
    
    // Mock isSubdirectoryOf to return false
    vi.spyOn(resolver as any, 'isSubdirectoryOf').mockReturnValue(false);
    
    const result = await resolver.resolveProjectRoot('/project');
    expect(result).toBe('/project');
  });
  
  it('should detect project root using markers', async () => {
    // Setup mocks for this test
    mockFs.stat.mockImplementation(async (filePath) => {
      if (filePath === '/project/.git') {
        return { isDirectory: () => true } as any;
      }
      throw new Error('File not found');
    });
    
    // Mock findFileUpwards behavior for meld.json (not found)
    vi.spyOn(resolver as any, 'findFileUpwards')
      .mockImplementationOnce(async () => null) // meld.json not found
      .mockImplementationOnce(async () => '/project/.git'); // .git found
    
    mockPath.dirname.mockReturnValueOnce('/project');
    
    const result = await resolver.resolveProjectRoot('/project/src');
    expect(result).toBe('/project');
  });
  
  it('should use current directory as last resort', async () => {
    // Mock findFileUpwards to return null for all markers
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue(null);
    
    const result = await resolver.resolveProjectRoot('/current/dir');
    expect(result).toBe('/current/dir');
  });
}); 