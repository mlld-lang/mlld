import type { Definition } from './types';
import { getLinesAndOffsets } from './shared-utils';

function findIndentedBlockEnd(lines: string[], startLine: number, indent: number): number {
  let line = startLine;
  for (; line < lines.length; line++) {
    const current = lines[line];
    if (current.trim() === '') {
      continue;
    }
    const currentIndent = current.match(/^\s*/)?.[0].length ?? 0;
    if (currentIndent <= indent) {
      break;
    }
  }
  return line;
}

function buildDefinition(
  content: string,
  offsets: number[],
  startLine: number,
  endLine: number,
  name: string,
  type: string
): Definition {
  const start = offsets[startLine];
  const end = offsets[endLine] ?? content.length;
  const code = content.slice(start, end);
  const search = code.split(/\r?\n/).slice(1).join('\n');
  return { name, type, start, end, line: startLine + 1, code, search };
}

function buildVariableDefinition(content: string, lineText: string, offsets: number[], line: number, name: string): Definition {
  const start = offsets[line];
  const end = start + lineText.length;
  const code = content.slice(start, end);
  return { name, type: 'variable', start, end, line: line + 1, code, search: code };
}

export function extractPythonDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (indent === 0 && /^def\s+(\w+)/.test(trimmed)) {
      const name = RegExp.$1;
      const endLine = findIndentedBlockEnd(lines, i + 1, indent);
      defs.push(buildDefinition(content, offsets, i, endLine, name, 'function'));
      i = endLine - 1;
      continue;
    }

    if (indent === 0 && /^class\s+(\w+)/.test(trimmed)) {
      const className = RegExp.$1;
      const endLine = findIndentedBlockEnd(lines, i + 1, indent);
      defs.push(buildDefinition(content, offsets, i, endLine, className, 'class'));

      for (let j = i + 1; j < endLine; j++) {
        const inner = lines[j];
        const innerIndent = inner.match(/^\s*/)?.[0].length ?? 0;
        const innerTrim = inner.trim();

        if (innerIndent > indent && /^def\s+(\w+)/.test(innerTrim)) {
          const methodName = RegExp.$1;
          const methodEndLine = findIndentedBlockEnd(lines, j + 1, innerIndent);
          defs.push(buildDefinition(content, offsets, j, methodEndLine, methodName, 'method'));
          j = methodEndLine - 1;
        }
      }

      i = endLine - 1;
      continue;
    }

    if (indent === 0 && /^(\w+)/.test(trimmed) && trimmed.includes('=')) {
      const variableName = RegExp.$1;
      defs.push(buildVariableDefinition(content, line, offsets, i, variableName));
    }
  }

  return defs;
}
