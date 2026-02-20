import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { setExpressionProvenance } from '@interpreter/utils/expression-provenance';
import { isPipelineInput } from '@core/types/variable/TypeGuards';
import {
  extractStageValue,
  getStructuredSecurityDescriptor,
  safeJSONStringify
} from './helpers';

export class PipelineOutputProcessor {
  constructor(private readonly env: Environment) {}

  normalizeOutput(output: unknown): StructuredValue {
    if (isStructuredValue(output)) {
      return output;
    }

    if (isPipelineInput(output as any)) {
      return output as StructuredValue;
    }

    if (output === null || output === undefined) {
      return wrapStructured('', 'text', '');
    }

    if (typeof output === 'string') {
      return wrapStructured(output, 'text', output);
    }

    if (typeof output === 'number' || typeof output === 'boolean' || typeof output === 'bigint') {
      const text = String(output);
      return wrapStructured(output, 'text', text);
    }

    if (Array.isArray(output)) {
      const normalizedArray = output.map(item => extractStageValue(item));
      const text = safeJSONStringify(normalizedArray);
      return wrapStructured(normalizedArray, 'array', text);
    }

    if (typeof output === 'object') {
      const maybeText = typeof (output as any).content === 'string' ? (output as any).content : undefined;
      const text = maybeText ?? safeJSONStringify(output);
      return wrapStructured(output as any, 'object', text);
    }

    return wrapStructured(output as any, 'text', safeJSONStringify(output));
  }

  finalizeStageOutput(
    value: StructuredValue,
    stageInput: StructuredValue,
    rawOutput: unknown,
    ...descriptorHints: (SecurityDescriptor | undefined)[]
  ): StructuredValue {
    const descriptor = this.mergeStageDescriptors(value, stageInput, rawOutput, descriptorHints);
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(value, descriptor);
      setExpressionProvenance(value, descriptor);
    }
    return value;
  }

  applySourceDescriptor(
    wrapper: StructuredValue,
    source: unknown
  ): void {
    const descriptor = extractSecurityDescriptor(source, {
      recursive: true,
      mergeArrayElements: true
    });
    if (!descriptor) {
      return;
    }

    applySecurityDescriptorToStructuredValue(wrapper, descriptor);
    setExpressionProvenance(wrapper, descriptor);
  }

  private mergeStageDescriptors(
    normalizedValue: StructuredValue,
    stageInput: StructuredValue,
    rawOutput: unknown,
    descriptorHints: (SecurityDescriptor | undefined)[] = []
  ): SecurityDescriptor | undefined {
    const descriptors: SecurityDescriptor[] = [];
    const inputDescriptor = extractSecurityDescriptor(stageInput, {
      recursive: true,
      mergeArrayElements: true
    });
    if (inputDescriptor) {
      descriptors.push(inputDescriptor);
    }

    const rawDescriptor = extractSecurityDescriptor(rawOutput ?? normalizedValue, {
      recursive: true,
      mergeArrayElements: true
    });
    if (rawDescriptor) {
      descriptors.push(rawDescriptor);
    }

    const existingDescriptor = getStructuredSecurityDescriptor(normalizedValue);
    if (existingDescriptor) {
      descriptors.push(existingDescriptor);
    }

    for (const hint of descriptorHints) {
      if (hint) {
        descriptors.push(hint);
      }
    }

    if (process.env.MLLD_DEBUG === 'true') {
      try {
        console.error('[PipelineExecutor][mergeStageDescriptors]', {
          inputLabels: inputDescriptor?.labels ?? null,
          rawLabels: rawDescriptor?.labels ?? null,
          existingLabels: existingDescriptor?.labels ?? null,
          hintLabels: descriptorHints.map(hint => hint?.labels ?? null),
          normalizedLabels: normalizedValue?.mx?.labels ?? null,
          normalizedText: normalizedValue?.text
        });
      } catch {
        // keep debug output best-effort
      }
    }

    if (descriptors.length === 0) {
      return undefined;
    }

    if (descriptors.length === 1) {
      return descriptors[0];
    }

    return this.env.mergeSecurityDescriptors(...descriptors);
  }
}
