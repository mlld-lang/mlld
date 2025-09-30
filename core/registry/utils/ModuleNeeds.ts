import type {
  ModuleNeeds,
  ModuleNeedsNormalized,
  PackageRequirement,
  PackageRequirementMap,
  RuntimeRequirement,
  ToolRequirement,
  VersionSpecifier
} from '../types';

type LegacyRuntimeDetail = {
  node?: string;
  python?: string;
  shell?: string;
  packages?: string[];
  commands?: string[];
};

type LegacyNeedsDetails = {
  js?: LegacyRuntimeDetail;
  node?: LegacyRuntimeDetail;
  py?: LegacyRuntimeDetail;
  sh?: LegacyRuntimeDetail;
};

export function normalizeModuleNeeds(
  rawNeeds: unknown,
  legacyDetails?: LegacyNeedsDetails
): ModuleNeedsNormalized {
  const normalized: ModuleNeedsNormalized = {
    runtimes: [],
    tools: [],
    packages: {}
  };

  const addRuntime = (candidate: RuntimeRequirement): void => {
    if (!candidate.name) {
      return;
    }

    if (!normalized.runtimes.find(existing => existing.name === candidate.name)) {
      normalized.runtimes.push(candidate);
      return;
    }

    const existing = normalized.runtimes.find(existing => existing.name === candidate.name);
    if (existing && !existing.specifier && candidate.specifier) {
      existing.specifier = candidate.specifier;
      existing.raw = candidate.raw;
    }
  };

  const addTool = (candidate: ToolRequirement): void => {
    if (!candidate.name) {
      return;
    }

    if (!normalized.tools.find(existing => existing.name === candidate.name)) {
      normalized.tools.push(candidate);
      return;
    }

    const existing = normalized.tools.find(existing => existing.name === candidate.name);
    if (existing && !existing.specifier && candidate.specifier) {
      existing.specifier = candidate.specifier;
      existing.raw = candidate.raw;
    }
  };

  const addPackages = (ecosystem: string, packages: PackageRequirement[]): void => {
    if (!ecosystem) {
      return;
    }

    const bucket = normalized.packages[ecosystem] || [];
    for (const pkg of packages) {
      if (!pkg.name) {
        continue;
      }
      if (!bucket.find(existing => existing.name === pkg.name && existing.specifier === pkg.specifier)) {
        bucket.push(pkg);
      }
    }
    normalized.packages[ecosystem] = bucket;
  };

  const handleRuntimeEntry = (entry: unknown): void => {
    if (typeof entry === 'string') {
      addRuntime(parseVersionSpecifier(entry));
    } else if (entry && typeof entry === 'object') {
      const name = String((entry as any).name || '');
      const specifier = (entry as any).specifier ?? (entry as any).version;
      if (name) {
        addRuntime({
          name,
          specifier: typeof specifier === 'string' && specifier.length > 0 ? specifier : undefined,
          raw: formatVersionSpecifier(name, specifier)
        });
      }
    }
  };

  const handleToolEntry = (entry: unknown): void => {
    if (typeof entry === 'string') {
      addTool(parseVersionSpecifier(entry));
    } else if (entry && typeof entry === 'object') {
      const name = String((entry as any).name || '');
      const specifier = (entry as any).specifier ?? (entry as any).version;
      if (name) {
        addTool({
          name,
          specifier: typeof specifier === 'string' && specifier.length > 0 ? specifier : undefined,
          raw: formatVersionSpecifier(name, specifier)
        });
      }
    }
  };

  const handlePackageList = (ecosystem: string, value: unknown): void => {
    if (Array.isArray(value)) {
      const packages = value.map(item => parseVersionSpecifier(String(item)));
      addPackages(ecosystem, packages);
      return;
    }

    if (value && typeof value === 'object') {
      const packages = Object.values(value as Record<string, unknown>).map(item => parseVersionSpecifier(String(item)));
      addPackages(ecosystem, packages);
    }
  };

  if (Array.isArray(rawNeeds)) {
    for (const entry of rawNeeds) {
      handleRuntimeEntry(entry);
    }
  } else if (typeof rawNeeds === 'string') {
    handleRuntimeEntry(rawNeeds);
  } else if (rawNeeds && typeof rawNeeds === 'object') {
    const structuredNeeds = rawNeeds as ModuleNeeds;

    if (structuredNeeds.runtimes) {
      for (const runtime of structuredNeeds.runtimes) {
        handleRuntimeEntry(runtime);
      }
    }

    if (structuredNeeds.tools) {
      for (const tool of structuredNeeds.tools) {
        handleToolEntry(tool);
      }
    }

    if (structuredNeeds.packages) {
      for (const [ecosystem, packageList] of Object.entries(structuredNeeds.packages)) {
        handlePackageList(ecosystem, packageList);
      }
    }
  }

  if (legacyDetails) {
    if (legacyDetails.js) {
      inheritLegacyRuntimeDetail('js', legacyDetails.js, addRuntime, addPackages, addTool);
    }
    if (legacyDetails.node) {
      inheritLegacyRuntimeDetail('node', legacyDetails.node, addRuntime, addPackages, addTool);
    }
    if (legacyDetails.py) {
      inheritLegacyRuntimeDetail('python', legacyDetails.py, addRuntime, addPackages, addTool);
    }
    if (legacyDetails.sh) {
      inheritLegacyRuntimeDetail('sh', legacyDetails.sh, addRuntime, addPackages, addTool);
    }
  }

  return normalized;
}

