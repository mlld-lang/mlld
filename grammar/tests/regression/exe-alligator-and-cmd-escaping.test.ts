import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

describe('exe alligator and cmd escaping regressions', () => {
  it('accepts alligator section selectors as exe bodies', async () => {
    const { ast } = await parse('/exe @releaseNotes(version) = <CHANGELOG.md # "[@version]">');
    const directive = ast[0] as any;

    expect(directive.kind).toBe('exe');
    expect(directive.subtype).toBe('exeData');
    expect(directive.values.data?.type).toBe('load-content');
    expect(directive.values.data?.options?.section?.type).toBe('section');
  });

  it('rejects legacy exe section bracket syntax', async () => {
    const result = await parse('/exe @legacy(file, section) = [@file # @section]', { mode: 'strict' });
    expect(result.success).toBe(false);
  });

  it('keeps pipe characters inside cmd double quotes literal with interpolated params', async () => {
    const { ast } = await parse('/exe @test(first, second) = cmd { echo "@first | @second" }');
    const directive = ast[0] as any;
    const variableRefs = (directive.values.command ?? []).filter(
      (node: any) => node.type === 'VariableReference'
    );

    expect(directive.subtype).toBe('exeCommand');
    expect(variableRefs.map((node: any) => node.identifier)).toEqual(['first', 'second']);
    expect(directive.raw.command.trim()).toBe('echo "@first | @second"');
  });

  it('treats \\@ as a literal @ inside cmd words after literal text', async () => {
    const { ast } = await parse('/run cmd { echo user\\@example.com }');
    const directive = ast[0] as any;
    const variableRefs = (directive.values.command ?? []).filter(
      (node: any) => node.type === 'VariableReference'
    );

    expect(directive.subtype).toBe('runCommand');
    expect(variableRefs).toHaveLength(0);
    expect(directive.raw.command.trim()).toBe('echo user@example.com');
  });
});
