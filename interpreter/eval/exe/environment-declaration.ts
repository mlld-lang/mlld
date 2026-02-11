import type { DirectiveNode } from '@core/types';
import type { CodeExecutable } from '@core/types/executable';
import {
  createSimpleTextVariable,
  type ExecutableVariable
} from '@core/types/variable';
import type { EvalResult } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { Environment } from '@interpreter/env/Environment';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { resolveShadowEnvironment, mergeShadowFunctions } from '@interpreter/eval/helpers/shadowEnvResolver';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { asData, asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { interpolateAndRecord } from './definition-helpers';

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

function createSyncJsWrapper(
  funcName: string,
  definition: CodeExecutable,
  env: Environment
): Function {
  return function(...args: any[]) {
    const params = definition.paramNames || [];
    const codeParams: Record<string, any> = {};

    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      let argValue = args[i];

      if (argValue !== undefined) {
        if (isStructuredValue(argValue)) {
          argValue = asData(argValue);
        } else if (isFileLoadedValue(argValue)) {
          argValue = argValue.content;
        }

        if (typeof argValue === 'string') {
          const numValue = Number(argValue);
          if (!isNaN(numValue) && argValue.trim() !== '') {
            argValue = numValue;
          }
        }
      }

      codeParams[paramName] = argValue;
    }

    const codeTemplate = definition.codeTemplate;
    if (!codeTemplate) {
      throw new Error(`Function ${funcName} has no code template`);
    }

    let code: string;
    try {
      code = codeTemplate
        .map(node => {
          if (node.type === 'Text') {
            return node.content;
          }
          throw new Error('Synchronous shadow functions only support simple code templates');
        })
        .join('');
    } catch (error: any) {
      throw new Error(`Cannot create synchronous wrapper for ${funcName}: ${error.message}`);
    }

    const capturedEnvs = (definition as any).capturedShadowEnvs;
    const shadowEnv = resolveShadowEnvironment('js', capturedEnvs, env);
    const paramSet = new Set(Object.keys(codeParams));
    const { names: shadowNames, values: shadowValues } = mergeShadowFunctions(shadowEnv, undefined, paramSet);

    const allParamNames = [...Object.keys(codeParams), ...shadowNames];
    const allParamValues = [...Object.values(codeParams), ...shadowValues];

    let functionBody = code;
    const trimmedCode = code.trim();
    const isExpression =
      (!code.includes('return') && !code.includes(';')) ||
      (trimmedCode.startsWith('(') && trimmedCode.endsWith(')'));

    if (isExpression) {
      functionBody = `return (${functionBody})`;
    }

    const fn = new Function(...allParamNames, functionBody);
    return fn(...allParamValues);
  };
}

function createExecWrapper(
  execName: string,
  execVar: ExecutableVariable,
  env: Environment
): Function {
  return async function(...args: any[]) {
    const definition = (execVar.internal as any)?.executableDef;
    if (!definition) {
      throw new Error(`Executable ${execName} has no definition in metadata`);
    }

    const params = definition.paramNames || [];
    const execEnv = env.createChild();

    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = args[i];
      if (argValue !== undefined) {
        const stringValue =
          typeof argValue === 'string'
            ? argValue
            : argValue === null || argValue === undefined
              ? String(argValue)
              : typeof argValue === 'object'
                ? (isStructuredValue(argValue) ? asText(argValue) : JSON.stringify(argValue))
                : String(argValue);

        const paramVar = createSimpleTextVariable(
          paramName,
          stringValue,
          {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            internal: {
              isSystem: true,
              isParameter: true
            }
          }
        );
        execEnv.setParameterVariable(paramName, paramVar);
      }
    }

    let result: string;

    if (definition.type === 'command') {
      const commandTemplate = definition.commandTemplate;
      if (!commandTemplate) {
        throw new Error(`Command ${execName} has no command template`);
      }

      const command = await interpolateAndRecord(
        commandTemplate,
        execEnv,
        InterpolationContext.ShellCommand
      );

      const envVars: Record<string, string> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        const argValue = args[i];
        if (argValue !== undefined) {
          envVars[paramName] = String(argValue);
        }
      }

      result = await execEnv.executeCommand(command, { env: envVars });
    } else if (definition.type === 'code') {
      const codeTemplate = definition.codeTemplate;
      if (!codeTemplate) {
        throw new Error(`Code command ${execName} has no code template`);
      }

      const code = await interpolateAndRecord(codeTemplate, execEnv);
      const codeParams: Record<string, any> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        let argValue = args[i];

        if (argValue !== undefined) {
          argValue = argValue instanceof Promise ? await argValue : argValue;
          argValue = AutoUnwrapManager.unwrap(argValue);

          if (typeof argValue === 'string') {
            const numValue = Number(argValue);
            if (!isNaN(numValue) && argValue.trim() !== '') {
              argValue = numValue;
            }
          }
        }

        codeParams[paramName] = argValue;
      }

      const capturedEnvs = (execVar.internal as any)?.capturedShadowEnvs;
      if (
        capturedEnvs &&
        (definition.language === 'js' ||
          definition.language === 'javascript' ||
          definition.language === 'node' ||
          definition.language === 'nodejs')
      ) {
        (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      }

      result = await execEnv.executeCode(code, definition.language || 'javascript', codeParams);
    } else if (definition.type === 'template') {
      const templateNodes = definition.template;
      if (!templateNodes) {
        throw new Error(`Template ${execName} has no template content`);
      }

      result = await interpolateAndRecord(templateNodes, execEnv);
    } else if (definition.type === 'data') {
      const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
      const dataValue = await evaluateDataValue(definition.dataTemplate as any, execEnv);
      try {
        return JSON.parse(JSON.stringify(dataValue));
      } catch {
        return dataValue;
      }
    } else if (definition.type === 'section') {
      throw new Error('Section executables cannot be invoked from shadow environments yet');
    } else if (definition.type === 'resolver') {
      throw new Error('Resolver executables cannot be invoked from shadow environments yet');
    } else if (definition.type === 'commandRef') {
      throw new Error('Command reference executables cannot be invoked from shadow environments yet');
    } else {
      throw new Error(`Unknown command type: ${definition.type}`);
    }

    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  };
}
