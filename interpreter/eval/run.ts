import type { DirectiveNode, TextNode, WithClause } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import type { SecurityDescriptor } from '@core/types/security';
import { executePipeline } from './pipeline';
import { FormatAdapterSink } from './pipeline/stream-sinks/format-adapter';
import { getAdapter } from '../streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '../streaming/stream-format';
import { wrapExecResult } from '../utils/structured-exec';
import {
  asText,
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor
} from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { varMxToSecurityDescriptor, hasSecurityVarMx } from '@core/types/variable/VarMxHelpers';
import { resolveDirectiveExecInvocation } from './directive-replay';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { executeRunCommand } from './run-modules/run-command-executor';
import { executeRunCode } from './run-modules/run-code-executor';
import { resolveRunExecutableReference } from './run-modules/run-exec-resolver';
import { dispatchRunExecutableDefinition } from './run-modules/run-exec-definition-dispatcher';

/**
 * Evaluate @run directives.
 * Executes commands/code and returns output as replacement nodes.
 * 
 * Ported from RunDirectiveHandler.
 */
export async function evaluateRun(
  directive: DirectiveNode,
  env: Environment,
  callStack: string[] = [],
  context?: EvaluationContext
): Promise<EvalResult> {
  // Check if we're importing - skip execution if so
  if (env.getIsImporting()) {
    return { value: null, env };
  }

  let outputValue: unknown;
  let outputText: string;
  let pendingOutputDescriptor: SecurityDescriptor | undefined;
  let lastOutputDescriptor: SecurityDescriptor | undefined;
  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const mergePendingDescriptor = (descriptor?: SecurityDescriptor): void => {
    if (!descriptor) {
      return;
    }
    pendingOutputDescriptor = pendingOutputDescriptor
      ? env.mergeSecurityDescriptors(pendingOutputDescriptor, descriptor)
      : descriptor;
  };
  const interpolateWithPendingDescriptor = async (
    nodes: any,
    interpolationContext: InterpolationContext = InterpolationContext.Default,
    targetEnv: Environment = env
  ): Promise<string> => {
    return interpolate(nodes, targetEnv, interpolationContext, {
      collectSecurityDescriptor: mergePendingDescriptor
    });
  };

  const setOutput = (value: unknown) => {
    const wrapped = wrapExecResult(value);
    if (pendingOutputDescriptor) {
      const existingDescriptor =
        wrapped.mx && hasSecurityVarMx(wrapped.mx) ? varMxToSecurityDescriptor(wrapped.mx) : undefined;
      const descriptor = existingDescriptor
        ? env.mergeSecurityDescriptors(existingDescriptor, pendingOutputDescriptor)
        : pendingOutputDescriptor;
      const defaultedDescriptor = policyEnforcer.applyDefaultTrustLabel(descriptor);
      if (defaultedDescriptor) {
        applySecurityDescriptorToStructuredValue(wrapped, defaultedDescriptor);
        lastOutputDescriptor = defaultedDescriptor;
      } else {
        lastOutputDescriptor = undefined;
      }
      pendingOutputDescriptor = undefined;
    } else {
      lastOutputDescriptor = undefined;
    }
    outputValue = wrapped;
    outputText = asText(wrapped as any);
  };

  const policyChecksEnabled = !context?.policyChecked;

  setOutput('');
  // Track source node to optionally enable stage-0 retry
  let sourceNodeForPipeline: any | undefined;

  let withClause = (directive.meta?.withClause || directive.values?.withClause) as WithClause | undefined;
  if (process.env.MLLD_DEBUG_STDIN === 'true') {
    try {
      console.error('[mlld] directive meta withClause', JSON.stringify(directive.meta?.withClause));
      console.error('[mlld] directive values withClause', JSON.stringify(directive.values?.withClause));
    } catch {
      console.error('[mlld] directive meta withClause', directive.meta?.withClause);
      console.error('[mlld] directive values withClause', directive.values?.withClause);
    }
  }

  const streamingOptions = env.getStreamingOptions();
  const streamingRequested = Boolean(withClause && (withClause as any).stream);
  const streamingEnabled = streamingOptions.enabled !== false && streamingRequested;
  const pipelineId = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

  // Check for streamFormat in withClause
  const hasStreamFormat = withClause && (withClause as any).streamFormat !== undefined;
  const rawStreamFormat = hasStreamFormat ? (withClause as any).streamFormat : undefined;
  const streamFormatValue = hasStreamFormat
    ? await resolveStreamFormatValue(rawStreamFormat, env)
    : undefined;

  // Persist streamFormat/sink preferences in env so downstream executors see them
  if (hasStreamFormat) {
    env.setStreamingOptions({
      ...streamingOptions,
      streamFormat: streamFormatValue as any,
      skipDefaultSinks: true,
      suppressTerminal: true
    });
  }
  const activeStreamingOptions = env.getStreamingOptions();

  if (process.env.MLLD_DEBUG) {
    console.error('[FormatAdapter /run] streamingEnabled:', streamingEnabled);
    console.error('[FormatAdapter /run] hasStreamFormat:', hasStreamFormat);
    console.error('[FormatAdapter /run] streamFormatValue:', streamFormatValue);
    console.error('[FormatAdapter /run] withClause:', JSON.stringify(withClause));
  }

  // Setup streaming via manager
  const streamingManager = env.getStreamingManager();
  if (streamingEnabled) {
    let adapter;
    // Only use format adapter when streamFormat is explicitly specified
    // This ensures FormatAdapterSink is used for JSON streaming (like claude --output-format stream-json)
    // but plain text streaming (sh/bash) uses the terminal sink + normal output path
    if (hasStreamFormat && streamFormatValue) {
      adapter = await loadStreamAdapter(streamFormatValue);
      if (!adapter) {
        adapter = await getAdapter('ndjson');
      }
    }
    streamingManager.configure({
      env,
      streamingEnabled: true,
      streamingOptions: activeStreamingOptions,
      adapter: adapter as any
    });
  }

  if (streamingEnabled) {
    const registry = env.getGuardRegistry?.();
    const subtypeKey =
      directive.subtype === 'runCommand'
        ? 'runCommand'
        : directive.subtype === 'runCode'
          ? 'runCode'
          : undefined;
    const afterGuards = registry
      ? [
          ...registry.getOperationGuardsForTiming('run', 'after'),
          ...(subtypeKey ? registry.getOperationGuardsForTiming(subtypeKey, 'after') : [])
        ]
      : [];
    if (afterGuards.length > 0) {
      const streamingMessage = [
        'Cannot run after-guards when streaming is enabled.',
        'Options:',
        '- Remove after-timed guards or change them to before',
        '- Disable streaming with `with { stream: false }`'
      ].join('\n');
      throw new GuardError({
        decision: 'deny',
        message: streamingMessage,
        reason: streamingMessage,
        operation: {
          type: 'run',
          subtype: directive.subtype === 'runCode' ? 'runCode' : 'runCommand'
        } as any,
        timing: 'after',
        guardResults: [],
        reasons: [streamingMessage]
      });
    }
  }

  // Create execution context with source information
  const executionContext = {
    sourceLocation: directive.location,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: directive.meta?.directiveType as string || 'run'
  };
  
  try {
  if (directive.subtype === 'runCommand') {
    const commandResult = await executeRunCommand({
      directive,
      env,
      context,
      withClause,
      executionContext,
      streamingEnabled,
      pipelineId,
      hasStreamFormat: Boolean(hasStreamFormat),
      suppressTerminal: activeStreamingOptions.suppressTerminal === true,
      policyEnforcer,
      policyChecksEnabled
    });
    mergePendingDescriptor(commandResult.outputDescriptor);
    setOutput(commandResult.value);
    
  } else if (directive.subtype === 'runCode') {
    const codeResult = await executeRunCode({
      directive,
      env,
      context,
      executionContext,
      streamingEnabled,
      pipelineId,
      policyEnforcer,
      policyChecksEnabled
    });
    setOutput(codeResult.value);
    
  } else if (directive.subtype === 'runExec') {
    const runExecResolution = await resolveRunExecutableReference({
      directive,
      env,
      context,
      callStack
    });
    callStack = runExecResolution.callStack;
    const { execVar, definition } = runExecResolution;

    const execDescriptor = execVar.mx ? varMxToSecurityDescriptor(execVar.mx) : undefined;
    const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
    
    // Get arguments from the run directive
    const args = directive.values?.args || [];
    const argValues: Record<string, string> = {};
    const argDescriptors: SecurityDescriptor[] = [];
    
    // Map parameter names to argument values
    const paramNames = definition.paramNames as string[] | undefined;
    if (paramNames && paramNames.length > 0) {
      for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i];
        if (!args[i]) {
          argValues[paramName] = '';
          continue;
        }
        
        // Handle argument nodes
        const arg = args[i];
        
        // Handle both primitive values and node objects
        let argValue: string;
        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
          // Primitive value from grammar
          argValue = String(arg);
        } else if (arg && typeof arg === 'object' && 'type' in arg) {
          if (arg.type === 'VariableReference' && typeof (arg as any).identifier === 'string') {
            const variable = env.getVariable((arg as any).identifier);
            if (variable?.mx) {
              argDescriptors.push(varMxToSecurityDescriptor(variable.mx));
            }
          } else if (
            arg.type === 'VariableReferenceWithTail' &&
            (arg as any).variable &&
            typeof (arg as any).variable.identifier === 'string'
          ) {
            const variable = env.getVariable((arg as any).variable.identifier);
            if (variable?.mx) {
              argDescriptors.push(varMxToSecurityDescriptor(variable.mx));
            }
          }
          // Node object - interpolate normally
          argValue = await interpolateWithPendingDescriptor([arg], InterpolationContext.Default);
        } else {
          // Fallback
          argValue = String(arg);
        }
        argValues[paramName] = argValue;
      }
    }
    
    const dispatchResult = await dispatchRunExecutableDefinition({
      directive,
      env,
      context,
      withClause,
      executionContext,
      streamingEnabled,
      pipelineId,
      policyEnforcer,
      policyChecksEnabled,
      definition,
      execVar,
      callStack,
      argValues,
      argDescriptors,
      exeLabels,
      services: {
        interpolateWithPendingDescriptor,
        evaluateRunRecursive: evaluateRun
      }
    });
    callStack = dispatchResult.callStack;
    for (const descriptor of dispatchResult.outputDescriptors) {
      mergePendingDescriptor(descriptor);
    }
    setOutput(dispatchResult.value);
  } else if (directive.subtype === 'runExecInvocation') {
    // Handle ExecInvocation nodes in run directive
    const execInvocation = directive.values?.execInvocation;
    if (!execInvocation) {
      throw new Error('Run exec invocation directive missing exec invocation');
    }
    
    // Evaluate the exec invocation
    const result = await resolveDirectiveExecInvocation(directive, env, execInvocation);
    setOutput(result.value);
    sourceNodeForPipeline = execInvocation;
    
  } else if (directive.subtype === 'runExecReference') {
    // Handle exec reference nodes in run directive (from @when actions)
    const execRef = directive.values?.execRef;
    if (!execRef) {
      throw new Error('Run exec reference directive missing exec reference');
    }

    // Evaluate the exec invocation
    const result = await resolveDirectiveExecInvocation(directive, env, execRef);
    setOutput(result.value);
    sourceNodeForPipeline = execRef;

  } else if (directive.subtype === 'runPipeline') {
    // Handle leading parallel pipeline: /run || @a() || @b()
    // Pipeline is already in withClause, initial input is empty string
    setOutput('');
    withClause = directive.values.withClause;

  } else {
    throw new Error(`Unsupported run subtype: ${directive.subtype}`);
  }
  
  // Handle with clause if present
  if (withClause) {
    if (process.env.MLLD_DEBUG_STDIN === 'true') {
      try {
        console.error('[mlld] withClause', JSON.stringify(withClause, null, 2));
      } catch {
        console.error('[mlld] withClause', withClause);
      }
    }
    // Apply pipeline transformations if specified
    if (withClause.pipeline && withClause.pipeline.length > 0) {
      // Use unified pipeline processor
      const { processPipeline } = await import('./pipeline/unified-processor');
      // Stage-0 retry is always enabled when we have a source node
      const enableStage0 = !!sourceNodeForPipeline;
      const pipelineInput = outputValue;
      const valueForPipeline = enableStage0
        ? { value: pipelineInput, mx: {}, internal: { isRetryable: true, sourceFunction: sourceNodeForPipeline } }
        : pipelineInput;
      const outputDescriptor = lastOutputDescriptor ?? extractSecurityDescriptor(pipelineInput, {
        recursive: true,
        mergeArrayElements: true
      });
      const pipelineDescriptorHint = pendingOutputDescriptor
        ? outputDescriptor
          ? env.mergeSecurityDescriptors(pendingOutputDescriptor, outputDescriptor)
          : pendingOutputDescriptor
        : outputDescriptor;
      const pipelineResult = await processPipeline({
        value: valueForPipeline,
        env,
        directive,
        pipeline: withClause.pipeline,
        format: withClause.format as string | undefined,
        isRetryable: enableStage0,
        location: directive.location,
        descriptorHint: pipelineDescriptorHint
      });
      setOutput(pipelineResult);
    }
  }

  // Cleanup streaming sinks and capture adapter output
  const finalizedStreaming = streamingManager.finalizeResults();
  env.setStreamingResult(finalizedStreaming.streaming);

  // When using format adapter, use the accumulated formatted text from the adapter
  // instead of the raw command output
  if (hasStreamFormat && finalizedStreaming.streaming?.text) {
    outputText = finalizedStreaming.streaming.text;
    // Update outputValue to match the formatted text
    setOutput(outputText);
  }

  // Output directives always end with a newline for display
  let displayText = outputText;
  if (!displayText.endsWith('\n')) {
    displayText += '\n';
  }
  outputText = displayText;

  // Only add output nodes for non-embedded directives
  if (!directive.meta?.isDataValue && !directive.meta?.isEmbedded) {
    // Create replacement text node with the output
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-output`,
      content: displayText
    };

    // Add the replacement node to environment
    env.addNode(replacementNode);
  }

  // Emit effect only for top-level run directives (not data/RHS contexts)
  // Skip emission when using format adapter (adapter already emitted during streaming)
  // Also skip if the output is empty (only whitespace) to avoid blank lines
  const shouldEmitFinalOutput = !hasStreamFormat || !streamingEnabled;
  const hasActualOutput = displayText.trim().length > 0;
  if (hasActualOutput && !directive.meta?.isDataValue && !directive.meta?.isEmbedded && !directive.meta?.isRHSRef && shouldEmitFinalOutput) {
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

  // Return the output value
  return {
    value: outputValue,
    env
  };
  } catch (error) {
    throw error;
  } finally {
    // Streaming cleanup already done above (moved out of finally to use results)
  }
}
