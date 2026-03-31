import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import type { ErrorUtils } from '../ErrorUtils';
import { StreamBus } from '@interpreter/eval/pipeline/stream-bus';
import { MlldCommandExecutionError } from '@core/errors';

describe('ShellCommandExecutor – E2BIG safeguards', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let executor: ShellCommandExecutor;
  let mockErrorUtils: ErrorUtils;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockErrorUtils = {
      handleCommandError: vi.fn(),
      createError: vi.fn()
    } as any;
    executor = new ShellCommandExecutor(mockErrorUtils, process.cwd(), () => new StreamBus());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when a single env override exceeds per-var limit', async () => {
    process.env.MLLD_MAX_SHELL_ENV_VAR_SIZE = '1024';
    const big = 'a'.repeat(2048);
    await expect(
      executor.execute('echo ok', { env: { big } })
    ).rejects.toBeInstanceOf(MlldCommandExecutionError);
  });

  it('throws when command payload exceeds limit', async () => {
    process.env.MLLD_MAX_SHELL_COMMAND_SIZE = '1024';
    const pad = 'x'.repeat(2048);
    await expect(
      executor.execute(`echo "${pad}"`)
    ).rejects.toBeInstanceOf(MlldCommandExecutionError);
  });

  it('throws when total env override size exceeds limit', async () => {
    process.env.MLLD_MAX_SHELL_ENV_TOTAL_SIZE = '3000';
    const a = 'a'.repeat(1500);
    const b = 'b'.repeat(1500);
    const c = 'c'.repeat(1500);
    await expect(
      executor.execute('echo ok', { env: { a, b, c } })
    ).rejects.toBeInstanceOf(MlldCommandExecutionError);
  });

  it('throws when combined args + env exceed limit', async () => {
    process.env.MLLD_MAX_SHELL_ARGS_ENV_TOTAL = '4096';
    const envVal = 'y'.repeat(3000);
    const pad = 'x'.repeat(1500);
    await expect(
      executor.execute(`echo "${pad}" "$IGNORED"`, { env: { IGNORED: envVal } })
    ).rejects.toBeInstanceOf(MlldCommandExecutionError);
  });

  it('executes quoted commands via direct argv spawn', async () => {
    const output = await executor.execute(
      `node -e "process.stdout.write(process.argv[1])" "hello world"`,
      undefined,
      { exeLabels: ['llm'] }
    );

    expect(output).toBe('hello world');
  });

  it('preserves empty quoted args via direct argv spawn', async () => {
    const output = await executor.execute(
      `node -e "process.stdout.write(JSON.stringify(process.argv.slice(1)))" -- --allowedTools "" --disallowedTools "Bash,Edit"`,
      undefined,
      { exeLabels: ['llm'] }
    );

    expect(output).toBe('["--allowedTools","","--disallowedTools","Bash,Edit"]');
  });

  it('writes stdin directly when using argv spawn', async () => {
    const output = await executor.execute(
      `node -e "process.stdin.setEncoding('utf8'); let data=''; process.stdin.on('data', chunk => data += chunk); process.stdin.on('end', () => process.stdout.write(data));"`,
      { input: 'ping' },
      { exeLabels: ['llm'] }
    );

    expect(output).toBe('ping');
  });

  it('preserves shell semantics for non-llm commands', async () => {
    const output = await executor.execute(
      `printf "%s" "$CUSTOM_VALUE"`,
      { env: { CUSTOM_VALUE: 'hello-shell' } }
    );

    expect(output).toBe('hello-shell');
  });
});
