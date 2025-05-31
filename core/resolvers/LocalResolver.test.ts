import { describe, it, expect, beforeEach } from 'vitest';
import { LocalResolver } from './LocalResolver';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { MlldResolutionError, MlldFileNotFoundError } from '@core/errors';

describe('LocalResolver', () => {
  let resolver: LocalResolver;
  let fileSystem: MemoryFileSystem;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    resolver = new LocalResolver(fileSystem);
    
    // Set up test files
    await fileSystem.mkdir('/project');
    await fileSystem.mkdir('/project/modules');
    await fileSystem.writeFile('/project/modules/utils.mld', '@text greeting = "Hello from utils"');
    await fileSystem.writeFile('/project/modules/config.json', '{"version": "1.0.0"}');
    await fileSystem.writeFile('/project/README.md', '# Test Project');
  });
  
  describe('canResolve', () => {
    it('should accept any reference with valid config', () => {
      const config = { basePath: '/project' };
      
      expect(resolver.canResolve('@local/file.mld', config)).toBe(true);
      expect(resolver.canResolve('any/path', config)).toBe(true);
    });
    
    it('should reject references without basePath', () => {
      expect(resolver.canResolve('@local/file.mld')).toBe(false);
      expect(resolver.canResolve('@local/file.mld', {})).toBe(false);
    });
  });
  
  describe('resolve', () => {
    it('should resolve files relative to basePath', async () => {
      const config = { basePath: '/project' };
      
      const result = await resolver.resolve('modules/utils.mld', config);
      
      expect(result.content).toBe('@text greeting = "Hello from utils"');
      expect(result.metadata?.source).toBe('file:///project/modules/utils.mld');
      expect(result.metadata?.mimeType).toBe('text/x-mlld');
    });
    
    it('should handle absolute paths within basePath', async () => {
      const config = { basePath: '/project' };
      
      const result = await resolver.resolve('/project/README.md', config);
      
      expect(result.content).toBe('# Test Project');
      expect(result.metadata?.mimeType).toBe('text/markdown');
    });
    
    it('should prevent path traversal attacks', async () => {
      const config = { basePath: '/project/modules' };
      
      await expect(resolver.resolve('../README.md', config))
        .rejects.toThrow('Path traversal detected');
      
      await expect(resolver.resolve('/etc/passwd', config))
        .rejects.toThrow('Path traversal detected');
    });
    
    it('should enforce file extension restrictions', async () => {
      const config = {
        basePath: '/project',
        allowedExtensions: ['.mld', '.md']
      };
      
      // Allowed extension
      await expect(resolver.resolve('modules/utils.mld', config)).resolves.toBeTruthy();
      
      // Disallowed extension
      await expect(resolver.resolve('modules/config.json', config))
        .rejects.toThrow('File extension \'.json\' not allowed');
    });
    
    it('should throw MlldFileNotFoundError for missing files', async () => {
      const config = { basePath: '/project' };
      
      await expect(resolver.resolve('missing.mld', config))
        .rejects.toThrow(MlldFileNotFoundError);
    });
    
    it('should enforce max depth restrictions', async () => {
      const config = {
        basePath: '/project',
        maxDepth: 1
      };
      
      // Within depth limit
      await expect(resolver.resolve('README.md', config)).resolves.toBeTruthy();
      
      // Exceeds depth limit
      await expect(resolver.resolve('modules/utils.mld', config))
        .rejects.toThrow('Path exceeds maximum depth of 1');
    });
  });
  
  describe('write', () => {
    it('should write files relative to basePath', async () => {
      const config = { basePath: '/project' };
      
      await resolver.write('output/result.txt', 'Test content', config);
      
      const content = await fileSystem.readFile('/project/output/result.txt');
      expect(content).toBe('Test content');
    });
    
    it('should create directories as needed', async () => {
      const config = { basePath: '/project' };
      
      await resolver.write('deeply/nested/file.txt', 'Nested content', config);
      
      const exists = await fileSystem.exists('/project/deeply/nested/file.txt');
      expect(exists).toBe(true);
    });
    
    it('should respect readonly configuration', async () => {
      const config = {
        basePath: '/project',
        readonly: true
      };
      
      await expect(resolver.write('output.txt', 'content', config))
        .rejects.toThrow('Cannot write: LocalResolver is configured as read-only');
    });
  });
  
  describe('list', () => {
    it('should list directory contents', async () => {
      const config = { basePath: '/project' };
      
      const items = await resolver.list('modules', config);
      
      expect(items).toHaveLength(2);
      expect(items.find(i => i.path === 'modules/utils.mld')).toBeTruthy();
      expect(items.find(i => i.path === 'modules/config.json')).toBeTruthy();
    });
    
    it('should filter by allowed extensions', async () => {
      const config = {
        basePath: '/project',
        allowedExtensions: ['.mld']
      };
      
      const items = await resolver.list('modules', config);
      
      expect(items).toHaveLength(1);
      expect(items[0].path).toBe('modules/utils.mld');
    });
    
    it('should return empty array for non-existent directories', async () => {
      const config = { basePath: '/project' };
      
      const items = await resolver.list('missing', config);
      
      expect(items).toEqual([]);
    });
  });
  
  describe('validateConfig', () => {
    it('should validate required basePath', () => {
      expect(resolver.validateConfig({})).toContain('basePath is required');
      expect(resolver.validateConfig({ basePath: 123 })).toContain('basePath must be a string');
      expect(resolver.validateConfig({ basePath: '/valid' })).toEqual([]);
    });
    
    it('should validate optional fields', () => {
      const config = {
        basePath: '/project',
        readonly: 'yes', // Should be boolean
        allowedExtensions: '.mld', // Should be array
        maxDepth: -1 // Should be non-negative
      };
      
      const errors = resolver.validateConfig(config);
      
      expect(errors).toContain('readonly must be a boolean');
      expect(errors).toContain('allowedExtensions must be an array');
      expect(errors).toContain('maxDepth must be a non-negative number');
    });
  });
  
  describe('checkAccess', () => {
    it('should check read access', async () => {
      const config = { basePath: '/project' };
      
      expect(await resolver.checkAccess('modules/utils.mld', 'read', config)).toBe(true);
      expect(await resolver.checkAccess('missing.mld', 'read', config)).toBe(false);
    });
    
    it('should check write access', async () => {
      const config = { basePath: '/project' };
      
      // Directory exists, should have write access
      expect(await resolver.checkAccess('modules/new.mld', 'write', config)).toBe(true);
      
      // Readonly mode
      const readonlyConfig = { basePath: '/project', readonly: true };
      expect(await resolver.checkAccess('modules/new.mld', 'write', readonlyConfig)).toBe(false);
    });
  });
  
  describe('MIME type detection', () => {
    it('should detect correct MIME types', async () => {
      await fileSystem.writeFile('/project/test.py', 'print("hello")');
      await fileSystem.writeFile('/project/test.js', 'console.log("hello")');
      await fileSystem.writeFile('/project/test.unknown', 'unknown content');
      
      const config = { basePath: '/project' };
      
      const pyResult = await resolver.resolve('test.py', config);
      expect(pyResult.metadata?.mimeType).toBe('text/x-python');
      
      const jsResult = await resolver.resolve('test.js', config);
      expect(jsResult.metadata?.mimeType).toBe('text/javascript');
      
      const unknownResult = await resolver.resolve('test.unknown', config);
      expect(unknownResult.metadata?.mimeType).toBe('text/plain');
    });
  });
});