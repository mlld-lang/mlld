import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileProcessor } from './FileProcessor';
import type { CLIOptions } from '../index';
import { OptionProcessor } from '../parsers/OptionProcessor';
import { ExecutionEmitter } from '@sdk/execution-emitter';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true)
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('content'),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn()
}));

vi.mock('@services/fs/NodeFileSystem', () => ({
  NodeFileSystem: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('@services/fs/PathService', () => ({
  PathService: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('@core/config/loader', () => ({
  ConfigLoader: vi.fn().mockImplementation(() => ({
    load: () => ({}),
    resolveURLConfig: () => undefined,
    resolveOutputConfig: () => ({
      showProgress: false,
      maxOutputLines: 50,
      errorBehavior: 'continue',
      collectErrors: false,
      showCommandContext: false
    })
  }))
}));

vi.mock('@core/services/PathContextService', () => ({
  PathContextBuilder: {
    fromFile: vi.fn().mockResolvedValue({
      projectRoot: '/',
      fileDirectory: '/',
      executionDirectory: '/',
      invocationDirectory: '/'
    }),
    fromDefaults: vi.fn().mockReturnValue({
      projectRoot: '/',
      fileDirectory: '/',
      executionDirectory: '/',
      invocationDirectory: '/'
    })
  }
}));

const interpretHolder: { fn: any } = { fn: vi.fn() };
vi.mock('@interpreter/index', () => ({
  interpret: (...args: any[]) => interpretHolder.fn(...args)
}));

function createStreamHandle() {
  return {
    done: () => Promise.resolve(),
    result: () => Promise.resolve({ output: 'STREAM' }),
    isComplete: () => true,
    on: () => {},
    off: () => {}
  };
}

describe('FileProcessor CLI flag matrix', () => {
  let fileProcessor: FileProcessor;
  let optionProcessor: OptionProcessor;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interpretHolder.fn = vi.fn();
    optionProcessor = new OptionProcessor();
    fileProcessor = new FileProcessor({ confirmOverwrite: vi.fn() } as any, optionProcessor);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  async function runWithOptions(cliOptions: Partial<CLIOptions>) {
    const options = { input: 'script.mld', stdout: true, ...cliOptions } as CLIOptions;
    const apiOptions = optionProcessor.cliToApiOptions(options);
    await fileProcessor.processFileWithOptions(options, apiOptions);
  }

  it('default document mode prints output once', async () => {
    interpretHolder.fn.mockImplementation(async (_content, options) => {
      expect(options.mode).toBe('document');
      return 'DOC';
    });

    await runWithOptions({});

    expect(logSpy).toHaveBeenCalledWith('DOC');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('--no-stream disables streaming and keeps document mode', async () => {
    interpretHolder.fn.mockImplementation(async (_content, options) => {
      expect(options.mode).toBe('document');
      expect(options.streaming?.enabled).toBe(false);
      return 'DOC';
    });

    await runWithOptions({ noStream: true });

    expect(logSpy).toHaveBeenCalledWith('DOC');
  });

  it('--debug streams with emitter logging to stderr and no stdout document', async () => {
    interpretHolder.fn.mockImplementation(async (_content, options) => {
      expect(options.mode).toBe('stream');
      expect(options.streaming?.enabled).toBe(true);
      const emitter = options.emitter as ExecutionEmitter;
      // Emit a progress event to verify stderr logging
      emitter.emit({ type: 'command:start', timestamp: Date.now() } as any);
      return createStreamHandle();
    });

    await runWithOptions({ debug: true });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('--debug --json emits DebugResult JSON to stdout without streaming logs', async () => {
    interpretHolder.fn.mockImplementation(async (_content, options) => {
      expect(options.mode).toBe('debug');
      expect(options.streaming?.enabled).toBe(false);
      return { output: 'DOC', effects: [], exports: {} };
    });

    await runWithOptions({ debug: true, json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = logSpy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(payload)).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
