import type { ResolverOptions } from '@core/resolvers';
import { ResolverManager } from '@core/resolvers';
import { parseSemVer, compareSemVer, satisfiesVersion } from '@core/utils/version-checker';
import { normalizeModuleNeeds, formatVersionSpecifier } from './utils/ModuleNeeds';
import { parseModuleMetadata, formatDependencyMap } from './utils/ModuleMetadata';
import type { ModuleCache, ModuleCacheMetadata, ModuleCacheStoreOptions } from './ModuleCache';
import type {
  AggregatedModuleNeeds,
  DependencyConflict,
  DependencyResolution,
  ModuleDependencyMap,
  ModuleGraphNode,
  ModuleNeeds,
  ModuleNeedsNormalized,
  ModuleSpecifierInput,
  PackageRequirement,
  PackageRequirementMap,
  PackageRequirementSource,
  PackageRequirementSummary,
  RuntimeRequirement,
  ToolRequirement
} from './types';

export interface DependencyResolverOptions {
  includeDevDependencies?: boolean;
  resolverContext?: ResolverOptions['context'];
}

export class DependencyResolver {
  constructor(
    private readonly resolverManager: Pick<ResolverManager, 'resolve'>,
    private readonly moduleCache: ModuleCache
  ) {}

  async resolve(
    specs: Array<string | ModuleSpecifierInput>,
    options: DependencyResolverOptions = {}
  ): Promise<DependencyResolution> {
    const queue = specs.map(spec => this.normalizeSpecifier(spec));
    const visited = new Set<string>();
    const modules: Record<string, ModuleGraphNode> = {};
    const order: string[] = [];

    const runtimeMap = new Map<string, RuntimeRequirement>();
    const toolMap = new Map<string, ToolRequirement>();
    const aggregatedPackages = new Map<string, PackageRequirementSummary>();
    const conflicts: DependencyConflict[] = [];

    while (queue.length > 0) {
      const spec = queue.shift()!;
      const key = this.getModuleKey(spec);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const reference = this.buildReference(spec);
      const moduleData = await this.loadModule(reference, spec, options);

      modules[key] = {
        module: moduleData.name,
        version: moduleData.version,
        hash: moduleData.hash,
        source: moduleData.source,
        needs: moduleData.needs,
        dependencies: moduleData.dependencies,
        devDependencies: Object.keys(moduleData.devDependencies).length > 0 ? moduleData.devDependencies : undefined
      };
      order.push(key);

      this.mergeRuntimeNeeds(runtimeMap, moduleData.needs.runtimes);
      this.mergeToolNeeds(toolMap, moduleData.needs.tools);
      this.collectPackageNeeds(aggregatedPackages, key, moduleData.needs.packages);

      const dependencyEntries = Object.entries(moduleData.dependencies);
      const devEntries = Object.entries(moduleData.devDependencies);
      const nextEntries = options.includeDevDependencies
        ? dependencyEntries.concat(devEntries)
        : dependencyEntries;

      for (const [depName, version] of nextEntries) {
        const nextSpec: ModuleSpecifierInput = {
          name: depName,
          version: version && version !== 'latest' ? version : undefined
        };
        const nextKey = this.getModuleKey(nextSpec);
        if (!visited.has(nextKey)) {
          queue.push(nextSpec);
        }
      }
    }

    const aggregatedNeeds = this.finalizeAggregatedNeeds(runtimeMap, toolMap, aggregatedPackages, conflicts);

    return {
      modules,
      order,
      aggregatedNeeds,
      conflicts
    };
  }

