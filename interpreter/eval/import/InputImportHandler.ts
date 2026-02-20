import type { DirectiveNode } from '@core/types';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { deriveImportTaint } from '@core/security/taint';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';

export class InputImportHandler {
  constructor(private readonly dataAdapter: ResolverImportDataAdapter) {}

  async evaluateInputImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new Error('Resolver manager not available');
    }

    const resolver = resolverManager.getResolver('input');
    if (!resolver) {
      throw new Error('input resolver not found');
    }

    const requestedImports = directive.subtype === 'importSelected'
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    const result = await resolver.resolve('@input', {
      context: 'import',
      requestedImports
    });

    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    const baseDescriptor = makeSecurityDescriptor({ labels: securityLabels });
    const sourceRef = result.mx?.source ?? '@input';
    const taintSnapshot = deriveImportTaint({
      importType: 'live',
      resolverName: 'input',
      source: sourceRef,
      resolvedPath: sourceRef,
      sourceType: 'input',
      labels: result.mx?.labels
    });
    const taintDescriptor = makeSecurityDescriptor({
      taint: taintSnapshot.taint,
      labels: taintSnapshot.labels,
      sources: taintSnapshot.sources
    });
    env.recordSecurityDescriptor(mergeDescriptors(baseDescriptor, taintDescriptor));

    let exportData: Record<string, any> = {};
    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        exportData = JSON.parse(result.content);
      } catch (e) {
        exportData = { value: result.content };
      }
    } else {
      exportData = { value: result.content };
    }

    await this.dataAdapter.importResolverVariables(directive, exportData, env, '@input');
    return { value: undefined, env };
  }
}
