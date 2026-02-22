/**
 * Ensures modules provide explicit export manifests and validates bindings.
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type {
  ModuleData,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ExportBinding,
  ValidationContext
} from '../types/PublishingTypes';
import type {
  MlldNode,
  ExportDirectiveNode,
  ExportReferenceNode,
  VarDirectiveNode,
  PathDirectiveNode,
  ExeDirectiveNode,
  VariableReferenceNode,
  TextNode,
  GuardDirectiveNode
} from '@core/types';
import { astLocationToSourceLocation } from '@core/types';

interface ExportCollection {
  entries: ExportBinding[];
  manifestCount: number;
  hasWildcard: boolean;
}

const EXPORT_REGEX = /^\s*\/export\s*\{([^}]+)\}/gm;

export class ExportValidator implements ValidationStep {
  name = 'exports';

  async validate(module: ModuleData, _context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Skills and commands are markdown files, not mlld modules — no exports expected
    if (module.moduleType === 'skill' || module.moduleType === 'command') {
      return { valid: true, errors: [], warnings: [] };
    }

    const { entries, manifestCount, hasWildcard } = this.collectExportBindings(module);
    const declarations = this.collectDeclarations(module.ast);

    if (manifestCount === 0) {
      errors.push({
        field: 'exports',
        message: 'Add `/export { name, otherName }` to declare the module API.'
      });
    }

    if (hasWildcard) {
      errors.push({
        field: 'exports',
        message: 'Wildcard manifests (`/export { * }`) are not allowed when publishing. List each exported binding explicitly.'
      });
    }

    for (const binding of entries) {
      if (declarations.has(binding.name)) {
        continue;
      }
      errors.push({
        field: 'exports',
        message:
          `Exported name '${binding.name}' is not declared by any recognized binding. ` +
          'Declare it with /var, /exe, /guard (with a name), or another directive that defines a binding before exporting.'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      exports: entries
    };
  }

  private collectExportBindings(module: ModuleData): ExportCollection {
    const entries: ExportBinding[] = [];
    let manifestCount = 0;
    let hasWildcard = false;

    this.walkAst(module.ast, node => {
      if (node.type !== 'Directive' || node.kind !== 'export') return;

      manifestCount += 1;
      const directive = node as ExportDirectiveNode;
      const exportNodes = directive.values?.exports ?? [];

      for (const exportNode of exportNodes as ExportReferenceNode[]) {
        if (exportNode.identifier === '*') {
          hasWildcard = true;
          continue;
        }

        entries.push({
          name: exportNode.identifier,
          alias: exportNode.alias,
          location: astLocationToSourceLocation(exportNode.location, module.filePath)
        });
      }
    });

    if (manifestCount === 0) {
      let match: RegExpExecArray | null;
      while ((match = EXPORT_REGEX.exec(module.content)) !== null) {
        manifestCount += 1;
        const members = match[1]
          .split(',')
          .map(part => part.trim())
          .filter(Boolean);

        for (const member of members) {
          if (member === '*') {
            hasWildcard = true;
            continue;
          }

          const [rawName, rawAlias] = member.split(/\s+as\s+/i).map(value => value.trim());
          const name = this.stripLeadingAt(rawName);
          const alias = rawAlias ? this.stripLeadingAt(rawAlias) : undefined;
          if (!name) continue;

          entries.push({ name, alias });
        }
      }
    }

    return { entries, manifestCount, hasWildcard };
  }

  private stripLeadingAt(value?: string): string {
    if (!value) return '';
    return value.startsWith('@') ? value.slice(1) : value;
  }

  private collectDeclarations(ast: MlldNode[]): Map<string, string> {
    const declarations = new Map<string, string>();
    this.walkAst(ast, node => {
      if (node.type !== 'Directive') return;

      switch (node.kind) {
        case 'var':
          this.extractVarNames(node as VarDirectiveNode).forEach(name => {
            if (!declarations.has(name)) declarations.set(name, 'var');
          });
          break;
        case 'path':
          this.extractVarNames(node as PathDirectiveNode).forEach(name => {
            if (!declarations.has(name)) declarations.set(name, 'path');
          });
          break;
        case 'exe':
          {
            const name = this.extractExeName(node as ExeDirectiveNode);
            if (name && !declarations.has(name)) {
              declarations.set(name, 'exe');
            }
          }
          break;
        case 'guard':
          this.extractGuardNames(node as GuardDirectiveNode).forEach(name => {
            if (!declarations.has(name)) declarations.set(name, 'guard');
          });
          break;
        default:
          break;
      }
    });

    return declarations;
  }

  private extractVarNames(node: VarDirectiveNode | PathDirectiveNode): string[] {
    const identifierNodes = node.values?.identifier;
    return this.extractIdentifierValues(identifierNodes);
  }

  private extractGuardNames(node: GuardDirectiveNode): string[] {
    return this.extractIdentifierValues(node.values?.name);
  }

  private extractIdentifierValues(field: unknown): string[] {
    if (!field) return [];

    const refs = Array.isArray(field) ? field : [field];
    const names: string[] = [];
    for (const ref of refs as VariableReferenceNode[]) {
      if (ref?.type === 'VariableReference' && typeof ref.identifier === 'string') {
        names.push(ref.identifier);
      }
    }
    return names;
  }

  private extractExeName(node: ExeDirectiveNode): string | null {
    const fragments = node.values?.identifier;
    if (!Array.isArray(fragments)) return null;

    const parts = fragments
      .map(fragment => {
        if (fragment.type === 'VariableReference') {
          return (fragment as VariableReferenceNode).identifier || '';
        }
        if (typeof (fragment as TextNode).content === 'string') {
          return (fragment as TextNode).content;
        }
        return '';
      })
      .join('')
      .trim();

    return parts || null;
  }

  private walkAst(nodes: MlldNode[] | undefined, visitor: (node: MlldNode) => void): void {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      visitor(node);

      const possibleNested = (node as any).content;
      if (Array.isArray(possibleNested)) {
        this.walkAst(possibleNested as MlldNode[], visitor);
      }
    }
  }
}
