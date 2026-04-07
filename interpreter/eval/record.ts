import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { createRecordVariable, type VariableSource } from '@core/types/variable';
import type { RecordDirectiveNode } from '@core/types/record';
import { MlldInterpreterError } from '@core/errors';
import { buildRecordDefinitionFromDirective } from '@core/validation/record-definition';

export async function evaluateRecord(
  directive: RecordDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const { definition, issues } = buildRecordDefinitionFromDirective(directive, {
    filePath: env.getCurrentFilePath()
  });

  if (!definition) {
    const firstIssue = issues[0];
    throw new MlldInterpreterError(
      firstIssue?.message ?? 'Invalid record definition',
      'record',
      firstIssue?.location,
      {
        code: firstIssue?.code ?? 'INVALID_RECORD'
      }
    );
  }

  env.registerRecordDefinition(definition.name, definition);
  const source: VariableSource = {
    directive: 'var',
    syntax: 'object',
    hasInterpolation: false,
    isMultiLine: true
  };
  env.setVariable(definition.name, createRecordVariable(definition.name, definition, source, {
    internal: {
      recordDefinition: definition
    }
  }));

  return {
    value: definition,
    env
  };
}
