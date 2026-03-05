import type { ExecInvocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { getAdapter } from '@interpreter/streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '@interpreter/streaming/stream-format';
import { resolveAnyStreamFlag } from '@interpreter/eval/stream-flag';

type ChunkSource = 'stdout' | 'stderr';

export type ExecInvocationStreamingSetup = {
  streamingOptions: StreamingOptions;
  streamingRequested: boolean;
  streamingEnabled: boolean;
  hasStreamFormat: boolean;
  pipelineId: string;
  streamingManager: StreamingManager;
};

type ExecInvocationStreamingState = Pick<
  ExecInvocationStreamingSetup,
  'streamingOptions' | 'streamingRequested' | 'streamingEnabled' | 'hasStreamFormat'
>;

async function definitionRequestsStreaming(
  definition: ExecutableDefinition,
  env: Environment
): Promise<boolean> {
  return resolveAnyStreamFlag(
    [
      definition.withClause?.stream,
      (definition.meta as any)?.withClause?.stream,
      (definition.meta as any)?.isStream
    ],
    env
  );
}

function definitionHasStreamFormat(definition: ExecutableDefinition): boolean {
  return (
    definition.withClause?.streamFormat !== undefined ||
    (definition.meta as any)?.withClause?.streamFormat !== undefined
  );
}

function resolveMergedStreamFormatRaw(
  node: ExecInvocation,
  definition: ExecutableDefinition
): unknown {
  if (node.withClause?.streamFormat !== undefined) {
    return node.withClause.streamFormat;
  }
  if (node.meta?.withClause?.streamFormat !== undefined) {
    return node.meta.withClause.streamFormat;
  }
  if (definition.withClause?.streamFormat !== undefined) {
    return definition.withClause.streamFormat;
  }
  return (definition.meta as any)?.withClause?.streamFormat;
}

async function configureExecStreamingManager(options: {
  env: Environment;
  streamingManager: StreamingManager;
  streamingEnabled: boolean;
  streamingOptions: StreamingOptions;
  hasStreamFormat: boolean;
  streamFormatValue: unknown;
}): Promise<void> {
  const {
    env,
    streamingManager,
    streamingEnabled,
    streamingOptions,
    hasStreamFormat,
    streamFormatValue
  } = options;

  if (!streamingEnabled) {
    return;
  }

  let adapter;
  if (hasStreamFormat && streamFormatValue) {
    adapter = await loadStreamAdapter(streamFormatValue);
  }
  if (!adapter) {
    adapter = await getAdapter('ndjson');
  }

  streamingManager.configure({
    env,
    streamingEnabled: true,
    streamingOptions,
    adapter: adapter as any
  });
}

export async function setupExecInvocationStreaming(
  node: ExecInvocation,
  env: Environment
): Promise<ExecInvocationStreamingSetup> {
  let streamingOptions = env.getStreamingOptions();
  const streamingRequested = await resolveAnyStreamFlag(
    [node.stream, node.withClause?.stream, node.meta?.withClause?.stream],
    env
  );
  const streamingEnabled = streamingOptions.enabled !== false && streamingRequested;
  const hasStreamFormat =
    node.withClause?.streamFormat !== undefined ||
    node.meta?.withClause?.streamFormat !== undefined;
  const rawStreamFormat = node.withClause?.streamFormat || node.meta?.withClause?.streamFormat;
  const streamFormatValue = hasStreamFormat
    ? await resolveStreamFormatValue(rawStreamFormat, env)
    : undefined;
  const pipelineId = `exec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

  if (hasStreamFormat) {
    env.setStreamingOptions({
      ...streamingOptions,
      streamFormat: streamFormatValue as any,
      skipDefaultSinks: true,
      suppressTerminal: true
    });
    streamingOptions = env.getStreamingOptions();
  }

  const streamingManager = env.getStreamingManager();
  await configureExecStreamingManager({
    env,
    streamingManager,
    streamingEnabled,
    streamingOptions,
    hasStreamFormat,
    streamFormatValue
  });

  return {
    streamingOptions,
    streamingRequested,
    streamingEnabled,
    hasStreamFormat,
    pipelineId,
    streamingManager
  };
}

export async function mergeExecInvocationStreamingFromDefinition(
  node: ExecInvocation,
  definition: ExecutableDefinition,
  env: Environment,
  streamingManager: StreamingManager,
  current: ExecInvocationStreamingState
): Promise<ExecInvocationStreamingState> {
  const mergedRequest =
    current.streamingRequested || (await definitionRequestsStreaming(definition, env));
  const mergedHasStreamFormat =
    current.hasStreamFormat || definitionHasStreamFormat(definition);
  const rawMergedStreamFormat = mergedHasStreamFormat
    ? resolveMergedStreamFormatRaw(node, definition)
    : undefined;
  const streamFormatValue = mergedHasStreamFormat
    ? await resolveStreamFormatValue(rawMergedStreamFormat, env)
    : undefined;

  let streamingOptions = current.streamingOptions;
  if (mergedHasStreamFormat && mergedRequest) {
    env.setStreamingOptions({
      ...streamingOptions,
      streamFormat: streamFormatValue as any,
      skipDefaultSinks: true,
      suppressTerminal: true
    });
    streamingOptions = env.getStreamingOptions();
  }

  const streamingEnabled = streamingOptions.enabled !== false && mergedRequest;
  await configureExecStreamingManager({
    env,
    streamingManager,
    streamingEnabled,
    streamingOptions,
    hasStreamFormat: mergedHasStreamFormat,
    streamFormatValue
  });

  return {
    streamingOptions,
    streamingRequested: mergedRequest,
    streamingEnabled,
    hasStreamFormat: mergedHasStreamFormat
  };
}

export function createExecInvocationChunkEffect(options: {
  env: Environment;
  isStreamingEnabled: () => boolean;
  shouldSkipDefaultSinks: () => boolean;
}): (chunk: string, source: ChunkSource) => void {
  const { env, isStreamingEnabled, shouldSkipDefaultSinks } = options;
  return (chunk: string, source: ChunkSource): void => {
    if (!isStreamingEnabled()) {
      return;
    }

    if (!shouldSkipDefaultSinks()) {
      return;
    }
    if (source === 'stderr') {
      env.emitEffect('stderr', chunk);
    }
  };
}

export function finalizeExecInvocationStreaming(
  env: Environment,
  streamingManager: StreamingManager
): void {
  const finalizedStreaming = streamingManager.finalizeResults();
  env.setStreamingResult(finalizedStreaming.streaming);
}
