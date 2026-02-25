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
});
