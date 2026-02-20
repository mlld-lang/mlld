import { describe, expect, it } from 'vitest';
import { extractAst } from '../ast-extractor';

function onlyResult(results: Array<{ name: string; type: string } | null>): { name: string; type: string } {
  const present = results.filter((result): result is { name: string; type: string } => result !== null);
  expect(present).toHaveLength(1);
  return present[0];
}

describe('ast extractor language group A (TS/Python/Ruby)', () => {
  it('keeps TypeScript nested member extraction and usage matching stable', () => {
    const source = [
      'const seed = 1;',
      'function helper() { return seed; }',
      'class Service {',
      '  build() { return helper(); }',
      '}'
    ].join('\n');

    const methodMatch = onlyResult(extractAst(source, 'service.ts', [{ type: 'definition', name: 'build' }]));
    expect(methodMatch.type).toBe('method');

    const usageMatch = onlyResult(extractAst(source, 'service.ts', [{ type: 'definition', name: 'helper', usage: true }]));
    expect(usageMatch.name).toBe('build');
    expect(usageMatch.type).toBe('method');
  });

  it('keeps Python class/method extraction and usage matching stable', () => {
    const source = [
      'class Service:',
      '    def process(self):',
      '        return helper()',
      '',
      'def helper():',
      '    return 1',
      '',
      'counter = 1'
    ].join('\n');

    const classMatch = onlyResult(extractAst(source, 'service.py', [{ type: 'definition', name: 'Service' }]));
    expect(classMatch.type).toBe('class');

    const methodMatch = onlyResult(extractAst(source, 'service.py', [{ type: 'definition', name: 'process' }]));
    expect(methodMatch.type).toBe('method');

    const usageMatch = onlyResult(extractAst(source, 'service.py', [{ type: 'definition', name: 'helper', usage: true }]));
    expect(usageMatch.name).toBe('process');
    expect(usageMatch.type).toBe('method');
  });

  it('keeps Ruby module/class qualification and method usage matching stable', () => {
    const source = [
      'module Billing',
      '  class Service',
      '    def build_invoice',
      '      calculate_total',
      '    end',
      '  end',
      'end',
      '',
      'def calculate_total',
      '  1',
      'end'
    ].join('\n');

    const classMatch = onlyResult(extractAst(source, 'service.rb', [{ type: 'definition', name: 'Billing::Service' }]));
    expect(classMatch.type).toBe('class');

    const usageMatch = onlyResult(extractAst(source, 'service.rb', [{ type: 'definition', name: 'calculate_total', usage: true }]));
    expect(usageMatch.name).toBe('build_invoice');
    expect(usageMatch.type).toBe('method');
  });
});
