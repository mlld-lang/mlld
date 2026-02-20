import { describe, expect, it } from 'vitest';
import { extractAst, extractNames } from '../ast-extractor';

describe('ast extractor registry composition', () => {
  it('keeps extension routing and default fallback stable across extractAst and extractNames', () => {
    const pythonSource = [
      'class Service:',
      '    def build(self):',
      '        return helper()',
      '',
      'def helper():',
      '    return 1'
    ].join('\n');

    const pythonUsage = extractAst(pythonSource, 'service.pyi', [
      { type: 'definition', name: 'helper', usage: true }
    ]);
    expect(pythonUsage).toHaveLength(1);
    expect(pythonUsage[0]?.name).toBe('build');
    expect(pythonUsage[0]?.type).toBe('method');

    const pythonNames = extractNames(pythonSource, 'service.pyi');
    expect(pythonNames).toEqual(['Service', 'helper']);

    const cppSource = [
      'class Worker {',
      'public:',
      '  int run();',
      '};',
      'int Worker::run() { return 1; }'
    ].join('\n');
    const cppNames = extractNames(cppSource, 'worker.hxx', 'fn');
    expect(cppNames).toEqual(['run']);

    const unknownExtensionSource = [
      'function fallbackFn() { return 1; }',
      'class Demo {',
      '  run() { return fallbackFn(); }',
      '}'
    ].join('\n');
    const unknownExtensionResults = extractAst(unknownExtensionSource, 'fallback.unknownext', [
      { type: 'definition', name: 'run' }
    ]);
    expect(unknownExtensionResults).toHaveLength(1);
    expect(unknownExtensionResults[0]?.type).toBe('method');
  });
});
