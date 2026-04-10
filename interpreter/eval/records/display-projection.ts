import type {
  RecordDefinition,
  RecordDisplayMode,
  RecordFieldProjectionMetadata
} from '@core/types/record';
import {
  resolveDisplaySelection,
  resolveRecordFieldDisplayMode,
  type DisplaySelection
} from '@core/records/display-mode';
import type { ToolCollection } from '@core/types/tools';
import { isExecutableVariable } from '@core/types/variable';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import { resolveFactRequirementsForOperation, type FactRequirement } from '@core/policy/fact-requirements';
import { expandOperationLabels } from '@core/policy/label-flow';
import type { Environment } from '@interpreter/env/Environment';
import {
  resolveEffectiveToolMetadata,
  resolveNamedOperationMetadata
} from '@interpreter/eval/exec/tool-metadata';
import {
  asText,
  getStructuredObjectField,
  getRecordProjectionMetadata,
  isStructuredValue,
  wrapStructured,
  type StructuredValue
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { maskFactFieldValue } from './display-masking';
import { traceDisplayProject } from '@interpreter/tracing/events';

type RefProjection = { value: unknown; handle: string };
type MaskedProjection = { preview: string; handle: string };
type HandleOnlyProjection = { handle: string };
type PreviewOnlyProjection = { preview: string };
type ValueOnlyProjection = { value: unknown };
type UnavailableProjection = { unavailable: true };
type HandleSurfaceRefProjection = { value: unknown; handle: string | null };
type HandleSurfaceMaskProjection = { preview: string; handle: string | null };
type HandleSurfaceHandleOnlyProjection = string | null;
const OMITTED_FIELD = Symbol('omitted-display-field');
type ProjectionSurface = 'display' | 'handles';

export interface ProjectedRecordFieldDescription {
  field: string;
  classification: 'fact' | 'data';
  mode: RecordDisplayMode;
  shape: 'value' | 'value+handle' | 'preview+handle' | 'handle';
}

export interface DisplayProjectionOptions {
  toolCollection?: ToolCollection;
  strict?: boolean;
  displayMode?: string;
  surface?: ProjectionSurface;
  nullOutsideBridge?: boolean;
}

type ActiveRequirementGroup = {
  opRef: string;
  arg: string;
  requirements: FactRequirement[];
};

type ProjectionContext = {
  strictMode: boolean;
  modeName?: string;
  activeRequirements: ActiveRequirementGroup[];
  parentRecord?: StructuredValue;
  surface: ProjectionSurface;
  nullOutsideBridge: boolean;
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toDisplayPrimitive(value: StructuredValue): unknown {
  return value.data;
}

function toStructuredProjectionElement(value: unknown): StructuredValue {
  return isStructuredValue(value) ? value : wrapStructured(value as any);
}

function readDisplayText(value: unknown): string | undefined {
  const resolved = isVariable(value) ? value.value : value;
  if (isStructuredValue(resolved)) {
    const text = asText(resolved).trim();
    return text.length > 0 ? text : undefined;
  }
  if (
    typeof resolved === 'string'
    || typeof resolved === 'number'
    || typeof resolved === 'boolean'
  ) {
    const text = String(resolved).trim();
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

function deriveSafeCandidatePreview(
  value: StructuredValue,
  fieldName: string,
  parent?: StructuredValue
): string | undefined {
  if (parent?.type === 'object' && parent.data && typeof parent.data === 'object' && !Array.isArray(parent.data)) {
    const objectData = parent.data as Record<string, unknown>;
    for (const preferredField of ['name', 'title', 'display', 'display_name', 'label']) {
      if (preferredField === fieldName || !Object.prototype.hasOwnProperty.call(objectData, preferredField)) {
        continue;
      }
      const displayText = readDisplayText(objectData[preferredField]);
      if (displayText) {
        return displayText;
      }
    }
  }

  const rawText = asText(value).trim();
  return rawText.length > 0 ? maskFactFieldValue(fieldName, rawText) : undefined;
}

function isToolCollection(value: unknown): value is ToolCollection {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function collectActiveRequirementGroups(
  env: Environment,
  toolCollection?: ToolCollection
): ActiveRequirementGroup[] {
  const scopedTools =
    toolCollection ??
    (isToolCollection(env.getScopedEnvironmentConfig()?.tools)
      ? env.getScopedEnvironmentConfig()?.tools as ToolCollection
      : undefined);
  if (!scopedTools) {
    return [];
  }

  const policy = env.getPolicySummary();
  const groups: ActiveRequirementGroup[] = [];

  for (const [toolName, definition] of Object.entries(scopedTools)) {
    const executableName = typeof definition?.mlld === 'string' ? definition.mlld : undefined;
    const executable = executableName ? env.getVariable(executableName) : undefined;
    const metadata =
      executable && isExecutableVariable(executable)
        ? resolveEffectiveToolMetadata({
            env,
            executable,
            operationName: toolName
          })
        : resolveNamedOperationMetadata(env, toolName);
    if (!metadata) {
      continue;
    }

    const resolution = resolveFactRequirementsForOperation({
      opRef: toolName,
      operationLabels: expandOperationLabels(
        metadata.labels,
        policy?.operations
      ),
      controlArgs: metadata.controlArgs,
      hasControlArgsMetadata: metadata.hasControlArgsMetadata,
      policy
    });

    for (const [arg, requirements] of Object.entries(resolution.requirementsByArg)) {
      if (requirements.length === 0) {
        continue;
      }
      groups.push({
        opRef: resolution.opRef ?? toolName,
        arg,
        requirements
      });
    }
  }

  return groups;
}

function createProjectionContext(
  env: Environment,
  options?: DisplayProjectionOptions
): ProjectionContext {
  const selection = options?.strict === true
    ? { strictMode: true }
    : resolveDisplaySelection({
        scopedDisplay: options?.displayMode ?? env.getScopedEnvironmentConfig()?.display,
        exeLabels: env.getExeLabels() ?? env.getEnclosingExeLabels()
      });
  return {
    strictMode: selection.strictMode,
    ...(selection.modeName ? { modeName: selection.modeName } : {}),
    activeRequirements: collectActiveRequirementGroups(env, options?.toolCollection),
    surface: options?.surface ?? 'display',
    nullOutsideBridge: options?.nullOutsideBridge === true
  };
}

function fieldSatisfiesActiveRequirements(
  value: StructuredValue,
  activeRequirements: readonly ActiveRequirementGroup[]
): boolean {
  if (activeRequirements.length === 0) {
    return true;
  }

  const labels = Array.isArray(value.mx?.labels)
    ? value.mx.labels.filter((label): label is string => typeof label === 'string')
    : [];

  return activeRequirements.some(group =>
    group.requirements.every(requirement =>
      requirement.patterns.some(pattern =>
        labels.some(label => matchesLabelPattern(pattern, label))
      )
    )
  );
}

function getProjectionFactsource(
  value: StructuredValue,
  parent?: StructuredValue
): Record<string, unknown> | undefined {
  for (const candidate of [value, parent]) {
    if (!candidate) {
      continue;
    }

    const factsources = Array.isArray(candidate.metadata?.factsources)
      ? candidate.metadata.factsources
      : Array.isArray(candidate.mx?.factsources)
        ? candidate.mx.factsources
        : undefined;
    const first = Array.isArray(factsources) ? factsources[0] : undefined;
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
  }

  return undefined;
}

function buildProjectionHandleMetadata(
  value: StructuredValue,
  options: {
    fieldProjection?: RecordFieldProjectionMetadata;
    parent?: StructuredValue;
    arrayIndex?: number;
  }
): { metadata: Record<string, unknown>; stableKey?: string } {
  const projection =
    options.fieldProjection
    ?? getRecordProjectionMetadata(value)
    ?? undefined;
  const factsource = getProjectionFactsource(value, options.parent);
  const sourceRef =
    typeof factsource?.sourceRef === 'string' && factsource.sourceRef.trim().length > 0
      ? factsource.sourceRef.trim()
      : projection?.kind === 'field' || projection?.kind === 'record'
        ? projection.recordName
        : undefined;
  const groupIdentity = [
    sourceRef ?? null,
    typeof factsource?.coercionId === 'string' ? factsource.coercionId : null,
    typeof factsource?.position === 'number' ? String(factsource.position) : null,
    typeof factsource?.instanceKey === 'string' ? factsource.instanceKey : null
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
  const groupKey = groupIdentity.length > 0 ? groupIdentity.join('|') : undefined;
  const stableKeyBase =
    projection?.kind === 'field'
      ? `field:${groupKey ?? projection.recordName}:${projection.fieldName}`
      : projection?.kind === 'record'
        ? `record:${groupKey ?? projection.recordName}`
        : undefined;
  const stableKey = stableKeyBase
    ? `${stableKeyBase}:${options.arrayIndex ?? 'scalar'}`
    : undefined;

  return {
    metadata: {
      ...(projection?.kind === 'field'
        ? {
            record: projection.recordName,
            field: projection.fieldName,
            projection
          }
        : projection?.kind === 'record'
          ? {
              record: projection.recordName,
              projection
            }
          : {}),
      ...(groupKey ? { groupKey } : {}),
      ...(typeof options.arrayIndex === 'number' ? { arrayIndex: options.arrayIndex } : {}),
      ...(sourceRef ? { factsourceRef: sourceRef } : {})
    },
    ...(stableKey ? { stableKey } : {})
  };
}

export function issueProjectionHandleForValue(
  env: Environment,
  value: StructuredValue,
  options: {
    fieldProjection?: RecordFieldProjectionMetadata;
    parent?: StructuredValue;
    arrayIndex?: number;
    preview?: string;
    nullOutsideBridge?: boolean;
  } = {}
): string | null {
  if (options.nullOutsideBridge && !env.getCurrentLlmSessionId()) {
    return null;
  }

  const { metadata, stableKey } = buildProjectionHandleMetadata(value, {
    fieldProjection: options.fieldProjection,
    parent: options.parent,
    arrayIndex: options.arrayIndex
  });
  const issued = env.issueHandle(value, {
    ...(options.preview ? { preview: options.preview } : {}),
    ...(stableKey ? { stableKey } : {}),
    metadata
  });
  return issued.handle;
}

function projectFieldValue(
  value: StructuredValue,
  fieldProjection: RecordFieldProjectionMetadata,
  env: Environment,
  context: ProjectionContext,
  parent?: StructuredValue
): unknown | typeof OMITTED_FIELD {
  const emitProjectionTrace = (mode: string, data: Record<string, unknown> = {}): void => {
    env.emitRuntimeTraceEvent(traceDisplayProject({
      record: fieldProjection.recordName,
      field: fieldProjection.fieldName,
      mode,
      ...data
    }));
  };
  const resolution = resolveEffectiveDisplayMode(fieldProjection, context);
  if (resolution.omitted) {
    emitProjectionTrace('omitted', { handleIssued: false });
    return OMITTED_FIELD;
  }

  const effectiveDisplay = resolution.mode;
  const buildHandleSurfaceProjection = (
    element: StructuredValue,
    options?: { arrayIndex?: number }
  ): HandleSurfaceRefProjection | HandleSurfaceMaskProjection | HandleSurfaceHandleOnlyProjection => {
    const projectionParent = typeof options?.arrayIndex === 'number' ? value : parent;
    if (effectiveDisplay === 'mask') {
      const preview = maskFactFieldValue(fieldProjection.fieldName, asText(element).trim());
      return {
        preview,
        handle: issueProjectionHandleForValue(env, element, {
          fieldProjection,
          parent: projectionParent,
          arrayIndex: options?.arrayIndex,
          preview,
          nullOutsideBridge: context.nullOutsideBridge
        })
      } satisfies HandleSurfaceMaskProjection;
    }

    const handle = issueProjectionHandleForValue(env, element, {
      fieldProjection,
      parent: projectionParent,
      arrayIndex: options?.arrayIndex,
      preview: deriveSafeCandidatePreview(element, fieldProjection.fieldName, projectionParent),
      nullOutsideBridge: context.nullOutsideBridge
    });
    if (effectiveDisplay === 'handle') {
      return handle satisfies HandleSurfaceHandleOnlyProjection;
    }
    return {
      value: toDisplayPrimitive(element),
      handle
    } satisfies HandleSurfaceRefProjection;
  };

  if (value.type === 'array' && Array.isArray(value.data)) {
    const elements = value.data.map(item => toStructuredProjectionElement(item));

    if (context.surface === 'handles') {
      const projectedElements = elements.map((element, index) =>
        buildHandleSurfaceProjection(element, { arrayIndex: index })
      );
      const handleCount = projectedElements.reduce((count, entry) => {
        if (typeof entry === 'string') {
          return count + 1;
        }
        return entry.handle ? count + 1 : count;
      }, 0);
      emitProjectionTrace(effectiveDisplay, {
        handleIssued: handleCount > 0,
        handleCount,
        elementCount: elements.length
      });
      return projectedElements;
    }

    if (effectiveDisplay === 'bare') {
      emitProjectionTrace('bare', {
        handleIssued: false,
        elementCount: elements.length
      });
      return elements.map(element => toDisplayPrimitive(element));
    }

    const qualifies = fieldSatisfiesActiveRequirements(value, context.activeRequirements);
    if (effectiveDisplay === 'ref') {
      emitProjectionTrace('ref', {
        handleIssued: qualifies,
        handleCount: qualifies ? elements.length : 0,
        elementCount: elements.length
      });
      return elements.map((element, index) => {
        const primitive = toDisplayPrimitive(element);
        if (!qualifies) {
          return { value: primitive } satisfies ValueOnlyProjection;
        }

        const handle = issueProjectionHandleForValue(env, element, {
          fieldProjection,
          parent: value,
          arrayIndex: index,
          preview: deriveSafeCandidatePreview(element, fieldProjection.fieldName, value)
        }) as string;
        return { value: primitive, handle } satisfies RefProjection;
      });
    }

    if (!qualifies) {
      if (effectiveDisplay === 'mask') {
        emitProjectionTrace('mask', {
          handleIssued: false,
          elementCount: elements.length
        });
        return elements.map(element => ({
          preview: maskFactFieldValue(fieldProjection.fieldName, asText(element).trim())
        } satisfies PreviewOnlyProjection));
      }
      emitProjectionTrace(effectiveDisplay, {
        handleIssued: false,
        elementCount: elements.length
      });
      return elements.map(() => ({ unavailable: true } satisfies UnavailableProjection));
    }

    if (effectiveDisplay === 'mask') {
      emitProjectionTrace('mask', {
        handleIssued: true,
        handleCount: elements.length,
        elementCount: elements.length
      });
      return elements.map((element, index) => {
        const preview = maskFactFieldValue(fieldProjection.fieldName, asText(element).trim());
        const handle = issueProjectionHandleForValue(env, element, {
          fieldProjection,
          parent: value,
          arrayIndex: index,
          preview
        }) as string;
        return { preview, handle } satisfies MaskedProjection;
      });
    }

    emitProjectionTrace(effectiveDisplay, {
      handleIssued: true,
      handleCount: elements.length,
      elementCount: elements.length
    });
    return elements.map((element, index) => {
      const handle = issueProjectionHandleForValue(env, element, {
        fieldProjection,
        parent: value,
        arrayIndex: index,
        preview: deriveSafeCandidatePreview(element, fieldProjection.fieldName, value)
      }) as string;
      return { handle } satisfies HandleOnlyProjection;
    });
  }

  if (context.surface === 'handles') {
    const projected = buildHandleSurfaceProjection(value);
    const handleIssued =
      projected === null || typeof projected === 'string'
        ? projected !== null
        : projected.handle !== null;
    emitProjectionTrace(effectiveDisplay, { handleIssued });
    return projected;
  }

  if (effectiveDisplay === 'bare') {
    emitProjectionTrace('bare', { handleIssued: false });
    return toDisplayPrimitive(value);
  }

  const primitive = toDisplayPrimitive(value);
  const rawText = asText(value).trim();
  const qualifies = fieldSatisfiesActiveRequirements(value, context.activeRequirements);

  if (effectiveDisplay === 'ref') {
    if (!qualifies) {
      emitProjectionTrace('ref', { handleIssued: false });
      return {
        value: primitive
      } satisfies ValueOnlyProjection;
    }

    emitProjectionTrace('ref', { handleIssued: true });
    const handle = issueProjectionHandleForValue(env, value, {
      fieldProjection,
      parent,
      preview: deriveSafeCandidatePreview(value, fieldProjection.fieldName, parent)
    }) as string;
    return {
      value: primitive,
      handle
    } satisfies RefProjection;
  }

  if (!qualifies) {
    if (effectiveDisplay === 'mask') {
      emitProjectionTrace('mask', { handleIssued: false });
      const projected: PreviewOnlyProjection = {
        preview: maskFactFieldValue(fieldProjection.fieldName, rawText)
      };
      return projected;
    }

    emitProjectionTrace(effectiveDisplay, { handleIssued: false });
    const projected: UnavailableProjection = { unavailable: true };
    return projected;
  }

  if (effectiveDisplay === 'mask') {
    emitProjectionTrace('mask', { handleIssued: true });
    const preview = maskFactFieldValue(fieldProjection.fieldName, rawText);
    const handle = issueProjectionHandleForValue(env, value, {
      fieldProjection,
      parent,
      preview
    }) as string;
    const projected: MaskedProjection = { preview, handle };
    return projected;
  }

  emitProjectionTrace(effectiveDisplay, { handleIssued: true });
  const handle = issueProjectionHandleForValue(env, value, {
    fieldProjection,
    parent,
    preview: deriveSafeCandidatePreview(value, fieldProjection.fieldName, parent)
  }) as string;
  const projected: HandleOnlyProjection = { handle };
  return projected;
}

function projectStructuredRecord(
  value: StructuredValue<Record<string, unknown>>,
  env: Environment,
  context: ProjectionContext
): Record<string, unknown> {
  const projection = getRecordProjectionMetadata(value);
  if (!projection || projection.kind !== 'record') {
    return isObjectLike(value.data) ? value.data : {};
  }

  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(projection.fields)) {
    const child = getStructuredObjectField(value, key);
    const rendered = renderDisplayProjectionSync(child, env, {
      ...context,
      parentRecord: value
    });
    if (rendered === OMITTED_FIELD) {
      continue;
    }
    projected[key] = rendered;
  }
  return projected;
}

export function renderDisplayProjectionSync(
  value: unknown,
  env: Environment,
  options?: DisplayProjectionOptions | ProjectionContext
): unknown {
  const context = 'activeRequirements' in (options ?? {})
    ? options as ProjectionContext
    : createProjectionContext(env, options as DisplayProjectionOptions | undefined);
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    const projection = getRecordProjectionMetadata(resolved);
    if (projection?.kind === 'field') {
      return projectFieldValue(
        resolved,
        projection,
        env,
        context,
        context.parentRecord
      );
    }
    if (projection?.kind === 'record' && resolved.type === 'object') {
      return projectStructuredRecord(
        resolved as StructuredValue<Record<string, unknown>>,
        env,
        context
      );
    }
    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      return resolved.data.map(item => renderDisplayProjectionSync(item, env, context));
    }
    return resolved.data;
  }

  if (Array.isArray(resolved)) {
    return resolved.map(item => renderDisplayProjectionSync(item, env, context));
  }

  if (isObjectLike(resolved)) {
    const projectedEntries = Object.entries(resolved).map(([key, entryValue]) => [
      key,
      renderDisplayProjectionSync(entryValue, env, context)
    ] as const);
    return Object.fromEntries(projectedEntries.filter(([, value]) => value !== OMITTED_FIELD));
  }

  return resolved;
}

export async function renderDisplayProjection(
  value: unknown,
  env: Environment,
  options?: DisplayProjectionOptions | ProjectionContext
): Promise<unknown> {
  return renderDisplayProjectionSync(value, env, options);
}

export function renderHandleProjectionSync(
  value: unknown,
  env: Environment,
  options?: Omit<DisplayProjectionOptions, 'surface'> | ProjectionContext
): unknown {
  const normalizedOptions =
    options && 'activeRequirements' in options
      ? {
          ...(options as ProjectionContext),
          surface: 'handles' as const,
          nullOutsideBridge: true
        }
      : {
          ...(options as DisplayProjectionOptions | undefined),
          surface: 'handles' as const,
          nullOutsideBridge: true
        };
  return renderDisplayProjectionSync(value, env, normalizedOptions);
}

export function describeRecordProjectionFields(
  definition: RecordDefinition,
  env: Environment,
  options?: DisplayProjectionOptions | ProjectionContext
): ProjectedRecordFieldDescription[] {
  const context = 'activeRequirements' in (options ?? {})
    ? options as ProjectionContext
    : createProjectionContext(env, options as DisplayProjectionOptions | undefined);
  const descriptions: ProjectedRecordFieldDescription[] = [];

  for (const field of definition.fields) {
    const projection: RecordFieldProjectionMetadata = {
      kind: 'field',
      recordName: definition.name,
      fieldName: field.name,
      classification: field.classification,
      dataTrust: field.dataTrust,
      display: definition.display
    };
    const resolution = resolveEffectiveDisplayMode(projection, context);
    if (resolution.omitted) {
      continue;
    }

    descriptions.push({
      field: field.name,
      classification: field.classification,
      mode: resolution.mode,
      shape:
        resolution.mode === 'mask'
          ? 'preview+handle'
          : resolution.mode === 'handle'
            ? 'handle'
            : resolution.mode === 'ref'
              ? 'value+handle'
              : 'value'
    });
  }

  return descriptions;
}

function resolveEffectiveDisplayMode(
  fieldProjection: RecordFieldProjectionMetadata,
  context: ProjectionContext
): { omitted: boolean; mode: RecordDisplayMode } {
  const selection: DisplaySelection = context.strictMode
    ? { strictMode: true }
    : context.modeName
      ? { strictMode: false, modeName: context.modeName }
      : { strictMode: false };
  return resolveRecordFieldDisplayMode(fieldProjection, selection);
}

export function hasDisplayProjectionTarget(value: unknown): boolean {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    if (Boolean(getRecordProjectionMetadata(resolved))) {
      return true;
    }
    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      return resolved.data.some(item => hasDisplayProjectionTarget(item));
    }
    return false;
  }

  if (Array.isArray(resolved)) {
    return resolved.some(item => hasDisplayProjectionTarget(item));
  }

  return false;
}
