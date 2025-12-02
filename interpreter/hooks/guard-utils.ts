import type { Environment } from '@interpreter/env/Environment';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';

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
