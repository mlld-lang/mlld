import type { ExeReturnNode } from '@core/types';
import type { ToolReturnMode } from '@core/types/executable';

function isAstObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isExeReturnNode(value: unknown): value is ExeReturnNode {
  return isAstObject(value) && value.type === 'ExeReturn';
}

function isForExpressionNode(value: unknown): value is Record<string, unknown> {
  return isAstObject(value) && value.type === 'ForExpression';
}

function isForDirectiveNode(value: unknown): value is Record<string, unknown> {
  return isAstObject(value) && value.type === 'Directive' && value.kind === 'for';
}

export function analyzeReturnChannels(root: unknown): ToolReturnMode {
  let strict = false;
  let allToolSigilsInForBodies = true;

  const visit = (value: unknown, inForBody: boolean): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, inForBody);
      }
      return;
    }

    if (!isAstObject(value)) {
      return;
    }

    if (isExeReturnNode(value)) {
      const kind = value.kind ?? 'canonical';
      if (kind === 'tool' || kind === 'dual') {
        strict = true;
        if (!inForBody) {
          allToolSigilsInForBodies = false;
        }
      }
      return;
    }

    if (isForExpressionNode(value)) {
      visit(value.expression, true);
      visit(value.source, false);
      if ('keyVariable' in value) {
        visit(value.keyVariable, false);
      }
      visit(value.variable, false);
      return;
    }

    if (isForDirectiveNode(value)) {
      const directiveValues = value.values as Record<string, unknown> | undefined;
      visit(directiveValues?.action, true);
      visit(directiveValues?.source, false);
      visit(directiveValues?.variable, false);
      if (directiveValues && 'key' in directiveValues) {
        visit(directiveValues.key, false);
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'location' || key === 'raw' || key === 'meta' || key === 'nodeId') {
        continue;
      }
      visit(child, inForBody);
    }
  };

  visit(root, false);

  return {
    strict,
    allToolSigilsInForBodies: strict && allToolSigilsInForBodies
  };
}
