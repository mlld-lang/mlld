/**
 * Variable Metadata Management
 * 
 * Types and utilities for managing variable metadata and source information.
 */

import { VariableSource, VariableMetadata, type Variable, type VariableMetrics, type VariableContextSnapshot } from './VariableTypes';
import type {
  CapabilityContext,
  SecurityDescriptor,
  DataLabel,
  CapabilityKind
} from '../security';
import {
  makeSecurityDescriptor,
  serializeSecurityDescriptor,
  deserializeSecurityDescriptor,
  serializeCapabilityContext,
  deserializeCapabilityContext,
  createCapabilityContext
} from '../security';
import { buildTokenMetrics, type TokenEstimationOptions, type TokenMetrics } from '@core/utils/token-metrics';

const EMPTY_LABELS: readonly DataLabel[] = Object.freeze([]);

// =========================================================================
// METADATA UTILITY FUNCTIONS
// =========================================================================

/**
 * Utility class for managing variable metadata
 */
export class VariableMetadataUtils {
  /**
   * Create consistent variable source metadata
   */
  static createSource(
    syntax: 'quoted' | 'template' | 'array' | 'object' | 'command' | 'code' | 'path' | 'reference',
    hasInterpolation: boolean,
    isMultiLine: boolean,
    wrapperType?: 'singleQuote' | 'doubleQuote' | 'backtick' | 'brackets'
  ): VariableSource {
    return {
      directive: 'var',
      syntax,
      wrapperType,
      hasInterpolation,
      isMultiLine
    };
  }

  /**
   * Merge metadata objects with proper precedence
   * Additional metadata takes precedence over base metadata
   */
  static mergeMetadata(
    base?: VariableMetadata,
    additional?: VariableMetadata
  ): VariableMetadata {
    if (!base && !additional) {
      return {};
    }
    if (!base) {
      return additional || {};
    }
    if (!additional) {
      return base;
    }
    
    return {
      ...base,
      ...additional
    };
  }

  /**
   * Validate metadata consistency
   */
  static validateMetadata(metadata: VariableMetadata): boolean {
    // Basic validation - can be extended
    if (metadata.isPipelineInput && typeof metadata.pipelineStage !== 'undefined') {
      return typeof metadata.pipelineStage === 'number' && metadata.pipelineStage >= 0;
    }
    
    if (metadata.isImported && !metadata.importPath) {
      return false;
    }
    
    return true;
  }

  /**
   * Extract source information for debugging
   */
  static extractSourceInfo(source: VariableSource): string {
    const parts: string[] = [source.directive];
    
    if (source.syntax) {
      parts.push(`syntax:${source.syntax}`);
    }
    
    if (source.wrapperType) {
      parts.push(`wrapper:${source.wrapperType}`);
    }
    
    if (source.hasInterpolation) {
      parts.push('interpolated');
    }
    
    if (source.isMultiLine) {
      parts.push('multiline');
    }
    
    return parts.join(' ');
  }

  /**
   * Check if metadata indicates a complex variable
   */
  static isComplexVariable(metadata?: VariableMetadata): boolean {
    return Boolean(metadata?.isComplex);
  }

  /**
   * Check if metadata indicates an imported variable
   */
  static isImportedVariable(metadata?: VariableMetadata): boolean {
    return Boolean(metadata?.isImported);
  }

  /**
   * Check if metadata indicates a pipeline input variable
   */
  static isPipelineInputVariable(metadata?: VariableMetadata): boolean {
    return Boolean(metadata?.isPipelineInput);
  }

  /**
   * Create metadata for imported variables
   */
  static createImportMetadata(
    importPath: string,
    additionalMetadata?: VariableMetadata
  ): VariableMetadata {
    const importMetadata: VariableMetadata = {
      isImported: true,
      importPath
    };
    
    return this.mergeMetadata(importMetadata, additionalMetadata);
  }

