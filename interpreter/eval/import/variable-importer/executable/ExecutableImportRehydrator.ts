import { createExecutableVariable, VariableMetadataUtils } from '@core/types/variable';
import { markExecutableDefinition } from '@core/types/executable';
import type { DataLabel } from '@core/types/security';
import type { ExecutableVariable, Variable, VariableMetadata, VariableSource } from '@core/types/variable';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { CapturedEnvRehydrator, type CapturedEnvVariableFactory } from './CapturedEnvRehydrator';
import { getCapturedModuleEnv } from './CapturedModuleEnvKeychain';
import type { Environment } from '@interpreter/env/Environment';

export interface ExecutableImportRehydrationRequest {
  name: string;
  value: any;
  source: VariableSource;
  metadata: VariableMetadata;
  securityLabels?: DataLabel[];
  env?: Environment;
  createVariableFromValue: CapturedEnvVariableFactory;
}

export class ExecutableImportRehydrator {
  constructor(private readonly capturedEnvRehydrator: CapturedEnvRehydrator) {}

  private getEmbeddedSecurityDescriptor(value: any): SecurityDescriptor | undefined {
    if (value?.mx) {
      return varMxToSecurityDescriptor(value.mx);
    }
    return value?.metadata?.security as SecurityDescriptor | undefined;
  }

  create(request: ExecutableImportRehydrationRequest): ExecutableVariable {
    const rawExecutableDef = request.value.executableDef ?? request.value.value;
    const executableDef = rawExecutableDef
      ? markExecutableDefinition(rawExecutableDef)
      : rawExecutableDef;
    const paramNames = executableDef?.paramNames || [];
    let originalInternal = request.value.internal || request.value.metadata || {};
    const originalCapturedModuleEnv = getCapturedModuleEnv(originalInternal);

    if (originalInternal.capturedShadowEnvs) {
      originalInternal = {
        ...originalInternal,
        capturedShadowEnvs: this.capturedEnvRehydrator.deserializeShadowEnvs(originalInternal.capturedShadowEnvs)
      };
    }

    if (originalCapturedModuleEnv !== undefined) {
      originalInternal = {
        ...originalInternal,
        capturedModuleEnv: originalCapturedModuleEnv
      };
    }

    const capturedModuleEnv = getCapturedModuleEnv(originalInternal);
    if (capturedModuleEnv instanceof Map) {
      this.capturedEnvRehydrator.rehydrateNestedCapturedModuleScope(
        capturedModuleEnv,
        new WeakMap<object, Map<string, Variable>>(),
        request.createVariableFromValue,
        request.env
      );
    }

    const enhancedMetadata = {
      ...request.metadata,
      isImported: true,
      importPath: request.metadata.importPath
    };
    const embeddedDescriptor = this.getEmbeddedSecurityDescriptor(request.value);
    const existingDescriptor =
      enhancedMetadata.security && embeddedDescriptor
        ? mergeDescriptors(enhancedMetadata.security as SecurityDescriptor, embeddedDescriptor)
        : (enhancedMetadata.security as SecurityDescriptor | undefined) ?? embeddedDescriptor;

    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(enhancedMetadata, {
      labels: request.securityLabels,
      existingDescriptor
    });

    const finalInternal = {
      ...(originalInternal as Record<string, unknown>),
      executableDef
    };

    return createExecutableVariable(
      request.name,
      'command',
      '',
      paramNames,
      undefined,
      request.source,
      {
        metadata: finalMetadata,
        internal: finalInternal
      }
    );
  }
}
