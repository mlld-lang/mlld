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
    return {
      ...originalVariable,
      name,
      ctx: { ...(originalVariable.ctx ?? {}) },
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
      metadata
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
      metadata
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
      metadata
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
      metadata
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
    metadata
  );
}
