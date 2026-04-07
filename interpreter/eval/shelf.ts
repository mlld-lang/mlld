import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { ShelfDirectiveNode } from '@core/types/shelf';
import { MlldInterpreterError } from '@core/errors';
import { createShelfVariable } from '@interpreter/shelf/runtime';
import { buildShelfDefinitionFromDirective } from '@core/validation/shelf-definition';

export async function evaluateShelf(
  directive: ShelfDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const referencedRecordNames = Array.from(
    new Set((directive.values?.slots ?? []).map(slot => slot.record))
  );
  const records = new Map(
    referencedRecordNames
      .map(recordName => [recordName, env.getRecordDefinition(recordName)] as const)
      .filter((entry): entry is [string, NonNullable<ReturnType<Environment['getRecordDefinition']>>] => Boolean(entry[1]))
  );

  const { definition, issues } = buildShelfDefinitionFromDirective(directive, {
    filePath: env.getCurrentFilePath(),
    records
  });

  if (!definition) {
    const firstIssue = issues[0];
    throw new MlldInterpreterError(
      firstIssue?.message ?? 'Invalid shelf definition',
      'shelf',
      firstIssue?.location,
      {
        code: firstIssue?.code ?? 'INVALID_SHELF'
      }
    );
  }

  env.registerShelfDefinition(definition.name, definition);
  env.setVariable(definition.name, createShelfVariable(env, definition));

  return {
    value: definition,
    env
  };
}
