import { describe, expect, it } from 'vitest';
import {
  collectDeclarativeFactRequirementEntries,
  resolveFactRequirementsForOperationArg,
  selectDestinationArgs,
  selectTargetArgs
} from './fact-requirements';
import { mergePolicyConfigs, normalizePolicyConfig } from './union';

describe('fact requirements', () => {
  it('resolves symbolic built-in operations without guessing from arg names alone', () => {
    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@email.send',
        argName: 'recipient'
      })
    ).toEqual({
      status: 'resolved',
      opRef: 'op:@email.send',
      requirements: [
        {
          arg: 'recipient',
          patterns: ['fact:*.email'],
          source: 'builtin'
        }
      ]
    });

    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@crm.delete',
        argName: 'id'
      })
    ).toEqual({
      status: 'resolved',
      opRef: 'op:@crm.delete',
      requirements: [
        {
          arg: 'id',
          patterns: ['fact:*.id'],
          source: 'builtin'
        }
      ]
    });
  });

  it('fails closed when operation identity is missing or unknown', () => {
    expect(
      resolveFactRequirementsForOperationArg({
        argName: 'recipient'
      })
    ).toEqual({
      status: 'unknown_operation',
      requirements: []
    });

    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@unknown.tool',
        argName: 'recipient'
      })
    ).toEqual({
      status: 'unknown_operation',
      opRef: 'op:@unknown.tool',
      requirements: []
    });
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

  it('derives fact requirements from live operation metadata when available', () => {
    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@createCalendarEvent',
        argName: 'participants',
        operationLabels: ['exfil:send'],
        controlArgs: ['participants'],
        hasControlArgsMetadata: true
      })
    ).toEqual({
      status: 'resolved',
      opRef: 'op:@createcalendarevent',
      requirements: [
        {
          arg: 'participants',
          patterns: ['fact:*.email'],
          source: 'builtin'
        }
      ]
    });

    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@sendMoney',
        argName: 'recipient',
        operationLabels: ['exfil:send'],
        hasControlArgsMetadata: false
      })
    ).toEqual({
      status: 'no_requirement',
      opRef: 'op:@sendmoney',
      requirements: []
    });
  });

  it('adds stricter policy-derived requirements on top of built-in op requirements', () => {
    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@email.send',
        argName: 'recipient',
        policy: {
          defaults: {
            rules: ['no-send-to-unknown', 'no-send-to-external']
          }
        }
      })
    ).toEqual({
      status: 'resolved',
      opRef: 'op:@email.send',
      requirements: [
        {
          arg: 'recipient',
          patterns: ['fact:*.email'],
          source: 'builtin'
        },
        {
          arg: 'recipient',
          patterns: ['fact:internal:*.email'],
          source: 'policy',
          rule: 'policy.defaults.rules.no-send-to-external'
        }
      ]
    });
  });

  it('collects declarative fact requirements from policy config and preserves merged clauses', () => {
    const merged = mergePolicyConfigs(
      normalizePolicyConfig({
        facts: {
          requirements: {
            '@createCalendarEvent': {
              participants: ['fact:*.email']
            }
          }
        }
      }),
      normalizePolicyConfig({
        facts: {
          requirements: {
            '@createCalendarEvent': {
              participants: ['fact:internal:*.email']
            }
          }
        }
      })
    );

    expect(collectDeclarativeFactRequirementEntries(merged)).toEqual([
      {
        opRef: 'op:@createcalendarevent',
        arg: 'participants',
        clauses: [
          ['fact:*.email'],
          ['fact:internal:*.email']
        ]
      }
    ]);
  });

  it('resolves declarative fact requirements for unknown symbolic operations', () => {
    expect(
      resolveFactRequirementsForOperationArg({
        opRef: 'op:@createCalendarEvent',
        argName: 'participants',
        policy: normalizePolicyConfig({
          facts: {
            requirements: {
              '@createCalendarEvent': {
                participants: ['fact:internal:*.email']
              }
            }
          }
        })
      })
    ).toEqual({
      status: 'resolved',
      opRef: 'op:@createcalendarevent',
      requirements: [
        {
          arg: 'participants',
          patterns: ['fact:internal:*.email'],
          source: 'declarative',
          rule: 'policy.facts.requirements.op:@createcalendarevent.participants'
        }
      ]
    });
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
