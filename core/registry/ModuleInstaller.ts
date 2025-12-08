import * as path from 'path';
import { ModuleCache } from './ModuleCache';
import { LockFile, type ModuleLockEntry, type LockFileOptions } from './LockFile';
import { ProjectConfig } from './ProjectConfig';
import { HashUtils } from './utils/HashUtils';
import { DependencyResolver } from './DependencyResolver';
import { ResolverManager, ProjectPathResolver, RegistryResolver, LocalResolver, GitHubResolver, HTTPResolver, type ResolverOptions } from '@core/resolvers';
import type { Resolver } from '@core/resolvers/types';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { parseSemVer, compareSemVer } from '@core/utils/version-checker';

import type { DependencyResolution } from './types';

export interface ModuleSpecifier {
  name: string;
  version?: string;
}

export type InstallStatus = 'installed' | 'cached' | 'dry-run' | 'failed';

export interface ModuleUpdateResult {
  module: string;
  previousVersion?: string;
  newVersion?: string;
  status: 'updated' | 'unchanged' | 'failed';
  hash?: string;
  error?: Error;
}

export interface ModuleOutdatedResult {
  module: string;
  currentVersion?: string;
  latestVersion?: string;
  status: 'outdated' | 'up-to-date' | 'unknown';
  reason?: string;
  error?: Error;
}

export type ModuleInstallerEvent =
  | { type: 'start'; module: string; version?: string }
  | { type: 'skip'; module: string; reason: 'cached' | 'dry-run' }
  | { type: 'fetch'; module: string }
  | { type: 'success'; module: string; status: 'installed' | 'cached'; hash?: string; version?: string }
  | { type: 'error'; module: string; error: Error };

export interface InstallOptions {
  force?: boolean;
  noCache?: boolean;
  dryRun?: boolean;
  context?: ResolverOptions['context'];
  onEvent?: (event: ModuleInstallerEvent) => void;
}

export interface ModuleWorkspaceOptions {
  projectRoot: string;
  lockFileOptions?: LockFileOptions;
  moduleCache?: ModuleCache;
  lockFile?: LockFile;
  resolverManager?: ResolverManager;
}

export class ModuleWorkspace {
  readonly projectRoot: string;
  readonly fileSystem: NodeFileSystem;
  readonly pathService: PathService;
  readonly lockFile: LockFile;
  readonly moduleCache: ModuleCache;
  readonly projectConfig: ProjectConfig;
  readonly resolverManager: ResolverManager;

  constructor(options: ModuleWorkspaceOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.fileSystem = new NodeFileSystem();
    this.pathService = new PathService();

    const fallbackPaths = [
      path.join(this.projectRoot, 'mlld.lock.json'),
      path.join(this.projectRoot, '.mlld', 'mlld.lock.json')
    ];

    this.lockFile = options.lockFile ?? new LockFile(
      path.join(this.projectRoot, 'mlld-lock.json'),
      {
        fallbackPaths,
        ...(options.lockFileOptions ?? {})
      }
    );

    this.moduleCache = options.moduleCache ?? new ModuleCache();
    this.projectConfig = new ProjectConfig(this.projectRoot);
    this.resolverManager = options.resolverManager ?? this.createResolverManager();
  }

  private createResolverManager(): ResolverManager {
    const manager = new ResolverManager(undefined, this.moduleCache, this.lockFile);

    const resolvers: Resolver[] = [
      new ProjectPathResolver(this.fileSystem),
      new RegistryResolver(),
      new LocalResolver(this.fileSystem),
      new GitHubResolver(),
      new HTTPResolver()
    ];

    for (const resolver of resolvers) {
      try {
        manager.registerResolver(resolver);
      } catch (error) {
        console.warn(`Failed to register resolver ${resolver.name}: ${(error as Error).message}`);
      }
    }

    const basePrefix = {
      prefix: '@base',
      resolver: 'base',
      type: 'io' as const,
      config: {
        basePath: this.projectRoot,
        readonly: false
      }
    };

    const prefixes = [basePrefix, ...this.projectConfig.getResolverPrefixes()];
    try {
      manager.configurePrefixes(prefixes, this.projectRoot);
    } catch (error) {
      console.warn(`Failed to configure resolver prefixes: ${(error as Error).message}`);
    }

    return manager;
  }

