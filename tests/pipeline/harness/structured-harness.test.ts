import { describe, it, expect, beforeAll } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { PipelineExecutor } from '@interpreter/eval/pipeline/index';
import { isStructuredValue, wrapStructured, type StructuredValue } from '@interpreter/utils/structured-value';
import { registerHarnessStages, describeStage, type StageSnippet, type StageTag } from './stages';
import { HARNESS_INPUTS, type HarnessInput } from './inputs';

interface StageSnapshot {
  snippet: StageSnippet;
  value: StructuredValue;
}

type PipelineSeed = string | StructuredValue;

const METADATA_KEYS_TO_TRACK = ['source', 'loadResult', 'filename', 'relative', 'absolute', 'retries'] as const;

describe('Pipeline structured harness', () => {
  let env: Environment;
  let snippets: StageSnippet[];

  beforeAll(async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/project');
    await env.registerBuiltinResolvers();
    snippets = await registerHarnessStages(env);
  });

  it('preserves structured types across stage permutations', async () => {
    const sequences = [
      ...generateSequences(snippets, 2),
      ...generateSequences(snippets, 3)
    ].filter(shouldIncludeSequence);

    for (const input of HARNESS_INPUTS) {
      const seedPreview = previewInput(input);
      for (const sequence of sequences) {
        const stageNames = sequence.map((s) => s.name).join(' | ');
        const context = `[${input.id}] ${stageNames}`;
        const baseValue = input.build();
        const baseline = createBaseline(baseValue);

        if (shouldSkipForInput(baseline.type, sequence)) {
          continue;
        }

        const pipelineSeed = cloneSeed(baseValue);
        const builtStages = sequence.map((snippet) => snippet.build());

        try {
          sequence.forEach((snippet) => snippet.beforeSequence?.());
          const executor = new PipelineExecutor(builtStages, env);
          await executor.execute(pipelineSeed, { returnStructured: true });

          const stageOutputs = readStageOutputs(executor, sequence);
          runAssertions(baseline, stageOutputs, context, seedPreview);
        } catch (error) {
          const stageOutputs =
            error instanceof HarnessAssertionError ? error.snapshots : undefined;
          const trace = stageOutputs
            ? stageOutputs.map((snapshot) => describeStage(snapshot.snippet.name, snapshot.value)).join('\n')
            : 'stage output unavailable';
          const message = `${context}\nseed=${seedPreview}\n${trace}\n${(error as Error).message}`;
          throw new Error(message);
        }
      }
    }
  });
});

class HarnessAssertionError extends Error {
  snapshots: StageSnapshot[];

  constructor(message: string, snapshots: StageSnapshot[]) {
    super(message);
    this.snapshots = snapshots;
  }
}

function generateSequences(source: StageSnippet[], length: number): StageSnippet[][] {
  const results: StageSnippet[][] = [];

  const build = (current: StageSnippet[]) => {
    if (current.length === length) {
      results.push(current);
      return;
    }
    for (const snippet of source) {
      build([...current, snippet]);
    }
  };

  build([]);
  return results;
}

function shouldIncludeSequence(sequence: StageSnippet[]): boolean {
  if (sequence.length === 0) return false;
  if (sequence[0].tags.includes('retry')) return false;

  const retryCount = countTag(sequence, 'retry');
  if (retryCount > 1) return false;

  const retryIndex = sequence.findIndex((snippet) => snippet.tags.includes('retry'));
  if (retryIndex !== -1 && retryIndex < 2) return false;

  const parallelCount = countTag(sequence, 'parallel');
  if (parallelCount > 1) return false;

  const hasStructured = sequence.some((snippet) => snippet.tags.includes('structured'));
  const hasRuntimeFeature = sequence.some((snippet) =>
    snippet.tags.some((tag) => tag === 'withClause' || tag === 'parallel' || tag === 'retry' || tag === 'shell')
  );

  return hasStructured || hasRuntimeFeature;
}

function countTag(sequence: StageSnippet[], tag: StageTag): number {
  return sequence.reduce((count, snippet) => (snippet.tags.includes(tag) ? count + 1 : count), 0);
}

