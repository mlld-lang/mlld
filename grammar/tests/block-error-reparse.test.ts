import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

function expectParseError(run: () => unknown) {
  try {
    run();
  } catch (error: any) {
    return error;
  }
  throw new Error('Expected parse to fail');
}

function baseLocationFor(source: string, snippet: string) {
  const offset = source.indexOf(snippet);
  expect(offset).toBeGreaterThanOrEqual(0);

  const before = source.slice(0, offset).split('\n');
  const line = before.length;
  const column = before[before.length - 1].length + 1;

  return {
    start: { offset, line, column }
  };
}

function offsetLocation(base: any, loc: any) {
  const startLine = loc.start.line + base.start.line - 1;
  const startColumn =
    loc.start.line === 1
      ? loc.start.column + base.start.column - 1
      : loc.start.column;

  return {
    start: {
      line: startLine,
      column: startColumn
    }
  };
}

function getLocation(error: any) {
  return error?.location || error?.mlldErrorLocation;
}

describe('Block error reparsing', () => {
  it('surfaces inner errors for exe blocks', () => {
    const inner = 'foo\n';
    const source = `/exe @demo() = [\n  ${inner}]\n`;

    const innerError = expectParseError(() =>
      parseSync(inner, { startRule: 'ExeBlockBody' })
    );
    const outerError = expectParseError(() => parseSync(source));

    const innerLocation = getLocation(innerError);
    const outerLocation = getLocation(outerError);

    expect(innerLocation).toBeDefined();
    expect(outerLocation).toBeDefined();

    const base = baseLocationFor(source, inner);
    const expectedStart = offsetLocation(base, innerLocation);

    expect(outerLocation.start.line).toBe(expectedStart.start.line);
    expect(outerLocation.start.column).toBe(expectedStart.start.column);
  });

  it('offsets parse failures inside for block actions', () => {
    const inner = 'oops\n';
    const source = `/for @item in [1] => [\n  ${inner}]\n`;

    const innerError = expectParseError(() =>
      parseSync(inner, { startRule: 'ForBlockStatementList' })
    );
    const outerError = expectParseError(() => parseSync(source));

    const innerLocation = getLocation(innerError);
    const outerLocation = getLocation(outerError);

    expect(innerLocation).toBeDefined();
    expect(outerLocation).toBeDefined();

    const base = baseLocationFor(source, inner);
    const expectedStart = offsetLocation(base, innerLocation);

    expect(outerLocation.start.line).toBe(expectedStart.start.line);
    expect(outerLocation.start.column).toBe(expectedStart.start.column);
  });

  it('aligns condition errors inside when blocks', () => {
    const inner = '@foo => show "ok"\noops\n';
    const source = `/when [\n  ${inner}]\n`;

    const innerError = expectParseError(() =>
      parseSync(inner, { startRule: 'WhenConditionList' })
    );
    const outerError = expectParseError(() => parseSync(source));

    const innerLocation = getLocation(innerError);
    const outerLocation = getLocation(outerError);

    expect(innerLocation).toBeDefined();
    expect(outerLocation).toBeDefined();

    const base = baseLocationFor(source, inner);
    const expectedStart = offsetLocation(base, innerLocation);

    expect(outerLocation.start.line).toBe(expectedStart.start.line);
    expect(outerLocation.start.column).toBe(expectedStart.start.column);
  });

  it('keeps guard block errors on the correct lines', () => {
    const inner = 'oops\n';
    const source = `/guard for op:run = when [\n  ${inner}]\n`;

    const innerError = expectParseError(() =>
      parseSync(inner, { startRule: 'GuardRuleList' })
    );
    const outerError = expectParseError(() => parseSync(source));

    const innerLocation = getLocation(innerError);
    const outerLocation = getLocation(outerError);

    expect(innerLocation).toBeDefined();
    expect(outerLocation).toBeDefined();

    const base = baseLocationFor(source, inner);
    const expectedStart = offsetLocation(base, innerLocation);

    expect(outerLocation.start.line).toBe(expectedStart.start.line);
    expect(outerLocation.start.column).toBe(expectedStart.start.column);
  });
});