  getDependenciesFromConfig(): ModuleSpecifier[] {
    const dependencies = this.projectConfig.getDependencies();
    return Object.entries(dependencies).map(([name, version]) => ({
      name: this.normalizeModuleName(name),
      version: version && version !== 'latest' ? version : undefined
    }));
  }

  getModulesFromLockFile(): ModuleSpecifier[] {
    return this.lockFile.getModuleEntries().map(({ moduleName, entry }) => ({
      name: moduleName,
      version: entry.registryVersion || entry.version
    }));
  }

  normalizeModuleName(name: string): string {
    if (!name) return name;
    if (name.startsWith('mlld://')) {
      name = name.slice('mlld://'.length);
    }
    if (!name.startsWith('@')) {
      return `@${name}`;
    }
    return name;
  }

  buildReference(spec: ModuleSpecifier): string {
    const name = this.normalizeModuleName(spec.name);
    if (spec.version && spec.version.length > 0) {
      return `${name}@${spec.version}`;
    }
    return name;
  }

  async resolveDependencies(
    specs: ModuleSpecifier[],
    options: { includeDevDependencies?: boolean } = {}
  ): Promise<DependencyResolution> {
    const resolver = new DependencyResolver(this.workspace.resolverManager, this.workspace.moduleCache);
    return resolver.resolve(specs, {
      includeDevDependencies: options.includeDevDependencies ?? false
    });
  }
}

export class ModuleInstaller {
  constructor(public readonly workspace: ModuleWorkspace) {}

  static forProject(projectRoot: string, options: Omit<ModuleWorkspaceOptions, 'projectRoot'> = {}): ModuleInstaller {
    const workspace = new ModuleWorkspace({ projectRoot, ...options });
    return new ModuleInstaller(workspace);
  }

  async installModules(specs: ModuleSpecifier[], options: InstallOptions = {}): Promise<ModuleInstallResult[]> {
    const results: ModuleInstallResult[] = [];
    for (const spec of specs) {
      const result = await this.installSingle(spec, options);
      results.push(result);
    }
    return results;
  }

