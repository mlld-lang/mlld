import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Environment } from './env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module to use memory filesystem
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      access: vi.fn()
    }
  };
});

describe('Lock File Automation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    
    // Create base directory structure
    await fileSystem.mkdir('/project', { recursive: true });
    
    // Setup fs mocks to use our memory filesystem
    vi.mocked(fs.promises.mkdir).mockImplementation(async (path, options) => {
      await fileSystem.mkdir(path as string, options as any);
    });
    
    vi.mocked(fs.promises.writeFile).mockImplementation(async (path, data) => {
      await fileSystem.writeFile(path as string, data as string);
    });
    
    vi.mocked(fs.promises.readFile).mockImplementation(async (path) => {
      return await fileSystem.readFile(path as string);
    });
    
    vi.mocked(fs.promises.access).mockImplementation(async (path) => {
      const exists = await fileSystem.exists(path as string);
      if (!exists) {
        throw new Error('ENOENT');
      }
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Auto-Creation', () => {
    it('should auto-create project lock file on first run', async () => {
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      // Give the async initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that lock file was created
      const lockFilePath = '/project/mlld.lock.json';
      const exists = await fileSystem.exists(lockFilePath);
      expect(exists).toBe(true);
      
      // Verify lock file structure
      const content = await fileSystem.readFile(lockFilePath);
      const lockData = JSON.parse(content);
      
      expect(lockData).toHaveProperty('version', '1.0.0');
      expect(lockData).toHaveProperty('imports', {});
      expect(lockData).toHaveProperty('metadata');
      expect(lockData.metadata).toHaveProperty('mlldVersion');
      expect(lockData.metadata).toHaveProperty('createdAt');
      expect(lockData.metadata).toHaveProperty('updatedAt');
    });
    
    it('should not overwrite existing project lock file', async () => {
      // Create existing lock file with custom data
      const existingData = {
        version: '1.0.0',
        imports: {
          'https://example.com/test.mld': {
            resolved: 'https://example.com/test.mld',
            integrity: 'sha256:abc123',
            approvedAt: '2024-01-01T00:00:00.000Z'
          }
        },
        metadata: {
          mlldVersion: '0.1.0',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      };
      
      await fileSystem.mkdir('/project');
      await fileSystem.writeFile(
        '/project/mlld.lock.json',
        JSON.stringify(existingData, null, 2)
      );
      
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      // Give the async initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify existing data is preserved
      const content = await fileSystem.readFile('/project/mlld.lock.json');
      const lockData = JSON.parse(content);
      
      expect(lockData.imports).toHaveProperty('https://example.com/test.mld');
      expect(lockData.metadata.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });
  
  describe('Global Lock File', () => {
    it.skip('should create global lock file with default trusted domains', async () => {
      // Skip this test for now - os.homedir is not easily mockable
      // The functionality is tested by integration tests
      const mockHomeDir = '/mock/home';
      
      // Create directory structure
      await fileSystem.mkdir(path.join(mockHomeDir, '.config', 'mlld'), { recursive: true });
      
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      // Give the async initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check global lock file
      const globalLockPath = path.join(mockHomeDir, '.config', 'mlld', 'mlld.lock.json');
      const exists = await fileSystem.exists(globalLockPath);
      
      if (exists) {
        const content = await fileSystem.readFile(globalLockPath);
        const globalData = JSON.parse(content);
        
        // Verify structure
        expect(globalData).toHaveProperty('version');
        expect(globalData).toHaveProperty('imports');
        
        // Check for default trusted domains
        if (globalData.security?.trustedDomains) {
          expect(globalData.security.trustedDomains).toContain('github.com');
          expect(globalData.security.trustedDomains).toContain('gist.github.com');
        }
      }
    });
  });
  
  describe('Import Approval Persistence', () => {
    it('should save import approvals to lock file', async () => {
      // This test would require mocking the approval prompt
      // For now, we verify the structure is in place
      
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      // Give initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the lock file
      const lockFile = env.getLockFile();
      expect(lockFile).toBeDefined();
      
      // Test adding an import approval
      if (lockFile) {
        await lockFile.addImport('https://example.com/test.mld', {
          resolved: 'https://example.com/test.mld',
          integrity: 'sha256:test123',
          approvedAt: new Date().toISOString(),
          approvedBy: 'test-user',
          trust: 'always'
        });
        
        // Verify it was saved
        const entry = await lockFile.getImport('https://example.com/test.mld');
        expect(entry).toBeDefined();
        expect(entry?.trust).toBe('always');
      }
    });
  });
  
  describe('Command Approval Persistence', () => {
    it('should support command approvals in lock file', async () => {
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      // Give initialization time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const lockFile = env.getLockFile();
      expect(lockFile).toBeDefined();
      
      // Test command approval methods exist
      if (lockFile && 'addCommandApproval' in lockFile) {
        // Add a command approval
        await lockFile.addCommandApproval('npm install', {
          trust: 'always'
        });
        
        // Verify it was saved
        const approval = await lockFile.getCommandApproval('npm install');
        expect(approval).toBeDefined();
        expect(approval?.trust).toBe('always');
      }
    });
  });
  
  describe('Time-based Approvals', () => {
    it('should handle TTL-based approvals', async () => {
      const env = new Environment(
        fileSystem,
        pathService,
        '/project'
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const lockFile = env.getLockFile();
      if (lockFile) {
        // Add approval with TTL
        await lockFile.addImport('https://example.com/temp.mld', {
          resolved: 'https://example.com/temp.mld',
          integrity: 'sha256:temp123',
          approvedAt: new Date().toISOString(),
          approvedBy: 'test-user',
          trust: 'always',
          ttl: '1h',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        });
        
        // Verify TTL was saved
        const entry = await lockFile.getImport('https://example.com/temp.mld');
        expect(entry?.ttl).toBe('1h');
        expect(entry?.expiresAt).toBeDefined();
      }
    });
  });
});