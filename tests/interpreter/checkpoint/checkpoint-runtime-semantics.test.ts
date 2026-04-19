import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { WorkspaceValue } from '@core/types/workspace';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VirtualFS } from '@services/fs/VirtualFS';
import { Environment } from '@interpreter/env/Environment';
import { CheckpointManager, type CheckpointInvocationMetadata } from '@interpreter/checkpoint/CheckpointManager';
import { evaluateDirective } from '@interpreter/eval/directive';
import { asText } from '@interpreter/utils/structured-value';
import { interpret } from '@interpreter/index';
import { logger } from '@core/utils/logger';
import type { StructuredResult } from '@sdk/types';
import { checkpointPostHook } from '@interpreter/hooks/checkpoint-post-hook';
import { checkpointPreHook } from '@interpreter/hooks/checkpoint-pre-hook';

const cleanupDirs: string[] = [];
const cleanupGlobals: string[] = [];

function parseDirectives(source: string): DirectiveNode[] {
  return parseSync(source).filter(
    node => (node as DirectiveNode | undefined)?.type === 'Directive'
  ) as DirectiveNode[];
}

async function evaluateDirectives(source: string, env: Environment): Promise<void> {
  for (const directive of parseDirectives(source)) {
    await evaluateDirective(directive, env);
  }
}

function readTextVariable(env: Environment, name: string): string {
  const variable = env.getVariable(name);
  if (!variable) {
    throw new Error(`Missing variable @${name}`);
  }
  return asText(variable.value);
}

async function createEnvWithCheckpoint(
  root: string,
  scriptName = 'pipeline'
): Promise<{ env: Environment; manager: CheckpointManager }> {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const manager = new CheckpointManager(scriptName, { cacheRootDir: root });
  await manager.load();
  env.setCheckpointManager(manager);
  return { env, manager };
}

async function runStructuredScript(
  source: string,
  root: string,
  scriptName = 'pipeline'
): Promise<{ output: string; structured: StructuredResult }> {
  const result = await interpret(source, {
    mode: 'structured',
    mlldMode: 'strict',
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService(),
    filePath: path.join(root, `${scriptName}.mld`),
    checkpoint: true,
    checkpointScriptName: scriptName,
    checkpointCacheRootDir: root,
    useMarkdownFormatter: false
  });

  if (typeof result === 'string') {
    throw new Error('Expected structured result');
  }

  return {
    output: String(result.output ?? '').trim(),
    structured: result
  };
}

function registerGlobalCounter(key: string): void {
  cleanupGlobals.push(key);
  (globalThis as Record<string, unknown>)[key] = 0;
}

function getGlobalCounter(key: string): number {
  return Number((globalThis as Record<string, unknown>)[key] ?? 0);
}

function buildLlmScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @result = @llm("review src/a.ts", "sonnet")
`;
}

function buildTelemetryScript(counterKey: string, includeGuards: boolean): string {
  const guardSection = includeGuards
    ? `
/guard before @denyBefore for op:exe = when [ * => deny "guard-before-blocked" ]
/guard after @denyAfter for op:exe = when [ * => deny "guard-after-blocked" ]
`
    : '';
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "telemetry:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
${guardSection}
/hook @telemetry after op:named:llm = [
  output \`hit:@mx.checkpoint.hit,key:@mx.checkpoint.key\` to "state://telemetry"
]
/var @result = @llm("review src/a.ts", "sonnet")
`;
}

function buildParallelScript(counterKey: string, items: readonly string[]): string {
  return `
/exe llm @llm(item, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawItem = item && typeof item === "object" && "value" in item ? item.value : item;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "parallel:" + rawItem + ":" + rawModel + ":" + globalThis.${counterKey};
}
/var @items = ${JSON.stringify(items)}
/var @result = for parallel(2) @item in @items => @llm(@item, "sonnet")
`;
}

function buildWorkspaceResumeScript(): string {
  return `
resume: auto

/exe llm @writeOutput() = sh {
  printf "warm" > warmup.txt
  printf "hello" > output.txt
  printf "wrote"
}

/hook @telemetry after op:named:writeOutput = [
  output \`hit:@mx.checkpoint.hit\` to "state://telemetry"
]

/var @ws = box [
  file "seed.txt" = "seed"
  let @warm = run sh { printf "stale-shell" > stale.txt }
  let @status = @writeOutput()
]

/show <@ws/output.txt>
`.trim();
}

function createWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