  private async installSingle(spec: ModuleSpecifier, options: InstallOptions): Promise<ModuleInstallResult> {
    const moduleName = this.workspace.normalizeModuleName(spec.name);
    const reference = this.workspace.buildReference(spec);
    const emit = options.onEvent;
    emit?.({ type: 'start', module: moduleName, version: spec.version });

    if (options.dryRun) {
      const existing = this.workspace.lockFile.getModule(moduleName);
      if (existing && existing.resolved) {
        emit?.({ type: 'skip', module: moduleName, reason: 'dry-run' });
        return {
          module: moduleName,
          status: 'dry-run',
          version: existing.registryVersion || existing.version,
          hash: existing.resolved,
          message: 'already installed (dry run)'
        };
      }
      emit?.({ type: 'skip', module: moduleName, reason: 'dry-run' });
      return {
        module: moduleName,
        status: 'dry-run',
        version: spec.version,
        message: 'would install'
      };
    }

    const requestedVersion = spec.version?.toString();
    let lockEntry = this.workspace.lockFile.getModule(moduleName);
    const lockVersion = lockEntry ? (lockEntry.registryVersion || lockEntry.version) : undefined;
    const versionMismatch = Boolean(
      requestedVersion &&
      lockVersion &&
      requestedVersion !== lockVersion
    );

    // If a different version is requested, purge cache and lock entry to force refetch
    if (versionMismatch && lockEntry?.resolved) {
      try {
        await this.workspace.moduleCache.remove(lockEntry.resolved);
      } catch (error) {
        console.warn(`Failed to purge cache for ${moduleName}: ${(error as Error).message}`);
      }
      try {
        await this.workspace.lockFile.removeModule(moduleName);
        lockEntry = undefined;
      } catch (error) {
        console.warn(`Failed to remove lock entry for ${moduleName}: ${(error as Error).message}`);
      }
    }

    if (!options.force && !options.noCache && lockEntry?.resolved) {
      try {
        const cached = await this.workspace.moduleCache.has(lockEntry.resolved);
        if (cached) {
          emit?.({ type: 'skip', module: moduleName, reason: 'cached' });
          return {
            module: moduleName,
            status: 'cached',
            version: lockEntry.registryVersion || lockEntry.version,
            hash: lockEntry.resolved
          };
        }
      } catch (error) {
        console.warn(`Failed to check cache for ${moduleName}: ${(error as Error).message}`);
      }
    }

    if ((options.force || options.noCache) && lockEntry?.resolved) {
      try {
        await this.workspace.moduleCache.remove(lockEntry.resolved);
      } catch (error) {
        console.warn(`Failed to purge cache for ${moduleName}: ${(error as Error).message}`);
      }
      try {
        await this.workspace.lockFile.removeModule(moduleName);
      } catch (error) {
        console.warn(`Failed to remove lock entry for ${moduleName}: ${(error as Error).message}`);
      }
    }

    emit?.({ type: 'fetch', module: moduleName });

    let resolvedContent: string = '';
    let resolvedVersion: string | undefined;
    let resolvedHash: string | undefined;
    let source: string | undefined;
    let sourceUrl: string | undefined;

    try {
      const resolution = await this.workspace.resolverManager.resolve(reference, {
        context: options.context ?? 'import'
      });
      resolvedContent = resolution.content.content;
      const metadata = resolution.content.metadata ?? {};
      resolvedHash = metadata.hash ?? undefined;
      resolvedVersion = metadata.version ?? metadata.registryVersion ?? spec.version;
      source = metadata.source ?? reference;
      sourceUrl = metadata.sourceUrl ?? metadata.source;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      emit?.({ type: 'error', module: moduleName, error: err });
      return {
        module: moduleName,
        status: 'failed',
        error: err
      };
    }

    const hash = resolvedHash && resolvedHash.length > 0
      ? resolvedHash
      : HashUtils.hash(resolvedContent);

    let integrity: string;
    try {
      integrity = await this.workspace.lockFile.calculateIntegrity(resolvedContent);
    } catch (error) {
      console.warn(`Failed to calculate integrity for ${moduleName}: ${(error as Error).message}`);
      integrity = `sha256:${hash}`;
    }

    const lockEntryToWrite: ModuleLockEntry = {
      version: resolvedVersion || spec.version || 'latest',
      resolved: hash,
      source: source ?? reference,
      sourceUrl,
      integrity,
      fetchedAt: new Date().toISOString(),
      registryVersion: resolvedVersion,
      dependencies: undefined
    };

    await this.workspace.lockFile.addModule(moduleName, lockEntryToWrite);

    emit?.({
      type: 'success',
      module: moduleName,
      status: 'installed',
      hash,
      version: lockEntryToWrite.registryVersion || lockEntryToWrite.version
    });

    return {
      module: moduleName,
      status: 'installed',
      hash,
      version: lockEntryToWrite.registryVersion || lockEntryToWrite.version
    };
  }

  async updateModules(specs: ModuleSpecifier[], options: InstallOptions = {}): Promise<ModuleUpdateResult[]> {
    const targets = specs.length > 0 ? specs : this.workspace.getModulesFromLockFile();
    const results: ModuleUpdateResult[] = [];

    for (const spec of targets) {
      const moduleName = this.workspace.normalizeModuleName(spec.name);
      const previousEntry = this.workspace.lockFile.getModule(moduleName);

      if (!previousEntry) {
        results.push({
          module: moduleName,
          status: 'failed',
          error: new Error(`Module ${moduleName} is not installed`)
        });
        continue;
      }

      const installResult = await this.installSingle({ name: moduleName, version: spec.version }, {
        ...options,
        force: true
      });

      if (installResult.status === 'failed') {
        results.push({
          module: moduleName,
          status: 'failed',
          previousVersion: previousEntry.registryVersion || previousEntry.version,
          error: installResult.error
        });
        continue;
      }

      const updatedEntry = this.workspace.lockFile.getModule(moduleName);
      const previousVersion = previousEntry.registryVersion || previousEntry.version;
      const newVersion = updatedEntry?.registryVersion || updatedEntry?.version;
      const previousHash = previousEntry.resolved;
      const newHash = updatedEntry?.resolved;
      const changed = this.hasChanged(previousVersion, newVersion, previousHash, newHash);

      results.push({
        module: moduleName,
        previousVersion,
        newVersion,
        hash: newHash,
        status: changed ? 'updated' : 'unchanged'
      });
    }

    return results;
  }

