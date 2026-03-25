import { describe, expect, it } from 'vitest';
import {
  getOperationLabels,
  normalizeNamedOperationRef,
  parseCommand
} from '@core/policy/operation-labels';

describe('operation labels', () => {
  it('builds hierarchical labels for command operations', () => {
    const labels = getOperationLabels({
      type: 'cmd',
      command: 'git',
      subcommand: 'status'
    });

    expect(labels).toEqual(['op:cmd', 'op:cmd:git', 'op:cmd:git:status']);
  });

  it('parses command and subcommand with env and flags', () => {
    const parsed = parseCommand('TOKEN=foo git -C /path status');
    expect(parsed.command).toBe('git');
    expect(parsed.subcommand).toBe('status');
  });

  it('normalizes named operation refs to canonical op:@ labels', () => {
    expect(normalizeNamedOperationRef('email.send')).toBe('op:@email.send');
    expect(normalizeNamedOperationRef('@Email.Send')).toBe('op:@email.send');
    expect(normalizeNamedOperationRef('op:@Email.Send')).toBe('op:@email.send');
    expect(normalizeNamedOperationRef('op:cmd')).toBeUndefined();
  });
});
