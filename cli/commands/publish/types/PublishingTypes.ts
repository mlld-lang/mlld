/**
 * Core types and interfaces for the mlld module publishing system
 */

export interface PublishOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  useGist?: boolean; // Force gist creation even if in git repo
  useRepo?: boolean; // Force repository publishing (skip interactive prompt)
  org?: string; // Publish on behalf of an organization
  skipVersionCheck?: boolean; // Skip checking for latest mlld version (dev only)
  private?: boolean; // Force private repo publishing
  pr?: boolean; // Create PR even for private publish
  path?: string; // Custom path for private publish (default: mlld/modules/)
}

export interface RuntimeDependencies {
  node?: string;
  python?: string;
  shell?: string;
  packages?: string[];
  commands?: string[];
}

export interface ModuleMetadata {
  name: string;
  author: string;
  version?: string;
  about: string;  // Renamed from description
  needs: string[];  // Required, empty array for pure mlld
  needsJs?: RuntimeDependencies;
  needsNode?: RuntimeDependencies;
  needsPy?: RuntimeDependencies;
  needsSh?: RuntimeDependencies;
  bugs?: string;
  repo?: string;
  keywords?: string[];
  homepage?: string;
  license: string;  // Always CC0, required
  mlldVersion?: string;
}

export interface GitInfo {
  isGitRepo: boolean;
  owner?: string;
  repo?: string;
  sha?: string;
  branch?: string;
  relPath?: string;
  isClean?: boolean;
  remoteUrl?: string;
  gitRoot?: string;
  hasWriteAccess?: boolean;
}

export interface ModuleData {
  metadata: ModuleMetadata;
  content: string;
  filePath: string;
  gitInfo: GitInfo;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  updatedMetadata?: ModuleMetadata;
  updatedContent?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface PublishContext {
  module: ModuleData;
  options: PublishOptions;
  user: GitHubUser;
  octokit: any; // Octokit instance
  
  // Validation results
  validationResult?: ValidationResult;
  
  // State tracking
  changes: StateChange[];
  checkpoints: Checkpoint[];
  shouldCommitMetadata?: boolean;
  
  // Methods
  rollback(): Promise<void>;
  checkpoint(name: string): void;
  restoreCheckpoint(name: string): Promise<void>;
  toErrorContext(): any;
}

export interface StateChange {
  type: 'file' | 'git' | 'github';
  action: string;
  data: any;
  timestamp: Date;
  revert(): Promise<void>;
}

export interface Checkpoint {
  name: string;
  timestamp: Date;
  changes: StateChange[];
}

export interface GitHubUser {
  login: string;
  id: number;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface PublishResult {
  success: boolean;
  url?: string;
  type: 'gist' | 'repository' | 'private';
  message?: string;
  error?: string;
  registryEntry?: any;
}

export interface PublishTarget {
  filePath: string;
  publishOptions: {
    prefix: string;
    moduleName: string;
    registry: any; // RegistryConfig
  };
}

export enum PublishingMethod {
  GIST = 'gist',
  REPOSITORY = 'repository', 
  PRIVATE = 'private'
}

export interface DecisionPointResult<T = any> {
  choice: T;
  shouldContinue: boolean;
  context?: any;
}