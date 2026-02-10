import type { DirectiveNode, ImportDirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportPathResolver, type ImportResolution } from './ImportPathResolver';
import { resolveImportType } from './ImportTypePolicy';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { ModuleContentProcessor, type ModuleProcessingResult } from './ModuleContentProcessor';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
import { McpImportService } from './McpImportService';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';
import { InputImportHandler } from './InputImportHandler';
import { ResolverImportHandler } from './ResolverImportHandler';
import { ModuleImportHandler } from './ModuleImportHandler';
import { NodeImportHandler } from './NodeImportHandler';
import { DirectoryImportHandler } from './DirectoryImportHandler';
import { FileUrlImportHandler } from './FileUrlImportHandler';
import { PolicyImportContextManager } from './PolicyImportContextManager';
import { ModuleNeedsValidator } from './ModuleNeedsValidator';
import { ImportBindingValidator } from './ImportBindingValidator';
import { ImportRequestRouter } from './ImportRequestRouter';
import { McpImportHandler } from './McpImportHandler';
import { ResolverContentImportHandler } from './ResolverContentImportHandler';

/**
 * Main coordinator for import directive evaluation.
 */
export class ImportDirectiveEvaluator {
  private readonly pathResolver: ImportPathResolver;
  private readonly policyImportContextManager: PolicyImportContextManager;
  private readonly moduleNeedsValidator: ModuleNeedsValidator;
  private readonly importBindingValidator: ImportBindingValidator;
  private readonly mcpImportHandler: McpImportHandler;
  private readonly importRequestRouter: ImportRequestRouter;
  private readonly resolverContentImportHandler: ResolverContentImportHandler;

  constructor(env: Environment) {
    this.pathResolver = new ImportPathResolver(env);
    this.policyImportContextManager = new PolicyImportContextManager();
    this.moduleNeedsValidator = new ModuleNeedsValidator(env);
    this.importBindingValidator = new ImportBindingValidator();

    const objectResolver = new ObjectReferenceResolver();
    const variableImporter = new VariableImporter(objectResolver);
    const securityValidator = new ImportSecurityValidator(env);
    const contentProcessor = new ModuleContentProcessor(
      env,
      securityValidator,
      variableImporter
    );
    const mcpImportService = new McpImportService(env);
    const resolverImportDataAdapter = new ResolverImportDataAdapter(variableImporter);

    const inputImportHandler = new InputImportHandler(resolverImportDataAdapter);
    const resolverImportHandler = new ResolverImportHandler(resolverImportDataAdapter);
    const moduleImportHandler = new ModuleImportHandler();
    const nodeImportHandler = new NodeImportHandler(
      variableImporter,
      (result, directive, source) => this.validateModuleResult(result, directive, source),
      (directive, policyEnv, source) =>
        this.policyImportContextManager.applyPolicyImportContext(directive, policyEnv, source)
    );
    const directoryImportHandler = new DirectoryImportHandler(
      async (resolution, directive) => contentProcessor.processModuleContent(resolution, directive),
      (needs, source) => this.moduleNeedsValidator.enforceModuleNeeds(needs, source)
    );
    const fileUrlImportHandler = new FileUrlImportHandler(
      async (resolution, directive) => contentProcessor.processModuleContent(resolution, directive),
      variableImporter,
      directoryImportHandler,
      (result, directive, source) => this.validateModuleResult(result, directive, source),
      (directive, policyEnv, source) =>
        this.policyImportContextManager.applyPolicyImportContext(directive, policyEnv, source)
    );

    this.mcpImportHandler = new McpImportHandler(mcpImportService);
    this.importRequestRouter = new ImportRequestRouter(
      inputImportHandler,
      resolverImportHandler,
      moduleImportHandler,
      nodeImportHandler,
      fileUrlImportHandler
    );
    this.resolverContentImportHandler = new ResolverContentImportHandler(
      securityValidator,
      contentProcessor,
      variableImporter,
      (result, directive, source) => this.validateModuleResult(result, directive, source),
      (directive, policyEnv, source) =>
        this.policyImportContextManager.applyPolicyImportContext(directive, policyEnv, source)
    );
  }

  /**
   * Main entry point for import directive evaluation.
   */
  async evaluateImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    try {
      return await this.policyImportContextManager.withPolicyOverride(
        directive,
        env,
        async () => this.evaluateImportByDirective(directive, env)
      );
    } catch (error) {
      return this.handleImportError(error);
    }
  }

  private async evaluateImportByDirective(
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    if (directive.subtype === 'importMcpSelected' || directive.subtype === 'importMcpNamespace') {
      return this.mcpImportHandler.evaluateImport(directive, env);
    }

    const resolution = await this.resolveImportResolution(directive as ImportDirectiveNode, env);
    return this.importRequestRouter.routeImportRequest(
      resolution,
      directive,
      env,
      async (resolverDirective, ref, resolverContent, handlerEnv) =>
        this.resolverContentImportHandler.importFromResolverContent(
          resolverDirective,
          ref,
          resolverContent,
          handlerEnv
        )
    );
  }

  private async resolveImportResolution(
    directive: ImportDirectiveNode,
    env: Environment
  ): Promise<ImportResolution> {
    const resolution = await this.pathResolver.resolveImportPath(directive);

    const importContext = resolveImportType(directive, resolution);
    resolution.importType = importContext.importType;
    if (importContext.cacheDurationMs !== undefined) {
      resolution.cacheDurationMs = importContext.cacheDurationMs;
    }

    if (resolution.importType === 'templates' && resolution.type !== 'file') {
      const resolvedPath = await env.resolvePath(resolution.resolvedPath);
      resolution.resolvedPath = resolvedPath;
      resolution.type = 'file';
    }

    if (
      directive.values?.templateParams &&
      directive.values.templateParams.length > 0 &&
      resolution.importType !== 'templates'
    ) {
      throw new MlldImportError('Import parameters are only supported with templates imports', {
        code: 'IMPORT_TYPE_MISMATCH',
        details: {
          importType: resolution.importType,
          path: resolution.resolvedPath
        }
      });
    }

    return resolution;
  }

  private handleImportError(error: unknown): never {
    throw error;
  }

  private validateModuleResult(
    result: ModuleProcessingResult,
    directive: DirectiveNode,
    source?: string
  ): void {
    this.moduleNeedsValidator.enforceModuleNeeds(result.moduleNeeds, source);
    this.importBindingValidator.validateExportBindings(
      result.moduleObject,
      directive,
      source,
      result.guardDefinitions
    );
  }
}
