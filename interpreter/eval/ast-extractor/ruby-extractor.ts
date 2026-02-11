import type { Definition } from './types';
import { getLinesAndOffsets } from './shared-utils';

interface RubyContextEntry {
  endLine: number;
  segments: string[];
  kind: 'module' | 'class';
}

function sanitizeRubyLine(line: string): string {
  return line.replace(/#.*$/, '');
}

function findRubyBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;

  for (let line = startLine; line < lines.length; line++) {
    const clean = sanitizeRubyLine(lines[line]);
    if (!clean.trim()) {
      continue;
    }

    if (line === startLine) {
      depth += 1;
    } else {
      const openers = clean.match(/\b(class|module|def|if|unless|case|begin|for|while|until|loop)\b/g);
      if (openers) {
        depth += openers.length;
      }
      const doMatches = clean.match(/\bdo\b/g);
      if (doMatches) {
        depth += doMatches.length;
      }
    }

    const endMatches = clean.match(/\bend\b/g);
    if (endMatches) {
      depth -= endMatches.length;
      if (depth <= 0) {
        return line + 1;
      }
    }
  }

  return lines.length;
}

function pushRubyDefinition(
  defs: Definition[],
  content: string,
  offsets: number[],
  name: string,
  type: string,
  startLine: number,
  endLine: number,
  overrideName?: string
): void {
  const finalName = overrideName ?? name;
  const start = offsets[startLine];
  const end = offsets[endLine] ?? content.length;
  const code = content.slice(start, end);
  const search = code.split(/\r?\n/).slice(1).join('\n');
  defs.push({ name: finalName, type, start, end, line: startLine + 1, code, search });
}

export function extractRubyDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];
  const contextStack: RubyContextEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const clean = sanitizeRubyLine(rawLine);
    const trimmed = clean.trim();

    while (contextStack.length > 0 && i >= contextStack[contextStack.length - 1].endLine) {
      contextStack.pop();
    }

    if (!trimmed) {
      continue;
    }

    const classMatch = /^class\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(trimmed);
    if (classMatch) {
      const endLine = findRubyBlockEnd(lines, i);
      const parentSegments = contextStack.length > 0 ? contextStack[contextStack.length - 1].segments : [];
      const classSegments = classMatch[1].split('::');
      const segments = [...parentSegments, ...classSegments];
      const qualifiedName = segments.join('::');

      pushRubyDefinition(defs, content, offsets, classMatch[1], 'class', i, endLine, qualifiedName);
      contextStack.push({ endLine, segments, kind: 'class' });
      continue;
    }

    const moduleMatch = /^module\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(trimmed);
    if (moduleMatch) {
      const endLine = findRubyBlockEnd(lines, i);
      const parentSegments = contextStack.length > 0 ? contextStack[contextStack.length - 1].segments : [];
      const moduleSegments = moduleMatch[1].split('::');
      const segments = [...parentSegments, ...moduleSegments];
      const qualifiedName = segments.join('::');

      pushRubyDefinition(defs, content, offsets, moduleMatch[1], 'module', i, endLine, qualifiedName);
      contextStack.push({ endLine, segments, kind: 'module' });
      continue;
    }

    const defMatch = /^def\s+([A-Za-z_]\w*[!?=]?|(?:self|[A-Za-z_]\w*)\.[A-Za-z_]\w*[!?=]?)/.exec(trimmed);
    if (defMatch) {
      const endLine = findRubyBlockEnd(lines, i);
      const methodName = defMatch[1];
      const insideClass = contextStack.some(context => context.kind === 'class');
      const type = insideClass ? 'method' : 'function';

      pushRubyDefinition(defs, content, offsets, methodName, type, i, endLine);
      i = endLine - 1;
      continue;
    }

    const constantMatch = /^([A-Z][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (constantMatch) {
      const start = offsets[i];
      const end = start + rawLine.length;
      const code = content.slice(start, end);
      defs.push({ name: constantMatch[1], type: 'constant', start, end, line: i + 1, code, search: code });
    }
  }

  return defs;
}
