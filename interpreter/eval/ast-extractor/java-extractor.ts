import type { Definition } from './types';
import { createBlockDefinition, findBraceBlockEnd, getLinesAndOffsets } from './shared-utils';

function stripJavaComment(line: string): string {
  return line.trim().replace(/\/\/.*$/, '');
}

function createJavaBlockEnd(lines: string[]): (startLine: number) => number {
  return (startLine: number): number => {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: line => line.replace(/".*?"/g, '')
    });
  };
}

function parseJavaMethodName(cleanedLine: string): string | null {
  const methodMatch = /^(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default|\s)*(?:<[^>]+>\s*)?(?:[\w$]+\s+)*([\w$]+)\s*\(/.exec(cleanedLine);
  const name = methodMatch?.[1];
  if (!name) {
    return null;
  }

  if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
    return null;
  }

  return name;
}

export function extractJavaDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);
  const defs: Definition[] = [];
  const blockEnd = createJavaBlockEnd(lines);

  const pushDefinition = (name: string, type: string, startLine: number): number => {
    const endLine = blockEnd(startLine);
    defs.push(createBlockDefinition(content, offsets, startLine, endLine, name, type));
    return endLine;
  };

  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripJavaComment(lines[i]);
    const classMatch = /^(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+)?class\s+([\w$]+)/.exec(cleaned);
    const interfaceMatch = /^(?:public\s+|protected\s+|private\s+)?interface\s+([\w$]+)/.exec(cleaned);
    const enumMatch = /^(?:public\s+|protected\s+|private\s+)?enum\s+([\w$]+)/.exec(cleaned);

    if (classMatch) {
      const className = classMatch[1];
      const classEndLine = pushDefinition(className, 'class', i);
      let braceDepth = 0;

      for (let j = i + 1; j < classEndLine; j++) {
        const innerClean = stripJavaComment(lines[j]);
        const opens = (innerClean.match(/\{/g) ?? []).length;
        const closes = (innerClean.match(/\}/g) ?? []).length;

        if (braceDepth === 0) {
          const methodName = parseJavaMethodName(innerClean);
          if (methodName) {
            const methodEndLine = pushDefinition(
              methodName,
              methodName === className ? 'constructor' : 'method',
              j
            );
            j = methodEndLine - 1;
            braceDepth = 0;
            continue;
          }
        }

        braceDepth += opens;
        braceDepth -= closes;
      }

      i = classEndLine - 1;
      continue;
    }

    if (interfaceMatch) {
      const endLine = pushDefinition(interfaceMatch[1], 'interface', i);
      i = endLine - 1;
      continue;
    }

    if (enumMatch) {
      const endLine = pushDefinition(enumMatch[1], 'enum', i);
      i = endLine - 1;
    }
  }

  return defs;
}
