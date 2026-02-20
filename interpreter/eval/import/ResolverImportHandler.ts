import type { DirectiveNode } from '@core/types';
import { MlldImportError } from '@core/errors';
import { deriveImportTaint } from '@core/security/taint';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';

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
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new Error('Resolver manager not available');
    }

    const resolver = resolverManager.getResolver(resolverName) ||
                    resolverManager.getResolver(resolverName.toLowerCase()) ||
                    resolverManager.getResolver(resolverName.toUpperCase());
    if (!resolver) {
      throw new Error(`Resolver '${resolverName}' not found`);
    }

    if (resolverName.toLowerCase() === 'keychain') {
      throw new MlldImportError(
        'Direct keychain imports are not available. Use policy.auth with using auth:*.',
        { code: 'KEYCHAIN_DIRECT_ACCESS_DENIED' }
      );
    }

    if (!resolver.capabilities.contexts.import) {
      const { ResolverError } = await import('@core/errors');
      throw ResolverError.unsupportedCapability(resolver.name, 'imports', 'import');
    }

    const requestedImports = directive.subtype === 'importSelected'
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    const resolverResult = await resolver.resolve(`@${resolverName}`, {
      context: 'import',
      requestedImports
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
      return importFromResolverContent(directive, ref, resolverResult, env);
    }

    let exportData: Record<string, any> = {};

    if ('getExportData' in resolver) {
      exportData = await this.dataAdapter.getResolverExportData(resolver as any, directive, resolverName);
    } else {
      exportData = await this.dataAdapter.fallbackResolverData(resolver, directive, resolverName, resolverResult);
    }

    await this.dataAdapter.importResolverVariables(directive, exportData, env, `@${resolverName}`);
    return { value: undefined, env };
  }
}
