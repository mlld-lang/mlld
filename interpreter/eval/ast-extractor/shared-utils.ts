import type { Definition } from './types';

export interface LinesAndOffsets {
  lines: string[];
  offsets: number[];
}

export interface BraceBlockOptions {
  lineSanitizer?: (line: string) => string;
  breakOnSemicolonBeforeBody?: boolean;
  closeWhenNonPositive?: boolean;
  returnSingleLineWhenNoBody?: boolean;
}

export function getLinesAndOffsets(content: string): LinesAndOffsets {
  const lines = content.split(/\r?\n/);
  const offsets: number[] = [];
  let position = 0;
  for (const line of lines) {
    offsets.push(position);
    position += line.length + 1;
  }
  return { lines, offsets };
}

export function findBraceBlockEnd(
  lines: string[],
  startLine: number,
  options: BraceBlockOptions = {}
): number {
  const sanitize = options.lineSanitizer ?? ((line: string) => line);
  const closeWhenNonPositive = options.closeWhenNonPositive ?? false;
  const breakOnSemicolon = options.breakOnSemicolonBeforeBody ?? false;
  const returnSingleLine = options.returnSingleLineWhenNoBody ?? false;

  let braces = 0;
  let started = false;

  for (let line = startLine; line < lines.length; line++) {
    const current = sanitize(lines[line] ?? '');
    const opens = (current.match(/\{/g) ?? []).length;
    const closes = (current.match(/\}/g) ?? []).length;
    if (!started && opens > 0) {
      started = true;
    }

    braces += opens;
    braces -= closes;

    if (!started && breakOnSemicolon && current.includes(';')) {
      return line + 1;
    }

    if (started) {
      const isClosed = closeWhenNonPositive ? braces <= 0 : braces === 0;
      if (isClosed) {
        return line + 1;
      }
    }
  }

  return returnSingleLine ? startLine + 1 : lines.length;
}

export function extractBlockSearch(code: string): string {
  const bodyStart = code.indexOf('{');
  const bodyEnd = code.lastIndexOf('}');
  return bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
}

export function createBlockDefinition(
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
  const search = extractBlockSearch(code);
  return { name, type, start, end, line: startLine + 1, code, search };
}

export function createLineDefinition(
  content: string,
  lineText: string,
  offsets: number[],
  line: number,
  name: string,
  type: string
): Definition {
  const start = offsets[line];
  const end = start + lineText.length;
  const code = content.slice(start, end);
  return { name, type, start, end, line: line + 1, code, search: code };
}
