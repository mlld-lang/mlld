import type { DirectiveNode } from '@core/types';
import { MlldImportError, ErrorSeverity } from '@core/errors';
import { deriveImportTaint } from '@core/security/taint';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import type { ImportResolution } from './ImportPathResolver';
import {
  buildImportTraceDataFromResolution,
  emitImportFailure,
  emitImportTrace
} from './runtime-trace';

const MODULE_SOURCE_EXTENSIONS = ['.mld.md', '.mld', '.md', '.mlld.md', '.mlld'] as const;

function matchesModuleExtension(candidate: string): boolean {
  return MODULE_SOURCE_EXTENSIONS.some(ext => candidate.endsWith(ext));
}

type ResolverModuleContent = {
  content: string;
  contentType: 'module' | 'data' | 'text';
  metadata?: any;
  mx?: any;
  resolverName?: string;
};

type ImportFromResolverContent = (
  directive: DirectiveNode,
  ref: string,
  resolverContent: ResolverModuleContent,
  env: Environment
) => Promise<EvalResult>;

export class ModuleImportHandler {
  async evaluateModuleImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment,
    importFromResolverContent: ImportFromResolverContent
  ): Promise<EvalResult> {
    const traceData = buildImportTraceDataFromResolution(directive, resolution);
    if (resolution.preferLocal) {
      const resolverManager = env.getResolverManager();
      if (!resolverManager || !resolverManager.hasLocalModule(resolution.resolvedPath)) {
        const error = new MlldImportError(`Local module not found for ${resolution.resolvedPath}`, {
          code: 'LOCAL_MODULE_NOT_FOUND',
          severity: ErrorSeverity.Fatal,
          details: { reference: resolution.resolvedPath }
        });
        emitImportFailure(env, {
          ...traceData,
          phase: 'resolve',
          error
        });
        throw error;
      }
    }

    const candidates = this.buildModuleCandidates(resolution);
    let lastError: unknown = undefined;

    for (const candidate of candidates) {
      try {
        const resolverContent = (await env.resolveModule(candidate, 'import')) as ResolverModuleContent;
        emitImportTrace(env, 'import.read', {
          ...traceData,
          resolvedPath: candidate,
          contentType: resolverContent.contentType
        });
        if (resolverContent.resolverName) {
          resolution.resolverName = resolverContent.resolverName;
        }

        const treatAsModule = resolverContent.contentType === 'module' || matchesModuleExtension(candidate);
        if (!treatAsModule) {
          lastError = new Error(
            `Import target is not a module: ${candidate} (content type: ${resolverContent.contentType})`
          );
          continue;
        }

        const importDescriptor = deriveImportTaint({
          importType: resolution.importType ?? 'module',
          resolverName: resolverContent.resolverName,
          source: resolverContent.mx?.source ?? resolution.resolvedPath,
          resolvedPath: resolverContent.mx?.source ?? resolution.resolvedPath,
          sourceType: 'module',
          labels: resolverContent.mx?.labels
        });
        env.recordSecurityDescriptor(
          makeSecurityDescriptor({
            taint: importDescriptor.taint,
            labels: importDescriptor.labels,
            sources: importDescriptor.sources
          })
        );

        await this.validateLockFileVersion(resolverContent, env);
        return await importFromResolverContent(directive, candidate, resolverContent, env);
      } catch (error) {
        if ((error as any)?.code === 'IMPORT_NO_EXPORTS') {
          lastError = error;
          break;
        }
        lastError = error;
      }
    }

    if (lastError) {
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error: lastError
      });
      throw lastError;
    }

    const error = new Error(`Unable to resolve module import: ${resolution.resolvedPath}`);
    emitImportFailure(env, {
      ...traceData,
      phase: 'resolve',
      error
    });
    throw error;
  }

  private buildModuleCandidates(resolution: ImportResolution): string[] {
    const baseRef = resolution.resolvedPath;
    const extension = resolution.moduleExtension;
    const candidates: string[] = [];

    if (extension) {
      candidates.push(`${baseRef}${extension}`);
      candidates.push(baseRef);
      return candidates;
    }

    const seen = new Set<string>();
    for (const ext of MODULE_SOURCE_EXTENSIONS) {
      const candidate = `${baseRef}${ext}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }

    if (!seen.has(baseRef)) {
      candidates.push(baseRef);
    }

    return candidates;
  }

  private async validateLockFileVersion(
    resolverContent: ResolverModuleContent,
    env: Environment
  ): Promise<void> {
    if (!resolverContent.metadata?.version || !resolverContent.metadata?.source?.startsWith('registry://')) {
      return;
    }

    const registrySource = resolverContent.metadata.source as string;
    const moduleMatch = registrySource.match(/^registry:\/\/(@[^@]+)@(.+)$/);
    if (!moduleMatch) {
      return;
    }

    const [, moduleRef, resolvedVersion] = moduleMatch;
    const registryManager = env.getRegistryManager();
    if (!registryManager) {
      return;
    }

    const lockFile = registryManager.getLockFile();
    const lockEntry = lockFile.getImport(moduleRef);
    if (!lockEntry || !lockEntry.registryVersion) {
      return;
    }

    if (lockEntry.registryVersion !== resolvedVersion) {
      throw new Error(
        `Locked version mismatch for ${moduleRef}: ` +
          `lock file has version ${lockEntry.registryVersion}, ` +
          `but resolved to version ${resolvedVersion}. ` +
          `Run 'mlld install' to update the lock file or specify the locked version explicitly.`
      );
    }
  }
}
