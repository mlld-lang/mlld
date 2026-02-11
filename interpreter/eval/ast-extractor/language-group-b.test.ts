import { describe, expect, it } from 'vitest';
import { extractAst } from '../ast-extractor';

function onlyResult(results: Array<{ name: string; type: string } | null>): { name: string; type: string } {
  const present = results.filter((result): result is { name: string; type: string } => result !== null);
  expect(present).toHaveLength(1);
  return present[0];
}

describe('ast extractor language group B (Rust/Go)', () => {
  it('keeps Rust impl method extraction and usage matching stable', () => {
    const source = [
      'pub struct Service {',
      '  value: i32,',
      '}',
      '',
      'impl Service {',
      '  pub fn process(&self) -> i32 {',
      '    helper()',
      '  }',
      '}',
      '',
      'pub fn helper() -> i32 {',
      '  1',
      '}'
    ].join('\n');

    const structMatch = onlyResult(extractAst(source, 'service.rs', [{ type: 'definition', name: 'Service' }]));
    expect(structMatch.type).toBe('struct');

    const methodMatch = onlyResult(extractAst(source, 'service.rs', [{ type: 'definition', name: 'process' }]));
    expect(methodMatch.type).toBe('method');

    const usageMatch = onlyResult(extractAst(source, 'service.rs', [{ type: 'definition', name: 'helper', usage: true }]));
    expect(usageMatch.name).toBe('process');
    expect(usageMatch.type).toBe('method');
  });

  it('keeps Go receiver method and type extraction stable', () => {
    const source = [
      'package main',
      '',
      'type Service struct {',
      '  value int',
      '}',
      '',
      'type Reader interface {',
      '  Read() error',
      '}',
      '',
      'func (s Service) Handle() int {',
      '  return helper()',
      '}',
      '',
      'func helper() int {',
      '  return 1',
      '}'
    ].join('\n');

    const structMatch = onlyResult(extractAst(source, 'service.go', [{ type: 'definition', name: 'Service' }]));
    expect(structMatch.type).toBe('struct');

    const interfaceMatch = onlyResult(extractAst(source, 'service.go', [{ type: 'definition', name: 'Reader' }]));
    expect(interfaceMatch.type).toBe('interface');

    const methodMatch = onlyResult(extractAst(source, 'service.go', [{ type: 'definition', name: 'Handle' }]));
    expect(methodMatch.type).toBe('method');

    const usageMatch = onlyResult(extractAst(source, 'service.go', [{ type: 'definition', name: 'helper', usage: true }]));
    expect(usageMatch.name).toBe('Handle');
    expect(usageMatch.type).toBe('method');
  });
});
