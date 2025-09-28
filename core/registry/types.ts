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
