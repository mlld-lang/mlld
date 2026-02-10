import type { Environment } from '@interpreter/env/Environment';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import type { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import {
  type ExecutableVariable,
  type TemplateVariable,
  type Variable,
  type VariableMetadata,
  VariableMetadataUtils
} from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';

type SerializedMetadata = ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;

interface ModuleExportSerializationContext {
  childVars: Map<string, Variable>;
  options?: { resolveStrings?: boolean };
  shouldSerializeModuleEnv: boolean;
  currentSerializationTarget?: Map<string, Variable>;
  serializingEnvs?: WeakSet<object>;
  getModuleEnvSnapshot: () => Map<string, Variable>;
  serializeShadowEnvs: (envs: any) => any;
  serializeModuleEnv: (moduleEnv: Map<string, Variable>, seen?: WeakSet<object>) => any;
}

export interface ModuleExportSerializationRequest {
  childVars: Map<string, Variable>;
  explicitExports: Set<string> | null;
  childEnv?: Environment;
  options?: { resolveStrings?: boolean };
  skipModuleEnvSerialization?: boolean;
  currentSerializationTarget?: Map<string, Variable>;
  serializingEnvs?: WeakSet<object>;
  isLegitimateVariableForExport: (variable: Variable) => boolean;
  serializeShadowEnvs: (envs: any) => any;
  serializeModuleEnv: (moduleEnv: Map<string, Variable>, seen?: WeakSet<object>) => any;
}

export interface ModuleExportSerializationResult {
  moduleObject: Record<string, any>;
}

export class ModuleExportSerializer {
  constructor(private readonly objectResolver: ObjectReferenceResolver) {}

  serialize(request: ModuleExportSerializationRequest): ModuleExportSerializationResult {
    const moduleObject: Record<string, any> = {};
    const serializedMetadataMap: Record<string, SerializedMetadata> = {};
    const shouldSerializeModuleEnv = !request.skipModuleEnvSerialization;
    let moduleEnvSnapshot: Map<string, Variable> | null = null;
    const getModuleEnvSnapshot = (): Map<string, Variable> => {
      if (!moduleEnvSnapshot) {
        moduleEnvSnapshot = new Map(request.childVars);
      }
      return moduleEnvSnapshot;
    };

    const envDescriptor = this.getEnvironmentDescriptor(request.childEnv);
    const context: ModuleExportSerializationContext = {
      childVars: request.childVars,
      options: request.options,
      shouldSerializeModuleEnv,
      currentSerializationTarget: request.currentSerializationTarget,
      serializingEnvs: request.serializingEnvs,
      getModuleEnvSnapshot,
      serializeShadowEnvs: request.serializeShadowEnvs,
      serializeModuleEnv: request.serializeModuleEnv
    };

    for (const [name, variable] of request.childVars) {
      if (request.explicitExports && !request.explicitExports.has(name)) {
        continue;
      }

      if (!request.isLegitimateVariableForExport(variable)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log(`[processModuleExports] Skipping non-legitimate variable '${name}' with type: ${variable.type}`);
        }
        continue;
      }

      moduleObject[name] = this.serializeVariable(name, variable, context);
      const serializedMetadata = this.serializeVariableMetadata(variable, envDescriptor);
      if (serializedMetadata) {
        serializedMetadataMap[name] = serializedMetadata;
      }
    }

    if (Object.keys(serializedMetadataMap).length > 0) {
      moduleObject.__metadata__ = serializedMetadataMap;
    }

    return { moduleObject };
  }

  private serializeVariable(
    _name: string,
    variable: Variable,
    context: ModuleExportSerializationContext
  ): any {
    if (variable.type === 'executable') {
      return this.serializeExecutableVariable(variable as ExecutableVariable, context);
    }

    if (variable.type === 'template') {
      const templateVar = variable as TemplateVariable;
      return {
        __template: true,
        content: templateVar.value,
        templateSyntax: templateVar.templateSyntax,
        parameters: templateVar.parameters,
        templateAst: templateVar.internal?.templateAst || (Array.isArray(templateVar.value) ? templateVar.value : undefined)
      };
    }

    if (variable.type === 'object' && typeof variable.value === 'object' && variable.value !== null) {
      return this.objectResolver.resolveObjectReferences(
        variable.value,
        context.childVars,
        { resolveStrings: context.options?.resolveStrings }
      );
    }

    return variable.value;
  }

  private serializeExecutableVariable(
    execVar: ExecutableVariable,
    context: ModuleExportSerializationContext
  ): Record<string, unknown> {
    const isImported = Boolean(execVar.mx?.isImported);
    let serializedInternal: Record<string, unknown> = { ...(execVar.internal ?? {}) };

    if (serializedInternal.capturedShadowEnvs) {
      serializedInternal = {
        ...serializedInternal,
        capturedShadowEnvs: context.serializeShadowEnvs(serializedInternal.capturedShadowEnvs)
      };
    }

    if (context.shouldSerializeModuleEnv) {
      const capturedEnv = !isImported
        ? context.getModuleEnvSnapshot()
        : serializedInternal.capturedModuleEnv instanceof Map
          ? serializedInternal.capturedModuleEnv
          : context.getModuleEnvSnapshot();
      serializedInternal = {
        ...serializedInternal,
        capturedModuleEnv: context.serializeModuleEnv(capturedEnv, context.serializingEnvs)
      };
    } else {
      const existingCapture = serializedInternal.capturedModuleEnv;
      if (!isImported) {
        delete serializedInternal.capturedModuleEnv;
      } else if (existingCapture instanceof Map) {
        if (
          (context.currentSerializationTarget && existingCapture === context.currentSerializationTarget) ||
          (context.serializingEnvs && context.serializingEnvs.has(existingCapture))
        ) {
          delete serializedInternal.capturedModuleEnv;
        } else {
          serializedInternal = {
            ...serializedInternal,
            capturedModuleEnv: context.serializeModuleEnv(existingCapture, context.serializingEnvs)
          };
        }
      }
    }

    return {
      __executable: true,
      value: execVar.value,
      executableDef: execVar.internal?.executableDef,
      internal: serializedInternal
    };
  }

  private getEnvironmentDescriptor(childEnv?: Environment): SecurityDescriptor | undefined {
    const envSnapshot = childEnv?.getSecuritySnapshot?.();
    if (!envSnapshot) {
      return undefined;
    }
    return makeSecurityDescriptor({
      labels: envSnapshot.labels,
      taint: envSnapshot.taint,
      sources: envSnapshot.sources,
      policyContext: envSnapshot.policy ? { ...envSnapshot.policy } : undefined
    });
  }

  private serializeVariableMetadata(
    variable: Variable,
    envDescriptor?: SecurityDescriptor
  ): SerializedMetadata | undefined {
    const descriptor = variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined;
    const mergedDescriptor = descriptor && envDescriptor
      ? mergeDescriptors(descriptor, envDescriptor)
      : descriptor ?? envDescriptor;
    const metadataForSerialization: VariableMetadata = {};
    if (mergedDescriptor) {
      metadataForSerialization.security = mergedDescriptor;
    }
    if (variable.internal?.capability) {
      metadataForSerialization.capability = variable.internal.capability;
    }
    return VariableMetadataUtils.serializeSecurityMetadata(metadataForSerialization);
  }
}
