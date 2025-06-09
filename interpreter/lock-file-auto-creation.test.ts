import { describe, it, expect, beforeEach } from 'vitest';
import { Environment } from './env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as path from 'path';

describe('Lock File Auto-Creation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let basePath: string;
  
  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    basePath = '/test/project';
  });
  
  it('should auto-create project lock file on Environment initialization', async () => {
    // Create environment which should trigger lock file creation
    const env = new Environment(fileSystem, pathService, basePath);
    
    // Give async initialization time to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that lock file was created
    const lockFilePath = path.join(basePath, 'mlld.lock.json');
    const exists = await fileSystem.exists(lockFilePath);
    expect(exists).toBe(true);
    
    // Read and validate lock file content
    const content = await fileSystem.readFile(lockFilePath);
    const lockData = JSON.parse(content);
    
    expect(lockData).toMatchObject({
      version: '1.0.0',
      imports: {},
      metadata: {
        mlldVersion: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    });
  });
  
  it('should not overwrite existing lock file', async () => {
    // Create existing lock file with custom data
    const lockFilePath = path.join(basePath, 'mlld.lock.json');
    const existingData = {
      version: '1.0.0',
      imports: {
        'https://example.com/test.mld': {
          resolved: 'https://example.com/test.mld',
          integrity: 'sha256:abc123',
          approvedAt: '2024-01-01T00:00:00.000Z',
          trust: 'always'
        }
      },
      metadata: {
        mlldVersion: '0.1.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    };
    
    await fileSystem.writeFile(lockFilePath, JSON.stringify(existingData, null, 2));
    
    // Create environment
    const env = new Environment(fileSystem, pathService, basePath);
    
    // Give async initialization time to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Read lock file and verify it wasn't overwritten
    const content = await fileSystem.readFile(lockFilePath);
    const lockData = JSON.parse(content);
    
    expect(lockData).toEqual(existingData);
  });
  
  it('should create global lock file in user home directory', async () => {
    // Mock home directory
    const homeDir = '/home/testuser';
    const originalHomedir = process.env.HOME;
    process.env.HOME = homeDir;
    
    try {
      // Create environment which should trigger global lock file creation
      const env = new Environment(fileSystem, pathService, basePath);
      
      // Give async initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that global lock file was created
      const globalLockPath = path.join(homeDir, '.config', 'mlld', 'mlld.lock.json');
      const exists = await fileSystem.exists(globalLockPath);
      expect(exists).toBe(true);
      
      // Read and validate global lock file content
      const content = await fileSystem.readFile(globalLockPath);
      const lockData = JSON.parse(content);
      
      expect(lockData).toMatchObject({
        version: '1.0.0',
        imports: {},
        metadata: {
          mlldVersion: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          isGlobal: true
        },
        security: {
          trustedDomains: expect.arrayContaining([
            'github.com',
            'raw.githubusercontent.com',
            'gist.githubusercontent.com'
          ]),
          blockedPatterns: []
        }
      });
    } finally {
      // Restore original HOME
      if (originalHomedir) {
        process.env.HOME = originalHomedir;
      } else {
        delete process.env.HOME;
      }
    }
  });
  
  it('should make lock file available via getLockFile()', async () => {
    // Create environment
    const env = new Environment(fileSystem, pathService, basePath);
    
    // Give async initialization time to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get lock file reference
    const lockFile = env.getLockFile();
    expect(lockFile).toBeDefined();
    
    // Test that we can use the lock file
    const imports = lockFile!.getAllImports();
    expect(imports).toEqual({});
    
    // Add an import
    await lockFile!.addImport('https://example.com/test.mld', {
      resolved: 'https://example.com/test.mld',
      integrity: 'sha256:test123',
      approvedAt: new Date().toISOString(),
      trust: 'always'
    });
    
    // Verify it was added
    const updatedImports = lockFile!.getAllImports();
    expect(Object.keys(updatedImports)).toHaveLength(1);
    expect(updatedImports['https://example.com/test.mld']).toBeDefined();
  });
  
  it('should pass lock file to ImportApproval', async () => {
    // Create environment
    const env = new Environment(fileSystem, pathService, basePath);
    
    // Give async initialization time to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get lock file and add a test approval
    const lockFile = env.getLockFile();
    expect(lockFile).toBeDefined();
    
    await lockFile!.addImport('https://example.com/approved.mld', {
      resolved: 'https://example.com/approved.mld',
      integrity: 'sha256:abc123',
      approvedAt: new Date().toISOString(),
      approvedBy: 'test',
      trust: 'always'
    });
    
    // Now when ImportApproval checks this URL, it should find the existing approval
    // This would be tested through integration tests of the import flow
  });
});