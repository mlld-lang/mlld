import { createExecutableVariable, VariableMetadataUtils } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import type { ExecutableVariable, Variable, VariableMetadata, VariableSource } from '@core/types/variable';
import { CapturedEnvRehydrator, type CapturedEnvVariableFactory } from './CapturedEnvRehydrator';

export interface ExecutableImportRehydrationRequest {
  name: string;
  value: any;
  source: VariableSource;
  metadata: VariableMetadata;
  securityLabels?: DataLabel[];
  createVariableFromValue: CapturedEnvVariableFactory;
}

export class ExecutableImportRehydrator {
  constructor(private readonly capturedEnvRehydrator: CapturedEnvRehydrator) {}

  create(request: ExecutableImportRehydrationRequest): ExecutableVariable {
    const executableDef = request.value.executableDef;
    const paramNames = executableDef?.paramNames || [];
    let originalInternal = request.value.internal || request.value.metadata || {};

    if (originalInternal.capturedShadowEnvs) {
      originalInternal = {
        ...originalInternal,
        capturedShadowEnvs: this.capturedEnvRehydrator.deserializeShadowEnvs(originalInternal.capturedShadowEnvs)
      };
    }

    if (originalInternal.capturedModuleEnv) {
      const deserializedEnv = this.capturedEnvRehydrator.deserializeModuleEnv(
        originalInternal.capturedModuleEnv,
        request.createVariableFromValue
      );
      this.capturedEnvRehydrator.rehydrateCapturedModuleScope(deserializedEnv);

      originalInternal = {
        ...originalInternal,
        capturedModuleEnv: deserializedEnv
      };
    }

    const enhancedMetadata = {
      ...request.metadata,
      isImported: true,
      importPath: request.metadata.importPath
    };

    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(enhancedMetadata, {
      labels: request.securityLabels,
      existingDescriptor: enhancedMetadata.security
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
