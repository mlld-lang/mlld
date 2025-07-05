import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublishCommand } from '../publish';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MlldError } from '@core/errors';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('@core/registry/auth/GitHubAuthService');
vi.mock('@octokit/rest');
vi.mock('child_process');
vi.mock('@grammar/parser');

describe('PublishCommand - Simplified Syntax', () => {
  let publisher: PublishCommand;
  let mockLockFile: any;
  
  beforeEach(() => {
    publisher = new PublishCommand();
    
    // Default mock lock file with registries
    mockLockFile = {
      version: '1.0',
      config: {
        resolvers: {
          registries: [
            {
              prefix: '@adam/',
              resolver: 'GITHUB',
              type: 'input',
              priority: 10,
              config: {
                repository: 'adamavenir/private-modules',
                branch: 'main',
                basePath: 'llm/modules'
              }
            },
            {
              prefix: '@adam/',
              resolver: 'REGISTRY',
              type: 'input', 
              priority: 20
            },
            {
              prefix: '@mlld/',
              resolver: 'REGISTRY',
              type: 'input',
              priority: 10
            }
          ]
        }
      }
    };
    
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('resolvePublishTarget', () => {
    it('should parse @author/module syntax correctly', async () => {
      // Mock lock file exists
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      // Mock module file exists
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error()) // .mlld.md doesn't exist
        .mockRejectedValueOnce(new Error()) // .mld doesn't exist
        .mockResolvedValueOnce(undefined); // .md exists
      
      const result = await (publisher as any).resolvePublishTarget('@adam/confidence');
      
      expect(result).toBeDefined();
      expect(result.filePath).toBe(path.join('llm/modules', 'confidence.md'));
      expect(result.publishOptions.prefix).toBe('@adam/');
      expect(result.publishOptions.moduleName).toBe('confidence');
      expect(result.publishOptions.registry.resolver).toBe('GITHUB');
    });
    
    it('should prefer .mlld.md extension over others', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      // Mock .mlld.md file exists
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      
      const result = await (publisher as any).resolvePublishTarget('@adam/utils');
      
      expect(result.filePath).toBe(path.join('llm/modules', 'utils.mlld.md'));
    });
    
    it('should throw error if no registry configured for prefix', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      await expect(
        (publisher as any).resolvePublishTarget('@unknown/module')
      ).rejects.toThrow('No registry configured for prefix \'@unknown/\'');
    });
    
    it('should throw error if module file not found', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      // Mock file not found for all extension checks
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('ENOENT')) // .mlld.md
        .mockRejectedValueOnce(new Error('ENOENT')) // .mld
        .mockRejectedValueOnce(new Error('ENOENT')) // .md
        .mockRejectedValueOnce(new Error('ENOENT')) // For REGISTRY check, .mlld.md
        .mockRejectedValueOnce(new Error('ENOENT')) // For REGISTRY check, .mld
        .mockRejectedValueOnce(new Error('ENOENT')); // For REGISTRY check, .md
      
      await expect(
        (publisher as any).resolvePublishTarget('@adam/nonexistent')
      ).rejects.toThrow('Module \'nonexistent\' not found in any configured location');
    });
    
    it('should skip LOCAL resolvers', async () => {
      const lockFileWithLocal = {
        ...mockLockFile,
        config: {
          resolvers: {
            registries: [
              {
                prefix: '@test/',
                resolver: 'LOCAL',
                priority: 10,
                config: { basePath: './local' }
              },
              {
                prefix: '@test/',
                resolver: 'GITHUB',
                priority: 20,
                config: {
                  repository: 'test/repo',
                  basePath: './github'
                }
              }
            ]
          }
        }
      };
      
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(lockFileWithLocal));
      
      // Mock file exists in GITHUB path
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      
      const result = await (publisher as any).resolvePublishTarget('@test/module');
      
      expect(result.publishOptions.registry.resolver).toBe('GITHUB');
      expect(result.filePath).toBe(path.join('./github', 'module.mlld.md'));
    });
    
    it('should return null for non-matching format', async () => {
      const result = await (publisher as any).resolvePublishTarget('./regular-file.mld');
      expect(result).toBeNull();
      
      const result2 = await (publisher as any).resolvePublishTarget('not-a-module-ref');
      expect(result2).toBeNull();
    });
    
    it('should throw error if lock file not found', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));
      
      await expect(
        (publisher as any).resolvePublishTarget('@adam/module')
      ).rejects.toThrow('No mlld.lock.json found');
    });
    
    it('should respect registry priority ordering', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      // First registry (priority 10 GITHUB) has file
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      
      const result = await (publisher as any).resolvePublishTarget('@adam/module');
      
      // Should use GITHUB (priority 10) not REGISTRY (priority 20)
      expect(result.publishOptions.registry.resolver).toBe('GITHUB');
      expect(result.publishOptions.registry.priority).toBe(10);
    });
  });
  
  describe('publish with simplified syntax', () => {
    it('should handle @author/module syntax in publish method', async () => {
      // Mock auth service
      const mockAuthService = {
        getOctokit: vi.fn().mockResolvedValue({}),
        getGitHubUser: vi.fn().mockResolvedValue({ login: 'testuser', id: 123 })
      };
      (publisher as any).authService = mockAuthService;
      
      // Mock lock file
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(mockLockFile));
      
      // Mock module file exists
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      
      // Mock module content
      const moduleContent = `---
name: confidence
author: adam
about: Confidence rating module
needs: []
license: CC0
---
# Confidence Module`;
      
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => false } as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(moduleContent);
      
      // Spy on console.log to check output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      try {
        await publisher.publish('@adam/confidence', { dryRun: true });
      } catch (error) {
        // May fail at later stages, but we're just testing the resolution
      }
      
      // Check that it resolved to the correct path
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resolved to private module:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB')
      );
    });
  });
});