  /**
   * Create metadata for pipeline input variables
   */
  static createPipelineMetadata(
    pipelineStage?: number,
    additionalMetadata?: VariableMetadata
  ): VariableMetadata {
    const pipelineMetadata: VariableMetadata = {
      isPipelineInput: true,
      pipelineStage
    };
    
    return this.mergeMetadata(pipelineMetadata, additionalMetadata);
  }

  /**
   * Create metadata for complex variables
   */
  static createComplexMetadata(
    additionalMetadata?: VariableMetadata
  ): VariableMetadata {
    const complexMetadata: VariableMetadata = {
      isComplex: true
    };
    
    return this.mergeMetadata(complexMetadata, additionalMetadata);
  }

  /**
   * Ensure metadata carries a security descriptor and optional capability context.
   * When labels are provided, they override any existing descriptor.
   * When no descriptor exists, a default descriptor is attached.
   */
  static applySecurityMetadata(
    metadata?: VariableMetadata,
    options?: {
      labels?: DataLabel[];
      existingDescriptor?: SecurityDescriptor;
      capability?: CapabilityContext;
      taint?: DataLabel[];
      sources?: string[];
      policyContext?: Record<string, unknown>;
      capabilityKind?: CapabilityKind;
    }
  ): VariableMetadata {
    const result: VariableMetadata = { ...(metadata ?? {}) };
    const baseDescriptor =
      options?.existingDescriptor ??
      result.security ??
      makeSecurityDescriptor();

    const overrideProvided =
      options?.labels ||
      options?.taint ||
      options?.sources ||
      options?.policyContext ||
      options?.capabilityKind;

    const descriptor = overrideProvided
      ? makeSecurityDescriptor({
          labels: options?.labels ?? baseDescriptor.labels,
          taint: options?.taint ?? baseDescriptor.taint,
          sources: options?.sources ?? baseDescriptor.sources,
          capability: options?.capabilityKind ?? baseDescriptor.capability,
          policyContext: {
            ...(baseDescriptor.policyContext ?? {}),
            ...(options?.policyContext ?? {})
          }
        })
      : baseDescriptor;

    result.security = descriptor;

    if (options?.capability) {
      result.capability =
        options.capability.security === descriptor
          ? options.capability
          : createCapabilityContext({
              kind: options.capability.kind,
              importType: options.capability.importType,
              descriptor,
              metadata: options.capability.metadata
                ? { ...options.capability.metadata }
                : undefined,
              policy: options.capability.policy
                ? { ...options.capability.policy }
                : undefined,
              operation: options.capability.operation
                ? { ...options.capability.operation }
                : undefined
            });
    } else if (result.capability) {
      const existing = result.capability;
      if (existing.security !== descriptor) {
        result.capability = createCapabilityContext({
          kind: existing.kind,
          importType: existing.importType,
          descriptor,
          metadata: existing.metadata ? { ...existing.metadata } : undefined,
          policy: existing.policy ? { ...existing.policy } : undefined,
          operation: existing.operation ? { ...existing.operation } : undefined
        });
      }
    }

    return result;
  }

  /**
   * Serialize security-aware metadata fragments for persistence.
   */
  static serializeSecurityMetadata(
    metadata?: VariableMetadata
  ): {
    security?: ReturnType<typeof serializeSecurityDescriptor>;
    capability?: ReturnType<typeof serializeCapabilityContext>;
  } | undefined {
    if (!metadata) {
      return undefined;
    }

    const serializedSecurity = serializeSecurityDescriptor(metadata.security);
    const serializedCapability = serializeCapabilityContext(metadata.capability);

    if (!serializedSecurity && !serializedCapability) {
      return undefined;
    }

    return {
      security: serializedSecurity,
      capability: serializedCapability
    };
  }

