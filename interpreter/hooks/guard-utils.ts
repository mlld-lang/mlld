import type { Environment } from '@interpreter/env/Environment';
import type { GuardActionNode, GuardLabelModifications } from '@core/types/guard';
import type { GuardDefinition } from '@interpreter/guards';
import { MlldSecurityError } from '@core/errors';
import {
  makeSecurityDescriptor,
  type SecurityDescriptor,
  isProtectedLabel
} from '@core/types/security';

export function guardSnapshotDescriptor(env: Environment): SecurityDescriptor | undefined {
  const snapshot = env.getSecuritySnapshot?.();
  if (!snapshot) {
    return undefined;
  }
  return makeSecurityDescriptor({
    labels: snapshot.labels,
    taint: snapshot.taint,
    sources: snapshot.sources,
    policyContext: snapshot.policy
  });
}

export function extractGuardLabelModifications(
  action: GuardActionNode | undefined
): GuardLabelModifications | undefined {
  if (!action) {
    return undefined;
  }
  const addLabels = Array.isArray(action.addLabels) ? action.addLabels : undefined;
  const removeLabels = Array.isArray(action.removeLabels) ? action.removeLabels : undefined;
  if ((addLabels?.length ?? 0) === 0 && (removeLabels?.length ?? 0) === 0) {
    return undefined;
  }
  return {
    addLabels: addLabels && addLabels.length > 0 ? [...addLabels] : undefined,
    removeLabels: removeLabels && removeLabels.length > 0 ? [...removeLabels] : undefined
  };
}

export function applyGuardLabelModifications(
  descriptor: SecurityDescriptor,
  modifications: GuardLabelModifications | undefined,
  guard: GuardDefinition
): SecurityDescriptor {
  if (!modifications) {
    return descriptor;
  }

  const removeLabels = modifications.removeLabels ?? [];
  if (removeLabels.length > 0 && guard.privileged !== true) {
    const guardLabel = guard.name ?? guard.filterValue ?? 'guard';
    const protectedLabel = removeLabels.find(label => isProtectedLabel(label));
    if (protectedLabel) {
      throw new MlldSecurityError(
        `Guard ${guardLabel} cannot remove protected label '${protectedLabel}'`,
        {
          code: 'PROTECTED_LABEL_REMOVAL',
          details: { label: protectedLabel, guard: guardLabel }
        }
      );
    }
    throw new MlldSecurityError(
      `Guard ${guardLabel} cannot remove labels without privilege`,
      {
        code: 'LABEL_PRIVILEGE_REQUIRED',
        details: { labels: removeLabels, guard: guardLabel }
      }
    );
  }

  if ((modifications.addLabels?.length ?? 0) === 0 && removeLabels.length === 0) {
    return descriptor;
  }

  const labelSet = new Set(descriptor.labels);
  const taintSet = new Set(descriptor.taint);

  for (const label of removeLabels) {
    labelSet.delete(label);
    taintSet.delete(label);
  }

  if (modifications.addLabels) {
    for (const label of modifications.addLabels) {
      labelSet.add(label);
      taintSet.add(label);
    }
  }

  const policyContext = descriptor.policyContext ? { ...descriptor.policyContext } : undefined;
  return makeSecurityDescriptor({
    labels: Array.from(labelSet),
    taint: Array.from(taintSet),
    sources: descriptor.sources,
    capability: descriptor.capability,
    policyContext
  });
}
