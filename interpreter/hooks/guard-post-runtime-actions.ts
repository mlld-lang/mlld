import { astLocationToSourceLocation } from '@core/types';
import type { GuardActionNode, GuardBlockNode } from '@core/types/guard';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { MlldWhenExpressionError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { GuardContextSnapshot } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { evaluate } from '../core/interpreter';
import { VariableImporter } from '../eval/import/VariableImporter';
import { evaluateCondition } from '../eval/when';
import { extractVariableValue, isVariable } from '../utils/variable-resolution';
import { combineValues } from '../utils/value-combine';
import { materializeGuardTransform } from '../utils/guard-transform';
import {
  applyGuardLabelModifications,
  extractGuardLabelModifications
} from './guard-utils';

export interface BuildPostDecisionMetadataExtras {
  hint?: string | null;
  inputPreview?: string | null;
  inputVariable?: Variable;
  contextSnapshot?: GuardContextSnapshot;
}

function isRawPrimitiveValue(value: unknown): boolean {
  return value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && !('type' in (value as any)));
}

function unwrapAssignmentValue(value: unknown): {
  firstValue: unknown;
  isRawPrimitive: boolean;
} {
  const firstValue = Array.isArray(value) && value.length > 0 ? value[0] : value;
  return {
    firstValue,
    isRawPrimitive: isRawPrimitiveValue(firstValue)
  };
}

export async function evaluatePostGuardBlock(
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

export interface PostGuardReplacementDependencies {
  cloneVariableWithDescriptor: (
    variable: Variable,
    descriptor: SecurityDescriptor
  ) => Variable;
}

export async function evaluatePostGuardReplacement(
  action: GuardActionNode | undefined,
  guardEnv: Environment,
  guard: GuardDefinition,
  inputVariable: Variable,
  dependencies: PostGuardReplacementDependencies
): Promise<Variable | undefined> {
  if (!action || action.decision !== 'allow') {
    return undefined;
  }

  const labelModifications = extractGuardLabelModifications(action);
  const baseDescriptor = inputVariable.mx
    ? varMxToSecurityDescriptor(inputVariable.mx)
    : makeSecurityDescriptor();
  const modifiedDescriptor = applyGuardLabelModifications(
    baseDescriptor,
    labelModifications,
    guard
  );
  const guardLabel = guard.name ?? guard.filterValue ?? 'guard';

  if (action.value && action.value.length > 0) {
    const result = await evaluate(action.value, guardEnv, {
      privileged: guard.privileged === true
    });
    let value = result?.value ?? result;
    if (isVariable(value as Variable)) {
      value = (value as Variable).value;
    }
    return materializeGuardTransform(value, guardLabel, modifiedDescriptor);
  }

  if (!labelModifications) {
    return undefined;
  }

  const guardDescriptor = mergeDescriptors(
    modifiedDescriptor,
    makeSecurityDescriptor({ sources: [`guard:${guardLabel}`] })
  );
  return dependencies.cloneVariableWithDescriptor(inputVariable, guardDescriptor);
}

export function buildPostDecisionMetadata(
  action: GuardActionNode,
  guard: GuardDefinition,
  extras?: BuildPostDecisionMetadataExtras
): Record<string, unknown> {
  const guardId = guard.name ?? `${guard.filterKind}:${guard.filterValue}`;
  const reason =
    action.message ??
    (action.decision === 'deny'
      ? `Guard ${guardId} denied operation`
      : `Guard ${guardId} requested retry`);

  const metadata: Record<string, unknown> = {
    reason,
    guardName: guard.name ?? null,
    guardFilter: `${guard.filterKind}:${guard.filterValue}`,
    scope: guard.scope,
    decision: action.decision,
    timing: 'after'
  };

  if (extras?.hint !== undefined) {
    metadata.hint = extras.hint;
  }

  if (extras?.inputPreview !== undefined) {
    metadata.inputPreview = extras.inputPreview;
  }

  if (extras?.inputVariable) {
    metadata.guardInput = extras.inputVariable;
  }

  if (extras?.contextSnapshot) {
    metadata.guardContext = extras.contextSnapshot;
  }

  return metadata;
}
