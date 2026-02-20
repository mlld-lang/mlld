import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { DataLabel } from '@core/types/security';
import {
  VariableMetadataUtils,
  type VariableMetadata,
  type VariableSource
} from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import type { ImportVariableMetadataContext } from './types';

export interface ImportVariableFactoryOptions {
  securityLabels?: DataLabel[];
  serializedMetadata?: ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined;
  env?: Environment;
}

export class ImportVariableMetadataBuilder {
  build(
    name: string,
    value: any,
    importPath: string,
    originalName?: string,
    options?: ImportVariableFactoryOptions
  ): ImportVariableMetadataContext {
    const source: VariableSource = {
      directive: 'var',
      syntax: Array.isArray(value)
        ? 'array'
        : (value && typeof value === 'object')
          ? 'object'
          : 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };

    const deserialized = VariableMetadataUtils.deserializeSecurityMetadata(options?.serializedMetadata);
    const snapshot = options?.env?.getSecuritySnapshot?.();
    const snapshotDescriptor = snapshot
      ? makeSecurityDescriptor({
          labels: snapshot.labels,
          taint: snapshot.taint,
          sources: snapshot.sources,
          policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
        })
      : undefined;
    let combinedDescriptor = deserialized.security;
    if (snapshotDescriptor) {
      combinedDescriptor = combinedDescriptor
        ? mergeDescriptors(combinedDescriptor, snapshotDescriptor)
        : snapshotDescriptor;
    }

    const baseMetadata = {
      isImported: true,
      importPath,
      originalName: originalName !== name ? originalName : undefined,
      definedAt: { line: 0, column: 0, filePath: importPath },
      ...deserialized
    };
    const initialMetadata = VariableMetadataUtils.applySecurityMetadata(baseMetadata, {
      labels: options?.securityLabels,
      existingDescriptor: combinedDescriptor
    });
    const buildMetadata = (extra?: VariableMetadata): VariableMetadata =>
      VariableMetadataUtils.applySecurityMetadata(
        {
          ...initialMetadata,
          ...(extra || {})
        },
        {
          labels: options?.securityLabels,
          existingDescriptor: initialMetadata.security
        }
      );

    return {
      source,
      securityLabels: options?.securityLabels,
      buildMetadata
    };
  }
}
