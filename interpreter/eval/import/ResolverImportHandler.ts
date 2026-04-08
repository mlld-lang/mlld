import type { DirectiveNode } from '@core/types';
import { MlldImportError } from '@core/errors';
import { deriveImportTaint } from '@core/security/taint';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';
import {
  buildImportTraceData,
  emitImportFailure,
  emitImportTrace
} from './runtime-trace';

type ResolverContent = {
  content: string;
  contentType: 'module' | 'data' | 'text';
  metadata?: any;
  mx?: any;
};

type ResolverImportFromContent = (
  directive: DirectiveNode,
  ref: string,
  resolverContent: ResolverContent,
  env: Environment
) => Promise<EvalResult>;

export class ResolverImportHandler {
  constructor(private readonly dataAdapter: ResolverImportDataAdapter) {}

  async evaluateResolverImport(
    directive: DirectiveNode,
    resolverName: string,
    env: Environment,
    importFromResolverContent: ResolverImportFromContent
  ): Promise<EvalResult> {
    const traceData = buildImportTraceData(directive, {
      ref: `@${resolverName}`,
      resolvedPath: `@${resolverName}`,
      transport: 'resolver',
      resolverName
    });
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      const error = new Error('Resolver manager not available');
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }

    const resolver = resolverManager.getResolver(resolverName) ||
                    resolverManager.getResolver(resolverName.toLowerCase()) ||
                    resolverManager.getResolver(resolverName.toUpperCase());
    if (!resolver) {
      const error = new Error(`Resolver '${resolverName}' not found`);
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }

    if (resolverName.toLowerCase() === 'keychain') {
      const error = new MlldImportError(
        'Direct keychain imports are not available. Use policy.auth with using auth:*.',
        { code: 'KEYCHAIN_DIRECT_ACCESS_DENIED' }
      );
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }

    if (!resolver.capabilities.contexts.import) {
      const { ResolverError } = await import('@core/errors');
      const error = ResolverError.unsupportedCapability(resolver.name, 'imports', 'import');
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }

    const requestedImports = directive.subtype === 'importSelected'
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    let resolverResult: ResolverContent;
    try {
      resolverResult = await resolver.resolve(`@${resolverName}`, {
        context: 'import',
        requestedImports
      }) as ResolverContent;
    } catch (error) {
      emitImportFailure(env, {
        ...traceData,
        phase: 'read',
        error
      });
      throw error;
    }

    emitImportTrace(env, 'import.read', {
      ...traceData,
      ref: resolverResult.mx?.source ?? `@${resolverName}`,
      resolvedPath: resolverResult.mx?.source ?? `@${resolverName}`,
      contentType: resolverResult.contentType
    });

    if (resolverResult.contentType === 'module') {
      const ref = resolverResult.mx?.source ?? `@${resolverName}`;
      const taintDescriptor = deriveImportTaint({
        importType: 'module',
        resolverName,
        source: ref,
        resolvedPath: ref,
        sourceType: 'resolver',
        labels: resolverResult.mx?.labels
      });
      env.recordSecurityDescriptor(
        makeSecurityDescriptor({
          taint: taintDescriptor.taint,
          labels: taintDescriptor.labels,
          sources: taintDescriptor.sources
        })
      );
      try {
        return await importFromResolverContent(directive, ref, resolverResult, env);
      } catch (error) {
        emitImportFailure(env, {
          ...traceData,
          ref,
          resolvedPath: ref,
          contentType: resolverResult.contentType,
          phase: 'evaluate',
          error
        });
        throw error;
      }
    }

    let exportData: Record<string, any> = {};

    if ('getExportData' in resolver) {
      exportData = await this.dataAdapter.getResolverExportData(resolver as any, directive, resolverName);
    } else {
      exportData = await this.dataAdapter.fallbackResolverData(resolver, directive, resolverName, resolverResult);
    }

    try {
      await this.dataAdapter.importResolverVariables(directive, exportData, env, `@${resolverName}`);
    } catch (error) {
      emitImportFailure(env, {
        ...traceData,
        contentType: resolverResult.contentType,
        phase: 'evaluate',
        error
      });
      throw error;
    }
    emitImportTrace(env, 'import.exports', {
      ...traceData,
      contentType: resolverResult.contentType,
      exportCount: Object.keys(exportData).length
    });
    return { value: undefined, env };
  }
}
