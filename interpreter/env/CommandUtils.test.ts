import { describe, expect, it } from 'vitest';
import { CommandUtils } from './CommandUtils';

describe('CommandUtils guidance messages', () => {
  it('suggests run/exe shell block patterns for banned cmd operators', () => {
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
