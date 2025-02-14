import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixtureManager } from '../FixtureManager';
import { ProjectBuilder } from '../ProjectBuilder';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}));

describe('FixtureManager', () => {
  let memfs: MemfsTestFileSystem;
  let builder: ProjectBuilder;
  let manager: FixtureManager;
  const fixturesDir = 'tests/fixtures';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup memfs and builder
    memfs = new MemfsTestFileSystem();
    memfs.initialize();
    builder = new ProjectBuilder(memfs);
    
    // Create fixture manager
    manager = new FixtureManager(builder, fixturesDir);
  });

  describe('fixture loading', () => {
    it('loads a basic fixture', async () => {
      // Mock fixture file existence and content
      const fixturePath = path.join(fixturesDir, 'basic.json');
      const fixtureContent = JSON.stringify({
        files: {
          'test.txt': 'content'
        }
      });
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(fixtureContent);

      // Load fixture
      await manager.load('basic');

      // Verify builder created the structure
      expect(memfs.exists('/project/test.txt')).toBe(true);
      expect(memfs.readFile('/project/test.txt')).toBe('content');
    });

    it('loads a complex fixture', async () => {
      const fixturePath = path.join(fixturesDir, 'complex.json');
      const fixtureContent = JSON.stringify({
        dirs: ['dir1', 'dir2/nested'],
        files: {
          'dir1/file1.txt': 'content1',
          'dir2/nested/file2.txt': 'content2'
        }
      });
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(fixtureContent);

      await manager.load('complex');

      expect(memfs.isDirectory('/project/dir1')).toBe(true);
      expect(memfs.isDirectory('/project/dir2/nested')).toBe(true);
      expect(memfs.readFile('/project/dir1/file1.txt')).toBe('content1');
      expect(memfs.readFile('/project/dir2/nested/file2.txt')).toBe('content2');
    });
  });

  describe('error handling', () => {
    it('throws when fixture does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(manager.load('nonexistent'))
        .rejects.toThrow('Fixture not found: nonexistent');
    });

    it('throws on invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      await expect(manager.load('invalid'))
        .rejects.toThrow(/JSON/);
    });

    it('throws on invalid fixture structure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        invalid: 'structure'
      }));

      await expect(manager.load('invalid'))
        .rejects.toThrow();
    });
  });

  describe('cache management', () => {
    it('caches loaded fixtures', async () => {
      // Setup mock for first load
      const fixtureContent = JSON.stringify({
        files: { 'test.txt': 'content' }
      });
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(fixtureContent);

      // Load twice
      await manager.load('cached');
      await manager.load('cached');

      // Should only read from fs once
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('clears cache when requested', async () => {
      // Setup mock
      const fixtureContent = JSON.stringify({
        files: { 'test.txt': 'content' }
      });
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(fixtureContent);

      // Load, clear cache, load again
      await manager.load('cached');
      manager.clearCache();
      await manager.load('cached');

      // Should read from fs twice
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('fixture directory handling', () => {
    it('uses custom fixtures directory', async () => {
      const customDir = 'custom/fixtures';
      const customManager = new FixtureManager(builder, customDir);
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        files: {}
      }));

      await customManager.load('test');

      // Should look in custom directory
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining(customDir)
      );
    });

    it('handles relative paths in fixtures directory', async () => {
      const relativeDir = './fixtures';
      const manager = new FixtureManager(builder, relativeDir);
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        files: {}
      }));

      await manager.load('test');

      // Should resolve relative path
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining(path.resolve(relativeDir))
      );
    });
  });
}); 