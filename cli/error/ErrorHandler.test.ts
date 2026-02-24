import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ErrorHandler } from './ErrorHandler';
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';
import { MlldCommandExecutionError } from '@core/errors/MlldCommandExecutionError';

describe('ErrorHandler', () => {
  it('emits command stderr details once via formatted output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-error-handler-'));
    const inputPath = path.join(tempDir, 'main.mld');
    await fs.writeFile(inputPath, '/run js { throw new Error("boom") }', 'utf8');

    const formatSpy = vi
      .spyOn(ErrorFormatSelector.prototype, 'formatForCLI')
      .mockResolvedValue('formatted: boom stack');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as (code?: string | number | null) => never);

    const handler = new ErrorHandler();
    const error = new MlldCommandExecutionError('Command failed', undefined, {
      command: 'js',
      exitCode: 1,
      duration: 1,
      stderr: 'boom stack',
      workingDirectory: process.cwd()
    });

    await handler.handleError(error, { input: inputPath } as any);

    const rendered = consoleSpy.mock.calls.map(call => String(call[0] ?? '')).join('\n');
    const stderrMentions = rendered.match(/boom stack/g) ?? [];
    const rawStderrPrint = consoleSpy.mock.calls.some(
      call => String(call[0] ?? '').trim() === 'boom stack'
    );

    expect(stderrMentions).toHaveLength(1);
    expect(rawStderrPrint).toBe(false);
    expect(exitSpy).toHaveBeenCalledWith(1);

    formatSpy.mockRestore();
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
