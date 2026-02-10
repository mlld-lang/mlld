import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { normalizeNodeModuleExports, resolveNodeModule, wrapNodeExport } from '../../utils/node-interop';
import type { ModuleProcessingResult } from './ModuleContentProcessor';
import type { ImportResolution } from './ImportPathResolver';
import { VariableImporter } from './VariableImporter';

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

export class NodeImportHandler {
  constructor(
    private readonly variableImporter: VariableImporter,
    private readonly validateModuleResult: ValidateModuleResult,
    private readonly applyPolicyImportContext: ApplyPolicyImportContext
  ) {}

  async evaluateNodeImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    const packageName = resolution.packageName ?? resolution.resolvedPath;
    const { module, spec } = await resolveNodeModule(packageName, env);
    const moduleExports = normalizeNodeModuleExports(module);
    const moduleObject: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(moduleExports)) {
      moduleObject[key] = wrapNodeExport(value, { name: key, moduleName: spec });
    }

    const childEnv = env.createChild();
    childEnv.setCurrentFilePath(`node:${spec}`);
    childEnv.setModuleIsolated(true);

    const processingResult: ModuleProcessingResult = {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv,
      guardDefinitions: []
    };

    this.validateModuleResult(processingResult, directive, `node:${spec}`);
    await this.variableImporter.importVariables(processingResult, directive, env);
    this.applyPolicyImportContext(directive, env, `node:${spec}`);

    return { value: undefined, env };
  }
}