  private async loadModule(
    reference: string,
    spec: ModuleSpecifierInput,
    options: DependencyResolverOptions
  ): Promise<LoadedModuleData> {
    const normalizedName = this.normalizeModuleName(spec.name);
    const desiredContext = options.resolverContext ?? 'import';

    const cacheHash = spec.hash || await this.moduleCache.getHashByImportPath(reference);
    if (cacheHash) {
      const cachedMetadata = await this.moduleCache.getMetadata(cacheHash);
      if (cachedMetadata?.moduleNeeds && cachedMetadata.dependencies) {
        return this.fromCache(normalizedName, spec, cacheHash, cachedMetadata);
      }
    }

    const resolution = await this.resolverManager.resolve(reference, { context: desiredContext });
    const content = resolution.content.content;
    const metadata = parseModuleMetadata(content);
    const needs = metadata.needs;

    const dependencies = metadata.dependencies;
    const devDependencies = metadata.devDependencies;

    const storeOptions: ModuleCacheStoreOptions = {
      dependencies: formatDependencyMap(dependencies),
      devDependencies: formatDependencyMap(devDependencies),
      moduleNeeds: needs
    };

    const stored = await this.moduleCache.store(
      content,
      resolution.content.metadata?.source || reference,
      reference,
      storeOptions
    );

    return {
      name: normalizedName,
      version: metadata.version ?? spec.version,
      hash: stored.hash,
      source: resolution.content.metadata?.source || reference,
      needs,
      dependencies,
      devDependencies
    };
  }

  private fromCache(
    name: string,
    spec: ModuleSpecifierInput,
    hash: string,
    metadata: ModuleCacheMetadata
  ): LoadedModuleData {
    const needs = normalizeModuleNeeds(metadata.moduleNeeds as ModuleNeeds);
    const dependencies = metadata.dependencies ? { ...metadata.dependencies } : {};
    const devDependencies = metadata.devDependencies ? { ...metadata.devDependencies } : {};

    return {
      name,
      version: spec.version ?? metadata.version,
      hash,
      source: metadata.source,
      needs,
      dependencies,
      devDependencies
    };
  }

  private finalizeAggregatedNeeds(
    runtimes: Map<string, PackageRequirement>,
    tools: Map<string, PackageRequirement>,
    packages: Map<string, PackageRequirementSummary>,
    conflicts: DependencyConflict[]
  ): AggregatedModuleNeeds {
    const runtimeList = Array.from(runtimes.values()).sort((a, b) => a.name.localeCompare(b.name));
    const toolList = Array.from(tools.values()).sort((a, b) => a.name.localeCompare(b.name));

    const packageSummaries: PackageRequirementSummary[] = [];
    for (const summary of packages.values()) {
      const resolution = this.resolvePackageSummary(summary);
      if (resolution.conflictMessage) {
        summary.conflictMessage = resolution.conflictMessage;
        conflicts.push({
          type: 'package',
          ecosystem: summary.ecosystem,
          name: summary.name,
          message: resolution.conflictMessage,
          requests: summary.requests
        });
      } else {
        summary.resolved = resolution.resolved;
      }
      packageSummaries.push(summary);
    }

    packageSummaries.sort((a, b) => {
      if (a.ecosystem === b.ecosystem) {
        return a.name.localeCompare(b.name);
      }
      return a.ecosystem.localeCompare(b.ecosystem);
    });

    return {
      runtimes: runtimeList,
      tools: toolList,
      packages: packageSummaries
    };
  }

  private resolvePackageSummary(summary: PackageRequirementSummary): {
    resolved?: PackageRequirement;
    conflictMessage?: string;
  } {
    const exactRequests = summary.requests.filter(({ requirement }) => this.isExactVersion(requirement.specifier));

    if (exactRequests.length > 0) {
      try {
        const candidate = exactRequests.reduce((current, entry) => {
          if (!current) {
            return entry;
          }
          const currentVer = parseSemVer(current.requirement.specifier!);
          const nextVer = parseSemVer(entry.requirement.specifier!);
          return compareSemVer(nextVer, currentVer) > 0 ? entry : current;
        }, exactRequests[0]);

        const candidateVersion = candidate.requirement.specifier!;

        const incompatible = summary.requests.some(({ requirement }) => {
          if (!requirement.specifier || requirement.specifier === candidateVersion) {
            return false;
          }
          if (this.isExactVersion(requirement.specifier)) {
            try {
              return compareSemVer(parseSemVer(candidateVersion), parseSemVer(requirement.specifier)) !== 0;
            } catch {
              return true;
            }
          }
          try {
            return !satisfiesVersion(candidateVersion, requirement.specifier);
          } catch {
            return true;
          }
        });

        if (incompatible) {
          return {
            conflictMessage: `No single version satisfies all requests for ${summary.name}`
          };
        }

        return {
          resolved: {
            name: summary.name,
            specifier: candidateVersion,
            raw: formatVersionSpecifier(summary.name, candidateVersion)
          }
        };
      } catch {
        return {
          conflictMessage: `Unable to evaluate version constraints for ${summary.name}`
        };
      }
    }

    const distinct = new Set(
      summary.requests
        .map(({ requirement }) => (requirement.specifier ? requirement.specifier.trim() : ''))
        .filter(value => value.length > 0)
    );

    if (distinct.size <= 1) {
      const [only] = [...distinct];
      if (only) {
        return {
          resolved: {
            name: summary.name,
            specifier: only,
            raw: formatVersionSpecifier(summary.name, only)
          }
        };
      }
      return {
        resolved: {
          name: summary.name,
          raw: formatVersionSpecifier(summary.name, undefined)
        }
      };
    }

    return {
      conflictMessage: `Incompatible version ranges for ${summary.name}: ${[...distinct].join(', ')}`
    };
  }

