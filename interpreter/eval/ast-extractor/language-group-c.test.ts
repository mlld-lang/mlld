import { describe, expect, it } from 'vitest';
import { extractAst } from '../ast-extractor';

function onlyResult(results: Array<{ name: string; type: string } | null>): { name: string; type: string } {
  const present = results.filter((result): result is { name: string; type: string } => result !== null);
  expect(present).toHaveLength(1);
  return present[0];
}

describe('ast extractor language group C (C/C++)', () => {
  it('keeps class context, out-of-class method parsing, and enum/variable extraction stable', () => {
    const source = [
      'class Widget {',
      'public:',
      '  int compute(int x);',
      '};',
      '',
      'int Widget::compute(int x) {',
      '  return helper(x);',
      '}',
      '',
      'int helper(int x) {',
      '  return x + 1;',
      '}',
      '',
      'enum class Kind { A, B };',
      'static int globalCount = 3;'
    ].join('\n');

    const classMatch = onlyResult(extractAst(source, 'widget.cpp', [{ type: 'definition', name: 'Widget' }]));
    expect(classMatch.type).toBe('class');

    const methodMatch = onlyResult(extractAst(source, 'widget.cpp', [{ type: 'definition', name: 'compute' }]));
    expect(methodMatch.type).toBe('method');

    const enumMatch = onlyResult(extractAst(source, 'widget.cpp', [{ type: 'definition', name: 'Kind' }]));
    expect(enumMatch.type).toBe('enum');

    const variableMatch = onlyResult(extractAst(source, 'widget.cpp', [{ type: 'definition', name: 'globalCount' }]));
    expect(variableMatch.type).toBe('variable');

    const usageMatch = onlyResult(extractAst(source, 'widget.cpp', [{ type: 'definition', name: 'helper', usage: true }]));
    expect(usageMatch.name).toBe('compute');
    expect(usageMatch.type).toBe('method');
  });

  it('keeps comment stripping, false-positive guards, and multiline signature parsing stable', () => {
    const source = [
      '/*',
      'int fake_from_comment() { return 0; }',
      '*/',
      '',
      'int',
      'free_func(',
      '  int x',
      ') {',
      '  if (x > 0) {',
      '    return x;',
      '  }',
      '  return 0;',
      '}',
      '',
      'if (true) {',
      '  // should not parse as function',
      '}'
    ].join('\n');

    const functionMatch = onlyResult(extractAst(source, 'free.cpp', [{ type: 'definition', name: 'free_func' }]));
    expect(functionMatch.type).toBe('function');

    const commentMatch = extractAst(source, 'free.cpp', [{ type: 'definition', name: 'fake_from_comment' }]);
    expect(commentMatch).toEqual([null]);

    const keywordMatch = extractAst(source, 'free.cpp', [{ type: 'definition', name: 'if' }]);
    expect(keywordMatch).toEqual([null]);
  });
});
