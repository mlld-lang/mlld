import type { Definition } from './types';
import {
  createBlockDefinition,
  createLineDefinition,
  findBraceBlockEnd,
  getLinesAndOffsets
} from './shared-utils';

interface GoLineMatch {
  functionName?: string;
  typeName?: string;
  variableName?: string;
}

function createGoType(typeLine: string): string {
  if (/struct/.test(typeLine)) {
    return 'struct';
  }
  if (/interface/.test(typeLine)) {
    return 'interface';
  }
  return 'type';
}

function createGoFunctionType(trimmed: string): string {
  return trimmed.startsWith('func (') ? 'method' : 'function';
}

function parseGoLine(trimmed: string): GoLineMatch {
  const functionMatch = /^func\s+(?:\([^)]+\)\s*)?(\w+)/.exec(trimmed);
  if (functionMatch) {
    return { functionName: functionMatch[1] };
  }

  const typeMatch = /^type\s+(\w+)/.exec(trimmed);
  if (typeMatch) {
    return { typeName: typeMatch[1] };
  }

  const variableMatch = /^(?:var|const)\s+(\w+)/.exec(trimmed);
  if (variableMatch) {
    return { variableName: variableMatch[1] };
  }

  return {};
}

export function extractGoDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineMatch = parseGoLine(trimmed);

    if (lineMatch.functionName) {
      const endLine = findBraceBlockEnd(lines, i);
      const type = createGoFunctionType(trimmed);
      defs.push(createBlockDefinition(content, offsets, i, endLine, lineMatch.functionName, type));
      i = endLine - 1;
      continue;
    }

    if (lineMatch.typeName) {
      const endLine = findBraceBlockEnd(lines, i);
      const type = createGoType(trimmed);
      defs.push(createBlockDefinition(content, offsets, i, endLine, lineMatch.typeName, type));
      i = endLine - 1;
      continue;
    }

    if (lineMatch.variableName) {
      defs.push(createLineDefinition(content, line, offsets, i, lineMatch.variableName, 'variable'));
    }
  }

  return defs;
}
