import ts from 'typescript';
import * as path from 'path';
import {
  evaluatePatternResults,
  hasContentPattern,
  hasNameListPattern,
  matchesTypeFilter,
  TYPE_FILTER_MAP
} from './ast-extractor/pattern-core';
import type { AstPattern, AstResult, Definition } from './ast-extractor/types';
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

function getLinesAndOffsets(content: string): { lines: string[]; offsets: number[] } {
  const lines = content.split(/\r?\n/);
  const offsets: number[] = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }
  return { lines, offsets };
}

export function extractAst(content: string, filePath: string, patterns: AstPattern[]): Array<AstResult | null> {
  const ext = path.extname(filePath).toLowerCase();
  let definitions: Definition[] = [];

  if (['.py', '.pyi'].includes(ext)) {
    definitions = extractPythonDefinitions(content);
  } else if (ext === '.rb') {
    definitions = extractRubyDefinitions(content);
  } else if (ext === '.go') {
    definitions = extractGoDefinitions(content);
  } else if (ext === '.rs') {
    definitions = extractRustDefinitions(content);
  } else if (ext === '.java') {
    definitions = extractJavaDefinitions(content);
  } else if (ext === '.sol') {
    definitions = extractSolidityDefinitions(content);
  } else if (['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(ext)) {
    definitions = extractCppDefinitions(content);
  } else if (ext === '.cs') {
    definitions = extractCSharpDefinitions(content);
  } else {
    definitions = extractTsDefinitions(content, filePath);
  }

  return evaluatePatternResults(definitions, patterns);
}

/**
 * Extract definition names from a file (for name-list patterns: ??, fn??, etc.)
 * Returns an array of definition names as strings
 */
export function extractNames(content: string, filePath: string, filter?: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  let definitions: Definition[] = [];

  if (['.py', '.pyi'].includes(ext)) {
    definitions = extractPythonDefinitions(content);
  } else if (ext === '.rb') {
    definitions = extractRubyDefinitions(content);
  } else if (ext === '.go') {
    definitions = extractGoDefinitions(content);
  } else if (ext === '.rs') {
    definitions = extractRustDefinitions(content);
  } else if (ext === '.java') {
    definitions = extractJavaDefinitions(content);
  } else if (ext === '.sol') {
    definitions = extractSolidityDefinitions(content);
  } else if (['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(ext)) {
    definitions = extractCppDefinitions(content);
  } else if (ext === '.cs') {
    definitions = extractCSharpDefinitions(content);
  } else {
    definitions = extractTsDefinitions(content, filePath);
  }

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

function extractTsDefinitions(content: string, filePath: string): Definition[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const defs: Definition[] = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      defs.push(makeTsDefinition(stmt.name.text, 'function', stmt, sourceFile, content));
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      defs.push(makeTsDefinition(stmt.name.text, 'class', stmt, sourceFile, content));
      for (const member of stmt.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          defs.push(makeTsDefinition(member.name.text, 'method', member, sourceFile, content));
        }
      }
    } else if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
      defs.push(makeTsDefinition(stmt.name.text, 'interface', stmt, sourceFile, content));
    } else if (ts.isEnumDeclaration(stmt) && stmt.name) {
      defs.push(makeTsDefinition(stmt.name.text, 'enum', stmt, sourceFile, content));
    } else if (ts.isTypeAliasDeclaration(stmt) && ts.isIdentifier(stmt.name)) {
      defs.push(makeTsDefinition(stmt.name.text, 'type-alias', stmt, sourceFile, content));
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          defs.push(makeTsDefinition(decl.name.text, 'variable', stmt, sourceFile, content));
        }
      }
    }
  }

  return defs;
}

function makeTsDefinition(name: string, type: string, node: ts.Node, sf: ts.SourceFile, text: string): Definition {
  const start = node.getStart();
  const end = node.getEnd();
  const line = sf.getLineAndCharacterOfPosition(start).line + 1;
  const code = text.slice(start, end);
  const body = (node as any).body as ts.Node | undefined;
  const search = body ? body.getText(sf) : code;
  return { name, type, start, end, line, code, search };
}

function extractPythonDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number, indent: number): number {
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      if (current.trim() === '') continue;
      const currentIndent = current.match(/^\s*/)?.[0].length ?? 0;
      if (currentIndent <= indent) break;
    }
    return line;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (indent === 0 && /^def\s+(\w+)/.test(trimmed)) {
      const name = RegExp.$1;
      const endLine = blockEnd(i + 1, indent);
      const start = offsets[i];
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const search = code.split(/\r?\n/).slice(1).join('\n');
      defs.push({ name, type: 'function', start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (indent === 0 && /^class\s+(\w+)/.test(trimmed)) {
      const name = RegExp.$1;
      const endLine = blockEnd(i + 1, indent);
      const start = offsets[i];
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const search = code.split(/\r?\n/).slice(1).join('\n');
      defs.push({ name, type: 'class', start, end, line: i + 1, code, search });

      for (let j = i + 1; j < endLine; j++) {
        const inner = lines[j];
        const innerIndent = inner.match(/^\s*/)?.[0].length ?? 0;
        const innerTrim = inner.trim();
        if (innerIndent > indent && /^def\s+(\w+)/.test(innerTrim)) {
          const mName = RegExp.$1;
          const mEnd = blockEnd(j + 1, innerIndent);
          const mStart = offsets[j];
          const mEndPos = offsets[mEnd] ?? content.length;
          const mCode = content.slice(mStart, mEndPos);
          const mSearch = mCode.split(/\r?\n/).slice(1).join('\n');
          defs.push({ name: mName, type: 'method', start: mStart, end: mEndPos, line: j + 1, code: mCode, search: mSearch });
          j = mEnd - 1;
        }
      }
      i = endLine - 1;
    } else if (indent === 0 && /^(\w+)/.test(trimmed) && trimmed.includes('=')) {
      const name = RegExp.$1;
      const start = offsets[i];
      const end = start + line.length;
      const code = content.slice(start, end);
      const search = code;
      defs.push({ name, type: 'variable', start, end, line: i + 1, code, search });
    }
  }

  return defs;
}

function extractRubyDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];
  const contextStack: Array<{ endLine: number; segments: string[]; kind: 'module' | 'class' }> = [];

  function sanitized(line: string): string {
    return line.replace(/#.*$/, '');
  }

  function blockEnd(startLine: number): number {
    let depth = 0;
    for (let line = startLine; line < lines.length; line++) {
      const clean = sanitized(lines[line]);
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

  function makeDefinition(name: string, type: string, startLine: number, endLine: number, overrideName?: string): void {
    const finalName = overrideName ?? name;
    const start = offsets[startLine];
    const end = offsets[endLine] ?? content.length;
    const code = content.slice(start, end);
    const search = code.split(/\r?\n/).slice(1).join('\n');
    defs.push({ name: finalName, type, start, end, line: startLine + 1, code, search });
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const clean = sanitized(rawLine);
    const trimmed = clean.trim();

    while (contextStack.length > 0 && i >= contextStack[contextStack.length - 1].endLine) {
      contextStack.pop();
    }

    if (!trimmed) {
      continue;
    }

    const classMatch = /^class\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(trimmed);
    if (classMatch) {
      const endLine = blockEnd(i);
      const parentSegments = contextStack.length > 0 ? contextStack[contextStack.length - 1].segments : [];
      const classSegments = classMatch[1].split('::');
      const segments = [...parentSegments, ...classSegments];
      const qualified = segments.join('::');
      makeDefinition(classMatch[1], 'class', i, endLine, qualified);
      contextStack.push({ endLine, segments, kind: 'class' });
      continue;
    }

    const moduleMatch = /^module\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(trimmed);
    if (moduleMatch) {
      const endLine = blockEnd(i);
      const parentSegments = contextStack.length > 0 ? contextStack[contextStack.length - 1].segments : [];
      const moduleSegments = moduleMatch[1].split('::');
      const segments = [...parentSegments, ...moduleSegments];
      const qualified = segments.join('::');
      makeDefinition(moduleMatch[1], 'module', i, endLine, qualified);
      contextStack.push({ endLine, segments, kind: 'module' });
      continue;
    }

    const defMatch = /^def\s+([A-Za-z_]\w*[!?=]?|(?:self|[A-Za-z_]\w*)\.[A-Za-z_]\w*[!?=]?)/.exec(trimmed);
    if (defMatch) {
      const endLine = blockEnd(i);
      const name = defMatch[1];
      const insideClass = contextStack.some(mx => mx.kind === 'class');
      const type = insideClass ? 'method' : 'function';
      makeDefinition(name, type, i, endLine);
      i = endLine - 1;
      continue;
    }

    const constMatch = /^([A-Z][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (constMatch) {
      const start = offsets[i];
      const end = start + rawLine.length;
      const code = content.slice(start, end);
      defs.push({ name: constMatch[1], type: 'constant', start, end, line: i + 1, code, search: code });
    }
  }

  return defs;
}

function extractRustDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    let braces = 0;
    let started = false;
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      const opens = (current.match(/\{/g) ?? []).length;
      const closes = (current.match(/\}/g) ?? []).length;
      braces += opens;
      braces -= closes;
      if (opens > 0) started = true;
      if (started && braces === 0) break;
    }
    return line + 1;
  }

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
      const name = fnMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'function', start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (indent === 0 && structMatch) {
      const name = structMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'struct', start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (indent === 0 && enumMatch) {
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
    } else if (indent === 0 && traitMatch) {
      const name = traitMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
      const code = content.slice(start, end);
      const bodyStart = code.indexOf('{');
      const bodyEnd = code.lastIndexOf('}');
      const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
      defs.push({ name, type: 'trait', start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (indent === 0 && constMatch) {
      const name = constMatch[1];
      const start = offsets[i];
      const end = start + line.length;
      const code = content.slice(start, end);
      defs.push({ name, type: 'variable', start, end, line: i + 1, code, search: code });
    } else if (indent === 0 && /^(?:pub\s+)?impl\b/.test(trimmed)) {
      const endLine = blockEnd(i);
      for (let j = i + 1; j < endLine; j++) {
        const inner = lines[j];
        const innerTrim = inner.trim();
        const methodMatch = /^(?:pub\s+)?fn\s+(\w+)/.exec(innerTrim);
        if (methodMatch) {
          const name = methodMatch[1];
          const mStart = offsets[j];
          const mEndLine = blockEnd(j);
          const mEnd = offsets[mEndLine] ?? content.length;
          const code = content.slice(mStart, mEnd);
          const bodyStart = code.indexOf('{');
          const bodyEnd = code.lastIndexOf('}');
          const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
          defs.push({ name, type: 'method', start: mStart, end: mEnd, line: j + 1, code, search });
          j = mEndLine - 1;
        }
      }
      i = endLine - 1;
    }
  }

  return defs;
}

function extractGoDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    let braces = 0;
    let started = false;
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      const opens = (current.match(/\{/g) ?? []).length;
      const closes = (current.match(/\}/g) ?? []).length;
      braces += opens;
      braces -= closes;
      if (opens > 0) started = true;
      if (started && braces === 0) break;
    }
    return line + 1;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const funcMatch = /^func\s+(?:\([^)]+\)\s*)?(\w+)/.exec(trimmed);
    const typeMatch = /^type\s+(\w+)/.exec(trimmed);
    const varMatch = /^(?:var|const)\s+(\w+)/.exec(trimmed);

    if (funcMatch) {
      const name = funcMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
        const code = content.slice(start, end);
        const bodyStart = code.indexOf('{');
        const bodyEnd = code.lastIndexOf('}');
        const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
        const type = trimmed.startsWith('func (') ? 'method' : 'function';
        defs.push({ name, type, start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (typeMatch) {
      const name = typeMatch[1];
      const start = offsets[i];
      const endLine = blockEnd(i);
      const end = offsets[endLine] ?? content.length;
        const code = content.slice(start, end);
        const bodyStart = code.indexOf('{');
        const bodyEnd = code.lastIndexOf('}');
        const search = bodyStart >= 0 && bodyEnd >= bodyStart ? code.slice(bodyStart + 1, bodyEnd) : code;
        const kind = /struct/.test(trimmed) ? 'struct' : /interface/.test(trimmed) ? 'interface' : 'type';
        defs.push({ name, type: kind, start, end, line: i + 1, code, search });
      i = endLine - 1;
    } else if (varMatch) {
      const name = varMatch[1];
      const start = offsets[i];
      const end = start + line.length;
      const code = content.slice(start, end);
      defs.push({ name, type: 'variable', start, end, line: i + 1, code, search: code });
    }
  }

  return defs;
}

function extractCppDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

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

  function sanitize(line: string): string {
    return line
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""');
  }

  function blockEnd(startLine: number): number {
    let braces = 0;
    let started = false;
    for (let line = startLine; line < lines.length; line++) {
      const sanitized = sanitize(strippedLines[line]);
      const opens = (sanitized.match(/\{/g) ?? []).length;
      const closes = (sanitized.match(/\}/g) ?? []).length;
      if (opens > 0) started = true;
      braces += opens;
      braces -= closes;
      if (!started && sanitized.includes(';')) {
        return line + 1;
      }
      if (started && braces <= 0) {
        return line + 1;
      }
    }
    return lines.length;
  }

  function pushBlockDefinition(name: string, type: string, startLine: number): void {
    const start = offsets[startLine];
    const endLine = blockEnd(startLine);
    const end = offsets[endLine] ?? content.length;
    const code = content.slice(start, end);
    let search = code;
    const bodyStart = code.indexOf('{');
    const bodyEnd = code.lastIndexOf('}');
    if (bodyStart >= 0 && bodyEnd >= bodyStart) {
      search = code.slice(bodyStart + 1, bodyEnd);
    }
    defs.push({ name, type, start, end, line: startLine + 1, code, search });
  }

  function pushVariable(name: string, startLine: number): void {
    const start = offsets[startLine];
    const end = start + lines[startLine].length;
    const code = content.slice(start, end);
    defs.push({ name, type: 'variable', start, end, line: startLine + 1, code, search: code });
  }

  const classStack: Array<{ name: string; endLine: number }> = [];
  let pendingFunction: { startLine: number; signature: string; className?: string } | null = null;
  let braceDepth = 0;

  function currentClass(): string | undefined {
    return classStack.length ? classStack[classStack.length - 1]?.name : undefined;
  }

  function resetPending(): void {
    pendingFunction = null;
  }

  function appendPending(text: string): void {
    if (!pendingFunction || !text) return;
    if (pendingFunction.signature) pendingFunction.signature += ' ';
    pendingFunction.signature += text;
  }

  function parsePending(): { name: string; type: string } | null {
    if (!pendingFunction) return null;
    const normalized = pendingFunction.signature.replace(/\s+/g, ' ').trim();
    const parenIndex = normalized.indexOf('(');
    if (parenIndex === -1) return null;
    const before = normalized.slice(0, parenIndex).trim();
    if (!before) return null;
    const tokens = before.split(/\s+/);
    if (tokens.length === 0) return null;
    let candidate = tokens[tokens.length - 1];
    candidate = candidate.replace(/[*&]+$/, '');
    const namePart = (candidate.split('::').pop() ?? candidate).replace(/[*&]+$/, '');
    if (!/^~?[A-Za-z_]\w*$/.test(namePart)) return null;
    if (/^(?:if|for|while|switch|catch|return|sizeof|throw|case|else|do)$/.test(namePart)) return null;
    const type = (pendingFunction.className || candidate.includes('::')) ? 'method' : 'function';
    return { name: namePart, type };
  }

  function maybeFunctionStart(line: string): boolean {
    if (!line.includes('(')) return false;
    if (/^(?:if|for|while|switch|catch|return|sizeof|throw|case|else|do)\b/.test(line)) return false;
    if (/^(?:using|typedef)\b/.test(line)) return false;
    return true;
  }

  for (let i = 0; i < lines.length; i++) {
    while (classStack.length && classStack[classStack.length - 1]?.endLine <= i) {
      classStack.pop();
    }

    const stripped = strippedLines[i];
    const trimmed = stripped.trim();
    const sanitizedLine = sanitize(stripped);

    if (pendingFunction) {
      appendPending(trimmed);
      if (sanitizedLine.includes('{')) {
        const parsed = parsePending();
        if (parsed) {
          pushBlockDefinition(parsed.name, parsed.type, pendingFunction.startLine);
        }
        resetPending();
      } else if (/;\s*$/.test(trimmed)) {
        resetPending();
      }
    } else if (trimmed && !trimmed.startsWith('#')) {
      const classMatch = /^(?:typedef\s+)?(?:template\s*<[^>]+>\s*)*(class|struct|union)\s+([A-Za-z_]\w*)/.exec(trimmed);
      if (classMatch && sanitizedLine.includes('{')) {
        const name = classMatch[2];
        const type = classMatch[1];
        const endLine = blockEnd(i);
        pushBlockDefinition(name, type, i);
        classStack.push({ name, endLine });
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

        if (maybeFunctionStart(trimmed)) {
          pendingFunction = { startLine: i, signature: trimmed, className: currentClass() };
          if (sanitizedLine.includes('{')) {
            const parsed = parsePending();
            if (parsed) {
              pushBlockDefinition(parsed.name, parsed.type, pendingFunction.startLine);
            }
            resetPending();
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

function extractSolidityDefinitions(content: string): Definition[] {
  const { lines, offsets } = getLinesAndOffsets(content);

  const defs: Definition[] = [];

  function blockEnd(startLine: number): number {
    let braces = 0;
    let started = false;
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      const cleaned = current.replace(/\/\/.*$/, '');
      const opens = (cleaned.match(/\{/g) ?? []).length;
      const closes = (cleaned.match(/\}/g) ?? []).length;
      if (!started && opens > 0) started = true;
      braces += opens;
      braces -= closes;
      if (!started && cleaned.includes(';')) {
        return line + 1;
      }
      if (started && braces <= 0) {
        return line + 1;
      }
    }
    return lines.length;
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
    let braces = 0;
    let started = false;
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      const cleaned = current.replace(/".*?"/g, '');
      const opens = (cleaned.match(/\{/g) ?? []).length;
      const closes = (cleaned.match(/\}/g) ?? []).length;
      braces += opens;
      braces -= closes;
      if (opens > 0) started = true;
      if (started && braces === 0) break;
    }
    return line + 1;
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
    let braces = 0;
    let started = false;
    let line = startLine;
    for (; line < lines.length; line++) {
      const current = lines[line];
      const cleaned = current.replace(/".*?"/g, '').replace(/\/\/.*$/, '');
      const opens = (cleaned.match(/\{/g) ?? []).length;
      const closes = (cleaned.match(/\}/g) ?? []).length;
      braces += opens;
      braces -= closes;
      if (opens > 0) started = true;
      if (started && braces === 0) break;
    }
    return started ? line + 1 : startLine + 1;
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
