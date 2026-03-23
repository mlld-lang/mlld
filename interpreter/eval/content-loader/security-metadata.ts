import { sha256 } from '@disreguard/sig';
import type { FileVerifyResult } from '@core/security';
import {
  getSigStatusAliases,
  toSigStatusEntry,
  verifyPatternStatuses
} from '@core/security/file-status';
import type { LoadContentResult } from '@core/types/load-content';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { labelsForPath } from '@core/security/paths';
import { getAuditFileDescriptor } from '@core/security/AuditLogIndex';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { resolveSignerLabels } from '@interpreter/policy/signer-labels';
import type { StructuredValueMetadata } from '../../utils/structured-value';

function isTrustLabel(label: string): boolean {
  return label === 'trusted' || label === 'untrusted';
}

function extractCustomLabels(taint: readonly string[]): string[] {
  return taint
    .map((label) => String(label).trim())
    .filter(
      (label) =>
        label.length > 0 &&
        !isTrustLabel(label) &&
        !label.startsWith('src:') &&
        !label.startsWith('dir:')
    );
}

function sanitizeInheritedDescriptor(
  descriptor?: SecurityDescriptor
): SecurityDescriptor | undefined {
  if (!descriptor) {
    return undefined;
  }

  const labels = descriptor.labels.filter((label) => !isTrustLabel(label));
  const taint = descriptor.taint.filter((label) => !isTrustLabel(label));
  return makeSecurityDescriptor({
    labels,
    taint,
    sources: descriptor.sources,
    tools: descriptor.tools
  });
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
    taint: taint.filter((label) => !isTrustLabel(label)),
    ...(verifyResult?.signer ? { sources: [verifyResult.signer] } : {})
  });
}

function buildTrustDescriptor(
  env: Environment,
  verifyResult?: FileVerifyResult
): SecurityDescriptor | undefined {
  const policy = env.getPolicySummary();
  const labels = resolveSignerLabels(
    verifyResult?.signer ?? null,
    verifyResult?.status ?? 'unsigned',
    policy?.signers,
    policy?.defaults?.unlabeled
  );

  return labels.length > 0 ? makeSecurityDescriptor({ labels }) : undefined;
}

function registerSigContext(
  env: Environment,
  verifyResult: FileVerifyResult
): void {
  const sigService = env.getSigService();
  if (!sigService) {
    return;
  }

  const contextManager = env.getContextManager();
  const entry = toSigStatusEntry(verifyResult, env.getPolicySummary());
  contextManager.recordSigStatus(getSigStatusAliases(entry), entry);
  contextManager.setSigFilesResolver(async (pattern: string) => {
    const entries = await verifyPatternStatuses({
      sigService,
      fileSystem: env.getFileSystemService(),
      projectRoot: env.getProjectRoot(),
      policy: env.getPolicySummary(),
      pattern,
      basePath: env.getFileDirectory()
    });

    for (const nextEntry of entries) {
      contextManager.recordSigStatus(getSigStatusAliases(nextEntry), nextEntry);
    }

    return entries;
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

    const verifyResult = await sigService.verifyHash(filePath, sha256(rawContent));
    registerSigContext(env, verifyResult);
    return verifyResult;
  }

  async buildFileSecurityDescriptor(
    filePath: string,
    env: Environment,
    _policyEnforcer: PolicyEnforcer,
    verifyResult?: FileVerifyResult
  ): Promise<SecurityDescriptor> {
    const fileDescriptor = makeSecurityDescriptor({
      taint: ['src:file', ...labelsForPath(filePath)],
      sources: [filePath]
    });
    const sigDescriptor = sanitizeInheritedDescriptor(buildSigMetadataDescriptor(verifyResult));
    const auditDescriptor = sigDescriptor
      ? undefined
      : sanitizeInheritedDescriptor(
          await getAuditFileDescriptor(env.getFileSystemService(), env.getProjectRoot(), filePath)
        );
    const trustDescriptor = buildTrustDescriptor(env, verifyResult);

    return mergeDescriptors(
      fileDescriptor,
      sigDescriptor,
      auditDescriptor,
      trustDescriptor
    );
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
