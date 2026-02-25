import type { ExecInvocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { asText, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { createParameterVariable } from '@interpreter/utils/parameter-factory';

export type EvaluatedExecArguments = {
  evaluatedArgStrings: string[];
  evaluatedArgs: unknown[];
};

export type ExecArgEvaluationServices = {
  interpolate: (
    nodes: any[],
    targetEnv: Environment,
    context?: InterpolationContext
  ) => Promise<string>;
  // Recursion seam for nested ExecInvocation argument nodes.
  evaluateExecInvocation: (node: ExecInvocation, env: Environment) => Promise<EvalResult>;
  mergeResultDescriptor: (descriptor?: SecurityDescriptor) => void;
};

type ParameterMetadataFactory = (value: unknown) => {
  metadata?: Record<string, unknown>;
  internal: {
    isSystem: true;
    isParameter: true;
  };
};

function cloneGuardCandidateForParameter(
  name: string,
  candidate: Variable,
  argValue: unknown,
  fallback: string | undefined
): Variable {
  const cloned: Variable = {
    ...candidate,
    name,
    value: argValue ?? fallback ?? candidate.value,
    mx: candidate.mx ? { ...candidate.mx } : undefined,
    internal: {
      ...(candidate.internal ?? {}),
      isSystem: true,
      isParameter: true
    }
  };
  if (cloned.mx?.mxCache) {
    delete cloned.mx.mxCache;
  }
  return cloned;
}

export function bindExecParameterVariables(options: {
  params: string[];
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
  originalVariables: (Variable | undefined)[];
  guardVariableCandidates: (Variable | undefined)[];
  definition: ExecutableDefinition;
  execEnv: Environment;
  transformedGuardSet?: ReadonlySet<Variable> | null;
  createParameterMetadata: ParameterMetadataFactory;
}): void {
  const {
    params,
    evaluatedArgs,
    evaluatedArgStrings,
    originalVariables,
    guardVariableCandidates,
    definition,
    execEnv,
    transformedGuardSet,
    createParameterMetadata
  } = options;

  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = evaluatedArgs[i];
    const argStringValue = evaluatedArgStrings[i];
    const originalVar = originalVariables[i];
    const guardCandidate = guardVariableCandidates[i];
    const isShellCode =
      definition.type === 'code' &&
      typeof definition.language === 'string' &&
      (definition.language === 'bash' || definition.language === 'sh');
    const preferGuardReplacement = transformedGuardSet?.has(guardCandidate as Variable) ?? false;
    const allowOriginalReuse =
      !preferGuardReplacement && Boolean(originalVar) && !isShellCode && definition.type !== 'command';

    if (guardCandidate && (!originalVar || !allowOriginalReuse || preferGuardReplacement)) {
      const candidateClone = cloneGuardCandidateForParameter(
        paramName,
        guardCandidate,
        argValue,
        argStringValue
      );
      execEnv.setParameterVariable(paramName, candidateClone);
      continue;
    }

    if (argValue !== undefined) {
      const paramVar = createParameterVariable({
        name: paramName,
        value: evaluatedArgs[i],
        stringValue: argStringValue,
        originalVariable: originalVar,
        allowOriginalReuse,
        metadataFactory: createParameterMetadata,
        origin: 'exec-param'
      });

      if (paramVar) {
        execEnv.setParameterVariable(paramName, paramVar);
      }
    }
  }
}

export async function evaluateExecInvocationArgs(options: {
  args: any[];
  env: Environment;
  commandName: string;
  services: ExecArgEvaluationServices;
}): Promise<EvaluatedExecArguments> {
  const { args, env, commandName, services } = options;
  const evaluatedArgStrings: string[] = [];
  const evaluatedArgs: unknown[] = [];

  for (const arg of args) {
    let argValue: string;
    let argValueAny: unknown;

    if (isStructuredValue(arg)) {
      argValueAny = arg;
      argValue = asText(arg);
    } else if (arg && typeof arg === 'object' && (arg as any).type === 'RegexLiteral') {
      const pattern = (arg as any).pattern || '';
      const flags = (arg as any).flags || '';
      const regex = new RegExp(pattern, flags);
      argValueAny = regex;
      argValue = regex.toString();
    } else if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      argValue = String(arg);
      argValueAny = arg;
    } else if (arg && typeof arg === 'object' && 'needsInterpolation' in arg && Array.isArray((arg as any).parts)) {
      const interpolated = await services.interpolate(
        (arg as any).parts,
        env,
        InterpolationContext.Default
      );
      argValue = interpolated;
      argValueAny = interpolated;
    } else if (
      Array.isArray(arg) &&
      arg.length > 0 &&
      arg.some((item: any) => item && typeof item === 'object' && item.type === 'VariableReference')
    ) {
      const interpolated = await services.interpolate(arg, env, InterpolationContext.Default);
      argValue = interpolated;
      argValueAny = interpolated;
    } else if (arg && typeof arg === 'object' && 'wrapperType' in arg && Array.isArray((arg as any).content)) {
      const interpolated = await services.interpolate(
        (arg as any).content,
        env,
        InterpolationContext.Default
      );
      argValue = interpolated;
      argValueAny = interpolated;
    } else if (arg && typeof arg === 'object' && 'type' in arg) {
      switch (arg.type) {
        case 'BinaryExpression':
        case 'TernaryExpression':
        case 'UnaryExpression':
        case 'ArrayFilterExpression':
        case 'ArraySliceExpression': {
          const { evaluateUnifiedExpression } = await import('@interpreter/eval/expressions');
          const exprResult = await evaluateUnifiedExpression(arg as any, env, { isExpression: true });
          if (exprResult.descriptor) {
            services.mergeResultDescriptor(exprResult.descriptor);
          }
          argValueAny = exprResult.value;
          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (isStructuredValue(argValueAny)) {
            argValue = asText(argValueAny);
          } else if (typeof argValueAny === 'object') {
            try {
              argValue = JSON.stringify(argValueAny);
            } catch {
              argValue = String(argValueAny);
            }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'WhenExpression': {
          const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
          const whenRes = await evaluateWhenExpression(arg as any, env);
          const whenDescriptor = extractSecurityDescriptor(whenRes.value, {
            recursive: true,
            mergeArrayElements: true
          });
          if (whenDescriptor) {
            services.mergeResultDescriptor(whenDescriptor);
          }
          argValueAny = whenRes.value;
          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (typeof argValueAny === 'object') {
            try {
              argValue = JSON.stringify(argValueAny);
            } catch {
              argValue = String(argValueAny);
            }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'foreach':
        case 'foreach-command': {
          const { evaluateForeachCommand } = await import('@interpreter/eval/foreach');
          const arr = await evaluateForeachCommand(arg as any, env);
          argValueAny = arr;
          argValue = JSON.stringify(arr);
          break;
        }
        case 'object': {
          const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
          argValueAny = await evaluateDataValue(arg, env);
          argValue = JSON.stringify(argValueAny);
          const { extractDescriptorsFromDataAst } = await import('@interpreter/eval/var');
          const objDescriptor = extractDescriptorsFromDataAst(arg, env);
          if (objDescriptor) {
            services.mergeResultDescriptor(objDescriptor);
          }
          break;
        }
        case 'array': {
          const { evaluateDataValue: evaluateArrayValue } = await import('@interpreter/eval/data-value-evaluator');
          argValueAny = await evaluateArrayValue(arg, env);
          argValue = JSON.stringify(argValueAny);
          const { extractDescriptorsFromDataAst } = await import('@interpreter/eval/var');
          const arrDescriptor = extractDescriptorsFromDataAst(arg, env);
          if (arrDescriptor) {
            services.mergeResultDescriptor(arrDescriptor);
          }
          break;
        }
        case 'VariableReference': {
          const varRef = arg as any;
          const varName = varRef.identifier;
          const variable = env.getVariable(varName);
          if (variable) {
            const { varMxToSecurityDescriptor } = await import('@core/types/variable/VarMxHelpers');
            if (variable.mx) {
              const varDescriptor = varMxToSecurityDescriptor(variable.mx as any);
              if (varDescriptor) {
                services.mergeResultDescriptor(varDescriptor);
              }
            }

            let value = variable.value;
            const { isTemplate } = await import('@core/types/variable');
            if (isTemplate(variable)) {
              if (Array.isArray(value)) {
                value = await services.interpolate(value, env, InterpolationContext.Default);
              } else if (variable.internal?.templateAst && Array.isArray(variable.internal.templateAst)) {
                value = await services.interpolate(
                  variable.internal.templateAst,
                  env,
                  InterpolationContext.Default
                );
              }
            }

            if (varRef.fields && varRef.fields.length > 0) {
              const { accessFields } = await import('@interpreter/utils/field-access');
              value = await accessFields(value, varRef.fields, {
                env,
                preserveContext: false,
                sourceLocation: (varRef as any).location
              });
            }

            if (isStructuredValue(value)) {
              argValueAny = value;
              argValue = asText(value);
            } else {
              argValueAny = value;
              if (value === undefined) {
                argValue = 'undefined';
              } else if (typeof value === 'object' && value !== null) {
                try {
                  argValue = JSON.stringify(value);
                } catch {
                  argValue = String(value);
                }
              } else {
                argValue = String(value);
              }
            }
          } else {
            throw new Error(`Undefined variable '@${varName}' passed to function @${commandName}`);
          }
          break;
        }
        case 'load-content': {
          const { processContentLoader } = await import('@interpreter/eval/content-loader');
          const { wrapLoadContentValue } = await import('@interpreter/utils/load-content-structured');
          const loadResult = await processContentLoader(arg as any, env);
          const structured = wrapLoadContentValue(loadResult);
          argValueAny = structured;
          argValue = asText(structured);
          break;
        }
        case 'ExecInvocation': {
          const nestedResult = await services.evaluateExecInvocation(arg as ExecInvocation, env);
          if (nestedResult && nestedResult.value !== undefined) {
            argValueAny = nestedResult.value;
          } else if (nestedResult && nestedResult.stdout !== undefined) {
            argValueAny = nestedResult.stdout;
          } else {
            argValueAny = undefined;
          }

          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (isStructuredValue(argValueAny)) {
            argValue = asText(argValueAny);
          } else if (typeof argValueAny === 'object') {
            try {
              argValue = JSON.stringify(argValueAny);
            } catch {
              argValue = String(argValueAny);
            }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'Text':
          argValue = await services.interpolate([arg], env, InterpolationContext.Default);
          argValueAny = argValue;
          break;
        default:
          argValue = await services.interpolate([arg], env, InterpolationContext.Default);
          try {
            argValueAny = JSON.parse(argValue);
          } catch {
            argValueAny = argValue;
          }
          break;
      }
    } else {
      argValue = String(arg);
      argValueAny = arg;
    }

    evaluatedArgStrings.push(argValue);
    evaluatedArgs.push(argValueAny);
  }

  return {
    evaluatedArgStrings,
    evaluatedArgs
  };
}
