import { describe, expect, it } from 'vitest';
import { CommandDispatcher } from './CommandDispatcher';

describe('CommandDispatcher', () => {
  it('accumulates repeated --mlld-env flags instead of overwriting', () => {
    const dispatcher = new CommandDispatcher();
    const { flags, remaining } = dispatcher.parseCommandFlags([
      'script',
      '--mlld-env',
      'KEY1=val1',
      '--mlld-env',
      'KEY2=val2',
      '--topic',
      'security'
    ]);

    expect(remaining).toEqual(['script']);
    expect(flags['mlld-env']).toEqual(['KEY1=val1', 'KEY2=val2']);
    expect(flags.topic).toBe('security');
  });

  it('registers the status command', () => {
    const dispatcher = new CommandDispatcher();

    expect(dispatcher.supportsCommand('status')).toBe(true);
    expect(dispatcher.getCommandDescription('status')).toBe(
      'Show filesystem signature and integrity status'
    );
  });
});
