/**
 * Registry security module
 * Provides module registry functionality with security advisory checking
 */

export { RegistryResolver } from './RegistryResolver';
export type { Registry, RegistryModule } from './RegistryResolver';

export { AdvisoryChecker } from './AdvisoryChecker';
export type { Advisory, AdvisoryDatabase } from './AdvisoryChecker';

export { RegistryClient } from './RegistryClient';
export type { RegistryImport, LockFileData } from './RegistryClient';

export { StorageManager, defaultStorageManager } from './StorageManager';
export type { 
  MlldModuleSource, 
  ModuleMetadata, 
  StorageAdapter, 
  StorageOptions,
  ParsedReference 
} from './types';

export { GistAdapter, RepositoryAdapter } from './adapters';