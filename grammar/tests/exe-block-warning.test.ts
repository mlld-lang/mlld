import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

describe('Grammar - exe block warnings', () => {
  it('warns when a non-final when expression is followed by more statements', async () => {
    const source = '/exe @doThing() = [ when [ true => "x"; * => null ] continue { ok: true } ]';
    const { warnings } = await parse(source, { mode: 'markdown' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('exe-nonfinal-when-discarded');
    expect(warnings[0]?.message).toContain('Non-final bracketed when [ ... ] expressions in exe blocks discard their value');
  });

  it('warns when a non-final when expression is followed only by an explicit return', async () => {
    const source = '/exe @doThing() = [ when [ true => "x"; * => null ] => "ok" ]';
    const { warnings } = await parse(source, { mode: 'markdown' });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('exe-nonfinal-when-discarded');
  });

  it('does not warn when a when expression is the final statement in the block', async () => {
    const source = '/exe @doThing() = [ when [ true => "x"; * => null ] ]';
    const { warnings } = await parse(source, { mode: 'markdown' });

    expect(warnings).toHaveLength(0);
  });

  it('does not warn for inline when guard forms followed by more statements', async () => {
    const source = '/exe @doThing(x) = [ when !@x => "missing" => "ok: @x" ]';
    const { warnings } = await parse(source, { mode: 'markdown' });

    expect(warnings).toHaveLength(0);
  });

  it('does not warn for bound-match when forms followed by more statements', async () => {
    const source = '/exe @route(action) = [ when @action [ "greet" => "Hello!"; * => null ] => "unknown" ]';
    const { warnings } = await parse(source, { mode: 'markdown' });

    expect(warnings).toHaveLength(0);
  });
});
