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
import { extractTsDefinitions } from './ast-extractor/typescript-extractor';
import { extractPythonDefinitions } from './ast-extractor/python-extractor';
import { extractRubyDefinitions } from './ast-extractor/ruby-extractor';
import { extractGoDefinitions } from './ast-extractor/go-extractor';
import { extractRustDefinitions } from './ast-extractor/rust-extractor';
import { extractCppDefinitions } from './ast-extractor/cpp-extractor';
import { extractSolidityDefinitions } from './ast-extractor/solidity-extractor';
import { extractJavaDefinitions } from './ast-extractor/java-extractor';
import { extractCSharpDefinitions } from './ast-extractor/csharp-extractor';
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

const AST_EXTRACTOR_REGISTRY: AstExtractorRegistry = {
  ts: extractTsDefinitions,
  python: extractPythonDefinitions,
  ruby: extractRubyDefinitions,
  go: extractGoDefinitions,
  rust: extractRustDefinitions,
  java: extractJavaDefinitions,
  solidity: extractSolidityDefinitions,
  cpp: extractCppDefinitions,
  csharp: extractCSharpDefinitions
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
