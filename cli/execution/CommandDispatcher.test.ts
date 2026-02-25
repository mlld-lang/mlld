import { describe, expect, it } from 'vitest';
import { CommandDispatcher } from './CommandDispatcher';

describe('CommandDispatcher', () => {
  it('accumulates repeated --env flags instead of overwriting', () => {
    const dispatcher = new CommandDispatcher();
    const { flags, remaining } = dispatcher.parseCommandFlags([
      'script',
      '--env',
      'KEY1=val1',
      '--env',
      'KEY2=val2',
      '--topic',
      'security'
    ]);

    expect(remaining).toEqual(['script']);
    expect(flags.env).toEqual(['KEY1=val1', 'KEY2=val2']);
    expect(flags.topic).toBe('security');
  });
});
