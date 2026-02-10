import type { Environment } from '@interpreter/env/Environment';
import type { StructuredValue } from '@interpreter/utils/structured-value';

export type FinalizeResult = (
  value: unknown,
  options?: { type?: string; text?: string }
) => unknown;

export type ExecuteCommandVariableFn = (
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string,
  structuredInput?: StructuredValue,
  hookOptions?: unknown
) => Promise<unknown>;

export interface ExecuteCommandRefHandlerOptions {
  env: Environment;
  execEnv: Environment;
  execDef: any;
  stdinInput?: string;
  structuredInput?: StructuredValue;
  hookOptions?: unknown;
  finalizeResult: FinalizeResult;
  executeCommandVariable: ExecuteCommandVariableFn;
}

export async function executeCommandRefHandler(
  options: ExecuteCommandRefHandlerOptions
): Promise<unknown> {
  const {
    env,
    execEnv,
    execDef,
    stdinInput,
    structuredInput,
    hookOptions,
    finalizeResult,
    executeCommandVariable
  } = options;

  const refAst = execDef.commandRefAst;
  if (refAst) {
    const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
    const baseInvocation =
      (refAst as any).type === 'ExecInvocation'
        ? refAst
        : {
            type: 'ExecInvocation',
            commandRef: refAst
          };
    const refInvocation = execDef.withClause ? { ...baseInvocation, withClause: execDef.withClause } : baseInvocation;
    const result = await evaluateExecInvocation(refInvocation as any, execEnv);
    return finalizeResult(result.value);
  }

  const refRaw = execDef.commandRef || '';
  const refName = String(refRaw);
  const fromParamScope = execEnv.getVariable(refName);

  if (fromParamScope) {
    if ((fromParamScope as any).type === 'executable') {
      return executeCommandVariable(
        fromParamScope as any,
        execDef.commandArgs ?? [],
        execEnv,
        stdinInput,
        structuredInput,
        hookOptions
      );
    }
    const t = (fromParamScope as any).type;
    throw new Error(
      `Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable (e.g., \`@${refName}\`) or refactor the definition.`
    );
  }

  const refVar = env.getVariable(refName);
  if (!refVar) {
    throw new Error(`Referenced executable not found: ${execDef.commandRef}`);
  }

  if ((refVar as any).type === 'executable') {
    return executeCommandVariable(
      refVar as any,
      execDef.commandArgs ?? [],
      env,
      stdinInput,
      structuredInput,
      hookOptions
    );
  }

  const t = (refVar as any).type;
  throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable or a function.`);
}