  /**
   * Deserialize persisted security metadata fragments.
   */
  static deserializeSecurityMetadata(
    payload?:
      | {
          security?: ReturnType<typeof serializeSecurityDescriptor>;
          capability?: ReturnType<typeof serializeCapabilityContext>;
        }
      | null
  ): Pick<VariableMetadata, 'security' | 'capability'> {
    if (!payload) {
      return {};
    }

    const security = deserializeSecurityDescriptor(payload.security);
    const capability = deserializeCapabilityContext(payload.capability);
    return {
      ...(security ? { security } : {}),
      ...(capability ? { capability } : {})
    };
  }

  static applyTextMetrics(
    metadata: VariableMetadata | undefined,
    text: string | undefined,
    options?: TokenEstimationOptions
  ): VariableMetadata | undefined {
    if (typeof text !== 'string') {
      return metadata;
    }
    const metrics = buildTokenMetrics(text, options);
    if (!metadata) {
      return { metrics };
    }
    return {
      ...metadata,
      metrics: VariableMetadataUtils.mergeMetrics(metadata.metrics, metrics)
    };
  }

  static assignMetrics(variable: Variable, metrics: VariableMetrics): void {
    if (!variable.internal) {
      variable.internal = {};
    }
    variable.internal.metrics = metrics;
    if (!variable.mx) {
      VariableMetadataUtils.attachContext(variable);
    }
    if (variable.mx) {
      variable.mx.length = metrics.length;
      variable.mx.tokest = metrics.tokest;
      variable.mx.tokens = metrics.tokens ?? metrics.tokest;
    }
    if (variable.internal.mxCache) {
      variable.internal.mxCache = variable.mx as VariableContextSnapshot;
    }
  }

