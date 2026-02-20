import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { interpret } from '@interpreter/index';
import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const cleanupDirs: string[] = [];
const cleanupGlobals: string[] = [];

interface RunScriptOptions {
  source: string;
  checkpointRoot: string;
  scriptName: string;
  checkpoint?: boolean;
  noCheckpoint?: boolean;
  resume?: string | true;
  fork?: string;
}

function registerCounter(counterKey: string): void {
  cleanupGlobals.push(counterKey);
  (globalThis as Record<string, unknown>)[counterKey] = 0;
}

function readCounter(counterKey: string): number {
  return Number((globalThis as Record<string, unknown>)[counterKey] ?? 0);
}

async function runScript(options: RunScriptOptions): Promise<string> {
  const result = await interpret(options.source, {
    mode: 'document',
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService(),
    filePath: path.join(options.checkpointRoot, `${options.scriptName}.mld`),
    ...(options.checkpoint === undefined ? {} : { checkpoint: options.checkpoint }),
    ...(options.noCheckpoint === undefined ? {} : { noCheckpoint: options.noCheckpoint }),
    checkpointScriptName: options.scriptName,
    checkpointCacheRootDir: options.checkpointRoot,
    ...(options.resume === undefined ? {} : { resume: options.resume }),
    ...(options.fork ? { fork: options.fork } : {})
  });

  const output = typeof result === 'string' ? result : result.output;
  return String(output ?? '').trim();
}

function buildSingleCallScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @result = @llm("alpha", "sonnet")
/show @result
`.trim();
}

function buildTwoSiteScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("alpha", "sonnet")
/var @second = @llm("beta", "sonnet")
/show @first
/show @second
`.trim();
}

function buildParallelScript(counterKey: string): string {
  return `
/exe llm @llm(item, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawItem = item && typeof item === "object" && "value" in item ? item.value : item;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "parallel:" + rawItem + ":" + rawModel + ":" + globalThis.${counterKey};
}
/var @items = ["aa", "bb", "cc"]
/var @result = for parallel(2) @item in @items => @llm(@item, "sonnet")
/show @result
`.trim();
}

function buildForkSourceScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("prompt-a", "sonnet")
/var @second = @llm("prompt-b", "sonnet")
/show @first
/show @second
`.trim();
}

function buildForkTargetScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @shared = @llm("prompt-a", "sonnet")
/var @modelMiss = @llm("prompt-a", "opus")
/var @promptMiss = @llm("prompt-c", "sonnet")
/show @shared
/show @modelMiss
/show @promptMiss
`.trim();
}

function buildNamedCheckpointScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("alpha", "sonnet")
/checkpoint "after-first"
/var @second = @llm("beta", "sonnet")
/show @first
/show @second
`.trim();
}

function buildNamedCheckpointWithSpacesScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("alpha", "sonnet")
/checkpoint "after first"
/var @second = @llm("beta", "sonnet")
/show @first
/show @second
`.trim();
}

function buildCheckpointPrefixScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("alpha", "sonnet")
/checkpoint "data-collection-complete"
/var @second = @llm("beta", "sonnet")
/checkpoint "data-processing-complete"
/var @third = @llm("gamma", "sonnet")
/show @first
/show @second
/show @third
`.trim();
}

function buildCheckpointExactPriorityScript(counterKey: string): string {
  return `
