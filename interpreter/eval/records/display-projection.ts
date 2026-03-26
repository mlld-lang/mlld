import type { RecordFieldProjectionMetadata } from '@core/types/record';
import type { Environment } from '@interpreter/env/Environment';
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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toDisplayPrimitive(value: StructuredValue): unknown {
  return value.data;
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
  env: Environment
): Promise<unknown> {
  if (fieldProjection.classification === 'data' || fieldProjection.display === 'bare') {
    return toDisplayPrimitive(value);
  }

  const rawText = asText(value).trim();
  if (fieldProjection.display === 'mask') {
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
  env: Environment
): Promise<Record<string, unknown>> {
  const projection = getRecordProjectionMetadata(value);
  if (!projection || projection.kind !== 'record') {
    return isObjectLike(value.data) ? value.data : {};
  }

  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(projection.fields)) {
    const child = await accessField(value, { type: 'field', value: key } as any, { env });
    projected[key] = await renderDisplayProjection(child, env);
  }
  return projected;
}

export async function renderDisplayProjection(
  value: unknown,
  env: Environment
): Promise<unknown> {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    const projection = getRecordProjectionMetadata(resolved);
    if (projection?.kind === 'field') {
      return projectFieldValue(resolved, projection, env);
    }
    if (projection?.kind === 'record' && resolved.type === 'object') {
      return projectStructuredRecord(resolved as StructuredValue<Record<string, unknown>>, env);
    }
    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      return Promise.all(resolved.data.map(item => renderDisplayProjection(item, env)));
    }
    return resolved.data;
  }

  if (Array.isArray(resolved)) {
    return Promise.all(resolved.map(item => renderDisplayProjection(item, env)));
  }

  if (isObjectLike(resolved)) {
    const projectedEntries = await Promise.all(
      Object.entries(resolved).map(async ([key, entryValue]) => [key, await renderDisplayProjection(entryValue, env)] as const)
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
