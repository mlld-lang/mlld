import {
  createSimpleTextVariable,
  type ExecutableVariable
} from '@core/types/variable';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { Environment } from '@interpreter/env/Environment';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { interpolateAndRecord } from './definition-helpers';

export function createExecWrapper(
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
