import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

describe('Multiline function arguments', () => {
  it('parses exec invocations with arguments split across lines', () => {
    const input = `var @result = @decisionPrompt(
  @context.spec,
  @job,
  @context.tickets ?? [],
  @context.recentEvents ?? [],
  @context.lastWorkerResult,
  @context.testResults,
  @context.lastError,
  @context.humanAnswers,
  @chestertonsFence
)`;

    const ast = parseSync(input, { mode: 'strict' });
    expect(ast).toHaveLength(1);

    const directive = ast[0];
    expect(directive.kind).toBe('var');

    const value = directive.values.value[0];
    expect(value.type).toBe('ExecInvocation');
    expect(value.commandRef.args).toHaveLength(9);
  });
});
