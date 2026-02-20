import { mergeDescriptors } from '@core/types/security';
import { isLoadContentResult } from '@core/types/load-content';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import {
  wrapStructured,
  isStructuredValue,
  ensureStructuredValue,
  type StructuredValue,
  type StructuredValueType,
  type StructuredValueMetadata
} from '@interpreter/utils/structured-value';

export interface ContentLoaderFinalizeOptions {
  type?: StructuredValueType;
  text?: string;
  metadata?: StructuredValueMetadata;
}

export class ContentLoaderFinalizationAdapter {
  finalizeLoaderResult<T>(
    value: T,
    options?: ContentLoaderFinalizeOptions
  ): T | StructuredValue {
    if (isLoadContentResult(value)) {
      const structured = wrapLoadContentValue(value) as StructuredValue;
      const metadata = this.mergeMetadata(structured.metadata, options?.metadata);
      if (!metadata || metadata === structured.metadata) {
        return structured as any;
      }
      return wrapStructured(structured, structured.type, structured.text, metadata) as any;
    }

    if (Array.isArray(value) && value.length > 0 && isLoadContentResult(value[0])) {
      const structured = wrapLoadContentValue(value) as StructuredValue;
      const metadata = this.mergeMetadata(structured.metadata, options?.metadata);
      if (!metadata || metadata === structured.metadata) {
        return structured as any;
      }
      return wrapStructured(structured, structured.type, structured.text, metadata) as any;
    }

    if (isStructuredValue(value)) {
      const metadata = this.mergeMetadata(value.metadata, options?.metadata);
      if (!options?.type && !options?.text && (!metadata || metadata === value.metadata)) {
        return value;
      }
      return wrapStructured(value, options?.type, options?.text, metadata);
    }

    const inferredType = options?.type ?? this.inferLoaderType(value);
    const text = options?.text ?? this.deriveLoaderText(value, inferredType);
    const metadata = this.mergeMetadata(undefined, options?.metadata);
    return ensureStructuredValue(value, inferredType, text, metadata);
  }

  private inferLoaderType(value: unknown): StructuredValueType {
    if (typeof value === 'string') {
      return 'text';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    return 'object';
  }

  private deriveLoaderText(value: unknown, type: StructuredValueType): string {
    if (type === 'text') {
      return typeof value === 'string' ? value : String(value ?? '');
    }

    if (type === 'array') {
      if (Array.isArray(value)) {
        if (value.length > 0 && isLoadContentResult(value[0])) {
          return value.map(item => item.content ?? '').join('\n\n');
        }
        return value.map(item => String(item)).join('\n\n');
      }
      return String(value ?? '');
    }

    if (type === 'object' && value && typeof value === 'object' && 'content' in value && typeof (value as any).content === 'string') {
      return (value as any).content;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value ?? '');
    }
  }

  private mergeMetadata(
    base: StructuredValueMetadata | undefined,
    extra: StructuredValueMetadata | undefined
  ): StructuredValueMetadata | undefined {
    const baseSecurity = base?.security;
    const extraSecurity = extra?.security;
    const mergedSecurity =
      baseSecurity && extraSecurity
        ? mergeDescriptors(baseSecurity, extraSecurity)
        : baseSecurity ?? extraSecurity;

    const merged = {
      source: 'load-content' as const,
      ...(base || {}),
      ...(extra || {})
    } as StructuredValueMetadata;

    if (mergedSecurity) {
      merged.security = mergedSecurity;
    }

    return merged;
  }
}
