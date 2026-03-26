import type { Environment } from '@interpreter/env/Environment';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import type { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv,
  stashCapturedModuleEnv
} from './executable/CapturedModuleEnvKeychain';
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
  childEnv?: Environment;
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
    const resolutionVars = this.buildResolutionVariables(request.childVars, request.childEnv);
    const context: ModuleExportSerializationContext = {
      childVars: resolutionVars,
      childEnv: request.childEnv,
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

  private buildResolutionVariables(
    childVars: Map<string, Variable>,
    childEnv?: Environment
  ): Map<string, Variable> {
    if (!childEnv || typeof childEnv.getAllVariables !== 'function') {
      return childVars;
    }

    const merged = new Map(childVars);
    for (const [name, variable] of childEnv.getAllVariables()) {
      if (!merged.has(name)) {
        merged.set(name, variable);
      }
    }
    return merged;
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

    if (variable.type === 'array') {
      return this.serializeArrayVariable(variable, context);
    }

    if (variable.type === 'object' && typeof variable.value === 'object' && variable.value !== null) {
      const resolved = this.objectResolver.resolveObjectReferences(
        variable.value,
        context.childVars,
        {
          resolveStrings: context.options?.resolveStrings,
          resolveVariable: name => context.childEnv?.getVariable(name)
        }
      );
      if (variable.internal?.isNamespace && resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        (resolved as Record<string, unknown>).__namespace = true;
      }
      return resolved;
    }

    return variable.value;
  }

  private serializeArrayVariable(
    variable: Variable,
    context: ModuleExportSerializationContext
  ): any {
    if (Array.isArray(variable.value)) {
      return this.objectResolver.resolveObjectReferences(
        variable.value,
        context.childVars,
        {
          resolveStrings: context.options?.resolveStrings,
          resolveVariable: name => context.childEnv?.getVariable(name)
        }
      );
    }

    const rawValue = variable.value as { items?: unknown[]; elements?: unknown[] } | undefined;
    const items = Array.isArray(rawValue?.items)
      ? rawValue.items
      : Array.isArray(rawValue?.elements)
        ? rawValue.elements
        : null;

    if (items) {
      return this.objectResolver.resolveObjectReferences(
        items,
        context.childVars,
        {
          resolveStrings: context.options?.resolveStrings,
          resolveVariable: name => context.childEnv?.getVariable(name)
        }
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
    const existingCapturedEnv = getCapturedModuleEnv(execVar.internal);

    if (serializedInternal.capturedShadowEnvs) {
      serializedInternal = {
        ...serializedInternal,
        capturedShadowEnvs: context.serializeShadowEnvs(serializedInternal.capturedShadowEnvs)
      };
    }

    if (context.shouldSerializeModuleEnv) {
      const capturedEnv = !isImported
        ? context.getModuleEnvSnapshot()
        : existingCapturedEnv instanceof Map
          ? existingCapturedEnv
          : context.getModuleEnvSnapshot();
      sealCapturedModuleEnv(
        serializedInternal,
        context.serializeModuleEnv(capturedEnv, context.serializingEnvs)
      );
    } else {
      const existingCapture = existingCapturedEnv;
      if (!isImported) {
        sealCapturedModuleEnv(serializedInternal, undefined);
      } else if (existingCapture instanceof Map) {
        if (
          (context.currentSerializationTarget && existingCapture === context.currentSerializationTarget) ||
          (context.serializingEnvs && context.serializingEnvs.has(existingCapture))
        ) {
          sealCapturedModuleEnv(serializedInternal, undefined);
        } else {
          sealCapturedModuleEnv(
            serializedInternal,
            context.serializeModuleEnv(existingCapture, context.serializingEnvs)
          );
        }
      } else if (existingCapture !== undefined) {
        sealCapturedModuleEnv(serializedInternal, existingCapture);
      }
    }

    const result = {
      __executable: true,
      name: execVar.name,
      value: execVar.value,
      paramNames: execVar.paramNames,
      paramTypes: execVar.paramTypes,
      description: execVar.description,
      executableDef: execVar.internal?.executableDef,
      internal: serializedInternal
    };
    stashCapturedModuleEnv(result, getCapturedModuleEnv(serializedInternal));
    return result;
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
    const metadataForSerialization: VariableMetadata = {};
    const hasSecurityDescriptor = Boolean(
      descriptor &&
        (
          (descriptor.labels?.length ?? 0) > 0 ||
          (descriptor.taint?.length ?? 0) > 0 ||
          (descriptor.sources?.length ?? 0) > 0 ||
          descriptor.policyContext
        )
    );
    if (hasSecurityDescriptor) {
      metadataForSerialization.security = envDescriptor
        ? mergeDescriptors(descriptor!, envDescriptor)
        : descriptor;
    }
    if (variable.internal?.capability) {
      metadataForSerialization.capability = variable.internal.capability;
    }
    return VariableMetadataUtils.serializeSecurityMetadata(metadataForSerialization);
  }
}
