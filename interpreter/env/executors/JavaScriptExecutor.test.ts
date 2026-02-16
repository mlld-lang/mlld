import { afterEach, describe, expect, it, vi } from 'vitest';
import { JavaScriptExecutor } from './JavaScriptExecutor';
import { ErrorUtils } from '../ErrorUtils';

function createExecutor(): JavaScriptExecutor {
  return new JavaScriptExecutor(new ErrorUtils(), process.cwd(), {
    getShadowEnv: () => undefined
  });
}

describe('JavaScriptExecutor console output handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns console output once when no explicit return value exists', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

    const output = await createExecutor().execute(
      'console.log("hello");',
      undefined,
      { directiveType: 'run' }
    );

    expect(output).toBe('hello');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('prefers explicit return values over console output', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

    const output = await createExecutor().execute(
      'console.log("hello"); return "world";',
      undefined,
      { directiveType: 'run' }
    );

    expect(output).toBe('world');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
