import type { ExecInvocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { getAdapter } from '@interpreter/streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '@interpreter/streaming/stream-format';

type ChunkSource = 'stdout' | 'stderr';

export type ExecInvocationStreamingSetup = {
  streamingOptions: StreamingOptions;
  streamingRequested: boolean;
  streamingEnabled: boolean;
  hasStreamFormat: boolean;
  pipelineId: string;
  streamingManager: StreamingManager;
};

export async function setupExecInvocationStreaming(
  node: ExecInvocation,
  env: Environment
): Promise<ExecInvocationStreamingSetup> {
  let streamingOptions = env.getStreamingOptions();
  const streamingRequested =
    node.stream === true ||
    node.withClause?.stream === true ||
    node.meta?.withClause?.stream === true;
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
  if (streamingEnabled) {
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

  return {
    streamingOptions,
    streamingRequested,
    streamingEnabled,
    hasStreamFormat,
    pipelineId,
    streamingManager
  };
}

export function mergeExecInvocationStreamingFromDefinition(
  streamingRequested: boolean,
  streamingOptions: StreamingOptions,
  definition: ExecutableDefinition
): { streamingRequested: boolean; streamingEnabled: boolean } {
  const mergedRequest =
    streamingRequested ||
    definition.withClause?.stream === true ||
    (definition.meta as any)?.withClause?.stream === true ||
    (definition.meta as any)?.isStream === true;
  const streamingEnabled = streamingOptions.enabled !== false && mergedRequest;
  return {
    streamingRequested: mergedRequest,
    streamingEnabled
  };
}

export function createExecInvocationChunkEffect(options: {
  env: Environment;
  isStreamingEnabled: () => boolean;
  shouldSkipDefaultSinks: () => boolean;
}): (chunk: string, source: ChunkSource) => void {
  const { env, isStreamingEnabled, shouldSkipDefaultSinks } = options;
  let lastEmittedChunk: string | undefined;
  return (chunk: string, source: ChunkSource): void => {
    if (!isStreamingEnabled()) {
      return;
    }

    const trimmed = chunk.trim();
    if (trimmed && trimmed === lastEmittedChunk) {
      return;
    }
    lastEmittedChunk = trimmed || chunk;
    const withSpacing = chunk.endsWith('\n') ? `${chunk}\n` : `${chunk}\n\n`;
    if (!shouldSkipDefaultSinks()) {
      return;
    }
    if (source === 'stdout') {
      env.emitEffect('doc', withSpacing);
    } else {
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
