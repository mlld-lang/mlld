import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { CheckpointManager, type CheckpointInvocationMetadata } from '@interpreter/checkpoint/CheckpointManager';
import { evaluateDirective } from '@interpreter/eval/directive';
import { asText } from '@interpreter/utils/structured-value';

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
/hook @telemetry after @llm = [
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
});
