import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import type { ModuleProcessingResult, ModuleContentProcessor } from './ModuleContentProcessor';
import type { ImportSecurityValidator } from './ImportSecurityValidator';
import type { VariableImporter } from './VariableImporter';
import { makeSecurityDescriptor } from '@core/types/security';

type ValidateModuleResult = (
  result: ModuleProcessingResult,
  directive: DirectiveNode,
  source?: string
) => void;

type ApplyPolicyImportContext = (
  directive: DirectiveNode,
  env: Environment,
  source?: string
) => void;

export class ResolverContentImportHandler {
  constructor(
    private readonly securityValidator: ImportSecurityValidator,
    private readonly contentProcessor: ModuleContentProcessor,
    private readonly variableImporter: VariableImporter,
    private readonly validateModuleResult: ValidateModuleResult,
    private readonly applyPolicyImportContext: ApplyPolicyImportContext
  ) {}

  async importFromResolverContent(
    directive: DirectiveNode,
    ref: string,
    resolverContent: { content: string; contentType: 'module' | 'data' | 'text'; metadata?: any; mx?: any },
    env: Environment
  ): Promise<EvalResult> {
    if (this.securityValidator.checkCircularImports(ref)) {
      throw new Error(`Circular import detected: ${ref}`);
    }

    try {
      const processingRef = typeof resolverContent.metadata?.source === 'string'
        ? resolverContent.metadata.source
        : ref;

      const processingResult = await this.contentProcessor.processResolverContent(
        resolverContent.content,
        processingRef,
        directive,
        resolverContent.contentType,
        resolverContent.mx?.labels
      );

      this.validateModuleResult(processingResult, directive, processingRef);

      await this.variableImporter.importVariables(processingResult, directive, env);
      this.applyPolicyImportContext(directive, env, processingRef);

      const dynamicSource = resolverContent.mx?.source;
      if (dynamicSource && typeof dynamicSource === 'string' && dynamicSource.startsWith('dynamic://')) {
        const childVariables = processingResult.childEnvironment.getAllVariables?.();
        const parentVariables = env.getAllVariables?.();
        const exportedNames =
          env.getExportManifest()?.getNames?.() ??
          (Array.isArray(resolverContent.metadata?.exports)
            ? (resolverContent.metadata.exports as string[])
            : undefined) ??
          processingResult.childEnvironment.getExportManifest?.()?.getNames?.() ??
          (childVariables ? Array.from(childVariables.keys()) : undefined) ??
          (parentVariables ? Array.from(parentVariables.keys()) : undefined) ??
          Object.keys(processingResult.moduleObject ?? {});
        const provenance =
          env.isProvenanceEnabled?.() === true
            ? resolverContent.metadata?.provenance ??
              this.buildDynamicImportProvenance(dynamicSource ?? ref, env)
            : undefined;
        env.emitSDKEvent({
          type: 'debug:import:dynamic',
          path: ref,
          source: dynamicSource,
          tainted: true,
          variables: exportedNames,
          timestamp: Date.now(),
          ...(provenance && { provenance })
        });
      }

      return { value: undefined, env };
    } finally {
      // Import tracking handled by ModuleContentProcessor.processResolverContent
    }
  }

  private buildDynamicImportProvenance(source: string | undefined, env: Environment) {
    const snapshot = env.getSecuritySnapshot?.();
    const normalizedSource = source
      ? source.startsWith('dynamic://')
        ? source
        : `dynamic://${source}`
      : 'dynamic://';
    return makeSecurityDescriptor({
      labels: [],
      taint: snapshot?.taint ?? ['src:dynamic'],
      sources: snapshot?.sources && snapshot.sources.length > 0 ? snapshot.sources : [normalizedSource],
      policyContext: snapshot?.policy
    });
  }
}
