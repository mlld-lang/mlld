import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import {
  normalizeEnvironmentPathContext,
  createResolverManager,
  buildImportResolverDependencies,
  buildVariableManagerDependencies
} from './EnvironmentBootstrap';

describe('EnvironmentBootstrap helpers', () => {
  describe('normalizeEnvironmentPathContext', () => {
    it('returns legacy path data when base path string is provided', () => {
      const normalized = normalizeEnvironmentPathContext('/tmp/project');

      expect(normalized.basePath).toBe('/tmp/project');
      expect(normalized.pathContext).toBeUndefined();
    });

    it('returns contextual path data when path context is provided', () => {
      const normalized = normalizeEnvironmentPathContext({
        projectRoot: '/tmp/project',
        fileDirectory: '/tmp/project/docs',
        executionDirectory: '/tmp/project',
        invocationDirectory: '/tmp/project'
      });

      expect(normalized.basePath).toBe('/tmp/project');
      expect(normalized.pathContext).toEqual({
        projectRoot: '/tmp/project',
        fileDirectory: '/tmp/project/docs',
        executionDirectory: '/tmp/project',
        invocationDirectory: '/tmp/project'
      });
    });
  });

  describe('createResolverManager', () => {
    it('registers default resolvers and configures @base prefix', () => {
      const manager = createResolverManager({
        fileSystem: new MemoryFileSystem(),
        projectRoot: '/tmp/project',
        basePath: '/tmp/project'
      });

      const resolverNames = manager.getResolverNames();
      expect(resolverNames).toContain('base');
      expect(resolverNames).toContain('root');
      expect(resolverNames).toContain('REGISTRY');
      expect(resolverNames).toContain('py');
      expect(resolverNames).toContain('python');
      expect(resolverNames).toContain('LOCAL');
      expect(resolverNames).toContain('GITHUB');
      expect(resolverNames).toContain('HTTP');

      const basePrefix = manager.getPrefixConfigs().find(prefix => prefix.prefix === '@base');
      expect(basePrefix).toBeDefined();
      expect(basePrefix?.resolver).toBe('base');
      expect((basePrefix?.config as any)?.basePath).toBe('/tmp/project');
      expect((basePrefix?.config as any)?.readonly).toBe(false);
    });
  });

  describe('buildImportResolverDependencies', () => {
    it('materializes fallback path context when one is not provided', () => {
      const dependencies = buildImportResolverDependencies({
        fileSystem: new MemoryFileSystem(),
        pathService: {} as any,
        pathContext: undefined,
        basePath: '/tmp/base',
        cacheManager: {} as any,
        getSecurityManager: () => undefined,
        getRegistryManager: () => undefined,
        getResolverManager: () => undefined,
        getParent: () => undefined,
        getCurrentFilePath: () => '/tmp/base/main.mld',
        getApproveAllImports: () => false,
        getLocalFileFuzzyMatch: () => true,
        getURLConfig: () => undefined,
        getDefaultUrlOptions: () => ({
          allowedProtocols: ['https'],
          allowedDomains: ['example.com'],
          blockedDomains: [],
          maxResponseSize: 1024,
          timeout: 5000
        }),
        getAllowAbsolutePaths: () => false
      });

      expect(dependencies.pathContext.projectRoot).toBe('/tmp/base');
      expect(dependencies.pathContext.fileDirectory).toBe('/tmp/base');
      expect(dependencies.pathContext.executionDirectory).toBe('/tmp/base');
      expect(dependencies.pathContext.invocationDirectory).toBeTypeOf('string');
      expect(dependencies.getCurrentFilePath()).toBe('/tmp/base/main.mld');
      expect(dependencies.getDefaultUrlOptions().timeout).toBe(5000);
    });

    it('preserves explicit path context when provided', () => {
      const explicitPathContext = {
        projectRoot: '/tmp/project',
        fileDirectory: '/tmp/project/file',
        executionDirectory: '/tmp/project/exec',
        invocationDirectory: '/tmp/project/invoke'
      };
      const dependencies = buildImportResolverDependencies({
        fileSystem: new MemoryFileSystem(),
        pathService: {} as any,
        pathContext: explicitPathContext,
        basePath: '/tmp/base',
        cacheManager: {} as any,
        getSecurityManager: () => undefined,
        getRegistryManager: () => undefined,
        getResolverManager: () => undefined,
        getParent: () => undefined,
        getCurrentFilePath: () => undefined,
        getApproveAllImports: () => false,
        getLocalFileFuzzyMatch: () => true,
        getURLConfig: () => undefined,
        getDefaultUrlOptions: () => ({
          allowedProtocols: ['https'],
          allowedDomains: [],
          blockedDomains: [],
          maxResponseSize: 1024,
          timeout: 5000
        }),
        getAllowAbsolutePaths: () => false
      });

      expect(dependencies.pathContext).toEqual(explicitPathContext);
    });
  });

  describe('buildVariableManagerDependencies', () => {
    it('passes through callback providers without transformation', () => {
      const reservedNames = new Set(['debug']);
      const dependencies = buildVariableManagerDependencies({
        cacheManager: {} as any,
        getCurrentFilePath: () => '/tmp/file.mld',
        getReservedNames: () => reservedNames,
        getParent: () => undefined,
        getCapturedModuleEnv: () => undefined,
        isModuleIsolated: () => false,
        getResolverManager: () => undefined,
        createDebugObject: () => 'debug',
        getEnvironmentVariables: () => ({ NODE_ENV: 'test' }),
        getStdinContent: () => '{"ok":true}',
        getFsService: () => new MemoryFileSystem(),
        getPathService: () => ({}) as any,
        getSecurityManager: () => undefined,
        getBasePath: () => '/tmp',
        getFileDirectory: () => '/tmp',
        getExecutionDirectory: () => '/tmp',
        getPipelineContext: () => undefined,
        getSecuritySnapshot: () => undefined,
        recordSecurityDescriptor: () => {},
        getContextManager: () => undefined
      });

      expect(dependencies.getCurrentFilePath()).toBe('/tmp/file.mld');
      expect(dependencies.getReservedNames()).toBe(reservedNames);
      expect(dependencies.getEnvironmentVariables()).toEqual({ NODE_ENV: 'test' });
      expect(dependencies.getStdinContent()).toBe('{"ok":true}');
      expect(dependencies.getBasePath()).toBe('/tmp');
      expect(dependencies.createDebugObject(3)).toBe('debug');
    });
  });
});
