import type { DirectiveNode } from '@core/types';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  createArrayVariable,
  createObjectVariable,
  type ExecutableVariable,
  type Variable,
  type VariableMetadata,
  type VariableSource,
  type VariableTypeDiscriminator,
  VariableMetadataUtils
} from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { isNodeProxy } from '@interpreter/utils/node-interop';
import { isStructuredValue } from '@interpreter/utils/structured-value';

type SerializedSecurityMetadata =
  | ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>
  | undefined;
type SerializedMetadataMap = Record<string, SerializedSecurityMetadata>;

export interface VariableImportUtilitiesDependencies {
  createExecutableFromImport: (
    name: string,
    value: any,
    source: VariableSource,
    metadata: VariableMetadata,
    securityLabels?: DataLabel[]
  ) => ExecutableVariable;
}

export class VariableImportUtilities {
  constructor(private readonly dependencies: VariableImportUtilitiesDependencies) {}

  unwrapArraySnapshots(value: any, importPath: string, seen = new WeakSet<object>()): any {
    if (Array.isArray(value)) {
      return value.map(item => this.unwrapArraySnapshots(item, importPath, seen));
    }

    if (value && typeof value === 'object') {
      if (isNodeProxy(value)) {
        return value;
      }
      if (seen.has(value as object)) {
        return value;
      }
      seen.add(value as object);
      if ((value as any).__arraySnapshot) {
        const snapshot = value as { value: any[]; metadata?: Record<string, any>; isComplex?: boolean; name?: string };
        const source: VariableSource = {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        };
        const arrayMetadata = {
          ...(snapshot.metadata || {}),
          isImported: true,
          importPath,
          originalName: snapshot.name
        };
        const normalizedElements = Array.isArray(snapshot.value)
          ? snapshot.value.map(item => this.unwrapArraySnapshots(item, importPath, seen))
          : [];
        const arrayName = snapshot.name || 'imported_array';
        return createArrayVariable(arrayName, normalizedElements, snapshot.isComplex === true, source, arrayMetadata);
      }

      if ((value as any).__executable) {
        const source: VariableSource = {
          directive: 'exe',
          syntax: 'braces',
          hasInterpolation: false,
          isMultiLine: false
        };
        return this.dependencies.createExecutableFromImport(
          'property',
          value,
          source,
          { isImported: true, importPath }
        );
      }

      if (isStructuredValue(value)) {
        return value;
      }

      const result: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.unwrapArraySnapshots(entry, importPath, seen);
      }
      return result;
    }

    return value;
  }

  createNamespaceVariable(
    alias: string,
    moduleObject: Record<string, any>,
    importPath: string,
    securityLabels?: DataLabel[],
    metadataMap?: SerializedMetadataMap,
    env?: Environment,
    options?: { strictFieldAccess?: boolean }
  ): Variable {
    const source: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };

    const isComplex = this.hasComplexContent(moduleObject);
    const snapshot = env?.getSecuritySnapshot?.();
    const snapshotDescriptor = snapshot
      ? makeSecurityDescriptor({
          labels: snapshot.labels,
          taint: snapshot.taint,
          sources: snapshot.sources,
          policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
        })
      : undefined;

    const metadata = VariableMetadataUtils.applySecurityMetadata(
      {
        isImported: true,
        importPath,
        definedAt: { line: 0, column: 0, filePath: importPath },
        namespaceMetadata: metadataMap
      },
      {
        labels: securityLabels,
        existingDescriptor: snapshotDescriptor
      }
    );
    const namespaceOptions = {
      metadata,
      internal: {
        isNamespace: true,
        strictFieldAccess: options?.strictFieldAccess === true
      }
    };

    return createObjectVariable(alias, moduleObject, isComplex, source, namespaceOptions);
  }

  hasComplexContent(value: any, seen = new WeakSet<object>()): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    if (this.isVariableLike(value)) {
      return false;
    }

    if (isNodeProxy(value)) {
      return false;
    }

    if (seen.has(value as object)) {
      return false;
    }
    seen.add(value as object);

    if (value.type) {
      return true;
    }

    if (value.__executable) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.some(item => this.hasComplexContent(item, seen));
    }

    for (const prop of Object.values(value)) {
      if (this.hasComplexContent(prop, seen)) {
        return true;
      }
    }

    return false;
  }

  inferVariableType(value: any): VariableTypeDiscriminator {
    if (isStructuredValue(value)) {
      return 'structured';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    if (value && typeof value === 'object') {
      return 'object';
    }
    return 'simple-text';
  }

  isLegitimateVariableForExport(variable: Variable): boolean {
    const isSystem = variable.internal?.isSystem ?? false;
    if (isSystem) {
      return false;
    }
    return true;
  }

  getImportDisplayPath(directive: DirectiveNode, fallback: string): string {
    const raw = (directive as any)?.raw;
    if (raw && typeof raw.path === 'string' && raw.path.trim().length > 0) {
      const trimmed = raw.path.trim();
      return trimmed.replace(/^['"]|['"]$/g, '');
    }
    return fallback;
  }

  private isVariableLike(value: any): boolean {
    return value &&
      typeof value === 'object' &&
      typeof value.type === 'string' &&
      'name' in value &&
      'value' in value &&
      'source' in value &&
      'createdAt' in value &&
      'modifiedAt' in value;
  }
}
