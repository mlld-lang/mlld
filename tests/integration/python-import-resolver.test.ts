import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Python Import Resolver Integration', () => {
  let testDir: string;
  let env: Environment;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-py-import-test-'));

    env = new Environment(
      new NodeFileSystem(),
      new PathService(),
      testDir
    );

    await env.registerBuiltinResolvers();
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('resolver registration', () => {
    it('should have py resolver registered', () => {
      const resolverManager = env.getResolverManager();
      expect(resolverManager).toBeDefined();

      const pyResolver = resolverManager?.getResolver('py');
      expect(pyResolver).toBeDefined();
      expect(pyResolver?.name).toBe('py');
    });

    it('should have python resolver registered', () => {
      const resolverManager = env.getResolverManager();
      expect(resolverManager).toBeDefined();

      const pythonResolver = resolverManager?.getResolver('python');
      expect(pythonResolver).toBeDefined();
      expect(pythonResolver?.name).toBe('python');
    });

    it('py resolver should handle @py/ references', () => {
      const resolverManager = env.getResolverManager();
      const pyResolver = resolverManager?.getResolver('py');

      expect(pyResolver?.canResolve('@py/numpy')).toBe(true);
      expect(pyResolver?.canResolve('@py/pandas:DataFrame')).toBe(true);
      expect(pyResolver?.canResolve('@base/file.mld')).toBe(false);
    });

    it('python resolver should handle @python/ references', () => {
      const resolverManager = env.getResolverManager();
      const pythonResolver = resolverManager?.getResolver('python');

      expect(pythonResolver?.canResolve('@python/numpy')).toBe(true);
      expect(pythonResolver?.canResolve('@python/requests')).toBe(true);
      expect(pythonResolver?.canResolve('@py/numpy')).toBe(false);
    });
  });

  describe('resolver capabilities', () => {
    it('py resolver should support import context', () => {
      const resolverManager = env.getResolverManager();
      const pyResolver = resolverManager?.getResolver('py');

      expect(pyResolver?.capabilities.contexts.import).toBe(true);
      expect(pyResolver?.capabilities.io.read).toBe(true);
      expect(pyResolver?.capabilities.io.write).toBe(false);
    });

    it('py resolver should return module content type', () => {
      const resolverManager = env.getResolverManager();
      const pyResolver = resolverManager?.getResolver('py');

      expect(pyResolver?.capabilities.supportedContentTypes).toContain('module');
      expect(pyResolver?.capabilities.defaultContentType).toBe('module');
    });
  });
});