  static attachContext(variable: Variable): Variable {
    if ((variable as any).__mxAttached) {
      return variable;
    }
    if (!variable.internal) {
      variable.internal = {};
    }
    const descriptor = Object.getOwnPropertyDescriptor(variable, 'mx');
    if (descriptor && !descriptor.get && !descriptor.set) {
      Object.defineProperty(variable, 'mx', {
        value: variable.mx,
        enumerable: false,
        configurable: true,
        writable: true
      });
      Object.defineProperty(variable, '__mxAttached', {
        value: true,
        enumerable: false,
        configurable: false
      });
      return variable;
    }
    Object.defineProperty(variable, '__mxAttached', {
      value: true,
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(variable, 'mx', {
      enumerable: false,
      configurable: true,
      get() {
        return VariableMetadataUtils.buildVariableContext(variable);
      }
    });
    return variable;
  }

  private static buildVariableContext(variable: Variable): VariableContextSnapshot {
    if (!variable.internal) {
      variable.internal = {};
    }
    if (variable.internal.mxCache) {
      return variable.internal.mxCache;
    }
    const metrics = VariableMetadataUtils.computeMetricsForVariable(variable);
    // GOTCHA: Do NOT access variable.mx here as it will call this getter recursively!
    // Instead, get the raw property descriptor to check if there's a stored value
    const descriptor = Object.getOwnPropertyDescriptor(variable, 'mx');
    const mxSnapshot = (descriptor && !descriptor.get && descriptor.value) ? descriptor.value : {};
    const labels = normalizeLabelArray(mxSnapshot.labels);
    const tokenValue = metrics?.tokens ?? metrics?.tokest ?? undefined;
    const tokestValue = metrics?.tokest ?? metrics?.tokens ?? undefined;
    const context: VariableContextSnapshot = {
      name: variable.name,
      type: variable.type,
      definedAt: variable.definedAt,
      labels,
      taint: mxSnapshot.taint ?? 'unknown',
      tokens: tokenValue,
      tokest: tokestValue,
      length: metrics?.length,
      size: Array.isArray(variable.value) ? variable.value.length : undefined,
      sources: mxSnapshot.sources ?? [],
      exported: Boolean(mxSnapshot.exported),
      policy: mxSnapshot.policy ?? null
    };
    if (variable.type === 'array' && variable.internal) {
      const aggregate = (variable.internal as any).arrayHelperAggregate;
      if (aggregate) {
        const hasAggregateContexts =
          Array.isArray(aggregate.contexts) && aggregate.contexts.length > 0;
        if (hasAggregateContexts) {
          context.labels = aggregate.labels;
          context.sources = aggregate.sources;
        }
        context.tokens = aggregate.tokens;
        context.totalTokens = aggregate.totalTokens;
        context.maxTokens = aggregate.maxTokens;
      }
    }
    variable.internal.mxCache = context;
    return context;
  }

  private static computeMetricsForVariable(variable: Variable): VariableMetrics | undefined {
    if (variable.internal?.metrics) {
      return variable.internal.metrics;
    }

    if (typeof variable.value === 'string') {
      const metrics = buildTokenMetrics(variable.value);
      VariableMetadataUtils.assignMetrics(variable, metrics);
      return metrics;
    }

    const text = (variable.value as any)?.text;
    if (typeof text === 'string') {
      const metrics = buildTokenMetrics(text);
      VariableMetadataUtils.assignMetrics(variable, metrics);
      return metrics;
    }

    return undefined;
  }

  private static mergeMetrics(
    existing: VariableMetrics | undefined,
    incoming: TokenMetrics
  ): VariableMetrics {
    if (!existing) {
      return incoming;
    }
    if (existing.source === 'exact' && incoming.source !== 'exact') {
      return existing;
    }
    return {
      ...existing,
      ...incoming
    };
  }
}

function normalizeLabelArray(
  labels: readonly DataLabel[] | DataLabel | undefined | null
): readonly DataLabel[] {
  if (Array.isArray(labels)) {
    return labels;
  }
  if (labels === undefined || labels === null) {
    return EMPTY_LABELS;
  }
  return [labels];
}

// =========================================================================
// SOURCE CREATION HELPERS
// =========================================================================

/**
 * Helper functions for creating common variable source configurations
 */
export class VariableSourceHelpers {
  /**
   * Create source for quoted text variables
   */
  static createQuotedSource(
    wrapperType: 'singleQuote' | 'doubleQuote',
    hasInterpolation: boolean = false,
    isMultiLine: boolean = false
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'quoted',
      hasInterpolation,
      isMultiLine,
      wrapperType
    );
  }

  /**
   * Create source for template variables
   */
  static createTemplateSource(
    isMultiLine: boolean = false
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'template',
      true, // Templates always have interpolation
      isMultiLine,
      'backtick'
    );
  }

  /**
   * Create source for array variables
   */
  static createArraySource(
    hasInterpolation: boolean = false,
    isMultiLine: boolean = false
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'array',
      hasInterpolation,
      isMultiLine,
      'brackets'
    );
  }

  /**
   * Create source for object variables
   */
  static createObjectSource(
    hasInterpolation: boolean = false,
    isMultiLine: boolean = true // Objects are typically multiline
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'object',
      hasInterpolation,
      isMultiLine
    );
  }

  /**
   * Create source for command variables
   */
  static createCommandSource(
    isMultiLine: boolean = false
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'command',
      true, // Commands typically have interpolation
      isMultiLine
    );
  }

  /**
   * Create source for code variables
   */
  static createCodeSource(
    isMultiLine: boolean = true // Code is typically multiline
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'code',
      true, // Code may have interpolation
      isMultiLine
    );
  }

  /**
   * Create source for path variables
   */
  static createPathSource(
    hasInterpolation: boolean = false
  ): VariableSource {
    return VariableMetadataUtils.createSource(
      'path',
      hasInterpolation,
      false, // Paths are typically single line
      'brackets'
    );
  }

  /**
   * Create source for reference variables
   */
  static createReferenceSource(): VariableSource {
    return VariableMetadataUtils.createSource(
      'reference',
      false, // References don't have interpolation
      false
    );
  }
}
