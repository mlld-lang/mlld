import type { DirectiveNode } from '@core/types';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { deriveImportTaint } from '@core/security/taint';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';
import {
  buildImportTraceData,
  emitImportFailure,
  emitImportTrace
} from './runtime-trace';

export class InputImportHandler {
  constructor(private readonly dataAdapter: ResolverImportDataAdapter) {}

  async evaluateInputImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    const traceData = buildImportTraceData(directive, {
      ref: '@input',
      resolvedPath: '@input',
      transport: 'input',
      resolverName: 'input'
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

    const resolver = resolverManager.getResolver('input');
    if (!resolver) {
      const error = new Error('input resolver not found');
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

    let result: Awaited<ReturnType<typeof resolver.resolve>>;
    try {
      result = await resolver.resolve('@input', {
        context: 'import',
        requestedImports
      });
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
      contentType: result.contentType
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

    env.recordKnownUrlsFromValue(exportData);
    try {
      await this.dataAdapter.importResolverVariables(directive, exportData, env, '@input');
    } catch (error) {
      emitImportFailure(env, {
        ...traceData,
        contentType: result.contentType,
        phase: 'evaluate',
        error
      });
      throw error;
    }

    emitImportTrace(env, 'import.exports', {
      ...traceData,
      contentType: result.contentType,
      exportCount: Object.keys(exportData).length
    });
    return { value: undefined, env };
  }
}
