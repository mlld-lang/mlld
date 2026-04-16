import type { Environment } from '@interpreter/env/Environment';
import { serializeRecordDefinition, serializeRecordVariable } from '@core/types/record';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import {
  getToolCollectionMetadata,
  TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY,
  TOOL_COLLECTION_METADATA_EXPORT_KEY
} from '@core/types/tools';
import type { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import { getCapturedModuleEnv } from './executable/CapturedModuleEnvKeychain';
import {
  type ExecutableVariable,
  type RecordVariable,
  type TemplateVariable,
  type Variable,
  type VariableMetadata,
  VariableMetadataUtils
} from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { serializeShelfDefinition } from '@interpreter/shelf/runtime';
import { serializeModuleBoundaryValue } from '@interpreter/utils/module-boundary-serialization';

type SerializedMetadata = ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;

interface ModuleExportSerializationContext {
  childVars: Map<string, Variable>;
  childEnv?: Environment;
  options?: { resolveStrings?: boolean };
  shouldSerializeModuleEnv: boolean;
  currentSerializationTarget?: Map<string, Variable>;
  serializingEnvs?: WeakSet<object>;
  serializedModuleEnvCache: WeakMap<object, unknown>;
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
  serializedModuleEnvCache?: WeakMap<object, unknown>;
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
    const serializedModuleEnvCache = request.serializedModuleEnvCache ?? new WeakMap<object, unknown>();
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
      serializedModuleEnvCache,
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

    if (request.explicitExports && request.childEnv) {
      for (const name of request.explicitExports) {
        if (Object.prototype.hasOwnProperty.call(moduleObject, name)) {
          continue;
        }

        const recordDefinition = request.childEnv.getRecordDefinition(name);
        if (recordDefinition) {
          moduleObject[name] = serializeRecordDefinition(recordDefinition);
        }
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
    name: string,
    variable: Variable,
    context: ModuleExportSerializationContext
  ): any {
    if (variable.internal?.isShelf === true && context.childEnv) {
      const definition = context.childEnv.getShelfDefinition(name);
      if (definition) {
        return serializeShelfDefinition(context.childEnv, definition);
      }
    }

    if (variable.type === 'executable') {
      return this.serializeExecutableVariable(variable as ExecutableVariable, context);
    }

    if (variable.type === 'record') {
      return serializeRecordVariable(variable as RecordVariable);
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
          resolveVariable: name => context.childEnv?.getVariable(name),
          serializingEnvs: context.serializingEnvs,
          serializedModuleEnvCache: context.serializedModuleEnvCache
        }
      );
      if (variable.internal?.isNamespace && resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        (resolved as Record<string, unknown>).__namespace = true;
      }
      const toolCollectionMetadata = getToolCollectionMetadata(variable.value);
      if (toolCollectionMetadata && resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        (resolved as Record<string, unknown>)[TOOL_COLLECTION_METADATA_EXPORT_KEY] = toolCollectionMetadata;
        const toolCollectionCapturedModuleEnv = this.serializeToolCollectionCapturedModuleEnv(
          variable,
          context
        );
        if (toolCollectionCapturedModuleEnv !== undefined) {
          (resolved as Record<string, unknown>)[TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY] =
            toolCollectionCapturedModuleEnv;
        }
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
          resolveVariable: name => context.childEnv?.getVariable(name),
          serializingEnvs: context.serializingEnvs,
          serializedModuleEnvCache: context.serializedModuleEnvCache
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
          resolveVariable: name => context.childEnv?.getVariable(name),
          serializingEnvs: context.serializingEnvs,
          serializedModuleEnvCache: context.serializedModuleEnvCache
        }
      );
    }

    return variable.value;
  }

  private serializeToolCollectionCapturedModuleEnv(
    variable: Variable,
    context: ModuleExportSerializationContext
  ): unknown {
    const existingCaptured =
      getCapturedModuleEnv(variable.internal)
      ?? getCapturedModuleEnv(variable);
    if (existingCaptured instanceof Map) {
      return context.serializeModuleEnv(existingCaptured, context.serializingEnvs);
    }
    if (existingCaptured && typeof existingCaptured === 'object') {
      return existingCaptured;
    }
    if (!variable.value || typeof variable.value !== 'object' || Array.isArray(variable.value)) {
      return undefined;
    }

    const serializedExecutables: Record<string, unknown> = {};
    for (const definition of Object.values(variable.value as Record<string, unknown>)) {
      if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
        continue;
      }
      const execName = typeof (definition as { mlld?: unknown }).mlld === 'string'
        ? (definition as { mlld: string }).mlld.trim()
        : '';
      if (!execName || Object.prototype.hasOwnProperty.call(serializedExecutables, execName)) {
        continue;
      }
      const referencedVariable =
        context.childVars.get(execName)
        ?? context.childEnv?.getVariable(execName);
      const resolvedExecutable = referencedVariable
        ? this.serializeWithModuleBoundaryContext(referencedVariable, context)
        : this.objectResolver.resolveObjectReferences(
            `@${execName}`,
            context.childVars,
            {
              resolveStrings: true,
              resolveVariable: name => context.childEnv?.getVariable(name),
              serializingEnvs: context.serializingEnvs,
              serializedModuleEnvCache: context.serializedModuleEnvCache
            }
          );
      if (
        resolvedExecutable
        && typeof resolvedExecutable === 'object'
        && (resolvedExecutable as { __executable?: unknown }).__executable
      ) {
        serializedExecutables[execName] = resolvedExecutable;
      }
    }

    return Object.keys(serializedExecutables).length > 0
      ? serializedExecutables
      : undefined;
  }

  private serializeExecutableVariable(
    execVar: ExecutableVariable,
    context: ModuleExportSerializationContext
  ): Record<string, unknown> {
    return this.serializeWithModuleBoundaryContext(execVar, context) as Record<string, unknown>;
  }

  private serializeWithModuleBoundaryContext(
    value: unknown,
    context: ModuleExportSerializationContext
  ): unknown {
    return serializeModuleBoundaryValue(value, {
      resolveStrings: context.options?.resolveStrings,
      resolveVariable: name => context.childEnv?.getVariable(name),
      serializeShadowEnvs: context.serializeShadowEnvs,
      serializeModuleEnv: (moduleEnv, seen) => context.serializeModuleEnv(moduleEnv, seen),
      resolveExecutableCapturedModuleEnv: (execVar, defaultCapturedEnv) =>
        this.resolveExecutableCapturedModuleEnv(execVar, defaultCapturedEnv, context),
      serializingEnvs: context.serializingEnvs,
      serializedModuleEnvCache: context.serializedModuleEnvCache
    });
  }

  private resolveExecutableCapturedModuleEnv(
    execVar: ExecutableVariable,
    defaultCapturedEnv: unknown,
    context: ModuleExportSerializationContext
  ): unknown {
    const isImported = Boolean(execVar.mx?.isImported);
    const existingCapturedEnv = defaultCapturedEnv;

    if (context.shouldSerializeModuleEnv) {
      return !isImported
        ? context.getModuleEnvSnapshot()
        : existingCapturedEnv !== undefined
          ? existingCapturedEnv
          : context.getModuleEnvSnapshot();
    }

    if (!isImported) {
      return undefined;
    }

    if (existingCapturedEnv instanceof Map) {
      if (
        (context.currentSerializationTarget && existingCapturedEnv === context.currentSerializationTarget) ||
        (context.serializingEnvs && context.serializingEnvs.has(existingCapturedEnv))
      ) {
        return undefined;
      }
      return existingCapturedEnv;
    }

    return existingCapturedEnv;
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
