import {
  evaluatePatternResults,
  hasContentPattern,
  hasNameListPattern,
  matchesTypeFilter,
  TYPE_FILTER_MAP
} from './ast-extractor/pattern-core';
import type { AstPattern, AstResult, Definition } from './ast-extractor/types';
import type { AstExtractorRegistry } from './ast-extractor/language-dispatch';
import { extractDefinitionsForFile } from './ast-extractor/language-dispatch';
import { findBraceBlockEnd, getLinesAndOffsets } from './ast-extractor/shared-utils';
import { extractTsDefinitions } from './ast-extractor/typescript-extractor';
import { extractPythonDefinitions } from './ast-extractor/python-extractor';
import { extractRubyDefinitions } from './ast-extractor/ruby-extractor';
import { extractGoDefinitions } from './ast-extractor/go-extractor';
import { extractRustDefinitions } from './ast-extractor/rust-extractor';
import { extractCppDefinitions } from './ast-extractor/cpp-extractor';
export type {
  AstPatternDefinition,
  AstPatternTypeFilter,
  AstPatternTypeFilterAll,
  AstPatternTypeFilterVar,
  AstPatternNameList,
  AstPatternNameListAll,
  AstPatternNameListVar,
  AstPatternLegacy,
  AstPattern,
  AstResult
} from './ast-extractor/types';

function extractJavaForFile(content: string): Definition[] {
  return extractJavaDefinitions(content);
}

function extractSolidityForFile(content: string): Definition[] {
  return extractSolidityDefinitions(content);
}

function extractCSharpForFile(content: string): Definition[] {
  return extractCSharpDefinitions(content);
}

const AST_EXTRACTOR_REGISTRY: AstExtractorRegistry = {
  ts: extractTsDefinitions,
  python: extractPythonDefinitions,
  ruby: extractRubyDefinitions,
  go: extractGoDefinitions,
  rust: extractRustDefinitions,
  java: extractJavaForFile,
  solidity: extractSolidityForFile,
  cpp: extractCppDefinitions,
  csharp: extractCSharpForFile
};

export function extractAst(content: string, filePath: string, patterns: AstPattern[]): Array<AstResult | null> {
  const definitions = extractDefinitionsForFile(content, filePath, AST_EXTRACTOR_REGISTRY);
  return evaluatePatternResults(definitions, patterns);
}

/**
 * Extract definition names from a file (for name-list patterns: ??, fn??, etc.)
 * Returns an array of definition names as strings
 */
export function extractNames(content: string, filePath: string, filter?: string): string[] {
  const definitions = extractDefinitionsForFile(content, filePath, AST_EXTRACTOR_REGISTRY);

  // Filter by type if specified
  let filtered: Definition[];
  if (filter) {
    filtered = definitions.filter(d => matchesTypeFilter(d.type, filter));
  } else {
    // For name-list-all (no filter), exclude nested definitions (methods, constructors)
    // to only return top-level definitions
    const nestedTypes = ['method', 'constructor'];
    filtered = definitions.filter(d => !nestedTypes.includes(d.type));
  }

  // Extract unique names, sorted alphabetically
  const names = [...new Set(filtered.map(d => d.name))];
  names.sort();
  return names;
}

/**
 * Check if patterns contain any name-list patterns
 */
export { hasNameListPattern, hasContentPattern, matchesTypeFilter, TYPE_FILTER_MAP };

function extractSolidityDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: line => line.replace(/\/\/.*$/, ''),
      breakOnSemicolonBeforeBody: true,
      closeWhenNonPositive: true
    });
  }

  function pushDefinition(name: string, type: string, startLine: number): void {
    const start = offsets[startLine];
    const endLine = blockEnd(startLine);
    const end = offsets[endLine] ?? content.length;
    const code = content.slice(start, end);
    const bodyStart = code.indexOf('{');
    const bodyEnd = code.lastIndexOf('}');
    const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
    defs.push({ name, type, start, end, line: startLine + 1, code, search });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = line.replace(/\/\/.*$/, '');
    const trimmed = cleaned.trim();
    if (!trimmed) continue;

    const contractMatch = /^(?:abstract\s+)?(contract|interface|library)\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (contractMatch) {
      const type = contractMatch[1];
      const name = contractMatch[2];
      pushDefinition(name, type, i);

      let braceDepth = (trimmed.match(/\{/g) ?? []).length - (trimmed.match(/\}/g) ?? []).length;
      const endLine = blockEnd(i);
      for (let j = i + 1; j < endLine; j++) {
        const innerLine = lines[j];
        const innerClean = innerLine.replace(/\/\/.*$/, '');
        const innerTrim = innerClean.trim();
        const beforeDepth = braceDepth;
        const opens = (innerClean.match(/\{/g) ?? []).length;
        const closes = (innerClean.match(/\}/g) ?? []).length;

        if (beforeDepth >= 1 && innerTrim) {
          let memberName: string | undefined;
          let memberType: string | undefined;

          const fnMatch = /function\s+([A-Za-z_][\w]*)/.exec(innerTrim);
          if (fnMatch) {
            memberName = fnMatch[1];
            memberType = 'function';
          } else if (/^constructor\s*\(/.test(innerTrim)) {
            memberName = 'constructor';
            memberType = 'constructor';
          } else {
            const modifierMatch = /modifier\s+([A-Za-z_][\w]*)/.exec(innerTrim);
            if (modifierMatch) {
              memberName = modifierMatch[1];
              memberType = 'modifier';
            } else {
              const eventMatch = /event\s+([A-Za-z_][\w]*)/.exec(innerTrim);
              if (eventMatch) {
                memberName = eventMatch[1];
                memberType = 'event';
              } else {
                const structMatch = /struct\s+([A-Za-z_][\w]*)/.exec(innerTrim);
                if (structMatch) {
                  memberName = structMatch[1];
                  memberType = 'struct';
                } else {
                  const enumMatch = /enum\s+([A-Za-z_][\w]*)/.exec(innerTrim);
                  if (enumMatch) {
                    memberName = enumMatch[1];
                    memberType = 'enum';
                  } else {
                    const errorMatch = /error\s+([A-Za-z_][\w]*)/.exec(innerTrim);
                    if (errorMatch) {
                      memberName = errorMatch[1];
                      memberType = 'error';
                    }
                  }
                }
              }
            }
          }

          if (memberName && memberType) {
            pushDefinition(memberName, memberType, j);
          }
        }

        braceDepth += opens;
        braceDepth -= closes;
      }

      i = endLine - 1;
      continue;
    }

    const freeFnMatch = /^function\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (freeFnMatch) {
      pushDefinition(freeFnMatch[1], 'function', i);
      continue;
    }

    const globalStructMatch = /^(struct|enum|error)\s+([A-Za-z_][\w]*)/.exec(trimmed);
    if (globalStructMatch) {
      pushDefinition(globalStructMatch[2], globalStructMatch[1], i);
    }
  }

  return defs;
}

function extractJavaDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: line => line.replace(/".*?"/g, '')
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const cleaned = trimmed.replace(/\/\/.*$/, '');

    const classMatch = /^(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+)?class\s+([\w$]+)/.exec(cleaned);
    const interfaceMatch = /^(?:public\s+|protected\s+|private\s+)?interface\s+([\w$]+)/.exec(cleaned);
    const enumMatch = /^(?:public\s+|protected\s+|private\s+)?enum\s+([\w$]+)/.exec(cleaned);

    if (classMatch) {
      const name = classMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'class', start, end, line: i + 1, code, search });

      let braceDepth = 0;
      for (let j = i + 1; j < endLine; j++) {
        const inner = lines[j];
        const innerClean = inner.trim().replace(/\/\/.*$/, '');
        const opens = (innerClean.match(/\{/g) ?? []).length;
        const closes = (innerClean.match(/\}/g) ?? []).length;

        if (braceDepth === 0) {
          const methodMatch = /^(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default|\s)*(?:<[^>]+>\s*)?(?:[\w$]+\s+)*([\w$]+)\s*\(/.exec(innerClean);
          const name = methodMatch?.[1];
          if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
            const mStart = offsets[j];
            const mEndLine = blockEnd(j);
            const mEnd = offsets[mEndLine] ?? content.length;
            const mCode = content.slice(mStart, mEnd);
            const bodyStart = mCode.indexOf('{');
            const bodyEnd = mCode.lastIndexOf('}');
            const search = bodyStart >= 0 && bodyEnd >= bodyStart ? mCode.slice(bodyStart + 1, bodyEnd) : mCode;
            const type = name === classMatch[1] ? 'constructor' : 'method';
            defs.push({ name, type, start: mStart, end: mEnd, line: j + 1, code: mCode, search });
            j = mEndLine - 1;
            braceDepth = 0;
            continue;
          }
        }

        braceDepth += opens;
        braceDepth -= closes;
      }

      i = endLine - 1;
    } else if (interfaceMatch) {
      const name = interfaceMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'interface', start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (enumMatch) {
      const name = enumMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'enum', start, end, line: i + 1, code, search });
      i = endLine - 1;
    }
  }

  return defs;
}

function extractCSharpDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    return findBraceBlockEnd(lines, startLine, {
      lineSanitizer: line => line.replace(/".*?"/g, '').replace(/\/\/.*$/, ''),
      returnSingleLineWhenNoBody: true
    });
  }

  const modifierSet = new Set([
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
  const keywordBlockers = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'lock']);

  function stripAttributes(text: string): string {
    let current = text.trim();
    while (current.startsWith('[')) {
      const close = current.indexOf(']');
      if (close === -1) break;
      current = current.slice(close + 1).trimStart();
    }
    return current;
  }

  function skipModifiers(tokens: string[]): number {
    let index = 0;
    while (index < tokens.length && modifierSet.has(tokens[index])) {
      index++;
    }
    return index;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const noComment = trimmed.replace(/\/\/.*$/, '');
    if (!noComment) continue;

    const signature = stripAttributes(noComment);
    if (!signature) continue;

    const tokens = signature.split(/\s+/);
    if (tokens.length === 0) continue;

    const startIndex = skipModifiers(tokens);
    const keyword = tokens[startIndex];

    if (!keyword) continue;

    if (keyword === 'record') {
      const recordKind = tokens[startIndex + 1] === 'class' || tokens[startIndex + 1] === 'struct'
        ? tokens[startIndex + 1]
        : undefined;
      const nameToken = tokens[startIndex + (recordKind ? 2 : 1)];
      if (nameToken) {
        const name = nameToken.replace(/[<({].*$/, '');
        const start = offsets[i];
        const endLine = blockEnd(i);
        const end = offsets[endLine] ?? content.length;
        const code = content.slice(start, end);
        const bodyStart = code.indexOf('{');
        const bodyEnd = code.lastIndexOf('}');
        const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
        defs.push({ name, type: 'record', start, end, line: i + 1, code, search });
        i = endLine - 1;
        continue;
      }
    } else if (keyword === 'class' || keyword === 'struct' || keyword === 'interface' || keyword === 'enum') {
      const nameToken = tokens[startIndex + 1];
      if (!nameToken) continue;
      const name = nameToken.replace(/[<({].*$/, '');
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      const type = keyword === 'class' ? 'class' : keyword === 'struct' ? 'struct' : keyword === 'interface' ? 'interface' : 'enum';
      defs.push({ name, type, start, end, line: i + 1, code, search });

      if (keyword === 'class' || keyword === 'struct') {
        let braceDepth = 0;
        for (let j = i + 1; j < endLine; j++) {
          const inner = lines[j];
          const innerTrim = inner.trim();
          if (!innerTrim) continue;

          const innerNoComment = innerTrim.replace(/\/\/.*$/, '');
          if (!innerNoComment) continue;

          const innerSignature = stripAttributes(innerNoComment);
          if (!innerSignature) continue;

          const opens = (innerSignature.match(/\{/g) ?? []).length;
          const closes = (innerSignature.match(/\}/g) ?? []).length;

          if (braceDepth <= 1 && innerSignature.includes('(')) {
            const parenIndex = innerSignature.indexOf('(');
            const before = innerSignature.slice(0, parenIndex).trim();
            if (before && !before.includes('=')) {
              const beforeTokens = before.split(/\s+/);
              const candidateRaw = beforeTokens[beforeTokens.length - 1];
              const candidate = candidateRaw?.replace(/<.*$/, '');
              if (candidate && !keywordBlockers.has(candidate)) {
                const mStart = offsets[j];
                const mEndLine = blockEnd(j);
                const mEnd = offsets[mEndLine] ?? content.length;
                const mCode = content.slice(mStart, mEnd);
                const bodyStart = mCode.indexOf('{');
                const bodyEnd = mCode.lastIndexOf('}');
                const search = bodyStart >= 0 && bodyEnd >= bodyStart ? mCode.slice(bodyStart + 1, bodyEnd) : mCode;
                const typeName = candidate === name ? 'constructor' : 'method';
                defs.push({ name: candidate, type: typeName, start: mStart, end: mEnd, line: j + 1, code: mCode, search });
                if (innerSignature.includes('{')) {
                  j = mEndLine - 1;
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
          const name = candidate;
          const start = offsets[i];
          const end = start + line.length;
          const code = content.slice(start, end);
          defs.push({ name, type: 'variable', start, end, line: i + 1, code, search: code });
        }
      }
    }
  }

  return defs;
}
