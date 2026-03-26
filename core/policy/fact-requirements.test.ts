import { describe, expect, it } from 'vitest';
import {
  deriveBuiltInFactPatternsForOperationArg,
  deriveBuiltInFactPatternsForQuery,
  selectDestinationArgs,
  selectTargetArgs
} from './fact-requirements';

describe('fact requirements', () => {
  it('derives built-in fact patterns for supported query args', () => {
    expect(deriveBuiltInFactPatternsForQuery({ arg: 'recipient' })).toEqual(['fact:*.email']);
    expect(deriveBuiltInFactPatternsForQuery({ arg: 'id' })).toEqual(['fact:*.id']);
    expect(deriveBuiltInFactPatternsForQuery({ arg: 'unknown' })).toEqual([]);
    expect(deriveBuiltInFactPatternsForQuery({})).toBeNull();
  });

  it('fails closed for tool:w send operations without declared control args', () => {
    expect(
      selectDestinationArgs(
        { labels: ['tool:w:send_money'] },
        { recipient: 'acct-1' }
      )
    ).toEqual([]);
  });

  it('uses declared control args for send destination selection', () => {
    expect(
      selectDestinationArgs(
        {
          labels: ['tool:w:create_calendar_event'],
          metadata: { authorizationControlArgs: ['participants'] }
        },
        { participants: ['ada@example.com'], title: 'Lunch' }
      )
    ).toEqual(['participants']);
  });

  it('derives fact patterns from live operation metadata when available', () => {
    expect(
      deriveBuiltInFactPatternsForOperationArg({
        arg: 'participants',
        operationLabels: ['exfil:send'],
        controlArgs: ['participants'],
        hasControlArgsMetadata: true
      })
    ).toEqual(['fact:*.email']);

    expect(
      deriveBuiltInFactPatternsForOperationArg({
        arg: 'recipient',
        operationLabels: ['exfil:send'],
        hasControlArgsMetadata: false
      })
    ).toEqual([]);
  });

  it('falls back to the first provided arg for non-tool send operations and targeted destroy', () => {
    expect(
      selectDestinationArgs(
        { labels: ['mail:send'] },
        { destination: 'ada@example.com', body: 'hello' }
      )
    ).toEqual(['destination']);

    expect(selectTargetArgs({ fileId: 'file-1' })).toEqual(['fileId']);
  });
});
