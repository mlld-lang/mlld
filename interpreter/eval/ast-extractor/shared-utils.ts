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
