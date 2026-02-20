import { astLocationToSourceLocation } from '@core/types';
import type { GuardActionNode, GuardBlockNode } from '@core/types/guard';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { MlldWhenExpressionError } from '@core/errors';
import { evaluate } from '../core/interpreter';
import type { Environment } from '../env/Environment';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluateCondition } from '../eval/when';
import { extractVariableValue } from '../utils/variable-resolution';
import { combineValues } from '../utils/value-combine';

function isRawPrimitiveValue(value: unknown): boolean {
  return value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && !('type' in (value as any)));
}

function unwrapAssignmentValue(value: unknown): unknown {
  const firstValue = Array.isArray(value) && value.length > 0 ? value[0] : value;
  return {
    firstValue,
    isRawPrimitive: isRawPrimitiveValue(firstValue)
  };
}

export async function evaluateGuardBlock(
  block: GuardBlockNode,
  guardEnv: Environment
): Promise<GuardActionNode | undefined> {
  let currentEnv = guardEnv;

  for (const entry of block.rules) {
    if (isLetAssignment(entry)) {
      let value: unknown;
      const { firstValue, isRawPrimitive } = unwrapAssignmentValue(entry.value);

      if (isRawPrimitive) {
        value = (entry.value as any[]).length === 1 ? firstValue : entry.value;
      } else {
        const valueResult = await evaluate(entry.value, currentEnv);
        value = valueResult.value;
      }

      const importer = new VariableImporter();
      const variable = importer.createVariableFromValue(
        entry.identifier,
        value,
        'let',
        undefined,
        { env: currentEnv }
      );
      currentEnv = currentEnv.createChild();
      currentEnv.setVariable(entry.identifier, variable);
      continue;
    }

    if (isAugmentedAssignment(entry)) {
      const existing = currentEnv.getVariable(entry.identifier);
      if (!existing) {
        const location = astLocationToSourceLocation(entry.location, currentEnv.getCurrentFilePath());
        throw new MlldWhenExpressionError(
          `Cannot use += on undefined variable @${entry.identifier}. ` +
          `Use "let @${entry.identifier} = ..." first.`,
          location,
          location?.filePath ? { filePath: location.filePath, sourceContent: currentEnv.getSource(location.filePath) } : undefined,
          { env: currentEnv }
        );
      }

      let rhsValue: unknown;
      const { firstValue, isRawPrimitive } = unwrapAssignmentValue(entry.value);

      if (isRawPrimitive) {
        rhsValue = (entry.value as any[]).length === 1 ? firstValue : entry.value;
      } else {
        const rhsResult = await evaluate(entry.value, currentEnv);
        rhsValue = rhsResult.value;
      }

      const existingValue = await extractVariableValue(existing, currentEnv);
      const combined = combineValues(existingValue, rhsValue, entry.identifier);

      const importer = new VariableImporter();
      const updatedVar = importer.createVariableFromValue(
        entry.identifier,
        combined,
        'let',
        undefined,
        { env: currentEnv }
      );
      currentEnv.updateVariable(entry.identifier, updatedVar);
      continue;
    }

    const rule = entry;
    let matches = false;
    if (rule.isWildcard) {
      matches = true;
    } else if (rule.condition && rule.condition.length > 0) {
      matches = await evaluateCondition(rule.condition, currentEnv);
    }

    if (matches) {
      return rule.action;
    }
  }

  return undefined;
}
