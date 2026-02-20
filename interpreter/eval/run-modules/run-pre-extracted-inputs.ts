import type { SecurityDescriptor } from '@core/types/security';
import type { ExecutableVariable } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';

export type PreExtractedRunStdin = {
  text: string;
  descriptor?: SecurityDescriptor;
};

type ExtractedInputRecord = Record<string, unknown> & { name?: unknown; value?: unknown; mx?: unknown };

function listExtractedInputs(context?: EvaluationContext): ExtractedInputRecord[] {
  if (!context?.extractedInputs || context.extractedInputs.length === 0) {
    return [];
  }
  return context.extractedInputs as ExtractedInputRecord[];
}

function findNamedInput(context: EvaluationContext | undefined, targetName: string): ExtractedInputRecord | undefined {
  const extractedInputs = listExtractedInputs(context);
  for (const input of extractedInputs) {
    if (input && typeof input === 'object' && input.name === targetName) {
      return input;
    }
  }
  return undefined;
}

export function getPreExtractedRunCommand(context?: EvaluationContext): string | undefined {
  const input = findNamedInput(context, '__run_command__');
  return input && typeof input.value === 'string' ? input.value : undefined;
}

export function getPreExtractedRunDescriptor(
  context?: EvaluationContext
): SecurityDescriptor | undefined {
  const input = findNamedInput(context, '__run_command__');
  return input?.mx ? varMxToSecurityDescriptor(input.mx) : undefined;
}

export function getPreExtractedRunStdin(
  context?: EvaluationContext
): PreExtractedRunStdin | undefined {
  const input = findNamedInput(context, '__run_stdin__');
  if (!input || typeof input.value !== 'string') {
    return undefined;
  }

  return {
    text: input.value,
    descriptor: input.mx ? varMxToSecurityDescriptor(input.mx) : undefined
  };
}

export function getPreExtractedExec(
  context: EvaluationContext | undefined,
  name: string
): ExecutableVariable | undefined {
  const extractedInputs = listExtractedInputs(context);
  for (const input of extractedInputs) {
    if (
      input &&
      typeof input === 'object' &&
      (input as Variable).name === name &&
      (input as Variable).type === 'executable'
    ) {
      return input as ExecutableVariable;
    }
  }

  return undefined;
}
