import { sha256 } from '@disreguard/sig';
import type { FileVerifyResult } from '@core/security';
import type { LoadContentResult } from '@core/types/load-content';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { labelsForPath } from '@core/security/paths';
import { getAuditFileDescriptor } from '@core/security/AuditLogIndex';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import type { StructuredValueMetadata } from '../../utils/structured-value';

function extractCustomLabels(taint: readonly string[]): string[] {
  return taint
    .map((label) => String(label).trim())
    .filter((label) => label.length > 0 && !label.startsWith('src:') && !label.startsWith('dir:'));
}

function buildSigMetadataDescriptor(
  verifyResult?: FileVerifyResult
): SecurityDescriptor | undefined {
  const taint = Array.isArray(verifyResult?.metadata?.taint)
    ? verifyResult.metadata.taint.map(String).filter(Boolean)
    : [];

  if (taint.length === 0) {
    return undefined;
  }

  return makeSecurityDescriptor({
    labels: extractCustomLabels(taint),
    taint,
    ...(verifyResult?.signer ? { sources: [verifyResult.signer] } : {})
  });
}

export class ContentLoaderSecurityMetadataHelper {
  async verifyFileIntegrity(
    filePath: string,
    rawContent: string,
    env: Environment
  ): Promise<FileVerifyResult | undefined> {
    const sigService = env.getSigService();
    if (!sigService || sigService.isExcluded(filePath)) {
      return undefined;
    }

    return await sigService.verifyHash(filePath, sha256(rawContent));
  }

  async buildFileSecurityDescriptor(
    filePath: string,
    env: Environment,
    policyEnforcer: PolicyEnforcer,
    verifyResult?: FileVerifyResult
  ): Promise<SecurityDescriptor> {
    const fileDescriptor = makeSecurityDescriptor({
      taint: ['src:file', ...labelsForPath(filePath)],
      sources: [filePath]
    });
    const sigDescriptor = buildSigMetadataDescriptor(verifyResult);
    const inheritedDescriptor = sigDescriptor
      ? sigDescriptor
      : await getAuditFileDescriptor(env.getFileSystemService(), env.getProjectRoot(), filePath);
    const mergedDescriptor = inheritedDescriptor
      ? mergeDescriptors(fileDescriptor, inheritedDescriptor)
      : fileDescriptor;
    return policyEnforcer.applyDefaultTrustLabel(mergedDescriptor) ?? mergedDescriptor;
  }

  attachSecurity<T extends LoadContentResult>(
    result: T,
    descriptor: SecurityDescriptor,
    verifyResult?: FileVerifyResult
  ): T {
    (result as { __security?: SecurityDescriptor; __sig?: FileVerifyResult }).__security = descriptor;
    if (verifyResult) {
      (result as { __security?: SecurityDescriptor; __sig?: FileVerifyResult }).__sig = verifyResult;
    }
    return result;
  }

  toFinalizationMetadata(
    descriptor: SecurityDescriptor,
    verifyResult?: FileVerifyResult
  ): StructuredValueMetadata {
    return {
      security: descriptor,
      ...(verifyResult ? { sig: verifyResult } : {})
    };
  }
}
