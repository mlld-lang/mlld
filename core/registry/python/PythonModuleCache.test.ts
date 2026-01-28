import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PythonModuleCache, type PythonCacheEntry } from './PythonModuleCache';

describe('PythonModuleCache', () => {
  let testDir: string;
  let cache: PythonModuleCache;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-python-cache-test-'));
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Use a fresh cache directory for each test
    const cacheDir = await fs.promises.mkdtemp(path.join(testDir, 'cache-'));
    cache = new PythonModuleCache({ cacheDir });
    await cache.initialize();
  });

  describe('initialization', () => {
    it('should create cache directory structure', async () => {
      const cacheDir = path.join(testDir, `init-test-${Date.now()}`);
      const newCache = new PythonModuleCache({ cacheDir });
      await newCache.initialize();

      expect(fs.existsSync(path.join(cacheDir, 'wheels', 'sha256'))).toBe(true);
      expect(fs.existsSync(path.join(cacheDir, 'sdist', 'sha256'))).toBe(true);
    });

    it('should handle missing index file', async () => {
      const hasPackage = await cache.hasPackage('nonexistent', '1.0.0');
      expect(hasPackage).toBe(false);
    });
  });

  describe('adding packages', () => {
    it('should add a wheel to cache', async () => {
      const content = Buffer.from('fake wheel content');
      const metadata = {
        name: 'numpy',
        version: '2.0.1',
        filename: 'numpy-2.0.1-cp311-cp311-macosx_11_0_arm64.whl',
        type: 'wheel' as const,
        abiTag: 'cp311',
        platformTag: 'macosx_11_0_arm64'
      };

      const entry = await cache.add(content, metadata);

      expect(entry.name).toBe('numpy');
      expect(entry.version).toBe('2.0.1');
      expect(entry.type).toBe('wheel');
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.size).toBe(content.length);
      expect(entry.cachedAt).toBeDefined();
    });

    it('should add a sdist to cache', async () => {
      const content = Buffer.from('fake sdist content');
      const metadata = {
        name: 'requests',
        version: '2.31.0',
        filename: 'requests-2.31.0.tar.gz',
        type: 'sdist' as const
      };

      const entry = await cache.add(content, metadata);

      expect(entry.name).toBe('requests');
      expect(entry.version).toBe('2.31.0');
      expect(entry.type).toBe('sdist');
    });

    it('should normalize package names to lowercase', async () => {
      const content = Buffer.from('content');
      const entry = await cache.add(content, {
        name: 'PyYAML',
        version: '6.0',
        filename: 'PyYAML-6.0.tar.gz',
        type: 'sdist'
      });

      expect(entry.name).toBe('pyyaml');

      const found = await cache.getByNameVersion('PYYAML', '6.0');
      expect(found).toBeDefined();
      expect(found?.name).toBe('pyyaml');
    });

    it('should return existing entry on duplicate add', async () => {
      const content = Buffer.from('duplicate content');
      const metadata = {
        name: 'flask',
        version: '3.0.0',
        filename: 'flask-3.0.0.whl',
        type: 'wheel' as const
      };

      const entry1 = await cache.add(content, metadata);
      const entry2 = await cache.add(content, metadata);

      expect(entry1.sha256).toBe(entry2.sha256);
      expect(entry1.cachedAt).toBe(entry2.cachedAt);
    });
  });

  describe('retrieving packages', () => {
    it('should retrieve by hash', async () => {
      const content = Buffer.from('test content');
      const entry = await cache.add(content, {
        name: 'pandas',
        version: '2.0.0',
        filename: 'pandas-2.0.0.whl',
        type: 'wheel'
      });

      const retrieved = await cache.getByHash(entry.sha256);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('pandas');
      expect(retrieved?.version).toBe('2.0.0');
    });

    it('should retrieve by name and version', async () => {
      const content = Buffer.from('scipy content');
      await cache.add(content, {
        name: 'scipy',
        version: '1.11.0',
        filename: 'scipy-1.11.0.whl',
        type: 'wheel'
      });

      const entry = await cache.getByNameVersion('scipy', '1.11.0');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('scipy');
    });

    it('should return undefined for missing packages', async () => {
      const entry = await cache.getByNameVersion('nonexistent', '1.0.0');
      expect(entry).toBeUndefined();
    });

    it('should get file content', async () => {
      const content = Buffer.from('file content for retrieval');
      const entry = await cache.add(content, {
        name: 'django',
        version: '4.2.0',
        filename: 'django-4.2.0.whl',
        type: 'wheel'
      });

      const retrieved = await cache.getContent(entry.sha256);
      expect(retrieved).toBeDefined();
      expect(retrieved?.toString()).toBe('file content for retrieval');
    });

    it('should get file path', async () => {
      const content = Buffer.from('path test content');
      const entry = await cache.add(content, {
        name: 'pytest',
        version: '7.4.0',
        filename: 'pytest-7.4.0.whl',
        type: 'wheel'
      });

      const filePath = await cache.getFilePath(entry.sha256);
      expect(filePath).toBeDefined();
      expect(fs.existsSync(filePath!)).toBe(true);
    });
  });

  describe('multiple versions', () => {
    it('should store multiple versions of same package', async () => {
      await cache.add(Buffer.from('v1'), {
        name: 'aiohttp',
        version: '3.8.0',
        filename: 'aiohttp-3.8.0.whl',
        type: 'wheel'
      });

      await cache.add(Buffer.from('v2'), {
        name: 'aiohttp',
        version: '3.9.0',
        filename: 'aiohttp-3.9.0.whl',
        type: 'wheel'
      });

      const versions = await cache.getPackageVersions('aiohttp');
      expect(versions).toHaveLength(2);
      expect(versions.map(v => v.version).sort()).toEqual(['3.8.0', '3.9.0']);
    });

    it('should lookup specific version', async () => {
      await cache.add(Buffer.from('old'), {
        name: 'pillow',
        version: '9.0.0',
        filename: 'pillow-9.0.0.whl',
        type: 'wheel'
      });

      await cache.add(Buffer.from('new'), {
        name: 'pillow',
        version: '10.0.0',
        filename: 'pillow-10.0.0.whl',
        type: 'wheel'
      });

      const old = await cache.getByNameVersion('pillow', '9.0.0');
      const newVer = await cache.getByNameVersion('pillow', '10.0.0');

      expect(old?.version).toBe('9.0.0');
      expect(newVer?.version).toBe('10.0.0');
    });
  });

  describe('removing packages', () => {
    it('should remove by hash', async () => {
      const content = Buffer.from('to remove');
      const entry = await cache.add(content, {
        name: 'removeme',
        version: '1.0.0',
        filename: 'removeme-1.0.0.whl',
        type: 'wheel'
      });

      expect(await cache.hasHash(entry.sha256)).toBe(true);

      const removed = await cache.remove(entry.sha256);
      expect(removed).toBe(true);
      expect(await cache.hasHash(entry.sha256)).toBe(false);
    });

    it('should return false for removing non-existent', async () => {
      const removed = await cache.remove('nonexistent-hash');
      expect(removed).toBe(false);
    });

    it('should update index lookups on remove', async () => {
      const content = Buffer.from('indexed package');
      const entry = await cache.add(content, {
        name: 'indexed',
        version: '1.0.0',
        filename: 'indexed-1.0.0.whl',
        type: 'wheel'
      });

      await cache.remove(entry.sha256);

      expect(await cache.hasPackage('indexed', '1.0.0')).toBe(false);
      const versions = await cache.getPackageVersions('indexed');
      expect(versions).toHaveLength(0);
    });
  });

  describe('integrity verification', () => {
    it('should verify correct content', async () => {
      const content = Buffer.from('integrity check content');
      const entry = await cache.add(content, {
        name: 'verify',
        version: '1.0.0',
        filename: 'verify-1.0.0.whl',
        type: 'wheel'
      });

      const valid = await cache.verifyIntegrity(entry.sha256);
      expect(valid).toBe(true);
    });

    it('should detect corrupted content', async () => {
      const content = Buffer.from('original content');
      const entry = await cache.add(content, {
        name: 'corrupt',
        version: '1.0.0',
        filename: 'corrupt-1.0.0.whl',
        type: 'wheel'
      });

      // Corrupt the file
      const filePath = await cache.getFilePath(entry.sha256);
      await fs.promises.writeFile(filePath!, 'corrupted content');

      const valid = await cache.verifyIntegrity(entry.sha256);
      expect(valid).toBe(false);
    });
  });

  describe('cache statistics', () => {
    it('should return accurate stats', async () => {
      await cache.add(Buffer.from('wheel1'), {
        name: 'pkg1',
        version: '1.0.0',
        filename: 'pkg1-1.0.0.whl',
        type: 'wheel'
      });

      await cache.add(Buffer.from('wheel2'), {
        name: 'pkg2',
        version: '1.0.0',
        filename: 'pkg2-1.0.0.whl',
        type: 'wheel'
      });

      await cache.add(Buffer.from('sdist1'), {
        name: 'pkg3',
        version: '1.0.0',
        filename: 'pkg3-1.0.0.tar.gz',
        type: 'sdist'
      });

      const stats = await cache.getStats();

      expect(stats.totalPackages).toBe(3);
      expect(stats.wheelCount).toBe(2);
      expect(stats.sdistCount).toBe(1);
      expect(stats.uniquePackages).toBe(3);
      expect(stats.totalSize).toBe(
        Buffer.from('wheel1').length +
        Buffer.from('wheel2').length +
        Buffer.from('sdist1').length
      );
    });
  });

  describe('cleanup and clear', () => {
    it('should clear all entries', async () => {
      await cache.add(Buffer.from('content1'), {
        name: 'clear1',
        version: '1.0.0',
        filename: 'clear1-1.0.0.whl',
        type: 'wheel'
      });

      await cache.add(Buffer.from('content2'), {
        name: 'clear2',
        version: '1.0.0',
        filename: 'clear2-1.0.0.tar.gz',
        type: 'sdist'
      });

      await cache.clear();

      const stats = await cache.getStats();
      expect(stats.totalPackages).toBe(0);
    });
  });

  describe('filename parsing', () => {
    describe('wheel filenames', () => {
      it('should parse standard wheel filename', () => {
        const result = PythonModuleCache.parseWheelFilename(
          'numpy-2.0.1-cp311-cp311-macosx_11_0_arm64.whl'
        );

        expect(result).toEqual({
          name: 'numpy',
          version: '2.0.1',
          pythonTag: 'cp311',
          abiTag: 'cp311',
          platformTag: 'macosx_11_0_arm64'
        });
      });

      it('should parse wheel with build tag', () => {
        const result = PythonModuleCache.parseWheelFilename(
          'package-1.0.0-1-cp310-cp310-linux_x86_64.whl'
        );

        expect(result).toEqual({
          name: 'package',
          version: '1.0.0',
          pythonTag: 'cp310',
          abiTag: 'cp310',
          platformTag: 'linux_x86_64'
        });
      });

      it('should parse any/none wheel', () => {
        const result = PythonModuleCache.parseWheelFilename(
          'requests-2.31.0-py3-none-any.whl'
        );

        expect(result).toEqual({
          name: 'requests',
          version: '2.31.0',
          pythonTag: 'py3',
          abiTag: 'none',
          platformTag: 'any'
        });
      });

      it('should normalize underscores to dashes', () => {
        const result = PythonModuleCache.parseWheelFilename(
          'some_package-1.0.0-py3-none-any.whl'
        );

        expect(result?.name).toBe('some-package');
      });

      it('should return null for invalid wheel filename', () => {
        const result = PythonModuleCache.parseWheelFilename('not-a-wheel.txt');
        expect(result).toBeNull();
      });
    });

    describe('sdist filenames', () => {
      it('should parse tar.gz sdist', () => {
        const result = PythonModuleCache.parseSdistFilename('requests-2.31.0.tar.gz');

        expect(result).toEqual({
          name: 'requests',
          version: '2.31.0'
        });
      });

      it('should parse zip sdist', () => {
        const result = PythonModuleCache.parseSdistFilename('flask-3.0.0.zip');

        expect(result).toEqual({
          name: 'flask',
          version: '3.0.0'
        });
      });

      it('should parse version with pre-release', () => {
        const result = PythonModuleCache.parseSdistFilename('package-1.0.0a1.tar.gz');

        expect(result).toEqual({
          name: 'package',
          version: '1.0.0a1'
        });
      });

      it('should parse version with post-release', () => {
        const result = PythonModuleCache.parseSdistFilename('package-1.0.0.post1.tar.gz');

        expect(result).toEqual({
          name: 'package',
          version: '1.0.0.post1'
        });
      });

      it('should return null for invalid sdist filename', () => {
        const result = PythonModuleCache.parseSdistFilename('not-a-sdist.txt');
        expect(result).toBeNull();
      });
    });
  });

  describe('index persistence', () => {
    it('should persist and reload index', async () => {
      const cacheDir = path.join(testDir, `persist-test-${Date.now()}`);
      const cache1 = new PythonModuleCache({ cacheDir });
      await cache1.initialize();

      await cache1.add(Buffer.from('persistent content'), {
        name: 'persistent',
        version: '1.0.0',
        filename: 'persistent-1.0.0.whl',
        type: 'wheel'
      });

      // Create new cache instance pointing to same directory
      const cache2 = new PythonModuleCache({ cacheDir });
      await cache2.initialize();

      const entry = await cache2.getByNameVersion('persistent', '1.0.0');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('persistent');
    });
  });
});
