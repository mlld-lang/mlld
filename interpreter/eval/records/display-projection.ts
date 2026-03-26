import type { RecordFieldProjectionMetadata } from '@core/types/record';
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
import { accessField } from '@interpreter/utils/field-access';
import {
  asText,
  getRecordProjectionMetadata,
  isStructuredValue,
  type StructuredValue
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { maskFactFieldValue } from './display-masking';

type HandleWrapper = { handle: string };
type MaskedProjection = { preview: string; handle: HandleWrapper };
type HandleOnlyProjection = { handle: HandleWrapper };
type PreviewOnlyProjection = { preview: string };
type UnavailableProjection = { unavailable: true };

export interface DisplayProjectionOptions {
  toolCollection?: ToolCollection;
  strict?: boolean;
}

type ActiveRequirementGroup = {
  opRef: string;
  arg: string;
  requirements: FactRequirement[];
};

type ProjectionContext = {
  strictMode: boolean;
  activeRequirements: ActiveRequirementGroup[];
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toDisplayPrimitive(value: StructuredValue): unknown {
  return value.data;
}

function isToolCollection(value: unknown): value is ToolCollection {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeStrictMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'strict';
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
  const strictMode =
    options?.strict === true ||
    normalizeStrictMode(env.getScopedEnvironmentConfig()?.display);
  return {
    strictMode,
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
): HandleWrapper {
  const issued = env.issueHandle(value, {
    ...(preview ? { preview } : {}),
    metadata: {
      record: fieldProjection.recordName,
      field: fieldProjection.fieldName,
      display: fieldProjection.display
    }
  });
  return { handle: issued.handle };
}

async function projectFieldValue(
  value: StructuredValue,
  fieldProjection: RecordFieldProjectionMetadata,
  env: Environment,
  context: ProjectionContext
): Promise<unknown> {
  if (fieldProjection.classification === 'data') {
    return toDisplayPrimitive(value);
  }

  const effectiveDisplay = context.strictMode ? 'handle' : fieldProjection.display;
  if (effectiveDisplay === 'bare') {
    return toDisplayPrimitive(value);
  }

  const rawText = asText(value).trim();
  const qualifies = fieldSatisfiesActiveRequirements(value, context.activeRequirements);

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

  const handle = issueProjectionHandle(env, value, fieldProjection);
  const projected: HandleOnlyProjection = { handle };
  return projected;
}

async function projectStructuredRecord(
  value: StructuredValue<Record<string, unknown>>,
  env: Environment,
  context: ProjectionContext
): Promise<Record<string, unknown>> {
  const projection = getRecordProjectionMetadata(value);
  if (!projection || projection.kind !== 'record') {
    return isObjectLike(value.data) ? value.data : {};
  }

  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(projection.fields)) {
    const child = await accessField(value, { type: 'field', value: key } as any, { env });
    projected[key] = await renderDisplayProjection(child, env, context);
  }
  return projected;
}

export async function renderDisplayProjection(
  value: unknown,
  env: Environment,
  options?: DisplayProjectionOptions | ProjectionContext
): Promise<unknown> {
  const context = 'activeRequirements' in (options ?? {})
    ? options as ProjectionContext
    : createProjectionContext(env, options as DisplayProjectionOptions | undefined);
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    const projection = getRecordProjectionMetadata(resolved);
    if (projection?.kind === 'field') {
      return projectFieldValue(resolved, projection, env, context);
    }
    if (projection?.kind === 'record' && resolved.type === 'object') {
      return projectStructuredRecord(
        resolved as StructuredValue<Record<string, unknown>>,
        env,
        context
      );
    }
    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      return Promise.all(resolved.data.map(item => renderDisplayProjection(item, env, context)));
    }
    return resolved.data;
  }

  if (Array.isArray(resolved)) {
    return Promise.all(resolved.map(item => renderDisplayProjection(item, env, context)));
  }

  if (isObjectLike(resolved)) {
    const projectedEntries = await Promise.all(
      Object.entries(resolved).map(async ([key, entryValue]) => [
        key,
        await renderDisplayProjection(entryValue, env, context)
      ] as const)
    );
    return Object.fromEntries(projectedEntries);
  }

  return resolved;
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
