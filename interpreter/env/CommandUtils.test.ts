import { describe, expect, it } from 'vitest';
import { CommandUtils } from './CommandUtils';

describe('CommandUtils guidance messages', () => {
  it('suggests run-specific shell block patterns in run context', () => {
    let message = '';
    try {
      CommandUtils.validateAndParseCommand('echo "x" && echo "y"', 'run');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('run sh(@path)');
    expect(message).not.toContain('exe @fn(path) = sh');
    expect(message).not.toContain('sh(@myVar)');
  });

  it('suggests exe-specific shell block patterns in exe context', () => {
    let message = '';
    try {
      CommandUtils.validateAndParseCommand('echo "x" && echo "y"', 'exe');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('exe @fn(path) = sh');
    expect(message).not.toContain('run sh(@path)');
    expect(message).not.toContain('sh(@myVar)');
  });

  it('includes both run and exe patterns in generic context', () => {
    let message = '';
    try {
      CommandUtils.validateAndParseCommand('echo "x" && echo "y"');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('run sh(@path)');
    expect(message).toContain('exe @fn(path) = sh');
    expect(message).not.toContain('sh(@myVar)');
  });

  it('allows inline quoted arguments in cmd commands', () => {
    expect(
      CommandUtils.validateAndParseCommand('claude -p --mcp-config "/tmp/a b"')
    ).toBe('claude -p --mcp-config "/tmp/a b"');
  });

  it('rejects escaped quoted fragments that shell would split apart', () => {
    expect(() =>
      CommandUtils.validateAndParseCommand('claude -p --mcp-config \\"/tmp/a b\\"')
    ).toThrow();
  });

  it('ignores non-AST command templates when collecting fragment warnings', () => {
    expect(
      CommandUtils.collectUnsafeInterpolatedFragmentWarnings(undefined, () => undefined)
    ).toEqual([]);
    expect(
      CommandUtils.collectUnsafeInterpolatedFragmentWarnings('printf hello', () => undefined)
    ).toEqual([]);
  });
});

describe('CommandUtils.parseDirectCommand', () => {
  it('preserves explicit empty quoted argv tokens', () => {
    expect(
      CommandUtils.parseDirectCommand(
        'claude --allowedTools "" --disallowedTools "Bash,Edit"'
      )
    ).toEqual({
      command: 'claude',
      args: ['--allowedTools', '', '--disallowedTools', 'Bash,Edit']
    });
  });
});
