import type { Definition } from './types';
import {
  createBlockDefinition,
  createLineDefinition,
  findBraceBlockEnd,
  getLinesAndOffsets
} from './shared-utils';

function createRustTopLevelBlock(
  defs: Definition[],
  content: string,
  offsets: number[],
  lines: string[],
  line: number,
  name: string,
  type: string
): number {
  const endLine = findBraceBlockEnd(lines, line);
  defs.push(createBlockDefinition(content, offsets, line, endLine, name, type));
  return endLine;
}

export function extractRustDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    const fnMatch = /^(?:pub\s+)?fn\s+(\w+)/.exec(trimmed);
    const structMatch = /^(?:pub\s+)?struct\s+(\w+)/.exec(trimmed);
    const enumMatch = /^(?:pub\s+)?enum\s+(\w+)/.exec(trimmed);
    const traitMatch = /^(?:pub\s+)?trait\s+(\w+)/.exec(trimmed);
    const constMatch = /^(?:pub\s+)?(?:const|static)\s+(\w+)/.exec(trimmed);

    if (indent === 0 && fnMatch) {
      const endLine = createRustTopLevelBlock(defs, content, offsets, lines, i, fnMatch[1], 'function');
      i = endLine - 1;
      continue;
    }

    if (indent === 0 && structMatch) {
      const endLine = createRustTopLevelBlock(defs, content, offsets, lines, i, structMatch[1], 'struct');
      i = endLine - 1;
      continue;
    }

    if (indent === 0 && enumMatch) {
      const endLine = createRustTopLevelBlock(defs, content, offsets, lines, i, enumMatch[1], 'enum');
      i = endLine - 1;
      continue;
    }

    if (indent === 0 && traitMatch) {
      const endLine = createRustTopLevelBlock(defs, content, offsets, lines, i, traitMatch[1], 'trait');
      i = endLine - 1;
      continue;
    }

    if (indent === 0 && constMatch) {
      defs.push(createLineDefinition(content, line, offsets, i, constMatch[1], 'variable'));
      continue;
    }

    if (indent === 0 && /^(?:pub\s+)?impl\b/.test(trimmed)) {
      const endLine = findBraceBlockEnd(lines, i);
      for (let j = i + 1; j < endLine; j++) {
        const inner = lines[j];
        const methodMatch = /^(?:pub\s+)?fn\s+(\w+)/.exec(inner.trim());
        if (!methodMatch) {
          continue;
        }

        const methodEndLine = findBraceBlockEnd(lines, j);
        defs.push(createBlockDefinition(content, offsets, j, methodEndLine, methodMatch[1], 'method'));
        j = methodEndLine - 1;
      }
      i = endLine - 1;
    }
  }

  return defs;
}
