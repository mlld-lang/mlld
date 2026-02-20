import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import type { ImportResolution } from './ImportPathResolver';
import type { InputImportHandler } from './InputImportHandler';
import type { ResolverImportHandler } from './ResolverImportHandler';
import type { ModuleImportHandler } from './ModuleImportHandler';
import type { NodeImportHandler } from './NodeImportHandler';
import type { FileUrlImportHandler } from './FileUrlImportHandler';

type ImportFromResolverContent = (
  directive: DirectiveNode,
  ref: string,
  resolverContent: { content: string; contentType: 'module' | 'data' | 'text'; metadata?: any; mx?: any },
  env: Environment
) => Promise<EvalResult>;

export class ImportRequestRouter {
  constructor(
    private readonly inputImportHandler: InputImportHandler,
    private readonly resolverImportHandler: ResolverImportHandler,
    private readonly moduleImportHandler: ModuleImportHandler,
    private readonly nodeImportHandler: NodeImportHandler,
    private readonly fileUrlImportHandler: FileUrlImportHandler
  ) {}

  async routeImportRequest(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment,
    importFromResolverContent: ImportFromResolverContent
  ): Promise<EvalResult> {
    switch (resolution.type) {
      case 'input':
        return this.inputImportHandler.evaluateInputImport(directive, env);

      case 'resolver':
        return this.resolverImportHandler.evaluateResolverImport(
          directive,
          resolution.resolverName!,
          env,
          async (resolverDirective, ref, resolverContent, handlerEnv) =>
            importFromResolverContent(resolverDirective, ref, resolverContent, handlerEnv)
        );

      case 'module':
        return this.moduleImportHandler.evaluateModuleImport(
          resolution,
          directive,
          env,
          async (moduleDirective, ref, resolverContent, handlerEnv) =>
            importFromResolverContent(moduleDirective, ref, resolverContent, handlerEnv)
        );

      case 'node':
        return this.nodeImportHandler.evaluateNodeImport(resolution, directive, env);

      case 'file':
      case 'url':
        return this.fileUrlImportHandler.evaluateFileImport(resolution, directive, env);

      default:
        throw new Error(`Unknown import type: ${(resolution as any).type}`);
    }
  }
}
