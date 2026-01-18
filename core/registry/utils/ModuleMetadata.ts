import * as yaml from 'js-yaml';
import { MlldError, ErrorSeverity } from '@core/errors';
import {
  normalizeModuleNeeds,
  formatVersionSpecifier
} from './ModuleNeeds';
import type {
  ModuleDependencyMap,
  ModuleNeeds,
  ModuleNeedsNormalized,
  PackageRequirement
} from '../types';
import { parseSync } from '@grammar/parser';
import { normalizeNeedsDeclaration, normalizeProfilesDeclaration } from '@core/policy/needs';
import type { NeedsDeclaration, ProfilesDeclaration } from '@core/policy/needs';
import { normalizeModuleName, splitModuleNameVersion } from './moduleNames';

export interface ParsedFrontmatterMetadata {
  name?: string;
  author?: string;
  version?: string;
  needs: ModuleNeedsNormalized;
  profiles: ProfilesDeclaration;
  dependencies: ModuleDependencyMap;
  devDependencies: ModuleDependencyMap;
  raw: Record<string, unknown>;
}

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---/;

export function extractFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown YAML error';
    throw new MlldError(`Invalid module frontmatter: ${message}`, {
      code: 'INVALID_FRONTMATTER',
      severity: ErrorSeverity.Fatal,
      cause: error
    });
  }
}

export function parseModuleMetadata(content: string): ParsedFrontmatterMetadata {
  const frontmatter = extractFrontmatter(content);
  assertNoLegacyNeeds(frontmatter);

  const needsDeclaration = extractNeedsFromContent(content);
  const profiles = extractProfilesFromContent(content);
  const needs = normalizeModuleNeeds(needsDeclaration);
  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
    author: typeof frontmatter.author === 'string' ? frontmatter.author : undefined,
    version: typeof frontmatter.version === 'string' ? frontmatter.version : undefined,
    needs,
    profiles: profiles ?? {},
    dependencies: parseDependencyMap(frontmatter.dependencies),
    devDependencies: parseDependencyMap(frontmatter.devDependencies ?? frontmatter.devdependencies),
    raw: frontmatter
  };
}

function assertNoLegacyNeeds(frontmatter: Record<string, unknown>): void {
  const legacyKeys = [
    'needs',
    'needs-js',
    'needsJs',
    'needs-node',
    'needsNode',
    'needs-py',
    'needsPy',
    'needs-sh',
    'needsSh'
  ];
  const hasLegacyNeeds = legacyKeys.some(key => frontmatter[key] !== undefined);
  if (hasLegacyNeeds) {
    throw new MlldError('Legacy frontmatter needs are not supported. Use /needs instead.', {
      code: 'LEGACY_NEEDS_NOT_SUPPORTED',
      severity: ErrorSeverity.Fatal
    });
  }
}

function extractNeedsFromContent(content: string): NeedsDeclaration | undefined {
  try {
    const ast = parseSync(content);
    const needsNode = ast.find((node: any) => node?.kind === 'needs');
    if (!needsNode) {
      return undefined;
    }
    return normalizeNeedsDeclaration((needsNode as any).values?.needs ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new MlldError(`Failed to parse module for /needs: ${message}`, {
      code: 'NEEDS_PARSE_FAILED',
      severity: ErrorSeverity.Fatal,
      cause: error
    });
  }
}

function extractProfilesFromContent(content: string): ProfilesDeclaration | undefined {
  try {
    const ast = parseSync(content);
    const profilesNode = ast.find((node: any) => node?.kind === 'profiles');
    if (!profilesNode) {
      return undefined;
    }
    return normalizeProfilesDeclaration((profilesNode as any).values?.profiles ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new MlldError(`Failed to parse module for /profiles: ${message}`, {
      code: 'PROFILES_PARSE_FAILED',
      severity: ErrorSeverity.Fatal,
      cause: error
    });
  }
}

function parseDependencyMap(value: unknown): ModuleDependencyMap {
  const result: ModuleDependencyMap = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = splitModuleNameVersion(key);
    const name = normalizeModuleName(parsed.name);
    if (!name) {
      continue;
    }

    let version: string | undefined;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      version = raw.trim();
    } else if (typeof raw === 'number') {
      version = String(raw);
    } else if (raw === null || raw === undefined) {
      version = 'latest';
    } else if (typeof raw === 'object' && raw && 'version' in (raw as Record<string, unknown>)) {
      const rawVersion = (raw as Record<string, unknown>).version;
      if (typeof rawVersion === 'string' && rawVersion.length > 0) {
        version = rawVersion;
      }
    }

    const finalVersion = version ?? parsed.version;
    if (finalVersion) {
      result[name] = finalVersion;
    }
  }

  return result;
}

export function formatDependencyMap(map: ModuleDependencyMap): Record<string, string> {
  const entries = Object.entries(map).map(([module, version]) => {
    const parsed = splitModuleNameVersion(module);
    const normalized = normalizeModuleName(parsed.name);
    const value = version && version.length > 0 ? version : parsed.version ?? 'latest';
    return [normalized, value];
  });
  return Object.fromEntries(entries);
}

export function mergeModuleNeeds(
  target: ModuleNeedsNormalized,
  addition: ModuleNeedsNormalized
): ModuleNeedsNormalized {
  const runtimes = mergeRequirementList(target.runtimes, addition.runtimes);
  const tools = mergeRequirementList(target.tools, addition.tools);
  const packages = mergePackageMaps(target.packages, addition.packages);
  return { runtimes, tools, packages };
}

function mergeRequirementList<T extends { name: string; specifier?: string; raw: string }>(
  target: T[],
  addition: T[]
): T[] {
  const byName = new Map<string, T>();
  for (const req of target) {
    byName.set(req.name, { ...req });
  }

  for (const incoming of addition) {
    const existing = byName.get(incoming.name);
    if (!existing) {
      byName.set(incoming.name, { ...incoming });
      continue;
    }

    if (!existing.specifier && incoming.specifier) {
      byName.set(incoming.name, {
        ...incoming,
        raw: formatVersionSpecifier(incoming.name, incoming.specifier)
      });
    }
  }

  return Array.from(byName.values());
}

function mergePackageMaps(
  target: Record<string, PackageRequirement[]>,
  addition: Record<string, PackageRequirement[]>
): Record<string, PackageRequirement[]> {
  const result: Record<string, PackageRequirement[]> = { ...target };
  for (const [ecosystem, requirements] of Object.entries(addition)) {
    const existing = result[ecosystem] ?? [];
    const byName = new Map<string, PackageRequirement>();
    for (const req of existing) {
      byName.set(req.raw || `${req.name}@${req.specifier ?? ''}`, req);
    }
    for (const req of requirements) {
      const key = `${req.name}@${req.specifier ?? ''}`;
      if (!byName.has(key)) {
        byName.set(key, req);
      }
    }
    result[ecosystem] = Array.from(byName.values());
  }
  return result;
}
