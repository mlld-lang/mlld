import { describe, expect, it } from 'vitest';
import { CommandUtils } from './CommandUtils';
import { createSimpleTextVariable } from '@core/types/variable';

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
    let message = '';
    try {
      CommandUtils.validateAndParseCommand('claude -p --mcp-config \\"/tmp/a b\\"');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Escaped quoted fragment is not allowed');
    expect(message).toContain('"/tmp/a b"');
    expect(message).toContain('quoted string variable was interpolated back into cmd');
  });

  it('warns when an interpolated quoted template is reused as a cmd fragment', () => {
    const flags = createSimpleTextVariable(
      'flags',
      '--mcp-config "/tmp/a b"',
      {
        directive: 'var',
        syntax: 'template',
        hasInterpolation: true,
        isMultiLine: false,
        wrapperType: 'backtick'
      },
      {
        internal: {
          templateRaw: '--mcp-config "@path"'
        }
      }
    );

    const warnings = CommandUtils.collectUnsafeInterpolatedFragmentWarnings(
      [{ type: 'VariableReference', identifier: 'flags' }],
      name => (name === 'flags' ? flags : undefined)
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('@flags');
    expect(warnings[0]).toContain('Inline the args in cmd');
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
