import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixtureManager } from '../FixtureManager';
import { ProjectBuilder } from '../ProjectBuilder';
import { MemfsTestFileSystem } from '../MemfsTestFileSystem';
import fs from 'fs';
import path from 'path';

// Create mock functions
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

// Mock fs module
vi.mock('fs', () => mockFs);

describe('FixtureManager', () => {
  let memfs: MemfsTestFileSystem;
  let builder: ProjectBuilder;
  let manager: FixtureManager;
  const fixturesDir = 'tests/fixtures';

  beforeEach(() => {
    vi.resetAllMocks();
    // Set default mock behavior
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{}');
    manager = new FixtureManager('/project/fixtures');
  });

  describe('fixture loading', () => {
    it('loads a basic fixture', async () => {
      const basicFixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(basicFixture));

      const result = await manager.load('basic');
      expect(result).toEqual(basicFixture);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/project/fixtures/basic.json');
    });

    it('loads a complex fixture', async () => {
      const complexFixture = {
        files: {
          'test.txt': 'content',
          'nested/file.txt': 'nested content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(complexFixture));

      const result = await manager.load('complex');
      expect(result).toEqual(complexFixture);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/project/fixtures/complex.json');
    });
  });

  describe('error handling', () => {
    it('throws when fixture does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(manager.load('nonexistent'))
        .rejects.toThrow('Fixture not found: nonexistent');
    });

    it('throws on invalid JSON', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      await expect(manager.load('invalid'))
        .rejects.toThrow(/Invalid JSON in fixture invalid/);
    });

    it('throws on invalid fixture structure', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        invalid: 'structure'
      }));

      await expect(manager.load('invalid'))
        .rejects.toThrow('Fixture must have a files object');
    });
  });

  describe('cache management', () => {
    it('caches loaded fixtures', async () => {
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(fixture));

      await manager.load('cached');
      await manager.load('cached');

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('clears cache when requested', async () => {
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(fixture));

      await manager.load('cached');
      manager.clearCache();
      await manager.load('cached');

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('fixture directory handling', () => {
    it('uses custom fixtures directory', async () => {
      const customManager = new FixtureManager('/custom/fixtures');
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(fixture));

      await customManager.load('test');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/custom/fixtures/test.json');
    });

    it('handles relative paths in fixtures directory', async () => {
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(fixture));

      const relativeManager = new FixtureManager('fixtures');
      await relativeManager.load('test');

      expect(mockFs.existsSync).toHaveBeenCalledWith(path.join(process.cwd(), 'fixtures', 'test.json'));
    });
  });
}); 