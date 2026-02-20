import type { Environment } from '@interpreter/env/Environment';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { isStructuredValue } from '@interpreter/utils/structured-value';

export class PipelineCommandArgumentBinder {
  async processArguments(args: any[], env: Environment): Promise<any[]> {
    const evaluatedArgs: any[] = [];

    for (const arg of args) {
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
        evaluatedArgs.push(arg);
        continue;
      }

      if (arg && typeof arg === 'object') {
        const evaluatedArg = await this.evaluateArgumentNode(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }
    }

    return evaluatedArgs;
  }

  async bindParametersAutomatically(
    commandVar: any,
    input: string,
    structuredInput?: StructuredValue
  ): Promise<any[]> {
    const paramNames = this.getParameterNames(commandVar);
    if (!paramNames || paramNames.length === 0) {
      return [];
    }

    const { AutoUnwrapManager } = await import('@interpreter/eval/auto-unwrap-manager');
    const unwrappedOutput = AutoUnwrapManager.unwrap(input);

    if (paramNames.length === 1) {
      if (structuredInput && isStructuredValue(structuredInput)) {
        return [structuredInput];
      }
      return [{ type: 'Text', content: unwrappedOutput }];
    }

    try {
      const parsed = JSON.parse(unwrappedOutput);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return paramNames.map(name => ({
          type: 'Text',
          content:
            (parsed as Record<string, unknown>)[name] !== undefined
              ? (typeof (parsed as Record<string, unknown>)[name] === 'string'
                  ? (parsed as Record<string, unknown>)[name]
                  : JSON.stringify((parsed as Record<string, unknown>)[name]))
              : ''
        }));
      }
    } catch {
      // Non-JSON input binds to the first parameter only.
    }

    return [{ type: 'Text', content: unwrappedOutput }];
  }

  private async evaluateArgumentNode(arg: any, env: Environment): Promise<any> {
    if (arg.type === 'VariableReference') {
      const variable = env.getVariable(arg.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${arg.identifier}`);
      }

      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      let value = await resolveVariable(variable, env, ResolutionContext.PipelineInput);

      if (arg.fields && arg.fields.length > 0) {
        const { accessFields } = await import('@interpreter/utils/field-access');
        const fieldResult = await accessFields(value, arg.fields, {
          preserveContext: false,
          sourceLocation: (arg as any)?.location,
          env
        });
        value = fieldResult;
      }

      return value;
    }

    const { interpolate } = await import('@interpreter/core/interpreter');
    const value = await interpolate([arg], env);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private getParameterNames(commandVar: any): string[] | undefined {
    if (commandVar && commandVar.type === 'executable' && commandVar.value) {
      return commandVar.value.paramNames;
    }
    if (commandVar && commandVar.paramNames) {
      return commandVar.paramNames;
    }
    return undefined;
  }
}
