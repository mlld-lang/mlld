import type { ImportDirectiveNode } from '@core/types';
import type { ImportType } from '@core/types/security';
import { MlldImportError } from '@core/errors';
import type { ImportResolution } from './ImportPathResolver';

export interface ImportTypeContext {
  importType: ImportType;
  cacheDurationMs?: number;
}

export function resolveImportType(
  directive: ImportDirectiveNode,
  resolution: ImportResolution
): ImportTypeContext {
  const declaredType = directive.values?.importType;
  const cachedDuration = directive.values?.cachedDuration;

  if (declaredType) {
    validateDeclaredImportType(declaredType, resolution);
  }

  if (declaredType === 'local' && resolution.type === 'module') {
    resolution.preferLocal = true;
  }

  const resolvedType = declaredType ?? inferImportType(resolution);
  const cacheDurationMs = resolvedType === 'cached'
    ? durationToMilliseconds(cachedDuration)
    : undefined;

  return {
    importType: resolvedType,
    cacheDurationMs
  };
}

export function inferImportType(resolution: ImportResolution): ImportType {
  switch (resolution.type) {
    case 'module':
    case 'node':
      return 'module';
    case 'file':
      return 'static';
    case 'url':
      return 'cached';
    case 'input':
      return 'live';
    case 'resolver':
      return inferResolverImportType(resolution);
    default:
      return 'live';
  }
}

export function inferResolverImportType(resolution: ImportResolution): ImportType {
  const name = resolution.resolverName?.toLowerCase();
  if (!name) {
    return 'live';
  }

  if (name === 'local') {
    return 'local';
  }

  if (name === 'base' || name === 'root' || name === 'project') {
    return 'static';
  }

  return 'live';
}

export function validateDeclaredImportType(type: ImportType, resolution: ImportResolution): void {
  const resolverName = resolution.resolverName?.toLowerCase();

  switch (type) {
    case 'module':
      if (resolution.type !== 'module' && resolution.type !== 'node') {
        throw new MlldImportError("Import type 'module' requires a registry module reference.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });
      }
      return;

    case 'cached':
      if (resolution.type !== 'url') {
        throw new MlldImportError("Import type 'cached' requires an absolute URL source.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });
      }
      return;

    case 'local':
      if (resolution.type === 'module') {
        resolution.preferLocal = true;
        return;
      }
      if (resolution.type !== 'resolver' || resolverName !== 'local') {
        throw new MlldImportError("Import type 'local' expects an @local/... module.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });
      }
      return;

    case 'static':
      if (resolution.type === 'file') {
        return;
      }
      if (resolution.type === 'resolver' && (resolverName === 'base' || resolverName === 'root' || resolverName === 'project')) {
        return;
      }
      throw new MlldImportError("Import type 'static' supports local files or @base/@root/@project resolver paths.", {
        code: 'IMPORT_TYPE_MISMATCH',
        details: { importType: type, resolvedType: resolution.type }
      });

    case 'live':
      if (resolution.type === 'url' || resolution.type === 'resolver' || resolution.type === 'input') {
        return;
      }
      throw new MlldImportError("Import type 'live' is only valid for resolvers, URLs, or @input.", {
        code: 'IMPORT_TYPE_MISMATCH',
        details: { importType: type, resolvedType: resolution.type }
      });

    case 'templates': {
      const isAllowedResolver =
        resolution.type === 'resolver' &&
        (resolverName === 'base' || resolverName === 'root' || resolverName === 'project' || resolverName === 'local');
      if (resolution.type === 'file' || isAllowedResolver) {
        return;
      }
      throw new MlldImportError("Import type 'templates' expects a directory from the local filesystem or @base/@root/@project/@local resolvers.", {
        code: 'IMPORT_TYPE_MISMATCH',
        details: { importType: type, resolvedType: resolution.type }
      });
    }

    default:
      return;
  }
}

export function durationToMilliseconds(
  duration?: ImportDirectiveNode['values']['cachedDuration']
): number | undefined {
  if (!duration) {
    return undefined;
  }

  const multipliers: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  };

  const value = multipliers[duration.unit];
  if (!value) {
    return undefined;
  }

  return duration.value * value;
}
