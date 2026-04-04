import type {
  RecordDisplayEntry,
  RecordDisplayMode,
  RecordFieldProjectionMetadata
} from '@core/types/record';
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

type RefProjection = { value: unknown; handle: string };
type MaskedProjection = { preview: string; handle: string };
type HandleOnlyProjection = { handle: string };
type PreviewOnlyProjection = { preview: string };
type ValueOnlyProjection = { value: unknown };
type UnavailableProjection = { unavailable: true };
const OMITTED_FIELD = Symbol('omitted-display-field');

export interface DisplayProjectionOptions {
  toolCollection?: ToolCollection;
  strict?: boolean;
  displayMode?: string;
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

function normalizeDisplaySelection(value: unknown): { strictMode: boolean; modeName?: string } {
  if (typeof value !== 'string') {
    return { strictMode: false };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { strictMode: false };
  }

  if (trimmed.toLowerCase() === 'strict') {
    return { strictMode: true };
  }

  return {
    strictMode: false,
    modeName: trimmed
  };
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
    : normalizeDisplaySelection(options?.displayMode ?? env.getScopedEnvironmentConfig()?.display);
  return {
    strictMode: selection.strictMode,
    ...(selection.modeName ? { modeName: selection.modeName } : {}),
    activeRequirements: collectActiveRequirementGroups(env, options?.toolCollection)
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

function issueProjectionHandle(
  env: Environment,
  value: StructuredValue,
  fieldProjection: RecordFieldProjectionMetadata,
  preview?: string
): string {
  const issued = env.issueHandle(value, {
    ...(preview ? { preview } : {}),
    metadata: {
      record: fieldProjection.recordName,
      field: fieldProjection.fieldName
    }
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
  const resolution = resolveEffectiveDisplayMode(fieldProjection, context);
  if (resolution.omitted) {
    return OMITTED_FIELD;
  }

  const effectiveDisplay = resolution.mode;
  if (value.type === 'array' && Array.isArray(value.data)) {
    const elements = value.data.map(item => toStructuredProjectionElement(item));

    if (effectiveDisplay === 'bare') {
      return elements.map(element => toDisplayPrimitive(element));
    }

    const qualifies = fieldSatisfiesActiveRequirements(value, context.activeRequirements);
    if (effectiveDisplay === 'ref') {
      return elements.map(element => {
        const primitive = toDisplayPrimitive(element);
        if (!qualifies) {
          return { value: primitive } satisfies ValueOnlyProjection;
        }

        const handle = issueProjectionHandle(
          env,
          element,
          fieldProjection,
          deriveSafeCandidatePreview(element, fieldProjection.fieldName, value)
        );
        return { value: primitive, handle } satisfies RefProjection;
      });
    }

    if (!qualifies) {
      if (effectiveDisplay === 'mask') {
        return elements.map(element => ({
          preview: maskFactFieldValue(fieldProjection.fieldName, asText(element).trim())
        } satisfies PreviewOnlyProjection));
      }
      return elements.map(() => ({ unavailable: true } satisfies UnavailableProjection));
    }

    if (effectiveDisplay === 'mask') {
      return elements.map(element => {
        const preview = maskFactFieldValue(fieldProjection.fieldName, asText(element).trim());
        const handle = issueProjectionHandle(env, element, fieldProjection, preview);
        return { preview, handle } satisfies MaskedProjection;
      });
    }

    return elements.map(element => {
      const handle = issueProjectionHandle(
        env,
        element,
        fieldProjection,
        deriveSafeCandidatePreview(element, fieldProjection.fieldName, value)
      );
      return { handle } satisfies HandleOnlyProjection;
    });
  }

  if (effectiveDisplay === 'bare') {
    return toDisplayPrimitive(value);
  }

  const primitive = toDisplayPrimitive(value);
  const rawText = asText(value).trim();
  const qualifies = fieldSatisfiesActiveRequirements(value, context.activeRequirements);

  if (effectiveDisplay === 'ref') {
    if (!qualifies) {
      return {
        value: primitive
      } satisfies ValueOnlyProjection;
    }

    const handle = issueProjectionHandle(
      env,
      value,
      fieldProjection,
      deriveSafeCandidatePreview(value, fieldProjection.fieldName, parent)
    );
    return {
      value: primitive,
      handle
    } satisfies RefProjection;
  }

  if (!qualifies) {
    if (effectiveDisplay === 'mask') {
      const projected: PreviewOnlyProjection = {
        preview: maskFactFieldValue(fieldProjection.fieldName, rawText)
      };
      return projected;
    }

    const projected: UnavailableProjection = { unavailable: true };
    return projected;
  }

  if (effectiveDisplay === 'mask') {
    const preview = maskFactFieldValue(fieldProjection.fieldName, rawText);
    const handle = issueProjectionHandle(env, value, fieldProjection, preview);
    const projected: MaskedProjection = { preview, handle };
    return projected;
  }

  const handle = issueProjectionHandle(
    env,
    value,
    fieldProjection,
    deriveSafeCandidatePreview(value, fieldProjection.fieldName, parent)
  );
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

function resolveEffectiveDisplayMode(
  fieldProjection: RecordFieldProjectionMetadata,
  context: ProjectionContext
): { omitted: boolean; mode: RecordDisplayMode } {
  if (context.strictMode) {
    return fieldProjection.classification === 'fact'
      ? { omitted: false, mode: 'handle' }
      : { omitted: true, mode: 'bare' };
  }

  const display = fieldProjection.display;
  if (display.kind === 'open') {
    return { omitted: false, mode: 'bare' };
  }

  if (display.kind === 'legacy') {
    const explicit = findDisplayEntry(display.entries, fieldProjection.fieldName);
    return explicit
      ? { omitted: false, mode: displayEntryToMode(explicit) }
      : { omitted: true, mode: 'bare' };
  }

  const selectedMode = context.modeName ?? (Object.prototype.hasOwnProperty.call(display.modes, 'default')
    ? 'default'
    : undefined);
  if (!selectedMode) {
    throw new Error(
      `Record '@${fieldProjection.recordName}' requires an explicit display mode before '${fieldProjection.fieldName}' can be projected`
    );
  }

  const entries = display.modes[selectedMode];
  if (!entries) {
    throw new Error(
      `Record '@${fieldProjection.recordName}' does not declare display mode '${selectedMode}'`
    );
  }

  const explicit = findDisplayEntry(entries, fieldProjection.fieldName);
  if (!explicit) {
    return { omitted: true, mode: 'bare' };
  }

  return {
    omitted: false,
    mode: displayEntryToMode(explicit)
  };
}

function findDisplayEntry(
  entries: readonly RecordDisplayEntry[],
  fieldName: string
): RecordDisplayEntry | undefined {
  return entries.find(entry => entry.field === fieldName);
}

function displayEntryToMode(entry: RecordDisplayEntry): RecordDisplayMode {
  return entry.kind;
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
