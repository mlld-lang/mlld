import type { CodeExecutable } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import { resolveShadowEnvironment, mergeShadowFunctions } from '@interpreter/eval/helpers/shadowEnvResolver';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

export function createSyncJsWrapper(
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
    const { names: shadowNames, values: shadowValues } = mergeShadowFunctions(
      shadowEnv,
      undefined,
      paramSet
    );

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