  private mergeRuntimeNeeds(target: Map<string, RuntimeRequirement>, incoming: RuntimeRequirement[]): void {
    this.mergeRequirementLists(target, incoming);
  }

  private mergeToolNeeds(target: Map<string, ToolRequirement>, incoming: ToolRequirement[]): void {
    this.mergeRequirementLists(target, incoming);
  }

  private mergeRequirementLists<T extends { name: string; specifier?: string; raw: string }>(
    target: Map<string, T>,
    incoming: T[]
  ): void {
    for (const requirement of incoming) {
      const existing = target.get(requirement.name);
      if (!existing) {
        target.set(requirement.name, { ...requirement });
        continue;
      }
      if (!existing.specifier && requirement.specifier) {
        target.set(requirement.name, { ...requirement });
      }
    }
  }

  private collectPackageNeeds(
    packages: Map<string, PackageRequirementSummary>,
    moduleKey: string,
    packageMap: PackageRequirementMap
  ): void {
    for (const [ecosystem, requirements] of Object.entries(packageMap)) {
      for (const requirement of requirements) {
        const key = `${ecosystem}:${requirement.name}`;
        const summary = packages.get(key) ?? {
          ecosystem,
          name: requirement.name,
          requests: []
        };
        summary.requests.push({ module: moduleKey, requirement });
        packages.set(key, summary);
      }
    }
  }

  private normalizeSpecifier(spec: string | ModuleSpecifierInput): ModuleSpecifierInput {
    if (typeof spec === 'string') {
      return { name: this.normalizeModuleName(spec) };
    }

    return {
      name: this.normalizeModuleName(spec.name),
      version: spec.version,
      hash: spec.hash
    };
  }

  private normalizeModuleName(name: string): string {
    if (!name) {
      return name;
    }
    if (name.startsWith('mlld://')) {
      return name.replace('mlld://', '@');
    }
    if (!name.startsWith('@')) {
      return `@${name}`;
    }
    return name;
  }

  private buildReference(spec: ModuleSpecifierInput): string {
    const name = this.normalizeModuleName(spec.name);
    return spec.version && spec.version.length > 0 ? `${name}@${spec.version}` : name;
  }

  private getModuleKey(spec: ModuleSpecifierInput): string {
    const name = this.normalizeModuleName(spec.name);
    if (spec.hash) {
      return `${name}#${spec.hash}`;
    }
    if (spec.version && spec.version.length > 0) {
      return `${name}@${spec.version}`;
    }
    return name;
  }

  private isExactVersion(specifier?: string): specifier is string {
    if (!specifier) {
      return false;
    }
    return /^\d+\.\d+\.\d+(?:-[^+]+)?(?:\+.+)?$/.test(specifier.trim());
  }
}

interface LoadedModuleData {
  name: string;
  version?: string;
  hash?: string;
  source?: string;
  needs: ModuleNeedsNormalized;
  dependencies: ModuleDependencyMap;
  devDependencies: ModuleDependencyMap;
}
