import { describe, expect, it } from 'vitest';
import {
  extractAst,
  extractNames,
  type AstPattern,
  type AstResult
} from './ast-extractor';

function resultNames(results: Array<AstResult | null>): Array<string | null> {
  return results.map(result => result?.name ?? null);
}

function nonNullResults(results: Array<AstResult | null>): AstResult[] {
  return results.filter((result): result is AstResult => result !== null);
}

describe('ast extractor phase-0 characterization', () => {
  it('keeps wildcard matching, null placeholders, and output ordering behavior stable', () => {
    const source = [
      'const seed = 1;',
      'function alphaHelper() { return seed; }',
      'function betaHelper() { return seed + 1; }',
      'class RequestBuilder {',
      '  createRequest() { return alphaHelper(); }',
      '  createResponse() { return betaHelper(); }',
      '}'
    ].join('\n');

    const patterns: AstPattern[] = [
      { type: 'definition', name: '*Helper' },
      { type: 'definition', name: 'missingSymbol' },
      { type: 'definition', name: 'create*' }
    ];

    const results = extractAst(source, 'service.ts', patterns);
    expect(resultNames(results)).toEqual([
      'alphaHelper',
      'betaHelper',
      null,
      'createRequest',
      'createResponse'
    ]);
  });

  it('keeps sequence stability and duplicate suppression behavior stable', () => {
    const source = [
      'function alphaHelper() { return 1; }',
      'function betaHelper() { return 2; }'
    ].join('\n');

    const patterns: AstPattern[] = [
      { type: 'definition', name: 'alphaHelper' },
      { type: 'definition', name: '*Helper' },
      { type: 'definition', name: 'alphaHelper' }
    ];

    const results = extractAst(source, 'dupes.ts', patterns);
    expect(resultNames(results)).toEqual(['alphaHelper', 'betaHelper']);
  });

  it('keeps containment-pruning behavior stable when container and member are both selected', () => {
    const source = [
      'class Service {',
      '  create() {',
      '    return 1;',
      '  }',
      '}'
    ].join('\n');

    const results = extractAst(source, 'containment.ts', [
      { type: 'definition', name: 'create' },
      { type: 'definition', name: 'Service' }
    ]);

    expect(resultNames(results)).toEqual(['Service']);
  });

  it('keeps usage-pattern behavior stable for wildcard, legacy usage, and type-filter usage', () => {
    const source = [
      'const seed = 1;',
      'function readSeed() { return seed; }',
      'function compute() { return readSeed(); }',
      'class Builder {',
      '  buildRequest() { return readSeed(); }',
      '}',
      'function unrelated() { return 0; }'
    ].join('\n');

    const wildcardUsageResults = extractAst(source, 'usage.ts', [
      { type: 'definition', name: 'read*', usage: true }
    ]);
    expect(resultNames(wildcardUsageResults)).toEqual(['compute', 'buildRequest']);

    const legacyUsageResults = extractAst(source, 'usage.ts', [
      { type: 'usage', name: 'readSeed' }
    ]);
    expect(resultNames(legacyUsageResults)).toEqual(['compute', 'buildRequest']);

    const typeFilterUsageResults = extractAst(source, 'usage.ts', [
      { type: 'type-filter', filter: 'var', usage: true }
    ]);
    expect(resultNames(typeFilterUsageResults)).toEqual(['readSeed']);
  });

  it('keeps type-filter and extractNames behavior stable', () => {
    const source = [
      'const seed = 1;',
      'function topLevel() { return seed; }',
      'class Service {',
      '  methodOne() { return topLevel(); }',
      '}',
      'interface Shape { id: string; }'
    ].join('\n');

    const fnResults = extractAst(source, 'types.ts', [
      { type: 'type-filter', filter: 'fn' }
    ]);
    expect(resultNames(fnResults)).toEqual(['topLevel', 'methodOne']);

    const allResults = extractAst(source, 'types.ts', [
      { type: 'type-filter-all' }
    ]);
    expect(resultNames(allResults)).toEqual([
      'seed',
      'topLevel',
      'Service',
      'Shape'
    ]);

    const topLevelNames = extractNames(source, 'types.ts');
    expect(topLevelNames).toEqual(['Service', 'Shape', 'seed', 'topLevel']);

    const functionNames = extractNames(source, 'types.ts', 'fn');
    expect(functionNames).toEqual(['methodOne', 'topLevel']);
  });

  it('keeps extension-based extractor routing stable for representative languages', () => {
    const cases: Array<{
      filePath: string;
      source: string;
      symbol: string;
      expectedType: string;
    }> = [
      {
        filePath: 'source.ts',
        source: 'function tsFunc() { return 1; }',
        symbol: 'tsFunc',
        expectedType: 'function'
      },
      {
        filePath: 'source.py',
        source: ['def py_func():', '    return 1'].join('\n'),
        symbol: 'py_func',
        expectedType: 'function'
      },
      {
        filePath: 'source.rb',
        source: ['def rb_func', '  1', 'end'].join('\n'),
        symbol: 'rb_func',
        expectedType: 'function'
      },
      {
        filePath: 'source.go',
        source: ['package main', '', 'func GoFunc() int { return 1 }'].join('\n'),
        symbol: 'GoFunc',
        expectedType: 'function'
      },
      {
        filePath: 'source.rs',
        source: 'fn rs_func() -> i32 { 1 }',
        symbol: 'rs_func',
        expectedType: 'function'
      },
      {
        filePath: 'source.cpp',
        source: 'int cpp_func() { return 1; }',
        symbol: 'cpp_func',
        expectedType: 'function'
      },
      {
        filePath: 'source.sol',
        source: ['contract Vault {', '  function store() public {}', '}'].join('\n'),
        symbol: 'store',
        expectedType: 'function'
      },
      {
        filePath: 'Source.java',
        source: ['public class Service {', '  public void createUser() {}', '}'].join('\n'),
        symbol: 'createUser',
        expectedType: 'method'
      },
      {
        filePath: 'Source.cs',
        source: ['public class Service {', '  public void CreateUser() { }', '}'].join('\n'),
        symbol: 'CreateUser',
        expectedType: 'method'
      }
    ];

    for (const testCase of cases) {
      const results = extractAst(testCase.source, testCase.filePath, [
        { type: 'definition', name: testCase.symbol }
      ]);
      const extracted = nonNullResults(results);

      expect(extracted.length, `expected one match for ${testCase.filePath}`).toBe(1);
      expect(extracted[0].name).toBe(testCase.symbol);
      expect(extracted[0].type).toBe(testCase.expectedType);
    }
  });
});
