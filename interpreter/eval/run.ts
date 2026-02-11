import type { DirectiveNode, ExeBlockNode, MlldNode, TextNode, VariableReference, WithClause } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { ExecutableVariable, ExecutableDefinition } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldCommandExecutionError, MlldInterpreterError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import { deriveCommandTaint } from '@core/security/taint';
import { parseCommand } from '@core/policy/operation-labels';
import type { CommandAnalyzer, CommandAnalysis, CommandRisk } from '@security/command/analyzer/CommandAnalyzer';
import type { SecurityManager } from '@security/SecurityManager';
import { isExecutableVariable, createSimpleTextVariable } from '@core/types/variable';
import { executePipeline } from './pipeline';
import { logger } from '@core/utils/logger';
import { FormatAdapterSink } from './pipeline/stream-sinks/format-adapter';
import { getAdapter } from '../streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '../streaming/stream-format';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { wrapExecResult } from '../utils/structured-exec';
import {
  asText,
  normalizeWhenShowEffect,
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor
} from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { varMxToSecurityDescriptor, hasSecurityVarMx } from '@core/types/variable/VarMxHelpers';
import { resolveDirectiveExecInvocation } from './directive-replay';
import { resolveWorkingDirectory } from '../utils/working-directory';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { buildAuthDescriptor, resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import { enforceKeychainAccess } from '@interpreter/policy/keychain-policy';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  resolveEnvironmentConfig,
  resolveEnvironmentAuthSecrets
} from '@interpreter/env/environment-provider';
import {
  mergeAuthUsing,
  resolveRunCodeOpType
} from './run-modules/run-pure-helpers';
import { getPreExtractedExec } from './run-modules/run-pre-extracted-inputs';
import {
  applyRunOperationContext,
  buildRunCapabilityOperationUpdate,
  buildRunCommandOperationUpdate,
  checkRunInputLabelFlow,
  deriveRunOutputPolicyDescriptor,
  enforceRunCapabilityPolicy,
  enforceRunCommandPolicy
} from './run-modules/run-policy-context';
import { executeRunCommand } from './run-modules/run-command-executor';
import { executeRunCode } from './run-modules/run-code-executor';

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
    // Handle exec reference with field access support
    const identifierNodes = directive.values?.identifier;
    if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
      throw new Error('Run exec directive missing exec reference');
    }
    
    // Extract command name first for call stack tracking
    let commandName: string = '';
    const identifierNode = identifierNodes[0];
    
    // With improved type consistency, identifierNodes is always VariableReferenceNode[]
    if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
      commandName = identifierNode.identifier;
    }
    
    // Add current command to call stack if not already there
    if (commandName && !callStack.includes(commandName)) {
      callStack = [...callStack, commandName];
    }
    
    // Check if this is a field access pattern (e.g., @http.get)
    let execVar: ExecutableVariable;
    
    if (identifierNode.type === 'VariableReference' && (identifierNode as VariableReference).fields && (identifierNode as VariableReference).fields.length > 0) {
      // Handle field access (e.g., @http.get)
      const varRef = identifierNode as VariableReference;
      const baseVar = env.getVariable(varRef.identifier);
      if (!baseVar) {
        throw new Error(`Base variable not found: ${varRef.identifier}`);
      }
      
      const variantMap = baseVar.internal?.transformerVariants as Record<string, any> | undefined;
      let value: any;
      let remainingFields = Array.isArray(varRef.fields) ? [...varRef.fields] : [];

      if (variantMap && remainingFields.length > 0) {
        const firstField = remainingFields[0];
        if (firstField.type === 'field' || firstField.type === 'stringIndex' || firstField.type === 'numericField') {
          const variantName = String(firstField.value);
          const variant = variantMap[variantName];
          if (!variant) {
            throw new Error(`Pipeline function '@${varRef.identifier}.${variantName}' is not defined`);
          }
          value = variant;
          remainingFields = remainingFields.slice(1);
        }
      }

      if (typeof value === 'undefined') {
        // Extract Variable value for field access - WHY: Need raw object to navigate fields
        const { extractVariableValue } = await import('../utils/variable-resolution');
        value = await extractVariableValue(baseVar, env);
      }

      // Navigate through the remaining field access chain
      for (const field of remainingFields) {
        if ((field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') && typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[String(field.value)];
        } else if (field.type === 'arrayIndex' && Array.isArray(value)) {
          value = value[Number(field.value)];
        } else {
          const fieldName = String(field.value);
          throw new Error(`Cannot access field '${fieldName}' on ${typeof value}`);
        }
      }
      
      
      // The resolved value could be an executable object directly or a string reference
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'executable') {
        // Direct executable object
        execVar = value as ExecutableVariable;
      } else if (typeof value === 'object' && value !== null && '__executable' in value && value.__executable) {
        // Serialized executable object from imports/exports
        // Manually reconstruct the ExecutableVariable with all metadata
        const fullName = `${varRef.identifier}.${varRef.fields.map(f => f.value).join('.')}`;
        
        // Deserialize shadow environments if present (convert objects back to Maps)
        let capturedShadowEnvs = value.internal?.capturedShadowEnvs;
        if (capturedShadowEnvs && typeof capturedShadowEnvs === 'object') {
          const deserialized: any = {};
          for (const [lang, shadowObj] of Object.entries(capturedShadowEnvs)) {
            if (shadowObj && typeof shadowObj === 'object') {
              // Convert object to Map
              const map = new Map<string, any>();
              for (const [name, func] of Object.entries(shadowObj)) {
                map.set(name, func);
              }
              deserialized[lang] = map;
            }
          }
          capturedShadowEnvs = deserialized;
        }
        
        execVar = {
          type: 'executable',
          name: fullName,
          value: value.value || { type: 'code', template: '', language: 'js' },
          paramNames: value.paramNames || [],
          source: {
            directive: 'import',
            syntax: 'code',
            hasInterpolation: false,
            isMultiLine: false
          },
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          mx: {
            ...(value.mx || {})
          },
          internal: {
            ...(value.internal || {}),
            executableDef: value.executableDef,
            // CRITICAL: Preserve captured shadow environments from imports (deserialized)
            capturedShadowEnvs: capturedShadowEnvs
          }
        };
        
      } else if (typeof value === 'string') {
        // String reference to an executable  
        const variable = env.getVariable(value);
        if (!variable || !isExecutableVariable(variable)) {
          throw new Error(`Executable variable not found: ${value}`);
        }
        execVar = variable;
      } else {
        throw new Error(`Field access did not resolve to an executable: ${typeof value}, got: ${JSON.stringify(value)}`);
      }
    } else {
      // Handle simple command reference (original behavior)
      // Command name already extracted above
      if (!commandName) {
        throw new Error('Run exec directive identifier must be a command reference');
      }
      
      const variable = getPreExtractedExec(context, commandName) ?? env.getVariable(commandName);
      if (!variable || !isExecutableVariable(variable)) {
        throw new Error(`Executable variable not found: ${commandName}`);
      }
      execVar = variable;
    }
    
    // Get the executable definition from metadata
    const definition = execVar.internal?.executableDef as ExecutableDefinition | undefined;
    if (!definition) {
      // For field access, provide more helpful error message
      const fullPath = identifierNode.type === 'VariableReference' && (identifierNode as VariableReference).fields && (identifierNode as VariableReference).fields.length > 0
        ? `${(identifierNode as VariableReference).identifier}.${(identifierNode as VariableReference).fields.map(f => f.value).join('.')}`
        : commandName;
      throw new Error(`Executable ${fullPath} has no definition (missing executableDef)`);
    }

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
    
    if (definition.type === 'command' && 'commandTemplate' in definition) {
      // Create a temporary environment with parameter values
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
      }

      const workingDirectory = await resolveWorkingDirectory(
        (definition as any)?.workingDir,
        tempEnv,
        { sourceLocation: directive.location, directiveType: 'run' }
      );
      const effectiveWorkingDirectory = workingDirectory || env.getExecutionDirectory();
      
      // TODO: Remove this workaround when issue #51 is fixed
      // Strip leading '[' from first command segment if present
      const cleanTemplate = definition.commandTemplate.map((seg: MlldNode, idx: number) => {
        if (idx === 0 && seg.type === 'Text' && 'content' in seg && seg.content.startsWith('[')) {
          return { ...seg, content: seg.content.substring(1) };
        }
        return seg;
      });
      
      // Interpolate the command template with parameters
      const command = await interpolateWithPendingDescriptor(
        cleanTemplate,
        InterpolationContext.ShellCommand,
        tempEnv
      );

      const parsedCommand = parseCommand(command);
      const opUpdate = buildRunCommandOperationUpdate(
        command,
        (context?.operationContext?.metadata ?? {}) as Record<string, unknown>
      );
      applyRunOperationContext(env, context, opUpdate);
      const opLabels = (opUpdate.opLabels ?? []) as string[];

      enforceRunCommandPolicy(
        env.getPolicySummary(),
        command,
        env,
        directive.location ?? undefined
      );

      const inputDescriptor =
        argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
      const inputTaint = checkRunInputLabelFlow({
        descriptor: inputDescriptor,
        policyEnforcer,
        policyChecksEnabled,
        opLabels,
        exeLabels,
        flowChannel: 'arg',
        command: parsedCommand.command,
        env,
        sourceLocation: directive.location ?? undefined
      });
      const outputPolicyDescriptor = deriveRunOutputPolicyDescriptor({
        policyEnforcer,
        inputTaint,
        exeLabels
      });
      mergePendingDescriptor(outputPolicyDescriptor);

      const commandTaint = deriveCommandTaint({ command });
      const scopedEnvConfig = resolveEnvironmentConfig(env, context?.guardMetadata);
      const resolvedEnvConfig = applyEnvironmentDefaults(scopedEnvConfig, env.getPolicySummary());
      mergePendingDescriptor(buildEnvironmentOutputDescriptor(command, resolvedEnvConfig));
      
      // NEW: Security check for exec commands
      const security = env.getSecurityManager();
      if (security) {
        const securityManager = security as SecurityManager & { commandAnalyzer?: CommandAnalyzer };
        const analyzer = securityManager.commandAnalyzer;
        if (analyzer) {
          const analysis = await analyzer.analyze(command);
          if (analysis.blocked) {
            const reason = analysis.risks?.[0]?.description || 'Security policy violation';
            throw new MlldCommandExecutionError(
              `Security: Exec command blocked - ${reason}`,
              directive.location,
            {
              command,
              exitCode: 1,
              duration: 0,
              stderr: `This exec command is blocked by security policy: ${reason}`,
              workingDirectory: effectiveWorkingDirectory,
              directiveType: 'run'
            },
            env
          );
        }
        }
      }
      
      // Pass context for exec command errors too
      const usingParts = await resolveUsingEnvParts(tempEnv, definition.withClause, withClause);
      const envAuthSecrets = await resolveEnvironmentAuthSecrets(tempEnv, resolvedEnvConfig);
      const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
      const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);
      const envInputTaint = checkRunInputLabelFlow({
        descriptor: envInputDescriptor,
        policyEnforcer,
        policyChecksEnabled,
        opLabels,
        exeLabels,
        flowChannel: 'using',
        command: parsedCommand.command,
        env,
        sourceLocation: directive.location ?? undefined
      });
      if (resolvedEnvConfig?.provider) {
        const providerResult = await executeProviderCommand({
          env: tempEnv,
          providerRef: resolvedEnvConfig.provider,
          config: resolvedEnvConfig,
          command,
          workingDirectory,
          vars: usingParts.vars,
          secrets: {
            ...envAuthSecrets,
            ...usingParts.secrets
          },
          executionContext: {
            ...executionContext,
            streamingEnabled,
            pipelineId,
            workingDirectory
          },
          sourceLocation: directive.location ?? null,
          directiveType: 'run'
        });
        setOutput(providerResult.stdout ?? '');
      } else {
        const injectedEnv = {
          ...envAuthSecrets,
          ...usingParts.merged
        };
        const commandOptions =
          workingDirectory || Object.keys(injectedEnv).length > 0
            ? {
                ...(workingDirectory ? { workingDirectory } : {}),
                ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
              }
            : undefined;
        setOutput(await env.executeCommand(command, commandOptions, {
          ...executionContext,
          streamingEnabled,
          pipelineId,
          workingDirectory
        }));
      }
      
    } else if (definition.type === 'commandRef') {
      const refAst = (definition as any).commandRefAst;
      if (refAst) {
        const { evaluateExecInvocation } = await import('./exec-invocation');
        const execEnv = env.createChild();
        for (const [key, value] of Object.entries(argValues)) {
          execEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
        }
        const mergedAuthUsing = mergeAuthUsing(definition.withClause as WithClause | undefined, withClause);
        const refWithClause = mergedAuthUsing
          ? { ...(withClause || {}), ...mergedAuthUsing }
          : withClause;
        const baseInvocation =
          (refAst as any).type === 'ExecInvocation'
            ? refAst
            : {
                type: 'ExecInvocation',
                commandRef: refAst
              };
        const refInvocation = refWithClause ? { ...baseInvocation, withClause: refWithClause } : baseInvocation;
        const result = await evaluateExecInvocation(refInvocation as any, execEnv);
        setOutput(result.value);
      } else {
        // This command references another command
        const refExecVar = env.getVariable(definition.commandRef);
        if (!refExecVar || !isExecutableVariable(refExecVar)) {
          throw new Error(`Referenced executable not found: ${definition.commandRef}`);
        }
        
        // Check for circular references
        if (callStack.includes(definition.commandRef)) {
          const cycle = [...callStack, definition.commandRef].join(' -> ');
          throw new Error(`Circular command reference detected: ${cycle}`);
        }
        
        // Create a new run directive for the referenced command
        const refDirective = {
          ...directive,
          values: {
            ...directive.values,
            identifier: [{ type: 'Text', content: definition.commandRef }],
            args: definition.commandArgs
          }
        };
        const mergedAuthUsing = mergeAuthUsing(definition.withClause as WithClause | undefined, withClause);
        const refWithClause = mergedAuthUsing
          ? { ...(withClause || {}), ...mergedAuthUsing }
          : withClause;
        if (refWithClause) {
          (refDirective.values as any).withClause = refWithClause;
          refDirective.meta = { ...directive.meta, withClause: refWithClause };
        }
        
        // Recursively evaluate the referenced command with updated call stack
        // Note: We don't add definition.commandRef here because it will be added 
        // at the beginning of the runExec case when processing refDirective
        const result = await evaluateRun(refDirective, env, callStack, context);
        setOutput(result.value);
      }
      
    } else if (execVar.internal?.isBuiltinTransformer && execVar.internal?.transformerImplementation) {
      // Special handling for built-in transformers (e.g., imported @keychain functions)
      const args = directive.values?.args || [];
      const evaluatedArgs: any[] = [];

      for (const arg of args) {
        if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
          evaluatedArgs.push(arg);
        } else if (arg && typeof arg === 'object' && 'type' in arg) {
          const argValue = await interpolateWithPendingDescriptor([arg], InterpolationContext.Default);
          evaluatedArgs.push(argValue);
        } else {
          evaluatedArgs.push(arg);
        }
      }

      const keychainFunction = execVar.internal?.keychainFunction;
      if (keychainFunction) {
        const service = String(evaluatedArgs[0] ?? '');
        const account = String(evaluatedArgs[1] ?? '');
        if (!service || !account) {
          throw new MlldInterpreterError('Keychain access requires service and account', {
            code: 'KEYCHAIN_PATH_INVALID'
          });
        }
        enforceKeychainAccess(env, { service, account, action: keychainFunction }, directive.location);
      }

      // Call the transformer implementation directly with all args
      const result = await execVar.internal.transformerImplementation(evaluatedArgs);
      if (keychainFunction === 'get' && result !== null && result !== undefined) {
        const keychainDescriptor = makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['secret', 'src:keychain'],
          sources: ['keychain.get']
        });
        const existingDescriptor = extractSecurityDescriptor(result, {
          recursive: true,
          mergeArrayElements: true
        });
        const mergedDescriptor = existingDescriptor
          ? env.mergeSecurityDescriptors(existingDescriptor, keychainDescriptor)
          : keychainDescriptor;
        const wrapped = wrapExecResult(result);
        applySecurityDescriptorToStructuredValue(wrapped, mergedDescriptor);
        setOutput(wrapped);
      } else {
        setOutput(result);
      }

    } else if (definition.type === 'code') {
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
      }
      const workingDirectory = await resolveWorkingDirectory(
        (definition as any)?.workingDir,
        tempEnv,
        { sourceLocation: directive.location, directiveType: 'run' }
      );

      const codeParams = { ...argValues };
      const capturedEnvs = execVar.internal?.capturedShadowEnvs;
      if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' ||
                           definition.language === 'node' || definition.language === 'nodejs')) {
        (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      }

      const opType = resolveRunCodeOpType(definition.language ?? '');
      let opLabels: string[] = [];
      if (opType) {
        const opUpdate = buildRunCapabilityOperationUpdate(opType);
        applyRunOperationContext(env, context, opUpdate);
        opLabels = (opUpdate.opLabels ?? []) as string[];
      }
      if (opType) {
        enforceRunCapabilityPolicy(
          env.getPolicySummary(),
          opType,
          env,
          directive.location ?? undefined
        );
      }
      const inputDescriptor =
        argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
      const inputTaint = checkRunInputLabelFlow({
        descriptor: inputDescriptor,
        policyEnforcer,
        policyChecksEnabled: policyChecksEnabled && Boolean(opType),
        opLabels,
        exeLabels,
        flowChannel: 'arg',
        env,
        sourceLocation: directive.location ?? undefined
      });
      const outputPolicyDescriptor = deriveRunOutputPolicyDescriptor({
        policyEnforcer,
        inputTaint,
        exeLabels
      });
      mergePendingDescriptor(outputPolicyDescriptor);

      // Special handling for mlld-when expressions
      if (definition.language === 'mlld-when') {
        logger.debug('🎯 mlld-when handler in run.ts CALLED');
        
        // The codeTemplate contains the WhenExpression node
        const whenExprNode = definition.codeTemplate[0];
        if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
          throw new Error('mlld-when executable missing WhenExpression node');
        }
        
        // Create parameter environment
        const execEnv = env.createChild();
        for (const [key, value] of Object.entries(codeParams)) {
          execEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
        }
        
        // Evaluate the when expression with the parameter environment
        const { evaluateWhenExpression } = await import('./when-expression');
        const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
        // If the when-expression tagged a side-effect show, unwrap to its text
        // so /run echoes it as output (tests expect duplicate lines).
        const normalized = normalizeWhenShowEffect(whenResult.value);
        setOutput(normalized.normalized);
        
        logger.debug('🎯 mlld-when result:', {
          outputType: typeof outputValue,
          outputValue: outputText.substring(0, 100)
        });
      } else if (definition.language === 'mlld-exe-block') {
        const blockNode = Array.isArray(definition.codeTemplate)
          ? (definition.codeTemplate[0] as ExeBlockNode | undefined)
          : undefined;
        if (!blockNode || !blockNode.values) {
          throw new Error('mlld-exe-block executable missing block content');
        }

        const execEnv = env.createChild();
        for (const [key, value] of Object.entries(codeParams)) {
          execEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
        }

        const { evaluateExeBlock } = await import('./exe');
        const blockResult = await evaluateExeBlock(blockNode, execEnv);
        setOutput(blockResult.value);
      } else {
        // Interpolate executable code templates with parameters (canonical behavior)
        const code = await interpolateWithPendingDescriptor(
          definition.codeTemplate,
          InterpolationContext.ShellCommand,
          tempEnv
        );
        if (process.env.DEBUG_EXEC) {
          logger.debug('run.ts code execution debug:', {
            codeTemplate: definition.codeTemplate,
            interpolatedCode: code,
            argValues
          });
        }

        setOutput(await AutoUnwrapManager.executeWithPreservation(async () => {
          return await env.executeCode(
            code,
            definition.language || 'javascript',
            codeParams,
            undefined,
            workingDirectory ? { workingDirectory } : undefined,
            {
              ...executionContext,
              streamingEnabled,
              pipelineId,
              workingDirectory
            }
          );
        }));
      }
    } else if (definition.type === 'template') {
      // Handle template executables
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
      }

      const templateOutput = await interpolateWithPendingDescriptor(
        definition.template,
        InterpolationContext.Default,
        tempEnv
      );
      setOutput(templateOutput);
    } else if (definition.type === 'prose') {
      // Handle prose executables - prose:@config { ... }
      const { executeProseExecutable } = await import('./prose-execution');
      const proseResult = await executeProseExecutable(definition, argValues, env);
      setOutput(proseResult);
    } else {
      throw new Error(`Unsupported executable type: ${definition.type}`);
    }
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