function shouldSkipForInput(initialType: string, sequence: StageSnippet[]): boolean {
  let currentType = initialType;
  for (const snippet of sequence) {
    if (snippet.requiresArrayInput && currentType !== 'array') {
      return true;
    }
    currentType = predictTypeAfterStage(currentType, snippet);
  }
  return false;
}

function predictTypeAfterStage(currentType: string, snippet: StageSnippet): string {
  if (snippet.name === '@h_object') return 'object';
  if (snippet.tags.includes('parallel')) return 'array';
  if (snippet.tags.includes('batch')) return 'array';
  if (snippet.tags.includes('foreach')) return 'array';
  if (snippet.tags.includes('withClause')) return 'object';
  if (snippet.tags.includes('shell')) return 'text';
  return currentType;
}

function createBaseline(seed: PipelineSeed): StructuredValue {
  if (typeof seed === 'string') {
    return wrapStructured(seed, 'text', seed);
  }
  return wrapStructured(seed, seed.type, seed.text, seed.metadata);
}

function cloneSeed(seed: PipelineSeed): PipelineSeed {
  if (typeof seed === 'string') {
    return seed;
  }
  return wrapStructured(seed, seed.type, seed.text, seed.metadata);
}

function readStageOutputs(executor: PipelineExecutor, sequence: StageSnippet[]): StageSnapshot[] {
  const outputs: Map<number, StructuredValue> = (executor as any).structuredOutputs;
  const snapshots: StageSnapshot[] = [];

  for (let index = 0; index < sequence.length; index += 1) {
    let value = outputs.get(index);
    if (!value && index === sequence.length - 1) {
      const finalResult = (executor as any).finalOutput;
      if (finalResult && isStructuredValue(finalResult)) {
        value = finalResult;
      }
    }
    if (!value && index > 0 && snapshots.length > 0) {
      value = snapshots[index - 1]?.value;
    }
    if (!value || !isStructuredValue(value)) {
      throw new HarnessAssertionError(`Expected structured output for stage ${sequence[index].name}`, snapshots);
    }
    snapshots.push({ snippet: sequence[index], value });
  }

  return snapshots;
}

function runAssertions(
  baseline: StructuredValue,
  stageOutputs: StageSnapshot[],
  context: string,
  seedPreview: string
): void {
  let previous = baseline;

  for (const snapshot of stageOutputs) {
    try {
      assertNoDowngrade(previous, snapshot.value, snapshot.snippet, context);
      assertMetadataPreserved(previous, snapshot.value, snapshot.snippet, context);
    } catch (error) {
      if (error instanceof HarnessAssertionError) {
        throw error;
      }
      throw new HarnessAssertionError(
        `${context}\nseed=${seedPreview}\n${(error as Error).message}`,
        stageOutputs
      );
    }
    previous = snapshot.value;
  }
}

function assertNoDowngrade(
  previous: StructuredValue,
  current: StructuredValue,
  snippet: StageSnippet,
  context: string
): void {
  if (!snippet.allowTextDowngrade && previous.type !== 'text' && current.type === 'text') {
    throw new Error(`Structured value downgraded to text at ${snippet.name} (${context})`);
  }

  if (snippet.preservesData && previous.type !== 'text' && current.type !== 'text') {
    if (current.type !== previous.type) {
      throw new Error(`Type changed for ${snippet.name}: expected ${previous.type}, received ${current.type}`);
    }
  }
}

function assertMetadataPreserved(
  previous: StructuredValue,
  current: StructuredValue,
  snippet: StageSnippet,
  context: string
): void {
  if (!snippet.preservesData) return;
  if (previous.type === 'text') return;
  if (!previous.metadata) return;

  const currentMetadata = current.metadata ?? {};
  for (const key of METADATA_KEYS_TO_TRACK) {
    if (previous.metadata[key] !== undefined) {
      expect(currentMetadata[key]).toEqual(previous.metadata[key]);
    }
  }
}

function previewInput(input: HarnessInput): string {
  try {
    const value = input.build();
    if (typeof value === 'string') {
      return value.length > 32 ? `${value.slice(0, 29)}…` : value;
    }
    if (value.type === 'text') {
      return value.text.length > 32 ? `${value.text.slice(0, 29)}…` : value.text;
    }
    return `[${value.type}]`;
  } catch {
    return '[error previewing]';
  }
}
