import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

async function evaluateWithRuntimeTrace(
  source: string,
  fileSystem: MemoryFileSystem,
  traceFile?: string
): Promise<{
  env: Environment;
  error?: unknown;
  traceLines: any[];
}> {
  const env = new Environment(fileSystem, pathService, pathContext);
  env.setCurrentFilePath('/project/main.mld');
  env.setApproveAllImports(true);
  env.setRuntimeTrace('verbose', traceFile ? { filePath: traceFile } : {});

  let error: unknown;
  try {
    await evaluate(parseSync(source) as any, env, { isExpression: true });
  } catch (nextError) {
    error = nextError;
  }

  const traceLines = traceFile
    ? await readRuntimeTraceFile(traceFile)
    : [];

  return { env, error, traceLines };
}

async function readRuntimeTraceFile(traceFile: string): Promise<any[]> {
  const content = await readFile(traceFile, 'utf8').catch(() => '');
  if (!content.trim()) {
    return [];
  }
  return content
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
}

describe('import runtime trace', () => {
  it('records selected-import lifecycle events in memory and trace files', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/provider.mld', '/var @value = "ok"\n/export { value }');

    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-import-trace-'));
    const traceFile = path.join(traceDir, 'runtime.jsonl');

    try {
      const { env, error, traceLines } = await evaluateWithRuntimeTrace(
        '/import { value } from "./provider.mld"\n/show @value',
        fileSystem,
        traceFile
      );

      expect(error).toBeUndefined();
      expect(env.getRuntimeTraceEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'import.resolve' }),
          expect.objectContaining({ event: 'import.read' }),
          expect.objectContaining({ event: 'import.parse' }),
          expect.objectContaining({ event: 'import.evaluate' }),
          expect.objectContaining({ event: 'import.exports' })
        ])
      );
      expect(traceLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'import.resolve' }),
          expect.objectContaining({ event: 'import.read' }),
          expect.objectContaining({ event: 'import.parse' }),
          expect.objectContaining({ event: 'import.evaluate' }),
          expect.objectContaining({ event: 'import.exports' })
        ])
      );
    } finally {
      await rm(traceDir, { recursive: true, force: true });
    }
  });

  it('records namespace-import lifecycle events', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/provider.mld', '/var @value = "ok"\n/var @other = "ok2"');

    const { env, error } = await evaluateWithRuntimeTrace(
      '/import "./provider.mld" as @provider\n/show @provider.value',
      fileSystem
    );

    expect(error).toBeUndefined();
    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'import.resolve',
          data: expect.objectContaining({
            directive: 'importNamespace'
          })
        }),
        expect.objectContaining({ event: 'import.exports' })
      ])
    );
  });

  it('emits parse failures for imported modules to memory and trace files', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/bad.mld', '/var @value = {');

    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-import-trace-fail-'));
    const traceFile = path.join(traceDir, 'runtime.jsonl');

    try {
      const { env, error, traceLines } = await evaluateWithRuntimeTrace(
        '/import { value } from "./bad.mld"\n/show @value',
        fileSystem,
        traceFile
      );

      expect(error).toBeDefined();
      expect(env.getRuntimeTraceEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'import.fail',
            data: expect.objectContaining({
              phase: 'parse',
              resolvedPath: '/project/bad.mld'
            })
          })
        ])
      );
      expect(traceLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'import.fail',
            data: expect.objectContaining({
              phase: 'parse',
              resolvedPath: '/project/bad.mld'
            })
          })
        ])
      );
    } finally {
      await rm(traceDir, { recursive: true, force: true });
    }
  });

  it('emits resolve failures for missing imported files', async () => {
    const fileSystem = new MemoryFileSystem();

    const { env, error } = await evaluateWithRuntimeTrace(
      '/import { value } from "./missing.mld"\n/show @value',
      fileSystem
    );

    expect(error).toBeDefined();
    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'import.fail',
          data: expect.objectContaining({
            phase: 'resolve'
          })
        })
      ])
    );
  });

  it('emits evaluate failures for imported module execution', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/bad-runtime.mld', '/var @value = @missing');

    const { env, error } = await evaluateWithRuntimeTrace(
      '/import { value } from "./bad-runtime.mld"\n/show @value',
      fileSystem
    );

    expect(error).toBeDefined();
    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'import.fail',
          data: expect.objectContaining({
            phase: 'evaluate',
            resolvedPath: '/project/bad-runtime.mld'
          })
        })
      ])
    );
  });

  it('attributes imported executable runtime events to the imported module file', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/project/provider.mld', `
/record @contact = {
  key: id,
  facts: [id: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emit() = { id: "c_1" } => contact
/exe @doWrite() = @shelf.write(@pipeline.selected, @emit())
/export { @doWrite }
`.trim());

    const { env, error } = await evaluateWithRuntimeTrace(
      '/import { doWrite } from "./provider.mld"\n/show @doWrite()',
      fileSystem
    );

    expect(error).toBeUndefined();
    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.write',
          scope: expect.objectContaining({
            file: '/project/provider.mld'
          })
        })
      ])
    );
  });
});
