import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

describe('Done literal regression', () => {
  it('parses bare done without consuming the next line as a value', () => {
    const ast = parseSync(
      [
        '/exe @processor(input) = when @input [',
        '  "stop" => done',
        '  * => "next"',
        ']'
      ].join('\n')
    ) as any[];

    const exeDirective = ast[0];
    const whenExpr = exeDirective?.values?.content?.[0];
    const firstAction = whenExpr?.conditions?.[0]?.action?.[0];
    const secondCondition = whenExpr?.conditions?.[1]?.condition?.[0];

    expect(firstAction?.valueType).toBe('done');
    expect(firstAction?.value).toBe('done');
    expect(secondCondition?.valueType).toBe('wildcard');
  });
});
