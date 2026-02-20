import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PythonPackageResolver, PythonAliasResolver } from './PythonPackageResolver';
import { VirtualEnvironmentManager } from '@core/registry/python/VirtualEnvironmentManager';
import { PythonModuleCache } from '@core/registry/python/PythonModuleCache';
import { PythonLockFile } from '@core/registry/python/PythonLockFile';

describe('PythonPackageResolver', () => {
  let testDir: string;
  let resolver: PythonPackageResolver;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-py-resolver-test-'));
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    resolver = new PythonPackageResolver({
      projectRoot: testDir
    });
  });

  describe('canResolve', () => {
    it('should resolve @py/ references', () => {
      expect(resolver.canResolve('@py/numpy')).toBe(true);
      expect(resolver.canResolve('@py/pandas')).toBe(true);
      expect(resolver.canResolve('@py/requests:get')).toBe(true);
    });

    it('should resolve @python/ references', () => {
      expect(resolver.canResolve('@python/numpy')).toBe(true);
      expect(resolver.canResolve('@python/flask')).toBe(true);
    });

    it('should not resolve other references', () => {
      expect(resolver.canResolve('@base/file.mld')).toBe(false);
      expect(resolver.canResolve('@local/module')).toBe(false);
      expect(resolver.canResolve('numpy')).toBe(false);
      expect(resolver.canResolve('@user/package')).toBe(false);
    });
  });

  describe('reference parsing', () => {
    it('should parse simple package reference', () => {
      const parsed = (resolver as any).parseReference('@py/numpy');
      expect(parsed.packageName).toBe('numpy');
      expect(parsed.objectPath).toBeUndefined();
    });

    it('should parse package with object path', () => {
      const parsed = (resolver as any).parseReference('@py/pandas:DataFrame');
      expect(parsed.packageName).toBe('pandas');
      expect(parsed.objectPath).toBe('DataFrame');
    });

    it('should parse nested object path', () => {
      const parsed = (resolver as any).parseReference('@py/numpy:random.default_rng');
      expect(parsed.packageName).toBe('numpy');
      expect(parsed.objectPath).toBe('random.default_rng');
    });

    it('should handle @python/ alias', () => {
      const parsed = (resolver as any).parseReference('@python/requests');
      expect(parsed.packageName).toBe('requests');
    });
  });

  describe('capabilities', () => {
    it('should have correct capabilities', () => {
      expect(resolver.capabilities.io.read).toBe(true);
      expect(resolver.capabilities.io.write).toBe(false);
      expect(resolver.capabilities.contexts.import).toBe(true);
      expect(resolver.capabilities.contexts.output).toBe(false);
      expect(resolver.capabilities.supportedContentTypes).toContain('module');
    });
  });

  describe('introspection scripts', () => {
    it('should generate package introspection script', () => {
      const script = (resolver as any).generatePackageIntrospectScript('numpy');
      expect(script).toContain('import numpy');
      expect(script).toContain('dir(numpy)');
      expect(script).toContain('json.dumps');
    });

    it('should generate object introspection script', () => {
      const script = (resolver as any).generateObjectIntrospectScript('pandas', 'DataFrame');
      expect(script).toContain('import pandas');
      expect(script).toContain('pandas.DataFrame');
      expect(script).toContain('inspect.signature');
    });
  });

  describe('module generation', () => {
    it('should generate mlld module from exports', () => {
      const exports = {
        array: { type: 'type', callable: true },
        pi: { type: 'float', callable: false }
      };

      const module = (resolver as any).generateMlldModule('numpy', exports);

      expect(module).toContain('# Python package: numpy');
      expect(module).toContain('/exe array');
      expect(module).toContain('/export');
    });

    it('should handle object path in module generation', () => {
      const exports = {
        DataFrame: { type: 'type', callable: true, doc: 'Two-dimensional data structure' }
      };

      const module = (resolver as any).generateMlldModule('pandas', exports, 'DataFrame');

      expect(module).toContain('pandas:DataFrame');
      expect(module).toContain('/exe DataFrame');
    });
  });
});

describe('PythonAliasResolver', () => {
  let testDir: string;
  let resolver: PythonAliasResolver;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-py-alias-test-'));
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    resolver = new PythonAliasResolver({
      projectRoot: testDir
    });
  });

  describe('canResolve', () => {
    it('should resolve @python/ references', () => {
      expect(resolver.canResolve('@python/numpy')).toBe(true);
      expect(resolver.canResolve('@python/pandas')).toBe(true);
    });

    it('should not resolve @py/ references (handled by main resolver)', () => {
      expect(resolver.canResolve('@py/numpy')).toBe(false);
    });

    it('should not resolve other references', () => {
      expect(resolver.canResolve('@base/file')).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('should have correct name', () => {
      expect(resolver.name).toBe('python');
    });

    it('should have lower priority than main resolver', () => {
      const mainResolver = new PythonPackageResolver({ projectRoot: testDir });
      expect(resolver.capabilities.priority).toBeGreaterThan(mainResolver.capabilities.priority);
    });
  });
});
