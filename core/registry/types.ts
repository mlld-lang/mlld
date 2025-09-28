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
}

export interface ModuleNeedsNormalized {
  runtimes: RuntimeRequirement[];
  tools: ToolRequirement[];
  packages: PackageRequirementMap;
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

