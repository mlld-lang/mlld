import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createLiveCommand, liveCommand } from './live';
import { startLiveStdioServer } from './live-stdio-server';

vi.mock('./live-stdio-server', () => ({
  startLiveStdioServer: vi.fn().mockResolvedValue(undefined)
}));

describe('live command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts live stdio server when --stdio is provided', async () => {
    await liveCommand(['--stdio']);

    expect(startLiveStdioServer).toHaveBeenCalledTimes(1);
  });

  it('fails without --stdio', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as any);

    await expect(liveCommand([])).rejects.toThrow('exit:1');

    expect(errorSpy).toHaveBeenCalledWith('Usage: mlld live --stdio');
    expect(startLiveStdioServer).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('supports execute() wrapper flags', async () => {
    const command = createLiveCommand();

    await command.execute([], { stdio: true });

    expect(startLiveStdioServer).toHaveBeenCalledTimes(1);
  });

  it('documents state:update in help output', async () => {
    const command = createLiveCommand();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute([], { help: true });

    const rendered = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(rendered).toContain('state:update');

    logSpy.mockRestore();
  });
});
