import type { ToolReturnMode } from '@core/types/executable';

export type ReturnChannelKind = 'tool' | 'dual' | 'canonical';

export interface ReturnChannelLocation {
  line?: number;
  column?: number;
}

export interface ReturnChannelSite {
  kind: ReturnChannelKind;
  inForBody: boolean;
  location?: ReturnChannelLocation;
}

export interface ReturnChannelAnalysis {
  strict: boolean;
  allToolSigilsInForBodies: boolean;
  sites: ReturnChannelSite[];
  toolSites: ReturnChannelSite[];
}

function isAstObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isExeReturnNode(value: unknown): value is Record<string, unknown> {
  return isAstObject(value) && value.type === 'ExeReturn';
}

function isForExpressionNode(value: unknown): value is Record<string, unknown> {
  return isAstObject(value) && value.type === 'ForExpression';
}

function isForDirectiveNode(value: unknown): value is Record<string, unknown> {
  return isAstObject(value) && value.type === 'Directive' && value.kind === 'for';
}

function readLocation(node: Record<string, unknown>): ReturnChannelLocation | undefined {
  const location = node.location as
    | { start?: { line?: number; column?: number } }
    | undefined;
  const start = location?.start;
  if (!start) {
    return undefined;
  }
  return { line: start.line, column: start.column };
}

export function analyzeReturnChannels(root: unknown): ReturnChannelAnalysis {
  const sites: ReturnChannelSite[] = [];

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
      const kind = (value.kind as ReturnChannelKind | undefined) ?? 'canonical';
      sites.push({
        kind,
        inForBody,
        location: readLocation(value)
      });
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

  const toolSites = sites.filter(site => site.kind === 'tool' || site.kind === 'dual');
  const strict = toolSites.length > 0;
  const allToolSigilsInForBodies = strict && toolSites.every(site => site.inForBody);

  return {
    strict,
    allToolSigilsInForBodies,
    sites,
    toolSites
  };
}

export function toToolReturnMode(analysis: ReturnChannelAnalysis): ToolReturnMode {
  return {
    strict: analysis.strict,
    allToolSigilsInForBodies: analysis.allToolSigilsInForBodies
  };
}
