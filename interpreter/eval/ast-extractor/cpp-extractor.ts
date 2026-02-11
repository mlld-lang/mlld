import type { Definition } from './types';
import {
  createBlockDefinition,
  createLineDefinition,
  findBraceBlockEnd,
  getLinesAndOffsets
} from './shared-utils';

interface ClassContext {
  name: string;
  endLine: number;
}

interface PendingFunction {
  startLine: number;
  signature: string;
  className?: string;
}

function stripCppComments(lines: string[]): string[] {
  const strippedLines: string[] = [];
  let inBlockComment = false;

  for (const line of lines) {
    let result = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (!inBlockComment && char === '/' && next === '/') {
        break;
      }
      if (!inBlockComment && char === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inBlockComment && char === '*' && next === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (!inBlockComment) {
        result += char;
      }
    }
    strippedLines.push(result);
  }

  return strippedLines;
}

function sanitizeCppStringLiterals(line: string): string {
  return line
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function createCppBlockEndResolver(strippedLines: string[]): (startLine: number) => number {
  return (startLine: number): number => {
    return findBraceBlockEnd(strippedLines, startLine, {
      lineSanitizer: sanitizeCppStringLiterals,
      breakOnSemicolonBeforeBody: true,
      closeWhenNonPositive: true
    });
  };
}

function parsePendingSignature(pendingFunction: PendingFunction): { name: string; type: string } | null {
  const normalized = pendingFunction.signature.replace(/\s+/g, ' ').trim();
  const parenIndex = normalized.indexOf('(');
  if (parenIndex === -1) {
    return null;
  }

  const before = normalized.slice(0, parenIndex).trim();
  if (!before) {
    return null;
  }

  const tokens = before.split(/\s+/);
  if (tokens.length === 0) {
    return null;
  }

  let candidate = tokens[tokens.length - 1];
  candidate = candidate.replace(/[*&]+$/, '');
  const namePart = (candidate.split('::').pop() ?? candidate).replace(/[*&]+$/, '');

  if (!/^~?[A-Za-z_]\w*$/.test(namePart)) {
    return null;
  }
  if (/^(?:if|for|while|switch|catch|return|sizeof|throw|case|else|do)$/.test(namePart)) {
    return null;
  }

  const type = (pendingFunction.className || candidate.includes('::')) ? 'method' : 'function';
  return { name: namePart, type };
}

function isPotentialFunctionStart(line: string): boolean {
  if (!line.includes('(')) {
    return false;
  }
  if (/^(?:if|for|while|switch|catch|return|sizeof|throw|case|else|do)\b/.test(line)) {
    return false;
  }
  if (/^(?:using|typedef)\b/.test(line)) {
    return false;
  }
  return true;
}

export function extractCppDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];
  const strippedLines = stripCppComments(lines);
  const blockEnd = createCppBlockEndResolver(strippedLines);

  const classStack: ClassContext[] = [];
  let pendingFunction: PendingFunction | null = null;
  let braceDepth = 0;

  function currentClassName(): string | undefined {
    return classStack.length ? classStack[classStack.length - 1]?.name : undefined;
  }

  function resetPendingFunction(): void {
    pendingFunction = null;
  }

  function appendPendingSignature(text: string): void {
    if (!pendingFunction || !text) {
      return;
    }
    if (pendingFunction.signature) {
      pendingFunction.signature += ' ';
    }
    pendingFunction.signature += text;
  }

  function pushBlockDefinition(name: string, type: string, startLine: number): void {
    const endLine = blockEnd(startLine);
    defs.push(createBlockDefinition(content, offsets, startLine, endLine, name, type));
  }

  function pushVariable(name: string, startLine: number): void {
    defs.push(createLineDefinition(content, lines[startLine], offsets, startLine, name, 'variable'));
  }

  for (let i = 0; i < lines.length; i++) {
    while (classStack.length && classStack[classStack.length - 1]?.endLine <= i) {
      classStack.pop();
    }

    const stripped = strippedLines[i];
    const trimmed = stripped.trim();
    const sanitizedLine = sanitizeCppStringLiterals(stripped);

    if (pendingFunction) {
      appendPendingSignature(trimmed);
      if (sanitizedLine.includes('{')) {
        const parsed = parsePendingSignature(pendingFunction);
        if (parsed) {
          pushBlockDefinition(parsed.name, parsed.type, pendingFunction.startLine);
        }
        resetPendingFunction();
      } else if (/;\s*$/.test(trimmed)) {
        resetPendingFunction();
      }
    } else if (trimmed && !trimmed.startsWith('#')) {
      const classMatch = /^(?:typedef\s+)?(?:template\s*<[^>]+>\s*)*(class|struct|union)\s+([A-Za-z_]\w*)/.exec(trimmed);
      if (classMatch && sanitizedLine.includes('{')) {
        const className = classMatch[2];
        const classType = classMatch[1];
        const endLine = blockEnd(i);
        pushBlockDefinition(className, classType, i);
        classStack.push({ name: className, endLine });
      } else {
        const enumMatch = /^(?:typedef\s+)?(?:template\s*<[^>]+>\s*)*enum(?:\s+(?:class|struct))?\s+([A-Za-z_]\w*)/.exec(trimmed);
        if (enumMatch && sanitizedLine.includes('{')) {
          pushBlockDefinition(enumMatch[1], 'enum', i);
        } else if (
          braceDepth === 0 &&
          !trimmed.includes('(') &&
          !/^(?:class|struct|union|enum|template|typedef)\b/.test(trimmed)
        ) {
          const varMatch = /^(?:constexpr\s+|const\s+|static\s+|inline\s+|extern\s+|volatile\s+|register\s+|thread_local\s+)*[A-Za-z_]\w*[\w\s:<>,*&]*\s+([A-Za-z_]\w*)\s*(?:=\s*[^;]+)?;$/.exec(trimmed);
          if (varMatch) {
            pushVariable(varMatch[1], i);
          }
        }

        if (isPotentialFunctionStart(trimmed)) {
          pendingFunction = { startLine: i, signature: trimmed, className: currentClassName() };
          if (sanitizedLine.includes('{')) {
            const parsed = parsePendingSignature(pendingFunction);
            if (parsed) {
              pushBlockDefinition(parsed.name, parsed.type, pendingFunction.startLine);
            }
            resetPendingFunction();
          }
        }
      }
    }

    const opens = (sanitizedLine.match(/\{/g) ?? []).length;
    const closes = (sanitizedLine.match(/\}/g) ?? []).length;
    braceDepth += opens;
    braceDepth -= closes;
  }

  return defs;
}
