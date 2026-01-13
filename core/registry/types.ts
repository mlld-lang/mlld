import type { NeedsDeclaration } from '@core/policy/needs';

export interface VersionSpecifier {
  name: string;
  specifier?: string;
  raw: string;
}

export type RuntimeRequirement = VersionSpecifier;
export type ToolRequirement = VersionSpecifier;
export type PackageRequirement = VersionSpecifier;

export type PackageRequirementMap = Record<string, PackageRequirement[]>;

export interface ModuleNeeds {
  runtimes?: RuntimeRequirement[];
  tools?: ToolRequirement[];
  packages?: PackageRequirementMap;
   capabilities?: NeedsDeclaration;
}

export interface ModuleNeedsNormalized {
  runtimes: RuntimeRequirement[];
  tools: ToolRequirement[];
  packages: PackageRequirementMap;
  capabilities?: NeedsDeclaration;
}

export type ModuleDependencyMap = Record<string, string>;
export interface ModuleSpecifierInput {
  name: string;
  version?: string;
  hash?: string;
}

export interface ModuleGraphNode {
  module: string;
  version?: string;
  hash?: string;
  source?: string;
  needs: ModuleNeedsNormalized;
  dependencies: ModuleDependencyMap;
  devDependencies?: ModuleDependencyMap;
}

export interface PackageRequirementSource {
  module: string;
  requirement: PackageRequirement;
}

export interface PackageRequirementSummary {
  ecosystem: string;
  name: string;
  requests: PackageRequirementSource[];
  resolved?: PackageRequirement;
  conflictMessage?: string;
}

export interface AggregatedModuleNeeds {
  runtimes: RuntimeRequirement[];
  tools: ToolRequirement[];
  packages: PackageRequirementSummary[];
}

export interface DependencyConflict {
  type: 'package';
  ecosystem: string;
  name: string;
  message: string;
  requests: PackageRequirementSource[];
}

export interface DependencyResolution {
  modules: Record<string, ModuleGraphNode>;
  order: string[];
  aggregatedNeeds: AggregatedModuleNeeds;
  conflicts: DependencyConflict[];
}

export type ModuleType = 'library' | 'app' | 'command' | 'skill';

export interface ModuleManifest {
  name: string;
  author: string;
  type: ModuleType;
  about: string;
  version: string;
  entry?: string;
  needs?: string[];
  license?: string;
  mlldVersion?: string;
  dependencies?: ModuleDependencyMap;
  devDependencies?: ModuleDependencyMap;
}

export interface DirectoryModuleSource {
  type: 'directory';
  baseUrl: string;
  files: string[];
  entryPoint: string;
  contentHash: string;
  repository?: {
    type: string;
    url: string;
    commit: string;
    path: string;
  };
}

export interface SingleFileModuleSource {
  type: 'github' | 'gist' | 'url';
  url: string;
  contentHash: string;
  repository?: {
    type: string;
    url: string;
    commit: string;
    path: string;
  };
  gistId?: string;
}

export type ModuleSource = DirectoryModuleSource | SingleFileModuleSource;

export const MODULE_TYPE_PATHS: Record<ModuleType, { local: string; global: string }> = {
  library: { local: 'llm/lib', global: '.mlld/lib' },
  app: { local: 'llm/run', global: '.mlld/run' },
  command: { local: '.claude/commands', global: '.claude/commands' },
  skill: { local: '.claude/skills', global: '.claude/skills' },
};
