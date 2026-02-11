import { describe, expect, it, vi } from 'vitest';
import {
  extractDefinitionsForFile,
  resolveAstExtractorKey,
  type AstExtractorRegistry
} from './language-dispatch';

describe('ast extractor language dispatch', () => {
  it('resolves extractor keys across supported extension sets', () => {
    const cases: Array<{ filePath: string; expected: ReturnType<typeof resolveAstExtractorKey> }> = [
      { filePath: 'file.ts', expected: 'ts' },
      { filePath: 'file.TSX', expected: 'ts' },
      { filePath: 'file.py', expected: 'python' },
      { filePath: 'file.PYI', expected: 'python' },
      { filePath: 'file.rb', expected: 'ruby' },
      { filePath: 'file.go', expected: 'go' },
      { filePath: 'file.rs', expected: 'rust' },
      { filePath: 'file.java', expected: 'java' },
      { filePath: 'file.sol', expected: 'solidity' },
      { filePath: 'file.c', expected: 'cpp' },
      { filePath: 'file.hpp', expected: 'cpp' },
      { filePath: 'file.cs', expected: 'csharp' },
      { filePath: 'file.unknown', expected: 'ts' }
    ];

    for (const testCase of cases) {
      expect(resolveAstExtractorKey(testCase.filePath)).toBe(testCase.expected);
    }
  });

  it('routes to the resolved extractor with content and file path', () => {
    const calls: Array<{ key: string; filePath: string; content: string }> = [];
    const makeExtractor = (key: string) => vi.fn((content: string, filePath: string) => {
      calls.push({ key, content, filePath });
      return [];
    });

    const registry: AstExtractorRegistry = {
      ts: makeExtractor('ts'),
      python: makeExtractor('python'),
      ruby: makeExtractor('ruby'),
      go: makeExtractor('go'),
      rust: makeExtractor('rust'),
      java: makeExtractor('java'),
      solidity: makeExtractor('solidity'),
      cpp: makeExtractor('cpp'),
      csharp: makeExtractor('csharp')
    };

    extractDefinitionsForFile('content-a', 'alpha.py', registry);
    extractDefinitionsForFile('content-b', 'beta.go', registry);
    extractDefinitionsForFile('content-c', 'gamma.txt', registry);

    expect(calls).toEqual([
      { key: 'python', content: 'content-a', filePath: 'alpha.py' },
      { key: 'go', content: 'content-b', filePath: 'beta.go' },
      { key: 'ts', content: 'content-c', filePath: 'gamma.txt' }
    ]);
  });
});
