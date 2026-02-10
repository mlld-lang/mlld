import path from 'path';
import type { MlldMode } from '@core/types/mode';
import type { ResolvedURLConfig } from '@core/config/types';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import { RegistryManager, type ProjectConfig } from '@core/registry';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import {
  ResolverManager,
  RegistryResolver,
  LocalResolver,
  GitHubResolver,
  HTTPResolver,
  ProjectPathResolver,
  PythonPackageResolver,
  PythonAliasResolver
} from '@core/resolvers';
import { logger } from '@core/utils/logger';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { PathContext } from '@core/services/PathContextService';
import { ImportResolver, type IImportResolver } from '../ImportResolver';
import { buildImportResolverDependencies } from '../bootstrap/EnvironmentBootstrap';
import type { CacheManager } from '../CacheManager';
import type { SecurityManager } from '@security';
import { defaultStreamingOptions, type StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { StreamingResult } from '@sdk/types';

export interface DefaultUrlOptions {
  allowedProtocols: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  maxResponseSize: number;
  timeout: number;
}

export interface CacheManagerWithUrlConfig {
  setURLConfig(config: ResolvedURLConfig): void;
}

export interface StreamingOptionsSink {
  setStreamingOptions(options: StreamingOptions): void;
}

export interface EphemeralReconfigurationInput {
  fileSystem: IFileSystemService;
  pathContext?: PathContext;
  projectRoot: string;
  hasRegistryManager: boolean;
  hasResolverManager: boolean;
}

export interface EphemeralReconfigurationResult {
  registryManager?: RegistryManager;
  resolverManager?: ResolverManager;
}

export interface ImportResolverFactoryInput {
  fileSystem: IFileSystemService;
  pathService: IPathService;
  pathContext?: PathContext;
  basePath: string;
  cacheManager: CacheManager;
  getSecurityManager: () => SecurityManager | undefined;
  getRegistryManager: () => RegistryManager | undefined;
  getResolverManager: () => ResolverManager | undefined;
  getParent: () => unknown;
  getCurrentFilePath: () => string | undefined;
  getApproveAllImports: () => boolean;
  getLocalFileFuzzyMatch: () => FuzzyMatchConfig | boolean;
  getURLConfig: () => ResolvedURLConfig | undefined;
  getDefaultUrlOptions: () => DefaultUrlOptions;
  getAllowAbsolutePaths: () => boolean;
}

export interface LocalModulesConfigurationInput {
  resolverManager?: ResolverManager;
  localModulePath?: string;
  fileSystem: IFileSystemService;
  projectConfig?: ProjectConfig;
}

export class RuntimeConfigurationRuntime {
  mergeUrlOptions(current: DefaultUrlOptions, options: Partial<DefaultUrlOptions>): DefaultUrlOptions {
    return { ...current, ...options };
  }

  applyUrlConfig(cacheManager: CacheManagerWithUrlConfig, config: ResolvedURLConfig): ResolvedURLConfig {
    cacheManager.setURLConfig(config);
    return config;
  }

  setAllowAbsolutePaths(allow: boolean): boolean {
    return allow;
  }

  getAllowAbsolutePaths(current: boolean): boolean {
    return current;
  }

  setStreamingOptions(
    current: StreamingOptions,
    options: Partial<StreamingOptions> | undefined,
    sink?: StreamingOptionsSink
  ): StreamingOptions {
    const next = options ? { ...current, ...options } : { ...defaultStreamingOptions };
    sink?.setStreamingOptions(next);
    return next;
  }

  getStreamingOptions(current: StreamingOptions): StreamingOptions {
    return { ...current };
  }

  ensureStreamingManager(manager: StreamingManager | undefined): StreamingManager {
    if (manager) {
      return manager;
    }
    return new StreamingManager();
  }

  setStreamingResult(result: StreamingResult | undefined): StreamingResult | undefined {
    return result;
  }

  getStreamingResult(result: StreamingResult | undefined): StreamingResult | undefined {
    return result;
  }

  setProvenanceEnabled(enabled: boolean): boolean {
    return enabled;
  }

  isProvenanceEnabled(enabled: boolean): boolean {
    return enabled;
  }

  setDynamicModuleMode(mode: MlldMode | undefined): MlldMode | undefined {
    return mode;
  }

  getDynamicModuleMode(mode: MlldMode | undefined): MlldMode {
    return mode ?? 'strict';
  }

  setNormalizeBlankLines(normalize: boolean): boolean {
    return normalize;
  }

  getNormalizeBlankLines(normalize: boolean): boolean {
    return normalize;
  }

  setLocalFileFuzzyMatch(config: FuzzyMatchConfig | boolean): FuzzyMatchConfig | boolean {
    return config;
  }

  enableEphemeralMode(): { isEphemeralMode: true; approveAllImports: true } {
    return {
      isEphemeralMode: true,
      approveAllImports: true
    };
  }

  async reconfigureForEphemeral(
    input: EphemeralReconfigurationInput
  ): Promise<EphemeralReconfigurationResult> {
    const [{ InMemoryModuleCache }, { NoOpLockFile }] = await Promise.all([
      import('@core/registry/InMemoryModuleCache'),
      import('@core/registry/NoOpLockFile')
    ]);

    const moduleCache = new InMemoryModuleCache();
    const lockFile = new NoOpLockFile(path.join(input.projectRoot, 'mlld.lock.json'));

    const result: EphemeralReconfigurationResult = {};

    if (input.hasRegistryManager) {
      result.registryManager = new RegistryManager(input.pathContext || input.projectRoot);
    }

    if (input.hasResolverManager) {
      const resolverManager = new ResolverManager(
        undefined,
        moduleCache,
        lockFile
      );

      resolverManager.registerResolver(new ProjectPathResolver(input.fileSystem));
      resolverManager.registerResolver(new RegistryResolver());

      const pythonResolverOptions = { projectRoot: input.projectRoot };
      resolverManager.registerResolver(new PythonPackageResolver(pythonResolverOptions));
      resolverManager.registerResolver(new PythonAliasResolver(pythonResolverOptions));

      resolverManager.registerResolver(new LocalResolver(input.fileSystem));
      resolverManager.registerResolver(new GitHubResolver());
      resolverManager.registerResolver(new HTTPResolver());

      resolverManager.configurePrefixes([
        {
          prefix: '@base',
          resolver: 'base',
          type: 'io',
          config: {
            basePath: input.projectRoot,
            readonly: false
          }
        }
      ]);

      result.resolverManager = resolverManager;
    }

    return result;
  }

  createImportResolver(input: ImportResolverFactoryInput): IImportResolver {
    return new ImportResolver(
      buildImportResolverDependencies({
        fileSystem: input.fileSystem,
        pathService: input.pathService,
        pathContext: input.pathContext,
        basePath: input.basePath,
        cacheManager: input.cacheManager,
        getSecurityManager: input.getSecurityManager,
        getRegistryManager: input.getRegistryManager,
        getResolverManager: input.getResolverManager,
        getParent: () => input.getParent() as any,
        getCurrentFilePath: input.getCurrentFilePath,
        getApproveAllImports: input.getApproveAllImports,
        getLocalFileFuzzyMatch: input.getLocalFileFuzzyMatch,
        getURLConfig: input.getURLConfig,
        getDefaultUrlOptions: input.getDefaultUrlOptions,
        getAllowAbsolutePaths: input.getAllowAbsolutePaths
      })
    );
  }

  async configureLocalModules(input: LocalModulesConfigurationInput): Promise<void> {
    if (!input.resolverManager) {
      return;
    }

    const localPath = input.localModulePath;
    if (!localPath) {
      return;
    }

    let exists = false;
    try {
      exists = await input.fileSystem.exists(localPath);
    } catch {
      exists = false;
    }

    if (!exists) {
      logger.debug(`Local modules path not found: ${localPath}`);
      return;
    }

    let currentUser: string | undefined;
    try {
      const user = await GitHubAuthService.getInstance().getGitHubUser();
      currentUser = user?.login?.toLowerCase();
    } catch {
      currentUser = undefined;
    }

    const prefixes = input.projectConfig?.getResolverPrefixes() ?? [];
    const allowedAuthors = prefixes
      .filter(prefixConfig => prefixConfig.prefix && prefixConfig.prefix.startsWith('@') && prefixConfig.resolver !== 'REGISTRY')
      .map(prefixConfig => prefixConfig.prefix.replace(/^@/, '').replace(/\/$/, '').toLowerCase());

    await input.resolverManager.configureLocalModules(localPath, {
      currentUser,
      allowedAuthors
    });
  }
}
