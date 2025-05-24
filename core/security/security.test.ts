import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportApproval } from './ImportApproval';
import { ImmutableCache } from './ImmutableCache';
import { GistTransformer } from './GistTransformer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Mock readline
vi.mock('readline/promises', () => ({
  createInterface: () => ({
    question: vi.fn(),
    close: vi.fn()
  })
}));

// Mock fs
vi.mock('fs/promises');

describe('Import Security', () => {
  describe('GistTransformer', () => {
    it('should detect Gist URLs', () => {
      expect(GistTransformer.isGistUrl('https://gist.github.com/user/123')).toBe(true);
      expect(GistTransformer.isGistUrl('https://github.com/user/repo')).toBe(false);
      expect(GistTransformer.isGistUrl('https://raw.githubusercontent.com/user/repo/main/file')).toBe(false);
    });

    it('should transform Gist URLs to raw URLs', async () => {
      const url = 'https://gist.github.com/adamavenir/abc123';
      const raw = await GistTransformer.transformToRaw(url);
      expect(raw).toBe('https://gist.githubusercontent.com/adamavenir/abc123/raw/');
    });

    it('should handle Gist URLs with file fragments', async () => {
      const url = 'https://gist.github.com/adamavenir/abc123#file-example-md';
      const raw = await GistTransformer.transformToRaw(url);
      expect(raw).toBe('https://gist.githubusercontent.com/adamavenir/abc123/raw/example.md');
    });

    it('should parse Gist metadata', () => {
      const meta = GistTransformer.parseGistUrl('https://gist.github.com/adamavenir/abc123#file-test-mld');
      expect(meta).toEqual({
        user: 'adamavenir',
        id: 'abc123',
        file: 'test.mld'
      });
    });
  });

  describe('ImmutableCache', () => {
    let cache: ImmutableCache;
    const testDir = '/test/project';

    beforeEach(() => {
      vi.clearAllMocks();
      cache = new ImmutableCache(testDir);
    });

    it('should store and retrieve content by hash', async () => {
      const url = 'https://example.com/test.mld';
      const content = '@text hello = "world"';
      const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      
      // Mock fs operations
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          url,
          contentHash: expectedHash,
          cachedAt: new Date().toISOString(),
          size: content.length
        }))
        .mockResolvedValueOnce(content);

      // Store
      const hash = await cache.set(url, content);
      expect(hash).toBe(expectedHash);

      // Retrieve
      const retrieved = await cache.get(url, hash);
      expect(retrieved).toBe(content);
    });

    it('should return null for cache miss', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      
      const result = await cache.get('https://example.com/missing.mld');
      expect(result).toBeNull();
    });

    it('should detect corrupted cache', async () => {
      const url = 'https://example.com/test.mld';
      
      // Mock corrupted content
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          url,
          contentHash: 'expected_hash',
          cachedAt: new Date().toISOString()
        }))
        .mockResolvedValueOnce('corrupted content');
      
      vi.mocked(fs.unlink).mockResolvedValue();

      const result = await cache.get(url, 'expected_hash');
      expect(result).toBeNull();
      
      // Should have tried to remove corrupted cache
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('ImportApproval', () => {
    let approval: ImportApproval;
    const testDir = '/test/project';

    beforeEach(() => {
      vi.clearAllMocks();
      approval = new ImportApproval(testDir);
    });

    it('should detect commands in content', () => {
      const content = `
        @text greeting = "hello"
        @run npm install
        @exec [git status]
        @run \`echo "test"\`
      `;
      
      // Access private method through prototype
      const commands = (approval as any).detectCommands(content);
      // detectCommands extracts base commands (first word)
      // 'npm install' -> 'npm'
      expect(commands).toContain('npm');
      expect(commands).toContain('git');
      expect(commands).toContain('echo');
    });

    it('should calculate content hash', () => {
      const content = '@text hello = "world"';
      const hash = (approval as any).calculateHash(content);
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash format
    });

    it('should allow imports when approval not required', async () => {
      // Mock the config to have approval disabled
      (approval as any).config = {
        requireApproval: false,
        allowed: []
      };
      
      const result = await approval.checkApproval('https://example.com/test.mld', 'content');
      expect(result).toBe(true);
    });

    it('should check existing approvals by hash', async () => {
      const url = 'https://example.com/test.mld';
      const content = '@text hello = "world"';
      const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

      // Mock the config to have existing approval
      (approval as any).config = {
        requireApproval: true,
        allowed: [{
          url,
          hash,
          pinnedVersion: true,
          allowedAt: new Date().toISOString(),
          detectedCommands: []
        }]
      };
      
      const result = await approval.checkApproval(url, content);
      expect(result).toBe(true);
    });

    it('should detect non-interactive mode', () => {
      const originalTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      
      expect(approval.isInteractive()).toBe(false);
      
      process.stdin.isTTY = originalTTY;
    });
  });
});