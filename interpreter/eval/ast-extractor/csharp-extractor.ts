import type { Definition } from './types';
import {
  createBlockDefinition,
  createLineDefinition,
  findBraceBlockEnd,
  getLinesAndOffsets
} from './shared-utils';

const CSHARP_MODIFIERS = new Set([
  'public',
  'internal',
  'protected',
  'private',
  'partial',
  'static',
  'sealed',
  'abstract',
  'unsafe',
  'new',
  'readonly',
  'ref',
  'virtual',
  'override',
  'async',
  'extern'
]);

const CSHARP_KEYWORD_BLOCKERS = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'lock']);

function stripCSharpAttributes(text: string): string {
  let current = text.trim();
  while (current.startsWith('[')) {
    const close = current.indexOf(']');
    if (close === -1) {
      break;
    }
    current = current.slice(close + 1).trimStart();
  }
  return current;
}

function skipCSharpModifiers(tokens: string[]): number {
  let index = 0;
  while (index < tokens.length && CSHARP_MODIFIERS.has(tokens[index])) {
    index++;
  }
  return index;
}

function createCSharpBlockEnd(lines: string[]): (startLine: number) => number {
  return (startLine: number): number => {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: line => line.replace(/".*?"/g, '').replace(/\/\/.*$/, ''),
      returnSingleLineWhenNoBody: true
    });
  };
}

export function extractCSharpDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];
  const blockEnd = createCSharpBlockEnd(lines);

  const pushBlockDefinition = (name: string, type: string, startLine: number): number => {
    const endLine = blockEnd(startLine);
    defs.push(createBlockDefinition(content, offsets, startLine, endLine, name, type));
    return endLine;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const noComment = trimmed.replace(/\/\/.*$/, '');
    if (!noComment) {
      continue;
    }

    const signature = stripCSharpAttributes(noComment);
    if (!signature) {
      continue;
    }

    const tokens = signature.split(/\s+/);
    if (tokens.length === 0) {
      continue;
    }

    const startIndex = skipCSharpModifiers(tokens);
    const keyword = tokens[startIndex];
    if (!keyword) {
      continue;
    }

    if (keyword === 'record') {
      const recordKind = tokens[startIndex + 1] === 'class' || tokens[startIndex + 1] === 'struct'
        ? tokens[startIndex + 1]
        : undefined;
      const nameToken = tokens[startIndex + (recordKind ? 2 : 1)];
      if (nameToken) {
        const name = nameToken.replace(/[<({].*$/, '');
        const endLine = pushBlockDefinition(name, 'record', i);
        i = endLine - 1;
        continue;
      }
    } else if (keyword === 'class' || keyword === 'struct' || keyword === 'interface' || keyword === 'enum') {
      const nameToken = tokens[startIndex + 1];
      if (!nameToken) {
        continue;
      }

      const typeName = nameToken.replace(/[<({].*$/, '');
      const definitionType = keyword === 'class'
        ? 'class'
        : keyword === 'struct'
          ? 'struct'
          : keyword === 'interface'
            ? 'interface'
            : 'enum';
      const endLine = pushBlockDefinition(typeName, definitionType, i);

      if (keyword === 'class' || keyword === 'struct') {
        let braceDepth = 0;
        for (let j = i + 1; j < endLine; j++) {
          const inner = lines[j];
          const innerTrim = inner.trim();
          if (!innerTrim) {
            continue;
          }

          const innerNoComment = innerTrim.replace(/\/\/.*$/, '');
          if (!innerNoComment) {
            continue;
          }

          const innerSignature = stripCSharpAttributes(innerNoComment);
          if (!innerSignature) {
            continue;
          }

          const opens = (innerSignature.match(/\{/g) ?? []).length;
          const closes = (innerSignature.match(/\}/g) ?? []).length;

          if (braceDepth <= 1 && innerSignature.includes('(')) {
            const parenIndex = innerSignature.indexOf('(');
            const before = innerSignature.slice(0, parenIndex).trim();
            if (before && !before.includes('=')) {
              const beforeTokens = before.split(/\s+/);
              const candidateRaw = beforeTokens[beforeTokens.length - 1];
              const candidate = candidateRaw?.replace(/<.*$/, '');
              if (candidate && !CSHARP_KEYWORD_BLOCKERS.has(candidate)) {
                const methodType = candidate === typeName ? 'constructor' : 'method';
                const methodEndLine = pushBlockDefinition(candidate, methodType, j);
                if (innerSignature.includes('{')) {
                  j = methodEndLine - 1;
                  braceDepth = 0;
                  continue;
                }
              }
            }
          }

          braceDepth += opens;
          braceDepth -= closes;
        }
      }

      i = endLine - 1;
      continue;
    }

    if (/^(?:public|internal|protected|private|const|static|readonly)/.test(signature) && signature.includes('=')) {
      const equalIndex = signature.indexOf('=');
      if (equalIndex > 0) {
        const before = signature.slice(0, equalIndex).trim();
        const candidate = before.split(/\s+/).pop();
        if (candidate && /^[A-Za-z_][\w]*$/.test(candidate)) {
          defs.push(createLineDefinition(content, line, offsets, i, candidate, 'variable'));
        }
      }
    }
  }

  return defs;
}
