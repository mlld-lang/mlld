import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { VariableImporter } from './VariableImporter';
import { DirectoryImportHandler } from './DirectoryImportHandler';
import type { ModuleProcessingResult } from './ModuleContentProcessor';
import type { ImportResolution } from './ImportPathResolver';

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

type ProcessModuleContent = (
  resolution: ImportResolution,
  directive: DirectiveNode
) => Promise<ModuleProcessingResult>;

export class FileUrlImportHandler {
  constructor(
    private readonly processModuleContent: ProcessModuleContent,
    private readonly variableImporter: VariableImporter,
    private readonly directoryImportHandler: DirectoryImportHandler,
    private readonly validateModuleResult: ValidateModuleResult,
    private readonly applyPolicyImportContext: ApplyPolicyImportContext
  ) {}

  async evaluateFileImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    const directoryResult = await this.directoryImportHandler.maybeProcessDirectoryImport(
      resolution,
      directive,
      env
    );
    const processingResult =
      directoryResult ?? (await this.processModuleContent(resolution, directive));

    this.validateModuleResult(processingResult, directive, resolution.resolvedPath);
    await this.variableImporter.importVariables(processingResult, directive, env);
    this.applyPolicyImportContext(directive, env, resolution.resolvedPath);

    return { value: undefined, env };
  }
}
