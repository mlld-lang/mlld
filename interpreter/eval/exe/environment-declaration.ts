import type { DirectiveNode } from '@core/types';
import { type ExecutableVariable } from '@core/types/variable';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { createExecWrapper } from './exec-wrapper';
import { createSyncJsWrapper } from './sync-js-wrapper';

export async function handleExeEnvironmentDeclaration(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const language = extractEnvironmentLanguage(directive);
  const envRefs = directive.values?.environment || [];

  const shadowFunctions = new Map<string, any>();
  for (const ref of envRefs) {
    const funcName = ref.identifier;
    const funcVar = env.getVariable(funcName) as ExecutableVariable | undefined;

    if (!funcVar || funcVar.type !== 'executable') {
      throw new Error(`${funcName} is not a defined exec function`);
    }

    let wrapper = createExecWrapper(funcName, funcVar, env);
    if ((language === 'js' || language === 'javascript') && funcVar.value.type === 'code') {
      const languageId = funcVar.value.language;
      if (languageId === 'javascript' || languageId === 'js') {
        const execDef = (funcVar.internal as any)?.executableDef;
        if (execDef && execDef.type === 'code') {
          (execDef as any).capturedShadowEnvs = (funcVar.internal as any)?.capturedShadowEnvs;
          wrapper = createSyncJsWrapper(funcName, execDef, env);
        }
      }
    }

    shadowFunctions.set(funcName, wrapper);
  }

  env.setShadowEnv(language, shadowFunctions);

  if (language === 'python' || language === 'py') {
    const pythonShadowEnv = env.getOrCreatePythonShadowEnv();
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName) as ExecutableVariable | undefined;

      if (!funcVar || funcVar.type !== 'executable' || funcVar.value.type !== 'code') {
        continue;
      }

      const execDef = (funcVar.internal as any)?.executableDef;
      if (!execDef || (execDef.language !== 'python' && execDef.language !== 'py')) {
        continue;
      }

      const codeTemplate = execDef.codeTemplate;
      if (!codeTemplate || !Array.isArray(codeTemplate)) {
        continue;
      }

      const code = codeTemplate.map((node: any) => (node.type === 'Text' ? node.content : '')).join('');
      const paramNames = execDef.paramNames || [];
      await pythonShadowEnv.addFunction(funcName, code, paramNames);
    }
  }

  if (env.hasShadowEnvs()) {
    const capturedEnvs = env.captureAllShadowEnvs();
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName) as ExecutableVariable | undefined;
      if (!funcVar || funcVar.type !== 'executable') {
        continue;
      }

      funcVar.internal = {
        ...(funcVar.internal ?? {}),
        capturedShadowEnvs: capturedEnvs
      };

      const execDef = (funcVar.internal as any)?.executableDef;
      if (execDef) {
        (execDef as any).capturedShadowEnvs = capturedEnvs;
      }
    }
  }

  return {
    value: null,
    env
  };
}

function extractEnvironmentLanguage(directive: DirectiveNode): string {
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Exec environment directive missing language identifier');
  }

  const identifierNode = identifierNodes[0];
  if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    return identifierNode.identifier;
  }

  throw new Error('Exec environment language must be a simple string');
}