export function moduleNeedsToRuntimeNames(needs?: ModuleNeeds | ModuleNeedsNormalized): string[] {
  if (!needs) {
    return [];
  }

  const source = Array.isArray((needs as ModuleNeeds).runtimes) ? (needs as ModuleNeeds).runtimes : (needs as ModuleNeedsNormalized).runtimes;
  if (!source) {
    return [];
  }

  return source.map(entry => entry.name);
}

export function parseVersionSpecifier(raw: string): VersionSpecifier {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { name: '', raw: '' };
  }

  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('@');
    if (parts.length > 2) {
      const spec = parts.pop();
      const scopedName = parts.join('@');
      if (spec) {
        return {
          name: scopedName,
          specifier: spec,
          raw: trimmed
        };
      }
    }
  }

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex > 0 && atIndex < trimmed.length - 1) {
    const name = trimmed.slice(0, atIndex);
    const specifier = trimmed.slice(atIndex + 1);
    return { name, specifier, raw: trimmed };
  }

  return { name: trimmed, raw: trimmed };
}

export function formatVersionSpecifier(name: string, specifier?: unknown): string {
  if (!name) {
    return '';
  }

  if (typeof specifier === 'string' && specifier.length > 0) {
    return `${name}@${specifier}`;
  }

  return name;
}

export function moduleNeedsToSerializable(needs: ModuleNeedsNormalized): ModuleNeeds {
  const result: ModuleNeeds = {};

  if (needs.runtimes.length > 0) {
    result.runtimes = needs.runtimes.map(runtime => ({
      name: runtime.name,
      specifier: runtime.specifier,
      raw: runtime.raw
    }));
  }

  if (needs.tools.length > 0) {
    result.tools = needs.tools.map(tool => ({
      name: tool.name,
      specifier: tool.specifier,
      raw: tool.raw
    }));
  }

  const packageEntries = Object.entries(needs.packages);
  if (packageEntries.length > 0) {
    result.packages = packageEntries.reduce<PackageRequirementMap>((acc, [ecosystem, packages]) => {
      acc[ecosystem] = packages.map(pkg => ({
        name: pkg.name,
        specifier: pkg.specifier,
        raw: pkg.raw
      }));
      return acc;
    }, {});
  }

  return result;
}

export function stringifyRequirementList(requirements: VersionSpecifier[]): string[] {
  return requirements.map(req => formatVersionSpecifier(req.name, req.specifier));
}

export function stringifyPackageMap(packages: PackageRequirementMap): Record<string, string[]> {
  const entries: [string, string[]][] = Object.entries(packages).map(([ecosystem, list]) => [
    ecosystem,
    list.map(pkg => formatVersionSpecifier(pkg.name, pkg.specifier))
  ]);
  return Object.fromEntries(entries);
}

function inheritLegacyRuntimeDetail(
  name: string,
  detail: LegacyRuntimeDetail,
  addRuntime: (candidate: RuntimeRequirement) => void,
  addPackages: (ecosystem: string, packages: PackageRequirement[]) => void,
  addTool: (candidate: ToolRequirement) => void
): void {
  if (detail.node && (name === 'node' || name === 'js')) {
    addRuntime({ name: 'node', specifier: detail.node, raw: formatVersionSpecifier('node', detail.node) });
  }

  if (detail.python && name === 'python') {
    addRuntime({ name: 'python', specifier: detail.python, raw: formatVersionSpecifier('python', detail.python) });
  }

  if (detail.shell && name === 'sh') {
    addTool({ name: detail.shell, raw: detail.shell });
  }

  if (detail.packages && detail.packages.length > 0) {
    addPackages(name, detail.packages.map(pkg => parseVersionSpecifier(pkg)));
  }

  if (detail.commands && detail.commands.length > 0) {
    for (const command of detail.commands) {
      addTool(parseVersionSpecifier(command));
    }
  }
}
