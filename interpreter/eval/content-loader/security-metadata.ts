import type { LoadContentResult } from '@core/types/load-content';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { labelsForPath } from '@core/security/paths';
import { getAuditFileDescriptor } from '@core/security/AuditLogIndex';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import type { StructuredValueMetadata } from '../../utils/structured-value';

export class ContentLoaderSecurityMetadataHelper {
  async buildFileSecurityDescriptor(
    filePath: string,
    env: Environment,
    policyEnforcer: PolicyEnforcer
  ): Promise<SecurityDescriptor> {
    const fileDescriptor = makeSecurityDescriptor({
      taint: ['src:file', ...labelsForPath(filePath)],
      sources: [filePath]
    });
    const auditDescriptor = await getAuditFileDescriptor(
      env.getFileSystemService(),
      env.getProjectRoot(),
      filePath
    );
    const mergedDescriptor = auditDescriptor
      ? mergeDescriptors(fileDescriptor, auditDescriptor)
      : fileDescriptor;
    return policyEnforcer.applyDefaultTrustLabel(mergedDescriptor) ?? mergedDescriptor;
  }

  attachSecurity<T extends LoadContentResult>(result: T, descriptor: SecurityDescriptor): T {
    (result as { __security?: SecurityDescriptor }).__security = descriptor;
    return result;
  }

  toFinalizationMetadata(descriptor: SecurityDescriptor): StructuredValueMetadata {
    return { security: descriptor };
  }
}
