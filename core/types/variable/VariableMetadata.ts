/**
 * Variable Metadata Management
 * 
 * Types and utilities for managing variable metadata and source information.
 */

import { VariableSource, VariableMetadata } from './VariableTypes';
import type {
  CapabilityContext,
  SecurityDescriptor,
  DataLabel,
  TaintLevel,
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
      taintLevel?: TaintLevel;
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
      options?.taintLevel ||
      options?.sources ||
      options?.policyContext ||
      options?.capabilityKind;

    const descriptor = overrideProvided
      ? makeSecurityDescriptor({
          labels: options?.labels ?? baseDescriptor.labels,
          taintLevel: options?.taintLevel ?? baseDescriptor.taintLevel,
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
