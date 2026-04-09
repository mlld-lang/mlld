import type { Variable } from '@core/types/variable';
import {
  createSimpleTextVariable,
  createStructuredValueVariable,
  createObjectVariable,
  createArrayVariable,
  createPrimitiveVariable,
  type VariableFactoryInitOptions
} from '@core/types/variable/VariableFactories';
import { isStructuredValue } from '../utils/structured-value';
import { materializeExpressionValue } from './expression-provenance';
import { isShelfSlotRefValue } from '@core/types/shelf';
import { getCapturedModuleEnv, sealCapturedModuleEnv } from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { resolveDirectToolCollection } from '@interpreter/eval/var/tool-scope';
import { boundary } from './boundary';

export interface ParameterFactoryOptions {
  name: string;
  value: unknown;
  stringValue?: string;
  originalVariable?: Variable;
  allowOriginalReuse?: boolean;
  metadataFactory?: (value: unknown) => VariableFactoryInitOptions | undefined;
  origin: 'exec-param' | 'pipeline' | 'directive';
  closureEnv?: Map<string, Variable>;
}

export function createParameterVariable(
  options: ParameterFactoryOptions
): Variable | undefined {
  const {
    name,
    value,
    stringValue,
    originalVariable,
    allowOriginalReuse,
    metadataFactory
  } = options;

  if (originalVariable && allowOriginalReuse) {
    if (originalVariable.internal?.isToolsCollection === true) {
      boundary.identity(originalVariable);
    } else {
      const capturedModuleEnv =
        getCapturedModuleEnv(originalVariable.internal)
        ?? getCapturedModuleEnv(originalVariable);
      if (capturedModuleEnv !== undefined && originalVariable.value && typeof originalVariable.value === 'object') {
        boundary.identity(originalVariable);
      }
    }

    return {
      ...originalVariable,
      name,
      mx: { ...(originalVariable.mx ?? {}) },
      internal: {
        ...(originalVariable.internal ?? {}),
        isSystem: true,
        isParameter: true
      }
    };
  }

  const preservedValue = value !== undefined ? value : stringValue;
  if (preservedValue === undefined) {
    return undefined;
  }

  const metadata = metadataFactory ? metadataFactory(preservedValue) : undefined;
  const preservedToolCollection =
    (originalVariable?.internal?.isToolsCollection === true
      ? boundary.identity(originalVariable)
      : resolveDirectToolCollection(originalVariable))
    ?? resolveDirectToolCollection(preservedValue);
  const capturedModuleEnv =
    getCapturedModuleEnv(originalVariable?.internal)
    ?? getCapturedModuleEnv(originalVariable)
    ?? getCapturedModuleEnv(preservedValue);
  const internalMetadata = {
    ...(metadata?.internal ?? {}),
    ...(preservedToolCollection
      ? {
          isToolsCollection: true,
          toolCollection: preservedToolCollection
        }
      : {})
  };
  if (capturedModuleEnv !== undefined) {
    sealCapturedModuleEnv(internalMetadata, capturedModuleEnv);
    if (preservedToolCollection) {
      sealCapturedModuleEnv(preservedToolCollection, capturedModuleEnv);
    }
  }
  const normalizedMetadata = {
    ...metadata,
    internal: internalMetadata
  };

  if (isStructuredValue(preservedValue)) {
    return createStructuredValueVariable(
      name,
      preservedValue,
      {
        directive: 'var',
        syntax: 'reference',
        hasInterpolation: false,
        isMultiLine: false
      },
      normalizedMetadata
    );
  }

  if (isShelfSlotRefValue(preservedValue)) {
    return createObjectVariable(
      name,
      preservedValue as unknown as Record<string, unknown>,
      false,
      {
        directive: 'var',
        syntax: 'reference',
        hasInterpolation: false,
        isMultiLine: false
      },
      normalizedMetadata
    );
  }

  if (
    preservedValue !== null &&
    typeof preservedValue === 'object' &&
    !Array.isArray(preservedValue)
  ) {
    return createObjectVariable(
      name,
      preservedValue,
      true,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      normalizedMetadata
    );
  }

  if (Array.isArray(preservedValue)) {
    return createArrayVariable(
      name,
      preservedValue,
      true,
      {
        directive: 'var',
        syntax: 'array',
        hasInterpolation: false,
        isMultiLine: false
      },
      normalizedMetadata
    );
  }

  if (
    typeof preservedValue === 'number' ||
    typeof preservedValue === 'boolean' ||
    preservedValue === null
  ) {
    return createPrimitiveVariable(
      name,
      preservedValue,
      {
        directive: 'var',
        syntax: 'literal',
        hasInterpolation: false,
        isMultiLine: false
      },
      normalizedMetadata
    );
  }

  return createSimpleTextVariable(
    name,
    String(preservedValue),
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    normalizedMetadata
  );
}

export interface PipelineParameterFactoryOptions extends ParameterFactoryOptions {
  pipelineStage?: number;
  isPipelineInput?: boolean;
}

export function createPipelineParameterVariable(
  options: PipelineParameterFactoryOptions
): Variable | undefined {
  const {
    name,
    value,
    stringValue,
    originalVariable,
    allowOriginalReuse,
    metadataFactory,
    pipelineStage,
    isPipelineInput
  } = options;

  if (originalVariable && allowOriginalReuse) {
    return {
      ...originalVariable,
      name,
      mx: { ...(originalVariable.mx ?? {}) },
      internal: {
        ...(originalVariable.internal ?? {}),
        isSystem: true,
        isParameter: true,
        isPipelineParameter: Boolean(isPipelineInput),
        pipelineStage
      }
    };
  }

  const provenanceVariable =
    materializeExpressionValue(value, { name }) ??
    (stringValue !== undefined ? materializeExpressionValue(stringValue, { name }) : undefined);
  if (provenanceVariable) {
    return {
      ...provenanceVariable,
      internal: {
        ...(provenanceVariable.internal ?? {}),
        isSystem: true,
        isParameter: true,
        isPipelineParameter: Boolean(isPipelineInput),
        pipelineStage
      }
    };
  }

  const resolvedMetadataFactory = (val: unknown) => {
    const base = metadataFactory ? metadataFactory(val) : undefined;
    return {
      ...base,
      internal: {
        ...(base?.internal ?? {}),
        isParameter: true,
        isPipelineParameter: Boolean(isPipelineInput),
        pipelineStage
      }
    };
  };

  return createParameterVariable({
    ...options,
    metadataFactory: resolvedMetadataFactory,
    origin: options.origin ?? 'pipeline'
  });
}
