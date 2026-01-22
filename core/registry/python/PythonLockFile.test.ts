import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PythonLockFile, type PythonLockEntry } from './PythonLockFile';

describe('PythonLockFile', () => {
  let testDir: string;
  let lockFilePath: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-python-lock-test-'));
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Use a fresh lock file for each test
    lockFilePath = path.join(testDir, `mlld-lock-${Date.now()}.json`);
  });

  describe('empty lock file', () => {
    it('should create empty data when file does not exist', () => {
      const lockFile = new PythonLockFile(lockFilePath);
      const packages = lockFile.getAllPackages();
      expect(packages).toEqual({});
    });

    it('should handle hasPackage on empty file', () => {
      const lockFile = new PythonLockFile(lockFilePath);
      expect(lockFile.hasPackage('numpy')).toBe(false);
    });
  });

  describe('adding packages', () => {
    it('should add a package entry', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      const entry: PythonLockEntry = {
        version: '2.0.1',
        resolved: 'numpy-2.0.1-cp311-cp311-macosx_11_0_arm64.whl',
        resolvedHash: 'sha256:abc123',
        source: 'pypi',
        integrity: 'sha256:def456',
        fetchedAt: new Date().toISOString()
      };

      await lockFile.setPackage('numpy', entry);
      await lockFile.save();

      // Verify it's in memory
      const retrieved = lockFile.getPackage('numpy', '2.0.1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.version).toBe('2.0.1');
      expect(retrieved?.source).toBe('pypi');

      // Verify it's persisted
      const content = fs.readFileSync(lockFilePath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed.python?.packages['numpy@2.0.1']).toBeDefined();
    });

    it('should update existing package', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      const entry1: PythonLockEntry = {
        version: '1.0.0',
        resolved: 'requests-1.0.0.tar.gz',
        resolvedHash: 'sha256:old',
        source: 'pypi',
        integrity: 'sha256:old',
        fetchedAt: new Date().toISOString()
      };

      await lockFile.setPackage('requests', entry1);

      const entry2: PythonLockEntry = {
        version: '1.0.0',
        resolved: 'requests-1.0.0-py3-none-any.whl',
        resolvedHash: 'sha256:new',
        source: 'pypi',
        integrity: 'sha256:new',
        fetchedAt: new Date().toISOString()
      };

      await lockFile.setPackage('requests', entry2);
      await lockFile.save();

      const retrieved = lockFile.getPackage('requests', '1.0.0');
      expect(retrieved?.resolvedHash).toBe('sha256:new');
    });
  });

  describe('removing packages', () => {
    it('should remove a specific version', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPackage('flask', {
        version: '2.0.0',
        resolved: 'flask-2.0.0.whl',
        resolvedHash: 'sha256:xxx',
        source: 'pypi',
        integrity: 'sha256:xxx',
        fetchedAt: new Date().toISOString()
      });

      expect(lockFile.hasPackage('flask', '2.0.0')).toBe(true);

      await lockFile.removePackage('flask', '2.0.0');

      expect(lockFile.hasPackage('flask', '2.0.0')).toBe(false);
    });

    it('should remove all versions when version not specified', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPackage('django', {
        version: '3.0.0',
        resolved: 'django-3.0.0.whl',
        resolvedHash: 'sha256:xxx',
        source: 'pypi',
        integrity: 'sha256:xxx',
        fetchedAt: new Date().toISOString()
      });

      await lockFile.setPackage('django', {
        version: '4.0.0',
        resolved: 'django-4.0.0.whl',
        resolvedHash: 'sha256:yyy',
        source: 'pypi',
        integrity: 'sha256:yyy',
        fetchedAt: new Date().toISOString()
      });

      expect(lockFile.hasPackage('django', '3.0.0')).toBe(true);
      expect(lockFile.hasPackage('django', '4.0.0')).toBe(true);

      await lockFile.removePackage('django');

      expect(lockFile.hasPackage('django')).toBe(false);
    });
  });

  describe('Python config', () => {
    it('should set and get Python config', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPythonConfig({
        pythonVersion: '3.11',
        manager: 'uv',
        venvPath: '.venv'
      });

      await lockFile.save();

      const config = lockFile.getPythonConfig();
      expect(config.pythonVersion).toBe('3.11');
      expect(config.manager).toBe('uv');
      expect(config.venvPath).toBe('.venv');
    });

    it('should preserve config across reload', async () => {
      const lockFile1 = new PythonLockFile(lockFilePath);

      await lockFile1.setPythonConfig({
        pythonVersion: '3.10',
        manager: 'pip'
      });
      await lockFile1.save();

      // Reload
      const lockFile2 = new PythonLockFile(lockFilePath);
      const config = lockFile2.getPythonConfig();

      expect(config.pythonVersion).toBe('3.10');
      expect(config.manager).toBe('pip');
    });
  });

  describe('preserves existing modules', () => {
    it('should preserve Node.js modules when adding Python packages', async () => {
      // Write existing lock file with Node.js modules
      const existingData = {
        lockfileVersion: 1,
        modules: {
          'some-npm-package@1.0.0': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/some-npm-package/-/some-npm-package-1.0.0.tgz',
            source: 'some-npm-package',
            integrity: 'sha256:existing',
            fetchedAt: '2024-01-01T00:00:00.000Z'
          }
        },
        metadata: {
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };

      fs.writeFileSync(lockFilePath, JSON.stringify(existingData, null, 2));

      // Add Python package
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPackage('pandas', {
        version: '2.0.0',
        resolved: 'pandas-2.0.0.whl',
        resolvedHash: 'sha256:pandas',
        source: 'pypi',
        integrity: 'sha256:pandas',
        fetchedAt: new Date().toISOString()
      });

      await lockFile.save();

      // Verify both sections exist
      const content = fs.readFileSync(lockFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.modules['some-npm-package@1.0.0']).toBeDefined();
      expect(parsed.python?.packages['pandas@2.0.0']).toBeDefined();
    });
  });

  describe('integrity verification', () => {
    it('should calculate integrity hash', () => {
      const lockFile = new PythonLockFile(lockFilePath);
      const hash = lockFile.calculateIntegrity('test content');
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should verify package integrity', async () => {
      const lockFile = new PythonLockFile(lockFilePath);
      const content = 'package content';
      const hash = lockFile.calculateIntegrity(content);

      await lockFile.setPackage('mypackage', {
        version: '1.0.0',
        resolved: 'mypackage-1.0.0.whl',
        resolvedHash: hash,
        source: 'pypi',
        integrity: hash,
        fetchedAt: new Date().toISOString()
      });

      const valid = await lockFile.verifyPackageIntegrity('mypackage', '1.0.0', content);
      expect(valid).toBe(true);

      const invalid = await lockFile.verifyPackageIntegrity('mypackage', '1.0.0', 'different content');
      expect(invalid).toBe(false);
    });
  });

  describe('package lookup', () => {
    it('should find package by name without version', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPackage('scipy', {
        version: '1.11.0',
        resolved: 'scipy-1.11.0.whl',
        resolvedHash: 'sha256:scipy',
        source: 'pypi',
        integrity: 'sha256:scipy',
        fetchedAt: new Date().toISOString()
      });

      // Find without specifying version
      const entry = lockFile.getPackage('scipy');
      expect(entry).toBeDefined();
      expect(entry?.version).toBe('1.11.0');
    });

    it('should be case-insensitive for package names', async () => {
      const lockFile = new PythonLockFile(lockFilePath);

      await lockFile.setPackage('PyYAML', {
        version: '6.0.0',
        resolved: 'PyYAML-6.0.0.whl',
        resolvedHash: 'sha256:yaml',
        source: 'pypi',
        integrity: 'sha256:yaml',
        fetchedAt: new Date().toISOString()
      });

      // Keys are lowercased
      expect(lockFile.hasPackage('pyyaml', '6.0.0')).toBe(true);
      expect(lockFile.hasPackage('PYYAML', '6.0.0')).toBe(true);
    });
  });
});
