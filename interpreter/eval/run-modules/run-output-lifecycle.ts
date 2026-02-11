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
  const finalizedStreaming = streamingManager.finalizeResults();
  env.setStreamingResult(finalizedStreaming.streaming as any);

  if (hasStreamFormat && finalizedStreaming.streaming?.text) {
    return { formattedText: finalizedStreaming.streaming.text };
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

  if (!directive.meta?.isDataValue && !directive.meta?.isEmbedded) {
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-output`,
      content: displayText
    };
    env.addNode(replacementNode);
  }

  const shouldEmitFinalOutput = !hasStreamFormat || !streamingEnabled;
  const hasActualOutput = displayText.trim().length > 0;
  if (
    hasActualOutput &&
    !directive.meta?.isDataValue &&
    !directive.meta?.isEmbedded &&
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
