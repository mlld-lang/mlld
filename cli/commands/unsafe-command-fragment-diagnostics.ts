import type { Diagnostic } from 'vscode-languageserver/node.js';
import { DiagnosticSeverity } from 'vscode-languageserver/node.js';

type UnsafeCommandFragmentDefinition = {
  name: string;
  rawTemplate: string;
};

export function collectUnsafeCommandFragmentDiagnostics(ast: any[]): Diagnostic[] {
  const unsafeDefinitions = collectUnsafeCommandFragmentDefinitions(ast);
  if (unsafeDefinitions.size === 0) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  walkAst(ast, node => {
    if (!isCommandDirective(node)) {
      return;
    }

    const commandNodes = getCommandNodes(node);
    for (const commandNode of commandNodes) {
      const identifier = getInterpolatedVariableIdentifier(commandNode);
      if (!identifier) {
        continue;
      }

      const definition = unsafeDefinitions.get(identifier);
      if (!definition) {
        continue;
      }

      const range = toDiagnosticRange(commandNode.location ?? node.location);
      const dedupeKey = `${identifier}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range,
        message: [
          `Unsafe cmd fragment interpolation: @${identifier} was built from a quoted interpolated template.`,
          'This often breaks argv splitting in cmd { ... }.',
          `Template: ${truncateForDisplay(definition.rawTemplate, 120)}`,
          'Inline the arguments directly in cmd { ... } or switch to sh { ... }.'
        ].join('\n'),
        source: 'mlld'
      });
      seen.add(dedupeKey);
    }
  });

  return diagnostics;
}

function collectUnsafeCommandFragmentDefinitions(ast: any[]): Map<string, UnsafeCommandFragmentDefinition> {
  const definitions = new Map<string, UnsafeCommandFragmentDefinition>();

  walkAst(ast, node => {
    if (!isUnsafeCommandFragmentDefinition(node)) {
      return;
    }

    const identifier = extractDirectiveIdentifier(node);
    const rawTemplate = typeof node.meta?.rawTemplate === 'string' ? node.meta.rawTemplate : '';
    if (!identifier || !rawTemplate || definitions.has(identifier)) {
      return;
    }

    definitions.set(identifier, {
      name: identifier,
      rawTemplate
    });
  });

  return definitions;
}

function isUnsafeCommandFragmentDefinition(node: any): boolean {
  if (!node || node.type !== 'Directive' || node.kind !== 'var') {
    return false;
  }

  const rawTemplate = typeof node.meta?.rawTemplate === 'string' ? node.meta.rawTemplate : '';
  if (!rawTemplate || !/["']/.test(rawTemplate) || !/\s/.test(rawTemplate)) {
    return false;
  }

  const valueNodes = Array.isArray(node.values?.value) ? node.values.value : [];
  return containsInterpolationNode(valueNodes);
}

function containsInterpolationNode(nodes: readonly any[]): boolean {
  return nodes.some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }

    if (
      node.type === 'VariableReference' ||
      node.type === 'VariableReferenceWithTail' ||
      node.type === 'TemplateVariable' ||
      node.type === 'InterpolationVar' ||
      node.type === 'ExecInvocation'
    ) {
      return true;
    }

    return Object.values(node).some(value => {
      if (Array.isArray(value)) {
        return containsInterpolationNode(value);
      }
      if (value && typeof value === 'object') {
        return containsInterpolationNode([value]);
      }
      return false;
    });
  });
}

function isCommandDirective(node: any): boolean {
  if (!node || node.type !== 'Directive') {
    return false;
  }

  return (
    node.subtype === 'runCommand' ||
    node.subtype === 'exeCommand'
  );
}

function getCommandNodes(node: any): any[] {
  if (!node?.values) {
    return [];
  }

  if (Array.isArray(node.values.command)) {
    return node.values.command;
  }

  if (Array.isArray(node.values.identifier)) {
    return node.values.identifier;
  }

  return [];
}

function extractDirectiveIdentifier(node: any): string | null {
  const identifierNodes = Array.isArray(node?.values?.identifier) ? node.values.identifier : [];
  for (const identifierNode of identifierNodes) {
    if (identifierNode?.identifier) {
      return identifierNode.identifier;
    }
  }
  return null;
}

function getInterpolatedVariableIdentifier(node: any): string | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (
    (node.type === 'VariableReference' || node.type === 'TemplateVariable') &&
    typeof node.identifier === 'string'
  ) {
    return node.identifier;
  }

  if (
    node.type === 'VariableReferenceWithTail' &&
    node.variable &&
    typeof node.variable.identifier === 'string'
  ) {
    return node.variable.identifier;
  }

  return null;
}

function toDiagnosticRange(location: any): Diagnostic['range'] {
  if (!location?.start || !location?.end) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    };
  }

  return {
    start: {
      line: Math.max(0, (location.start.line || 1) - 1),
      character: Math.max(0, (location.start.column || 1) - 1)
    },
    end: {
      line: Math.max(0, (location.end.line || 1) - 1),
      character: Math.max(0, (location.end.column || 1) - 1)
    }
  };
}

function truncateForDisplay(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function walkAst(root: unknown, visitor: (node: any) => void): void {
  const seen = new Set<unknown>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const node = value as Record<string, unknown>;
    if (typeof node.type === 'string') {
      visitor(node);
    }

    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') {
        visit(child);
      }
    }
  };

  visit(root);
}
