import type { Definition } from './types';
import { createBlockDefinition, findBraceBlockEnd, getLinesAndOffsets } from './shared-utils';

interface SolidityMemberMatch {
  name: string;
  type: string;
}

function stripLineComment(line: string): string {
  return line.replace(/\/\/.*$/, '');
}

function parseSolidityMember(trimmed: string): SolidityMemberMatch | null {
  const functionMatch = /function\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (functionMatch) {
    return { name: functionMatch[1], type: 'function' };
  }

  if (/^constructor\s*\(/.test(trimmed)) {
    return { name: 'constructor', type: 'constructor' };
  }

  const modifierMatch = /modifier\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (modifierMatch) {
    return { name: modifierMatch[1], type: 'modifier' };
  }

  const eventMatch = /event\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (eventMatch) {
    return { name: eventMatch[1], type: 'event' };
  }

  const structMatch = /struct\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (structMatch) {
    return { name: structMatch[1], type: 'struct' };
  }

  const enumMatch = /enum\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (enumMatch) {
    return { name: enumMatch[1], type: 'enum' };
  }

  const errorMatch = /error\s+([A-Za-z_][\w]*)/.exec(trimmed);
  if (errorMatch) {
    return { name: errorMatch[1], type: 'error' };
  }

  return null;
}

export function extractSolidityDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];

  const blockEnd = (startLine: number): number => {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: stripLineComment,
      breakOnSemicolonBeforeBody: true,
      closeWhenNonPositive: true
    });
  };

  const pushDefinition = (name: string, type: string, startLine: number): void => {
    const endLine = blockEnd(startLine);
    defs.push(createBlockDefinition(content, offsets, startLine, endLine, name, type));
  };

  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripLineComment(lines[i]);
    const trimmed = cleaned.trim();
    if (!trimmed) {
      continue;
    }

    const contractMatch = /^(?:abstract\s+)?(contract|interface|library)\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (contractMatch) {
      const contractType = contractMatch[1];
      const contractName = contractMatch[2];
      pushDefinition(contractName, contractType, i);

      let braceDepth = (trimmed.match(/\{/g) ?? []).length - (trimmed.match(/\}/g) ?? []).length;
      const endLine = blockEnd(i);
      for (let j = i + 1; j < endLine; j++) {
        const innerClean = stripLineComment(lines[j]);
        const innerTrim = innerClean.trim();
        const beforeDepth = braceDepth;
        const opens = (innerClean.match(/\{/g) ?? []).length;
        const closes = (innerClean.match(/\}/g) ?? []).length;

        if (beforeDepth >= 1 && innerTrim) {
          const member = parseSolidityMember(innerTrim);
          if (member) {
            pushDefinition(member.name, member.type, j);
          }
        }

        braceDepth += opens;
        braceDepth -= closes;
      }

      i = endLine - 1;
      continue;
    }

    const freeFunctionMatch = /^function\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (freeFunctionMatch) {
      pushDefinition(freeFunctionMatch[1], 'function', i);
      continue;
    }

    const globalDeclarationMatch = /^(struct|enum|error)\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (globalDeclarationMatch) {
      pushDefinition(globalDeclarationMatch[2], globalDeclarationMatch[1], i);
    }
  }

  return defs;
}