afterEach(async () => {
  for (const key of cleanupGlobals.splice(0)) {
    delete (globalThis as Record<string, unknown>)[key];
  }
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('checkpoint runtime semantics', () => {
  it('serves miss->hit from cache and writes checkpoint entries only on misses', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-runtime-miss-hit-'));
    cleanupDirs.push(root);
    const counterKey = '__mlldCheckpointRuntimeMissHit';
    registerGlobalCounter(counterKey);

    const firstRun = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildLlmScript(counterKey), firstRun.env);
    const firstValue = readTextVariable(firstRun.env, 'result');
    expect(getGlobalCounter(counterKey)).toBe(1);
    expect(firstRun.manager.getStats().localCached).toBe(1);

    const secondRun = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildLlmScript(counterKey), secondRun.env);
    const secondValue = readTextVariable(secondRun.env, 'result');
    expect(secondValue).toBe(firstValue);
    expect(getGlobalCounter(counterKey)).toBe(1);
    expect(secondRun.manager.getStats().localCached).toBe(1);

    const cacheRaw = await readFile(path.join(root, 'pipeline', 'llm-cache.jsonl'), 'utf8');
    const lines = cacheRaw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as { durationMs?: number };
    expect(typeof record.durationMs).toBe('number');
    expect((record.durationMs as number) >= 0).toBe(true);
  });

  it('skips guards on checkpoint hits while still running user after hooks with checkpoint telemetry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-runtime-guards-'));
    cleanupDirs.push(root);
    const counterKey = '__mlldCheckpointRuntimeGuards';
    registerGlobalCounter(counterKey);

    const firstRun = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildTelemetryScript(counterKey, false), firstRun.env);
    const firstValue = readTextVariable(firstRun.env, 'result');
    const firstWrites = firstRun.env.getStateWrites().filter(write => write.path === 'telemetry');
    expect(firstWrites).toHaveLength(1);
    expect(String(firstWrites[0].value)).toContain('hit:false');
    expect(getGlobalCounter(counterKey)).toBe(1);

    const secondRun = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildTelemetryScript(counterKey, true), secondRun.env);
    const secondValue = readTextVariable(secondRun.env, 'result');
    const secondWrites = secondRun.env.getStateWrites().filter(write => write.path === 'telemetry');

    expect(secondValue).toBe(firstValue);
    expect(secondWrites).toHaveLength(1);
    expect(String(secondWrites[0].value)).toContain('hit:true');
    expect(getGlobalCounter(counterKey)).toBe(1);
  });

  it('caches llm invocations per item inside for parallel loops', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-runtime-parallel-'));
    cleanupDirs.push(root);
    const counterKey = '__mlldCheckpointRuntimeParallel';
    registerGlobalCounter(counterKey);

    const runOne = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildParallelScript(counterKey, ['a', 'b', 'c']), runOne.env);
    expect(getGlobalCounter(counterKey)).toBe(3);

    const runTwo = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildParallelScript(counterKey, ['a', 'b', 'c']), runTwo.env);
    expect(getGlobalCounter(counterKey)).toBe(3);

    const runThree = await createEnvWithCheckpoint(root);
    await evaluateDirectives(buildParallelScript(counterKey, ['a', 'x', 'c']), runThree.env);
    expect(getGlobalCounter(counterKey)).toBe(4);
  });

  it('restores box workspace snapshots on checkpoint hits and clears stale shell sessions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-runtime-workspace-resume-'));
    cleanupDirs.push(root);

    const source = buildWorkspaceResumeScript();
    const firstRun = await runStructuredScript(source, root, 'workspace-resume');
    const secondRun = await runStructuredScript(source, root, 'workspace-resume');

    expect(firstRun.output).toBe('hello');
    expect(secondRun.output).toBe('hello');

    const firstTelemetry = firstRun.structured.stateWrites.filter(write => write.path === 'telemetry');
    const secondTelemetry = secondRun.structured.stateWrites.filter(write => write.path === 'telemetry');
    expect(String(firstTelemetry[0]?.value ?? '')).toContain('hit:false');
    expect(String(secondTelemetry[0]?.value ?? '')).toContain('hit:true');

    const restoredWorkspace = secondRun.structured.environment.getVariableValue('ws') as WorkspaceValue;
    expect(await restoredWorkspace.fs.readFile(path.join(root, 'output.txt'))).toBe('hello');
    expect(restoredWorkspace.shellSession).toBeUndefined();
  });

  it('degrades checkpoint pre-hook read failures to cache-miss behavior', async () => {
    const counterKey = '__mlldCheckpointReadFailure';
    registerGlobalCounter(counterKey);

    let readCalls = 0;
    let writeCalls = 0;
    const manager = {
      assignInvocationMetadata(): CheckpointInvocationMetadata {
        return {
          invocationOrdinal: 0,
          executionOrder: 0
        };
      },
      async get(): Promise<unknown | null> {
        readCalls += 1;
        throw new Error('simulated read failure');
      },
      async put(): Promise<void> {
        writeCalls += 1;
      }
    } as unknown as CheckpointManager;

    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setCheckpointManager(manager);

    await evaluateDirectives(buildLlmScript(counterKey), env);
    expect(getGlobalCounter(counterKey)).toBe(1);
    expect(readTextVariable(env, 'result')).toContain('call:1');
    expect(readCalls).toBe(1);
    expect(writeCalls).toBe(1);
  });

  it('treats cache-hit workspace snapshots as a no-op when no active workspace exists', async () => {
    const counterKey = '__mlldCheckpointNoWorkspaceReplay';
    registerGlobalCounter(counterKey);

    const manager = {
      assignInvocationMetadata(): CheckpointInvocationMetadata {
        return {
          invocationOrdinal: 0,
          executionOrder: 0
        };
      },
      async getWithMetadata(): Promise<unknown> {
        return {
          value: 'cached:no-workspace',
          ts: '2026-03-05T12:00:00.000Z',
          workspaceSnapshot: {
            vfsPatch: {
              version: 1,
              entries: [{ op: 'write', path: '/output.txt', content: 'hello' }]
            },
            descriptions: { '/output.txt': 'cached output' }
          }
        };
      },
      wasWrittenThisRun(): boolean {
        return false;
      }
    } as unknown as CheckpointManager;

    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setCheckpointManager(manager);
    env.setCheckpointScriptResumeMode('auto');

    await evaluateDirectives(buildLlmScript(counterKey), env);
    expect(getGlobalCounter(counterKey)).toBe(0);
    expect(readTextVariable(env, 'result')).toBe('cached:no-workspace');
  });

  it('warns and continues when a checkpoint hit carries a malformed workspace snapshot', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setCheckpointManager({} as CheckpointManager);
    const workspace = createWorkspace();
    env.pushActiveWorkspace(workspace);

    try {
      const result = await checkpointPostHook(
        {} as any,
        { value: 'cached:malformed-workspace', env },
        [],
        env,
        {
          type: 'exe',
          name: 'llm',
          labels: ['llm'],
          metadata: {
            sourceRetryable: true,
            checkpointHit: true,
            checkpointWorkspaceSnapshot: { nope: true }
          }
        } as any
      );

      expect(result.value).toBe('cached:malformed-workspace');
      expect(warnSpy).toHaveBeenCalledWith(
        '[checkpoint] ignoring malformed workspace snapshot on cache hit',
        expect.any(Object)
      );
      expect(workspace.shellSession).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('degrades checkpoint post-hook write failures without aborting execution', async () => {
    const counterKey = '__mlldCheckpointWriteFailure';
    registerGlobalCounter(counterKey);

    let readCalls = 0;
    let writeCalls = 0;
    const manager = {
      assignInvocationMetadata(): CheckpointInvocationMetadata {
        return {
          invocationOrdinal: 0,
          executionOrder: 0
        };
      },
      async get(): Promise<unknown | null> {
        readCalls += 1;
        return null;
      },
      async put(): Promise<void> {
        writeCalls += 1;
        throw new Error('simulated write failure');
      }
    } as unknown as CheckpointManager;

    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setCheckpointManager(manager);

    await evaluateDirectives(buildLlmScript(counterKey), env);
    expect(getGlobalCounter(counterKey)).toBe(1);
    expect(readTextVariable(env, 'result')).toContain('call:1');
    expect(readCalls).toBe(1);
    expect(writeCalls).toBe(1);
  });

  describe('eligibility gate', () => {
    // Regression for m-2a3c: mlld-internal control-flow exes (mlld-exe-block,
    // mlld-for, mlld-loop, mlld-foreach, mlld-box) inherit the `llm` label
    // from an enclosing llm tool-call via operation context. Without this
    // gate, every such exe called inside an llm chain becomes cache-eligible,
    // which poisons anything reading mutable runtime state (shelves, other
    // exes) on repeated calls.
    //
    // The pre-hook must return { action: 'continue' } with no cache metadata
    // for mlld-internal exes. The post-hook must not persist their returns.

    const mlldInternalLanguages = [
      'mlld-exe-block',
      'mlld-for',
      'mlld-loop',
      'mlld-foreach',
      'mlld-box'
    ];

    for (const language of mlldInternalLanguages) {
      it(`pre-hook skips caching for ${language} exes even with llm label`, async () => {
        const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
        const getCalls: string[] = [];
        env.setCheckpointManager({
          assignInvocationMetadata(): CheckpointInvocationMetadata {
            return { invocationOrdinal: 0, executionOrder: 0 };
          },
          async get(key: string): Promise<unknown | null> {
            getCalls.push(key);
            return null;
          }
        } as unknown as CheckpointManager);

        const decision = await checkpointPreHook(
          {} as any,
          [],
          env,
          {
            type: 'exe',
            name: 'inner',
            labels: ['llm'],
            metadata: {
              sourceRetryable: true,
              executableType: 'code',
              executableLanguage: language
            }
          } as any
        );

        expect(decision.action).toBe('continue');
        expect(decision.metadata).toBeUndefined();
        expect(getCalls).toHaveLength(0);
      });
    }

    it('pre-hook still serves cache for non-mlld languages (js, cmd, etc.)', async () => {
      const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
      let getCalls = 0;
      env.setCheckpointManager({
        assignInvocationMetadata(): CheckpointInvocationMetadata {
          return { invocationOrdinal: 0, executionOrder: 0 };
        },
        async get(): Promise<unknown | null> {
          getCalls += 1;
          return null;
        }
      } as unknown as CheckpointManager);

      const decision = await checkpointPreHook(
        {} as any,
        [],
        env,
        {
          type: 'exe',
          name: 'llm',
          labels: ['llm'],
          metadata: {
            sourceRetryable: true,
            executableType: 'code',
            executableLanguage: 'js'
          }
        } as any
      );

      expect(decision.action).toBe('continue');
      expect(getCalls).toBe(1);
      expect(decision.metadata).toMatchObject({ checkpointKey: expect.any(String) });
    });

    it('post-hook does not persist returns from mlld-exe-block exes', async () => {
      const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
      let putCalls = 0;
      env.setCheckpointManager({
        assignInvocationMetadata(): CheckpointInvocationMetadata {
          return { invocationOrdinal: 0, executionOrder: 0 };
        },
        async put(): Promise<void> {
          putCalls += 1;
        },
        wasWrittenThisRun(): boolean {
          return false;
        }
      } as unknown as CheckpointManager);

      await checkpointPostHook(
        {} as any,
        { value: { agent: 'x', state: 'y', query: 'z' }, env },
        [],
        env,
        {
          type: 'exe',
          name: 'plannerToolContext',
          labels: ['llm'],
          metadata: {
            sourceRetryable: true,
            executableType: 'code',
            executableLanguage: 'mlld-exe-block'
          }
        } as any
      );

      expect(putCalls).toBe(0);
    });

    it('end-to-end: repeated calls to an llm-labeled mlld-exe-block exe recompute, not cache', async () => {
      // Direct repro of m-2a3c: an exe that reads mutable state returns
      // different values each call. If caching sneaks back in, both calls
      // would return the first call's value.
      const counterKey = '__mlldCheckpointGateMlldExeBlock';
      registerGlobalCounter(counterKey);

      const root = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-gate-mlld-'));
      cleanupDirs.push(root);

      const source = `
/exe @incr() = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  return globalThis.${counterKey};
}
/exe llm @wrapper() = [
  let @n = @incr()
  => { count: @n }
]
/var @first = @wrapper()
/var @second = @wrapper()
`;
      const { env } = await createEnvWithCheckpoint(root, 'gate-mlld-block');
      await evaluateDirectives(source, env);

      const first = env.getVariable('first')?.value as any;
      const second = env.getVariable('second')?.value as any;

      // If caching poisoned this, first.data.count and second.data.count
      // would be equal (both reporting the first call's counter value).
      const firstCount = first?.data?.count ?? first?.count;
      const secondCount = second?.data?.count ?? second?.count;
      expect(firstCount).toBe(1);
      expect(secondCount).toBe(2);
      expect(getGlobalCounter(counterKey)).toBe(2);
    });
  });
});
