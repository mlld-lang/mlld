import type { PathContext } from '@core/services/PathContextService';
import type { ResolvedURLConfig } from '@core/config/types';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import type { Variable } from '@core/types/variable';
import type { SecurityDescriptor } from '@core/types/security';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { SecurityManager } from '@security';
import { RegistryManager, ModuleCache, LockFile, ProjectConfig } from '@core/registry';
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
import * as path from 'path';

import type { CacheManager } from '../CacheManager';
import type { ImportResolverContext, ImportResolverDependencies } from '../ImportResolver';
import type { ContextManager, PipelineContextSnapshot } from '../ContextManager';
import type { VariableManagerContext, VariableManagerDependencies } from '../VariableManager';
import type { SecuritySnapshotLike } from '../runtime/SecurityPolicyRuntime';

interface UrlValidationOptions {
  allowedProtocols: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  maxResponseSize: number;
  timeout: number;
}

export interface NormalizedEnvironmentPathContext {
  basePath: string;
  pathContext?: PathContext;
}

export interface RootBootstrapResult {
  securityManager?: SecurityManager;
  registryManager?: RegistryManager;
  projectConfig?: ProjectConfig;
  resolverManager?: ResolverManager;
  localModulePath: string;
  allowAbsolutePaths: boolean;
}

export interface RootBootstrapContext {
  fileSystem: IFileSystemService;
  pathContext?: PathContext;
  basePath: string;
}

export interface VariableManagerDependencyContext {
  cacheManager: CacheManager;
  getCurrentFilePath(): string | undefined;
  getReservedNames(): Set<string>;
  getParent(): VariableManagerContext | undefined;
  getCapturedModuleEnv(): Map<string, Variable> | undefined;
  isModuleIsolated(): boolean;
  getResolverManager(): ResolverManager | undefined;
  createDebugObject(format: number): string;
  getEnvironmentVariables(): Record<string, string>;
  getStdinContent(): string | undefined;
  getFsService(): IFileSystemService;
  getPathService(): IPathService;
  getSecurityManager(): SecurityManager | undefined;
  getBasePath(): string;
  getFileDirectory(): string;
  getExecutionDirectory(): string;
  getPipelineContext(): PipelineContextSnapshot | undefined;
  getSecuritySnapshot(): SecuritySnapshotLike | undefined;
  recordSecurityDescriptor(descriptor: SecurityDescriptor | undefined): void;
  getContextManager(): ContextManager | undefined;
}

export interface ImportResolverDependencyContext {
  fileSystem: IFileSystemService;
  pathService: IPathService;
  pathContext?: PathContext;
  basePath: string;
  cacheManager: CacheManager;
  getSecurityManager(): SecurityManager | undefined;
  getRegistryManager(): RegistryManager | undefined;
  getResolverManager(): ResolverManager | undefined;
  getParent(): ImportResolverContext | undefined;
  getCurrentFilePath(): string | undefined;
  getApproveAllImports(): boolean;
  getLocalFileFuzzyMatch(): FuzzyMatchConfig | boolean;
  getURLConfig(): ResolvedURLConfig | undefined;
  getDefaultUrlOptions(): UrlValidationOptions;
  getAllowAbsolutePaths(): boolean;
}

interface ResolverManagerFactoryContext {
  fileSystem: IFileSystemService;
  projectRoot: string;
  basePath: string;
  moduleCache?: ModuleCache;
  lockFile?: LockFile;
  projectConfig?: ProjectConfig;
}

export function normalizeEnvironmentPathContext(
  basePathOrContext: string | PathContext
): NormalizedEnvironmentPathContext {
  if (typeof basePathOrContext === 'string') {
    logger.debug('Environment created with legacy basePath', { basePath: basePathOrContext });
    return { basePath: basePathOrContext };
  }

  logger.debug('Environment created with PathContext', {
    projectRoot: basePathOrContext.projectRoot,
    fileDirectory: basePathOrContext.fileDirectory
  });
  return {
    basePath: basePathOrContext.projectRoot,
    pathContext: basePathOrContext
  };
}

