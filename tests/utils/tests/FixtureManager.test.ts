import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixtureManager, FileSystem } from '@tests/utils/FixtureManager.js';
import path from 'path';

describe('FixtureManager', () => {
  let manager: FixtureManager;
  let mockFs: FileSystem;

  beforeEach(() => {
    // Create mock file system
    mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('{}')
    };
    
    // Create a new manager for each test with mock file system
    manager = new FixtureManager('/project/fixtures', mockFs);
  });

  describe('fixture loading', () => {
    it('loads a basic fixture', async () => {
      const basicFixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(basicFixture));

      const result = await manager.load('basic');
      expect(result).toEqual(basicFixture);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/project/fixtures/basic.json');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/project/fixtures/basic.json', 'utf-8');
    });

    it('loads a complex fixture', async () => {
      const complexFixture = {
        files: {
          'test.txt': 'content',
          'nested/file.txt': 'nested content'
        }
      };

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(complexFixture));

      const result = await manager.load('complex');
      expect(result).toEqual(complexFixture);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/project/fixtures/complex.json');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/project/fixtures/complex.json', 'utf-8');
    });
  });

  describe('error handling', () => {
    it('throws when fixture does not exist', async () => {
      mockFs.existsSync.mockReturnValueOnce(false);

      await expect(manager.load('nonexistent'))
        .rejects.toThrow('Fixture not found: nonexistent');
    });

    it('throws on invalid JSON', async () => {
      mockFs.existsSync.mockReturnValueOnce(true);
      mockFs.readFileSync.mockReturnValueOnce('invalid json');

      await expect(manager.load('invalid'))
        .rejects.toThrow(/Invalid JSON in fixture invalid/);
    });

    it('throws on invalid fixture structure', async () => {
      mockFs.existsSync.mockReturnValueOnce(true);
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
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

      mockFs.readFileSync.mockReturnValue(JSON.stringify(fixture));

      await manager.load('cached');
      manager.clearCache();
      await manager.load('cached');

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('fixture directory handling', () => {
    it('uses custom fixtures directory', async () => {
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(fixture));

      const customManager = new FixtureManager('/custom/fixtures', mockFs);
      await customManager.load('test');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/custom/fixtures/test.json');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/custom/fixtures/test.json', 'utf-8');
    });

    it('handles relative paths in fixtures directory', async () => {
      const fixture = {
        files: {
          'test.txt': 'content'
        }
      };

      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(fixture));

      const relativeManager = new FixtureManager('fixtures', mockFs);
      await relativeManager.load('test');

      const expectedPath = path.join(process.cwd(), 'fixtures', 'test.json');
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });
  });
}); 