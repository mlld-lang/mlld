/**
 * Import validation for mlld modules
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type {
  ModuleData,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ImportRecord,
  ImportBinding,
  ValidationContext
} from '../types/PublishingTypes';
import type {
  ImportDirectiveNode,
  ImportReferenceNode,
  ImportWildcardNode,
  TimeDurationNode,
  MlldNode,
  TextNode,
  LiteralNode,
  VariableReferenceNode,
  PathSeparatorNode,
  DotSeparatorNode
} from '@core/types';
import { astLocationToSourceLocation } from '@core/types';

const DEFAULT_ALLOWED_AUTHORS = new Set<string>(['mlld']);

export class ImportValidator implements ValidationStep {
  name = 'imports';

  async validate(module: ModuleData, context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const records: ImportRecord[] = [];

    const ast = Array.isArray(module.ast) ? module.ast : [];
    const allowedAuthors = new Set<string>(DEFAULT_ALLOWED_AUTHORS);

    if (module.metadata?.author) {
      allowedAuthors.add(module.metadata.author);
    }
    if (context.user?.login) {
      allowedAuthors.add(context.user.login);
    }

    for (const node of ast) {
      if (node.type !== 'Directive' || node.kind !== 'import') continue;

      const directive = node as ImportDirectiveNode;
      const record = this.describeImport(directive, module.filePath);
      records.push(record);

      if (record.source === 'registry' && record.author) {
        if (!allowedAuthors.has(record.author)) {
          errors.push({
            field: 'imports',
            message: `Registry import @${record.author}/${record.module ?? ''} is outside your publishing namespace. Publish modules only depend on namespaces you control.`,
            severity: 'error'
          });
        }
      }

      if (record.source === 'local' || record.preferLocal) {
        warnings.push({
          field: 'imports',
          message: `Local import ${record.path} may not be available to registry consumers. Publish the dependency or remove the local flag.`,
          severity: 'warning'
        });
      }

      if (record.source === 'url') {
        warnings.push({
          field: 'imports',
          message: `Network import ${record.path} (${record.importType ?? 'live'}) runs at publish time. Confirm the registry policy allows external HTTP sources.`,
          severity: 'warning'
        });
      }

      if (record.source === 'resolver' && record.resolverName !== 'local') {
        warnings.push({
          field: 'imports',
          message: `Resolver import ${record.path} uses @${record.resolverName}. Ensure this resolver is approved for published modules.`,
          severity: 'warning'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      imports: records
    };
  }

  private describeImport(directive: ImportDirectiveNode, filePath: string): ImportRecord {
    const bindings = this.collectBindings(directive, filePath);
    const rawPath = directive.raw?.path ?? this.serializePath(directive.values?.path ?? []);
    const importType = directive.values?.importType;
    const cachedDuration = this.formatDuration(directive.values?.cachedDuration);
    const location = astLocationToSourceLocation(directive.location, filePath);
    const metaPath = (directive.meta as any)?.path ?? {};

    const record: ImportRecord = {
      source: 'unknown',
      path: rawPath,
      importType,
      bindings,
      cachedDuration,
      location
    };

    if (metaPath?.isModule) {
      const namespace = metaPath.namespace as string | undefined;
      const moduleName = metaPath.name as string | undefined;
      const isLocalNamespace = namespace === 'local' || namespace === '@local';

      if (importType === 'local' || isLocalNamespace) {
        record.source = 'local';
        record.preferLocal = true;
        record.author = namespace;
        record.module = moduleName;
      } else {
        record.source = 'registry';
        record.author = namespace;
        record.module = moduleName;
      }
    } else if (importType === 'local') {
      record.source = 'local';
      record.preferLocal = true;
    } else if (this.looksLikeUrl(rawPath)) {
      record.source = 'url';
    } else if (metaPath?.isSpecial) {
      const sourceName = typeof metaPath.source === 'string' ? metaPath.source : undefined;
      if (sourceName === 'stdin' || rawPath === '@input') {
        record.source = 'input';
      } else {
        record.source = 'resolver';
        record.resolverName = sourceName ?? rawPath.replace(/^@/, '');
      }
    } else if (this.looksLikeResolver(rawPath)) {
      record.source = 'resolver';
      record.resolverName = rawPath.replace(/^@/, '').split(/[\/]/)[0];
    } else if (this.looksLikeFile(rawPath, metaPath)) {
      record.source = 'file';
    }

    return record;
  }

  private collectBindings(directive: ImportDirectiveNode, filePath: string): ImportBinding[] {
    const bindings: ImportBinding[] = [];

    if (directive.subtype === 'importNamespace') {
      const namespaceNodes = directive.values?.namespace as TextNode[] | undefined;
      const name = this.joinText(namespaceNodes);
      if (name) {
        bindings.push({
          name,
          location: astLocationToSourceLocation(directive.location, filePath)
        });
      }
      return bindings;
    }

    const importNodes = directive.values?.imports ?? [];
    for (const specifier of importNodes as Array<ImportReferenceNode | ImportWildcardNode>) {
      if (specifier.identifier === '*') {
        bindings.push({
          name: '*',
          location: astLocationToSourceLocation(specifier.location, filePath)
        });
        continue;
      }
      bindings.push({
        name: specifier.identifier,
        alias: specifier.alias,
        location: astLocationToSourceLocation(specifier.location, filePath)
      });
    }

    return bindings;
  }

  private serializePath(pathNodes: MlldNode[]): string {
    if (!Array.isArray(pathNodes) || pathNodes.length === 0) {
      return '';
    }

    return pathNodes
      .map(node => {
        switch (node.type) {
          case 'Text':
            return (node as TextNode).content ?? '';
          case 'Literal':
            return String((node as LiteralNode).value ?? '');
          case 'VariableReference':
            return `@${(node as VariableReferenceNode).identifier ?? ''}`;
          case 'PathSeparator':
            return (node as PathSeparatorNode).value ?? '/';
          case 'DotSeparator':
            return (node as DotSeparatorNode).value ?? '.';
          default:
            return '';
        }
      })
      .join('')
      .trim();
  }

  private joinText(nodes?: TextNode[]): string {
    if (!Array.isArray(nodes)) return '';
    return nodes.map(node => node?.content ?? '').join('').trim();
  }

  private formatDuration(node?: TimeDurationNode): string | undefined {
    if (!node) return undefined;
    const unitAbbreviation: Record<string, string> = {
      seconds: 's',
      minutes: 'm',
      hours: 'h',
      days: 'd',
      weeks: 'w',
      years: 'y'
    };
    const suffix = unitAbbreviation[node.unit] ?? node.unit;
    return `${node.value}${suffix}`;
  }

  private looksLikeUrl(path: string): boolean {
    return /^https?:\/\//i.test(path);
  }

  private looksLikeResolver(path: string): boolean {
    return path.startsWith('@') && !path.startsWith('@/');
  }

  private looksLikeFile(path: string, metaPath: any): boolean {
    if (metaPath?.hasExtension) {
      return true;
    }
    return path.startsWith('./') || path.startsWith('../') || path.startsWith('/');
  }
}
