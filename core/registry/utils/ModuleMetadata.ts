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

export interface ParsedFrontmatterMetadata {
  name?: string;
  author?: string;
  version?: string;
  needs: ModuleNeedsNormalized;
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
  const needs = parseNeeds(frontmatter);
  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
    author: typeof frontmatter.author === 'string' ? frontmatter.author : undefined,
    version: typeof frontmatter.version === 'string' ? frontmatter.version : undefined,
    needs,
    dependencies: parseDependencyMap(frontmatter.dependencies),
    devDependencies: parseDependencyMap(frontmatter.devDependencies ?? frontmatter.devdependencies),
    raw: frontmatter
  };
}

function parseNeeds(frontmatter: Record<string, unknown>): ModuleNeedsNormalized {
  const baseNeeds = frontmatter.needs as ModuleNeeds | unknown;
  const legacyDetails = {
    js: frontmatter['needs-js'] || frontmatter.needsJs,
    node: frontmatter['needs-node'] || frontmatter.needsNode,
    py: frontmatter['needs-py'] || frontmatter.needsPy,
    sh: frontmatter['needs-sh'] || frontmatter.needsSh
  } as Record<string, unknown>;

  return normalizeModuleNeeds(baseNeeds, legacyDetails);
}

function parseDependencyMap(value: unknown): ModuleDependencyMap {
  const result: ModuleDependencyMap = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = normalizeModuleName(key);
    if (!name) {
      continue;
    }

    if (typeof raw === 'string' && raw.trim().length > 0) {
      result[name] = raw.trim();
    } else if (typeof raw === 'number') {
      result[name] = String(raw);
    } else if (raw === null || raw === undefined) {
      result[name] = 'latest';
    } else if (typeof raw === 'object' && raw && 'version' in (raw as Record<string, unknown>)) {
      const version = (raw as Record<string, unknown>).version;
      if (typeof version === 'string' && version.length > 0) {
        result[name] = version;
      }
    }
  }

  return result;
}

function normalizeModuleName(name: string): string {
  if (!name) {
    return '';
  }

  if (name.startsWith('mlld://')) {
    return name.replace('mlld://', '@');
  }

  if (name.startsWith('@')) {
    return name;
  }

  return `@${name}`;
}

export function formatDependencyMap(map: ModuleDependencyMap): Record<string, string> {
  const entries = Object.entries(map).map(([module, version]) => {
    const normalized = normalizeModuleName(module);
    const value = version && version.length > 0 ? version : 'latest';
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