  async checkOutdated(specs: ModuleSpecifier[] = []): Promise<ModuleOutdatedResult[]> {
    const targets = specs.length > 0 ? specs : this.workspace.getModulesFromLockFile();
    const results: ModuleOutdatedResult[] = [];

    for (const spec of targets) {
      const moduleName = this.workspace.normalizeModuleName(spec.name);
      const entry = this.workspace.lockFile.getModule(moduleName);

      if (!entry) {
        results.push({
          module: moduleName,
          status: 'unknown',
          reason: 'not installed'
        });
        continue;
      }

      if (!this.isRegistryEntry(entry)) {
        results.push({
          module: moduleName,
          currentVersion: entry.registryVersion || entry.version,
          status: 'unknown',
          reason: 'local module'
        });
        continue;
      }

      try {
        const latest = await this.fetchLatestMetadata({ name: moduleName });
        const currentVersion = entry.registryVersion || entry.version;
        const latestVersion = latest?.version;

        if (!latestVersion) {
          results.push({
            module: moduleName,
            currentVersion,
            status: 'unknown',
            reason: 'no registry metadata'
          });
          continue;
        }

        const isDifferent = this.isVersionDifferent(currentVersion, latestVersion);
        results.push({
          module: moduleName,
          currentVersion,
          latestVersion,
          status: isDifferent ? 'outdated' : 'up-to-date'
        });
      } catch (error) {
        results.push({
          module: moduleName,
          currentVersion: entry.registryVersion || entry.version,
          status: 'unknown',
          error: error as Error
        });
      }
    }

    return results;
  }

  private hasChanged(previousVersion?: string, newVersion?: string, previousHash?: string, newHash?: string): boolean {
    if (previousHash && newHash && previousHash !== newHash) {
      return true;
    }
    return this.isVersionDifferent(previousVersion, newVersion);
  }

  private isVersionDifferent(current?: string, latest?: string): boolean {
    if (!latest) {
      return false;
    }
    if (!current) {
      return true;
    }

    try {
      const currentSem = parseSemVer(current);
      const latestSem = parseSemVer(latest);
      return compareSemVer(currentSem, latestSem) !== 0;
    } catch {
      return current !== latest;
    }
  }

  private async fetchLatestMetadata(spec: ModuleSpecifier): Promise<{ version?: string; hash?: string; source?: string } | null> {
    try {
      const resolver = new RegistryResolver();
      const resolution = await resolver.resolve(this.workspace.buildReference({ name: spec.name }));
      const metadata = resolution.content.metadata ?? {};
      return {
        version: metadata.version ?? metadata.registryVersion ?? spec.version,
        hash: metadata.hash,
        source: metadata.source ?? metadata.sourceUrl
      };
    } catch {
      return null;
    }
  }

  private isRegistryEntry(entry: ModuleLockEntry): boolean {
    const source = entry.sourceUrl ?? entry.source ?? '';
    return source.startsWith('registry://') || source.includes('gist.githubusercontent.com') || source.includes('github.com');
  }

  async resolveDependencies(
    specs: ModuleSpecifier[],
    options: { includeDevDependencies?: boolean } = {}
  ): Promise<DependencyResolution> {
    const resolver = new DependencyResolver(this.workspace.resolverManager, this.workspace.moduleCache);
    return resolver.resolve(specs, {
      includeDevDependencies: options.includeDevDependencies ?? false
    });
  }

}
