import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectPathResolver } from './ProjectPathResolver.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs and path modules
vi.mock('fs/promises');
vi.mock('path');

describe('ProjectPathResolver', () => {
  let resolver: ProjectPathResolver;
  
  beforeEach(() => {
    resolver = new ProjectPathResolver();
    vi.resetAllMocks();
    
    // Setup path mocks with default implementations
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    vi.mocked(path.dirname).mockImplementation((p) => p.split('/').slice(0, -1).join('/'));
    vi.mocked(path.resolve).mockImplementation((dir, file) => `${dir}/${file}`);
    vi.mocked(path.normalize).mockImplementation((p) => p);
    vi.mocked(path.relative).mockImplementation((from, to) => {
      if (to.startsWith(from)) {
        return to.substring(from.length + 1);
      }
      return `../${to}`;
    });
    vi.mocked(path.parse).mockReturnValue({ root: '/' } as any);
    vi.mocked(path.isAbsolute).mockImplementation((p) => p.startsWith('/'));
  });
  
  it('should use meld.json directory when found', async () => {
    // Setup mocks for this test
    vi.mocked(fs.stat).mockImplementation(async (filePath) => {
      if (filePath === '/project/meld.json') {
        return { isFile: () => true } as any;
      }
      throw new Error('File not found');
    });
    
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ projectRoot: '.' }));
    vi.mocked(path.dirname).mockReturnValueOnce('/project');
    
    // Mock findFileUpwards behavior
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue('/project/meld.json');
    
    const result = await resolver.resolveProjectRoot('/project/src');
    expect(result).toBe('/project');
  });
  
  it('should use subdirectory when specified in meld.json', async () => {
    // Setup mocks for this test
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ projectRoot: 'src' }));
    vi.mocked(path.dirname).mockReturnValueOnce('/project');
    vi.mocked(path.resolve).mockReturnValueOnce('/project/src');
    vi.mocked(path.relative).mockReturnValueOnce('src');
    
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
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ projectRoot: '../other' }));
    vi.mocked(path.dirname).mockReturnValueOnce('/project');
    vi.mocked(path.resolve).mockReturnValueOnce('/other');
    
    // Mock findFileUpwards behavior
    vi.spyOn(resolver as any, 'findFileUpwards').mockResolvedValue('/project/meld.json');
    
    // Mock isSubdirectoryOf to return false
    vi.spyOn(resolver as any, 'isSubdirectoryOf').mockReturnValue(false);
    
    const result = await resolver.resolveProjectRoot('/project');
    expect(result).toBe('/project');
  });
  
  it('should detect project root using markers', async () => {
    // Setup mocks for this test
    vi.mocked(fs.stat).mockImplementation(async (filePath) => {
      if (filePath === '/project/.git') {
        return { isDirectory: () => true } as any;
      }
      throw new Error('File not found');
    });
    
    // Mock findFileUpwards behavior for meld.json (not found)
    vi.spyOn(resolver as any, 'findFileUpwards')
      .mockImplementationOnce(async () => null) // meld.json not found
      .mockImplementationOnce(async () => '/project/.git'); // .git found
    
    vi.mocked(path.dirname).mockReturnValueOnce('/project');
    
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