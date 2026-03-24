import type { DirectiveNode, WithClause } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { executePipeline } from './pipeline';
import { FormatAdapterSink } from './pipeline/stream-sinks/format-adapter';
import { getAdapter } from '../streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '../streaming/stream-format';
import { wrapExecResult } from '../utils/structured-exec';
import {
  asText,
  applySecurityDescriptorToStructuredValue
} from '../utils/structured-value';
import { varMxToSecurityDescriptor, hasSecurityVarMx } from '@core/types/variable/VarMxHelpers';
import { resolveDirectiveExecInvocation } from './directive-replay';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { executeRunCommand } from './run-modules/run-command-executor';
import { executeRunCode } from './run-modules/run-code-executor';
import { resolveRunExecutableReference } from './run-modules/run-exec-resolver';
import { resolveAnyStreamFlag, resolveStreamFlag } from './stream-flag';
import {
  dispatchRunExecutableDefinition,
  extractRunExecArguments
} from './run-modules/run-exec-definition-dispatcher';
import {
  applyRunWithClausePipeline,
  finalizeRunOutputLifecycle,
  finalizeRunStreamingLifecycle
} from './run-modules/run-output-lifecycle';

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

  let streamingOptions = env.getStreamingOptions();
  let activeStreamingOptions = streamingOptions;
  let streamingRequested = await resolveStreamFlag((withClause as any)?.stream, env);
  let streamingEnabled = streamingOptions.enabled !== false && streamingRequested;
  const pipelineId = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

  // Check for streamFormat in withClause
  let hasStreamFormat = Boolean(withClause && (withClause as any).streamFormat !== undefined);
  let rawStreamFormat = hasStreamFormat ? (withClause as any).streamFormat : undefined;
  let streamFormatValue = hasStreamFormat
    ? await resolveStreamFormatValue(rawStreamFormat, env)
    : undefined;

  const streamingManager = env.getStreamingManager();
  const refreshStreamingOptions = (): void => {
    streamingOptions = env.getStreamingOptions();
    activeStreamingOptions = streamingOptions;
  };
  const definitionRequestsStreaming = async (definition: any): Promise<boolean> => {
    return resolveAnyStreamFlag(
      [
        definition?.withClause?.stream,
        definition?.meta?.withClause?.stream,
        definition?.meta?.isStream
      ],
      env
    );
  };
  const definitionHasStreamFormat = (definition: any): boolean => {
    return (
      definition?.withClause?.streamFormat !== undefined ||
      definition?.meta?.withClause?.streamFormat !== undefined
    );
  };
  const resolveDefinitionRawStreamFormat = (definition: any): unknown => {
    if (definition?.withClause?.streamFormat !== undefined) {
      return definition.withClause.streamFormat;
    }
    return definition?.meta?.withClause?.streamFormat;
  };
  const configureStreamingManager = async (): Promise<void> => {
    if (!streamingEnabled) {
      return;
    }

    let adapter;
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
  };
  const enforceNoAfterGuardsWhenStreaming = (): void => {
    if (!streamingEnabled) {
      return;
    }
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
    if (afterGuards.length === 0) {
      return;
    }

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
  };

  // Persist streamFormat/sink preferences in env so downstream executors see them
  if (hasStreamFormat) {
    env.setStreamingOptions({
      ...streamingOptions,
      streamFormat: streamFormatValue as any,
      skipDefaultSinks: true,
      suppressTerminal: true
    });
    refreshStreamingOptions();
  } else {
    refreshStreamingOptions();
  }

  if (process.env.MLLD_DEBUG) {
    console.error('[FormatAdapter /run] streamingEnabled:', streamingEnabled);
    console.error('[FormatAdapter /run] hasStreamFormat:', hasStreamFormat);
    console.error('[FormatAdapter /run] streamFormatValue:', streamFormatValue);
    console.error('[FormatAdapter /run] withClause:', JSON.stringify(withClause));
  }

  // Setup streaming via manager
  await configureStreamingManager();
  enforceNoAfterGuardsWhenStreaming();

  // Create execution context with source information
  const executionContext = {
    sourceLocation: directive.location,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: directive.meta?.directiveType as string || 'run'
  };

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
      withClause,
      executionContext,
      streamingEnabled,
      pipelineId,
      policyEnforcer,
      policyChecksEnabled
    });
    mergePendingDescriptor(codeResult.outputDescriptor);
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

    const definitionWantsStreaming = await definitionRequestsStreaming(definition);
    const definitionWantsStreamFormat = definitionHasStreamFormat(definition);
    streamingRequested = streamingRequested || definitionWantsStreaming;
    hasStreamFormat = hasStreamFormat || definitionWantsStreamFormat;
    rawStreamFormat = hasStreamFormat
      ? rawStreamFormat ?? resolveDefinitionRawStreamFormat(definition)
      : undefined;
    streamFormatValue = hasStreamFormat
      ? await resolveStreamFormatValue(rawStreamFormat, env)
      : undefined;

    if (hasStreamFormat) {
      env.setStreamingOptions({
        ...streamingOptions,
        streamFormat: streamFormatValue as any,
        skipDefaultSinks: true,
        suppressTerminal: true
      });
      refreshStreamingOptions();
    } else {
      refreshStreamingOptions();
    }
    streamingEnabled = activeStreamingOptions.enabled !== false && streamingRequested;
    await configureStreamingManager();
    enforceNoAfterGuardsWhenStreaming();

    const execDescriptor = execVar.mx ? varMxToSecurityDescriptor(execVar.mx) : undefined;
    const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
    const exeOutputLabels = exeLabels.filter(
      (label): label is string => typeof label === 'string' && label.length > 0
    );
    const exeOutputDescriptor =
      exeOutputLabels.length > 0 ? makeSecurityDescriptor({ labels: exeOutputLabels }) : undefined;
    
    const {
      argValues,
      argRuntimeValues,
      argDescriptors,
      argOriginalVariables,
      argBindingDescriptors
    } = await extractRunExecArguments({
      directive,
      definition,
      env,
      interpolateWithPendingDescriptor
    });
    
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
      argRuntimeValues,
      argDescriptors,
      argOriginalVariables,
      argBindingDescriptors,
      exeLabels,
      services: {
        interpolateWithPendingDescriptor,
        evaluateRunRecursive: evaluateRun
      }
    });
    callStack = dispatchResult.callStack;
    mergePendingDescriptor(exeOutputDescriptor);
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
  
  const pipelineResult = await applyRunWithClausePipeline({
    withClause,
    outputValue,
    pendingOutputDescriptor,
    lastOutputDescriptor,
    sourceNodeForPipeline,
    env,
    directive
  });
  if (typeof pipelineResult !== 'undefined') {
    setOutput(pipelineResult);
  }

  const streamingResult = finalizeRunStreamingLifecycle({
    env,
    streamingManager,
    hasStreamFormat: Boolean(hasStreamFormat)
  });
  if (streamingResult.formattedText) {
    setOutput(streamingResult.formattedText);
  }

  const outputLifecycle = finalizeRunOutputLifecycle({
    directive,
    env,
    outputValue,
    outputText,
    hasStreamFormat: Boolean(hasStreamFormat),
    streamingEnabled
  });
  outputText = outputLifecycle.displayText;

  // Return the output value
  return {
    value: outputValue,
    env
  };
}
