export { LockFile } from './LockFile';
export type { LockFileData, ModuleLockEntry } from './LockFile';

export { ConfigFile } from './ConfigFile';
export type { ConfigFileData } from './ConfigFile';

export { ProjectConfig } from './ProjectConfig';

export { Cache } from './Cache';
export type { CacheMetadata } from './Cache';

export { ModuleCache } from './ModuleCache';
export type { CacheEntry, ModuleCacheMetadata, ModuleCacheStoreOptions } from './ModuleCache';

export { HashUtils } from './utils/HashUtils';
export type { ModuleContent } from './utils/HashUtils';

export type {
  ModuleNeeds,
  ModuleNeedsNormalized,
  ModuleDependencyMap,
  PackageRequirement,
  PackageRequirementMap,
  RuntimeRequirement,
  ToolRequirement,
  VersionSpecifier
} from './types';

export {
  normalizeModuleNeeds,
  moduleNeedsToRuntimeNames,
  parseVersionSpecifier,
  formatVersionSpecifier,
  moduleNeedsToSerializable,
  stringifyRequirementList,
  stringifyPackageMap
} from './utils/ModuleNeeds';

export { RegistryResolver } from './RegistryResolver';
export type { RegistryModule, Registry, Advisory, AdvisoryFile } from './RegistryResolver';

export { StatsCollector } from './StatsCollector';
export type { StatsEvent, AggregatedStats } from './StatsCollector';

export { RegistryManager } from './RegistryManager';
export type { RegistryConfig } from './RegistryManager';
export { ModuleInstaller, ModuleWorkspace, type ModuleSpecifier, type ModuleInstallResult, type InstallStatus, type ModuleInstallerEvent, type InstallOptions, type ModuleUpdateResult, type ModuleOutdatedResult } from './ModuleInstaller';
