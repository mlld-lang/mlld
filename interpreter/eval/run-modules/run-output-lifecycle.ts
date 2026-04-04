import type { DirectiveNode, TextNode, WithClause } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { materializeDisplayValue } from '@interpreter/utils/display-materialization';

export type RunPipelineLifecycleParams = {
  withClause?: WithClause;
  outputValue: unknown;
  pendingOutputDescriptor?: SecurityDescriptor;
  lastOutputDescriptor?: SecurityDescriptor;
  sourceNodeForPipeline?: unknown;
  env: Environment;
  directive: DirectiveNode;
};

export type RunStreamingLifecycleParams = {
  env: Environment;
  streamingManager: {
    finalizeResults: () => {
      streaming?: {
        text?: string;
      };
    };
  };
  hasStreamFormat: boolean;
};

export type RunOutputLifecycleParams = {
  directive: DirectiveNode;
  env: Environment;
  outputValue: unknown;
  outputText: string;
  hasStreamFormat: boolean;
  streamingEnabled: boolean;
};

export type RunStreamingLifecycleResult = {
  formattedText?: string;
};

export type RunOutputLifecycleResult = {
  displayText: string;
};

export async function applyRunWithClausePipeline(
  params: RunPipelineLifecycleParams
): Promise<unknown | undefined> {
  const {
    withClause,
    outputValue,
    pendingOutputDescriptor,
    lastOutputDescriptor,
    sourceNodeForPipeline,
    env,
    directive
  } = params;

  if (process.env.MLLD_DEBUG_STDIN === 'true' && withClause) {
    try {
      console.error('[mlld] withClause', JSON.stringify(withClause, null, 2));
    } catch {
      console.error('[mlld] withClause', withClause);
    }
  }

  if (!withClause?.pipeline || withClause.pipeline.length === 0) {
    return undefined;
  }

  const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
  const enableStage0 = Boolean(sourceNodeForPipeline);
  const valueForPipeline = enableStage0
    ? { value: outputValue, mx: {}, internal: { isRetryable: true, sourceFunction: sourceNodeForPipeline } }
    : outputValue;
  const outputDescriptor = lastOutputDescriptor ?? extractSecurityDescriptor(outputValue, {
    recursive: true,
    mergeArrayElements: true
  });
  const pipelineDescriptorHint = pendingOutputDescriptor
    ? outputDescriptor
      ? env.mergeSecurityDescriptors(pendingOutputDescriptor, outputDescriptor)
      : pendingOutputDescriptor
    : outputDescriptor;

  return processPipeline({
    value: valueForPipeline,
    env,
    directive,
    pipeline: withClause.pipeline,
    format: withClause.format as string | undefined,
    isRetryable: enableStage0,
    location: directive.location,
    descriptorHint: pipelineDescriptorHint
  });
}

export function finalizeRunStreamingLifecycle(
  params: RunStreamingLifecycleParams
): RunStreamingLifecycleResult {
  const { env, streamingManager, hasStreamFormat } = params;
  const previousStreaming = env.getStreamingResult();
  const finalizedStreaming = streamingManager.finalizeResults();
  const effectiveStreaming = finalizedStreaming.streaming ?? previousStreaming;
  env.setStreamingResult(effectiveStreaming as any);

  if (hasStreamFormat && effectiveStreaming?.text) {
    return { formattedText: effectiveStreaming.text };
  }

  return {};
}

export function finalizeRunOutputLifecycle(
  params: RunOutputLifecycleParams
): RunOutputLifecycleResult {
  const {
    directive,
    env,
    outputValue,
    outputText,
    hasStreamFormat,
    streamingEnabled
  } = params;

  let displayText = outputText;
  if (!displayText.endsWith('\n')) {
    displayText += '\n';
  }

  const shouldRenderOutput =
    !directive.meta?.isBareInvocation &&
    !directive.meta?.isDataValue &&
    !directive.meta?.isEmbedded;

  if (shouldRenderOutput) {
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-output`,
      content: displayText
    };
    env.addNode(replacementNode);
  }

  const hasFormattedStreamingText = Boolean(env.getStreamingResult()?.text);
  const shouldEmitFinalOutput =
    !hasStreamFormat || (!streamingEnabled && !hasFormattedStreamingText);
  const hasActualOutput = displayText.trim().length > 0;
  if (
    hasActualOutput &&
    shouldRenderOutput &&
    !directive.meta?.isRHSRef &&
    shouldEmitFinalOutput
  ) {
    const materializedEffect = materializeDisplayValue(
      outputValue,
      undefined,
      outputValue,
      displayText
    );
    const effectText = materializedEffect.text;
    if (materializedEffect.descriptor) {
      env.recordSecurityDescriptor(materializedEffect.descriptor);
    }
    env.emitEffect('both', effectText);
  }

  return { displayText };
}