/exe llm @llm(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "call:" + globalThis.${counterKey} + ":" + rawPrompt + ":" + rawModel;
}
/var @first = @llm("alpha", "sonnet")
/checkpoint "data"
/var @second = @llm("beta", "sonnet")
/checkpoint "data-processing-complete"
/var @third = @llm("gamma", "sonnet")
/show @first
/show @second
/show @third
`.trim();
}

afterEach(async () => {
  for (const key of cleanupGlobals.splice(0)) {
    delete (globalThis as Record<string, unknown>)[key];
  }
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('checkpoint resume + fork runtime semantics', () => {
  it('auto-enables checkpointing for llm-labeled calls when --checkpoint is omitted', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-auto-enable-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointAutoEnableCounter';
    registerCounter(counterKey);

    const source = buildSingleCallScript(counterKey);
    const first = await runScript({
      source,
      checkpointRoot,
      scriptName: 'auto-enable'
    });
    const second = await runScript({
      source,
      checkpointRoot,
      scriptName: 'auto-enable'
    });

    expect(first).toBe(second);
    expect(readCounter(counterKey)).toBe(1);
  });

  it('disables checkpointing when --no-checkpoint is enabled', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-no-checkpoint-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointNoCheckpointCounter';
    registerCounter(counterKey);

    const source = buildSingleCallScript(counterKey);
    const first = await runScript({
      source,
      checkpointRoot,
      scriptName: 'no-checkpoint',
      noCheckpoint: true
    });
    const second = await runScript({
      source,
      checkpointRoot,
      scriptName: 'no-checkpoint',
      noCheckpoint: true
    });

    expect(first).not.toBe(second);
    expect(readCounter(counterKey)).toBe(2);
  });

  it('keeps checkpoint hits when --resume is used without a target', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-auto-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeAutoCounter';
    registerCounter(counterKey);

    const source = buildSingleCallScript(counterKey);
    const first = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-auto'
    });
    const second = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-auto',
      resume: true
    });

    expect(first).toBe(second);
    expect(readCounter(counterKey)).toBe(1);
  });

  it('invalidates all cache entries for --resume @fn', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-function-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeFunctionCounter';
    registerCounter(counterKey);

    const source = buildTwoSiteScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-function'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-function',
      resume: '@llm'
    });

    expect(readCounter(counterKey)).toBe(4);
    expect(resumed).toContain('call:3:alpha:sonnet');
    expect(resumed).toContain('call:4:beta:sonnet');
  });

  it('invalidates only the selected invocation site for --resume @fn:index', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-site-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeSiteCounter';
    registerCounter(counterKey);

    const source = buildTwoSiteScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-site'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-site',
      resume: '@llm:1'
    });

    expect(readCounter(counterKey)).toBe(3);
    expect(resumed).toContain('call:1:alpha:sonnet');
    expect(resumed).toContain('call:3:beta:sonnet');
  });

  it('supports named checkpoints with spaces in --resume targets', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-named-space-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeNamedSpaceCounter';
    registerCounter(counterKey);

    const source = buildNamedCheckpointWithSpacesScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-named-space'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-named-space',
      resume: 'after first'
    });

    expect(readCounter(counterKey)).toBe(3);
    expect(resumed).toContain('call:1:alpha:sonnet');
    expect(resumed).toContain('call:3:beta:sonnet');
  });

  it('invalidates from fuzzy cursor for --resume @fn("prefix") in parallel loops', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-fuzzy-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeFuzzyCounter';
    registerCounter(counterKey);

    const source = buildParallelScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-fuzzy'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-fuzzy',
      resume: '@llm("bb")'
    });

    expect(readCounter(counterKey)).toBe(5);
    expect(resumed).toContain('parallel:aa:sonnet:1');
    expect(resumed).not.toContain('parallel:bb:sonnet:2');
    expect(resumed).not.toContain('parallel:cc:sonnet:3');
  });

  it('invalidates cached calls after a named checkpoint with --resume "name"', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-named-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeNamedCounter';
    registerCounter(counterKey);

    const source = buildNamedCheckpointScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-named'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-named',
      resume: 'after-first'
    });

    expect(readCounter(counterKey)).toBe(3);
    expect(resumed).toContain('call:1:alpha:sonnet');
    expect(resumed).toContain('call:3:beta:sonnet');
  });

  it('matches named checkpoints by prefix for --resume "prefix"', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-prefix-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumePrefixCounter';
    registerCounter(counterKey);

    const source = buildCheckpointPrefixScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-prefix'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-prefix',
      resume: 'data-col'
    });

    expect(readCounter(counterKey)).toBe(5);
    expect(resumed).toContain('call:1:alpha:sonnet');
    expect(resumed).toContain('call:4:beta:sonnet');
    expect(resumed).toContain('call:5:gamma:sonnet');
  });

  it('prefers exact named checkpoint matches over prefix matches', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-exact-priority-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeExactPriorityCounter';
    registerCounter(counterKey);

    const source = buildCheckpointExactPriorityScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-exact-priority'
    });
    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-exact-priority',
      resume: 'data'
    });

    expect(readCounter(counterKey)).toBe(5);
    expect(resumed).toContain('call:1:alpha:sonnet');
    expect(resumed).toContain('call:4:beta:sonnet');
    expect(resumed).toContain('call:5:gamma:sonnet');
  });

  it('errors on ambiguous named checkpoint prefixes', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-resume-ambiguous-prefix-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointResumeAmbiguousPrefixCounter';
    registerCounter(counterKey);

    const source = buildCheckpointPrefixScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'resume-ambiguous-prefix'
    });

    await expect(
      runScript({
        source,
        checkpointRoot,
        scriptName: 'resume-ambiguous-prefix',
        resume: 'data'
      })
    ).rejects.toThrow('Ambiguous checkpoint match "data"');
  });

  it('honors --resume @fn when matching entries come from --fork cache', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fork-resume-function-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointForkResumeFunctionCounter';
    registerCounter(counterKey);

    const source = buildForkSourceScript(counterKey);
    await runScript({
      source,
      checkpointRoot,
      scriptName: 'collect-resume-fn'
    });
    const seeded = await runScript({
      source,
      checkpointRoot,
      scriptName: 'analyze-resume-fn',
      fork: 'collect-resume-fn'
    });

    expect(readCounter(counterKey)).toBe(2);
    expect(seeded).toContain('call:1:prompt-a:sonnet');
    expect(seeded).toContain('call:2:prompt-b:sonnet');

    const resumed = await runScript({
      source,
      checkpointRoot,
      scriptName: 'analyze-resume-fn',
      fork: 'collect-resume-fn',
      resume: '@llm'
    });

    expect(readCounter(counterKey)).toBe(4);
    expect(resumed).toContain('call:3:prompt-a:sonnet');
    expect(resumed).toContain('call:4:prompt-b:sonnet');
  });

  it('uses fork cache as read-only seed and writes misses to local target cache', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fork-matrix-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__checkpointForkMatrixCounter';
    registerCounter(counterKey);

    await runScript({
      source: buildForkSourceScript(counterKey),
      checkpointRoot,
      scriptName: 'collect'
    });
    const forked = await runScript({
      source: buildForkTargetScript(counterKey),
      checkpointRoot,
      scriptName: 'analyze',
      fork: 'collect'
    });

    expect(readCounter(counterKey)).toBe(4);
    expect(forked).toContain('call:1:prompt-a:sonnet');
    expect(forked).toContain('call:3:prompt-a:opus');
    expect(forked).toContain('call:4:prompt-c:sonnet');

    const sourceManager = new CheckpointManager('collect', { cacheRootDir: checkpointRoot });
    await sourceManager.load();
    expect(sourceManager.getStats().localCached).toBe(2);

    const modelMissKey = CheckpointManager.computeCacheKey('llm', ['prompt-a', 'opus']);
    const promptMissKey = CheckpointManager.computeCacheKey('llm', ['prompt-c', 'sonnet']);
    await expect(sourceManager.get(modelMissKey)).resolves.toBeNull();
    await expect(sourceManager.get(promptMissKey)).resolves.toBeNull();

    const targetManager = new CheckpointManager('analyze', {
      cacheRootDir: checkpointRoot,
      forkScriptName: 'collect'
    });
    await targetManager.load();
    expect(targetManager.getStats().localCached).toBe(2);
    expect(targetManager.getStats().forkCached).toBe(2);
  });
});