export function initializeRootBootstrap(context: RootBootstrapContext): RootBootstrapResult {
  const projectRoot = context.pathContext?.projectRoot ?? context.basePath;
  let securityManager: SecurityManager | undefined;
  let registryManager: RegistryManager | undefined;
  let projectConfig: ProjectConfig | undefined;
  let resolverManager: ResolverManager | undefined;
  let allowAbsolutePaths = false;
  let localModulePath: string | undefined;

  try {
    securityManager = SecurityManager.getInstance(projectRoot);
  } catch (_error) {
    console.warn('SecurityManager not available, using legacy security components');
  }

  try {
    registryManager = new RegistryManager(context.pathContext || projectRoot);
  } catch (error) {
    console.warn('RegistryManager not available:', error);
  }

  let moduleCache: ModuleCache | undefined;
  let lockFile: LockFile | undefined;

  try {
    moduleCache = new ModuleCache();
    projectConfig = new ProjectConfig(projectRoot);
    const localModulesRelative = projectConfig.getLocalModulesPath?.() ?? path.join('llm', 'modules');
    localModulePath = path.isAbsolute(localModulesRelative)
      ? localModulesRelative
      : path.join(projectRoot, localModulesRelative);
    const lockFilePath = path.join(projectRoot, 'mlld-lock.json');
    lockFile = new LockFile(lockFilePath);
    allowAbsolutePaths = projectConfig.getAllowAbsolutePaths();
  } catch (error) {
    console.warn('Failed to initialize cache/lock file:', error);
  }

  if (!localModulePath) {
    localModulePath = path.join(projectRoot, 'llm', 'modules');
  }

  try {
    resolverManager = createResolverManager({
      fileSystem: context.fileSystem,
      projectRoot,
      basePath: context.basePath,
      moduleCache,
      lockFile,
      projectConfig
    });
  } catch (error) {
    console.warn('ResolverManager initialization failed:', error);
    if (error instanceof Error) {
      console.warn('Error stack:', error.stack);
    }
    resolverManager = undefined;
  }

  return {
    securityManager,
    registryManager,
    projectConfig,
    resolverManager,
    localModulePath,
    allowAbsolutePaths
  };
}

export function createResolverManager(context: ResolverManagerFactoryContext): ResolverManager {
  const resolverManager = new ResolverManager(
    undefined,
    context.moduleCache,
    context.lockFile
  );

  resolverManager.registerResolver(new ProjectPathResolver(context.fileSystem));
  resolverManager.registerResolver(new RegistryResolver());

  const pythonResolverOptions = { projectRoot: context.projectRoot };
  resolverManager.registerResolver(new PythonPackageResolver(pythonResolverOptions));
  resolverManager.registerResolver(new PythonAliasResolver(pythonResolverOptions));

  resolverManager.registerResolver(new LocalResolver(context.fileSystem));
  resolverManager.registerResolver(new GitHubResolver());
  resolverManager.registerResolver(new HTTPResolver());

  resolverManager.configurePrefixes([
    {
      prefix: '@base',
      resolver: 'base',
      type: 'io',
      config: {
        basePath: context.projectRoot,
        readonly: false
      }
    }
  ], context.basePath);

  if (context.projectConfig) {
    const resolverPrefixes = context.projectConfig.getResolverPrefixes();
    if (resolverPrefixes.length > 0) {
      logger.debug(`Configuring ${resolverPrefixes.length} resolver prefixes from config`);
      resolverManager.configurePrefixes(resolverPrefixes, context.basePath);
      logger.debug(`Total prefixes after configuration: ${resolverManager.getPrefixConfigs().length}`);
    }
  }

  return resolverManager;
}

export function buildVariableManagerDependencies(
  context: VariableManagerDependencyContext
): VariableManagerDependencies {
  return {
    cacheManager: context.cacheManager,
    getCurrentFilePath: context.getCurrentFilePath,
    getReservedNames: context.getReservedNames,
    getParent: context.getParent,
    getCapturedModuleEnv: context.getCapturedModuleEnv,
    isModuleIsolated: context.isModuleIsolated,
    getResolverManager: context.getResolverManager,
    createDebugObject: context.createDebugObject,
    getEnvironmentVariables: context.getEnvironmentVariables,
    getStdinContent: context.getStdinContent,
    getFsService: context.getFsService,
    getPathService: context.getPathService,
    getSecurityManager: context.getSecurityManager,
    getBasePath: context.getBasePath,
    getFileDirectory: context.getFileDirectory,
    getExecutionDirectory: context.getExecutionDirectory,
    getPipelineContext: context.getPipelineContext,
    getSecuritySnapshot: context.getSecuritySnapshot,
    recordSecurityDescriptor: context.recordSecurityDescriptor,
    getContextManager: context.getContextManager
  };
}

export function buildImportResolverDependencies(
  context: ImportResolverDependencyContext
): ImportResolverDependencies {
  const resolvedPathContext = context.pathContext || {
    projectRoot: context.basePath,
    fileDirectory: context.basePath,
    executionDirectory: context.basePath,
    invocationDirectory: process.cwd()
  };

  return {
    fileSystem: context.fileSystem,
    pathService: context.pathService,
    pathContext: resolvedPathContext,
    cacheManager: context.cacheManager,
    getSecurityManager: context.getSecurityManager,
    getRegistryManager: context.getRegistryManager,
    getResolverManager: context.getResolverManager,
    getParent: context.getParent,
    getCurrentFilePath: context.getCurrentFilePath,
    getApproveAllImports: context.getApproveAllImports,
    getLocalFileFuzzyMatch: context.getLocalFileFuzzyMatch,
    getURLConfig: context.getURLConfig,
    getDefaultUrlOptions: context.getDefaultUrlOptions,
    getAllowAbsolutePaths: context.getAllowAbsolutePaths
  };
}
