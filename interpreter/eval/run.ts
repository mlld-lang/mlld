import type { DirectiveNode, ExeBlockNode, MlldNode, TextNode, VariableReference, WithClause } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { ExecutableVariable, ExecutableDefinition } from '@core/types/executable';
import { interpolate, evaluate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldCommandExecutionError } from '@core/errors';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import { deriveCommandTaint } from '@core/security/taint';
import type { CommandAnalyzer, CommandAnalysis, CommandRisk } from '@security/command/analyzer/CommandAnalyzer';
import type { SecurityManager } from '@security/SecurityManager';
import { isExecutableVariable, createSimpleTextVariable } from '@core/types/variable';
import type { Variable } from '@core/types/variable';
import type { Variable } from '@core/types/variable';
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
import { coerceValueForStdin } from '../utils/shell-value';
import { resolveDirectiveExecInvocation } from './directive-replay';
import { resolveWorkingDirectory } from '../utils/working-directory';

/**
 * Extract raw text content from nodes without any interpolation processing
 * This preserves exact formatting and indentation for code blocks
 */
function extractRawTextContent(nodes: MlldNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content || '');
    } else if (node.type === 'Newline') {
      parts.push('\n');
    } else {
      parts.push(String((node as any).value || (node as any).content || ''));
    }
  }
  const rawContent = parts.join('');
  return rawContent.replace(/^\n/, '');
}

/**
 * Remove common leading indentation across all non-empty lines.
 * Preserves relative indentation and trailing whitespace.
 */
function dedentCommonIndent(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^[ \t]*/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) minIndent = indent;
    if (minIndent === 0) break;
  }
  if (!minIndent) return src;
  return lines.map(l => (l.trim().length === 0 ? '' : l.slice(minIndent!))).join('\n');
}

/**
 * Evaluate a stdin expression and coerce it into text for command execution.
 * WHY: /run supports expressions in the `with { stdin: ... }` slot that can
 *      reference variables or pipelines; those must resolve before coercion.
 * CONTEXT: Delegates final conversion to the shared shell-value helper once evaluation
 *          finishes in the command execution resolution context.
 */
async function resolveStdinInput(stdinSource: unknown, env: Environment): Promise<string> {
  if (stdinSource === null || stdinSource === undefined) {
    return '';
  }

  const result = await evaluate(stdinSource as MlldNode | MlldNode[], env, { isExpression: true });
  let value = result.value;

  if (process.env.MLLD_DEBUG_STDIN === 'true') {
    try {
      console.error('[mlld] stdin evaluate result', JSON.stringify(value));
    } catch {
      console.error('[mlld] stdin evaluate result', value);
    }
  }

  const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
    if (process.env.MLLD_DEBUG_STDIN === 'true') {
      try {
        console.error('[mlld] stdin resolved variable', JSON.stringify(value));
      } catch {
        console.error('[mlld] stdin resolved variable', value);
      }
    }
  }

  return coerceValueForStdin(value);
}

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
      applySecurityDescriptorToStructuredValue(wrapped, descriptor);
      lastOutputDescriptor = descriptor;
      pendingOutputDescriptor = undefined;
    } else {
      lastOutputDescriptor = undefined;
    }
    outputValue = wrapped;
    outputText = asText(wrapped as any);
  };

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
    // Handle command execution
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    const preExtractedCommand = getPreExtractedRunCommand(context);
    // Interpolate command (resolve variables) with shell command context
    const command =
      preExtractedCommand ??
      (await interpolateWithPendingDescriptor(commandNodes, InterpolationContext.ShellCommand));

    const workingDirectory = await resolveWorkingDirectory(
      (directive.values as any)?.workingDir,
      env,
      { sourceLocation: directive.location, directiveType: 'run' }
    );
    const effectiveWorkingDirectory = workingDirectory || env.getExecutionDirectory();
    const commandTaint = deriveCommandTaint({ command });
    mergePendingDescriptor(
      makeSecurityDescriptor({
        taint: commandTaint.taint,
        labels: commandTaint.labels,
        sources: commandTaint.sources
      })
    );

    // Friendly pre-check for oversized simple /run command payloads
    // Rationale: Some environments may not hit ShellCommandExecutor's guard early enough.
    // This check ensures users see a clear suggestion before the shell invocation.
    try {
      const CMD_MAX = (() => {
        const v = process.env.MLLD_MAX_SHELL_COMMAND_SIZE;
        if (!v) return 128 * 1024; // 128KB default
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
      })();
      const cmdBytes = Buffer.byteLength(command || '', 'utf8');
      if (process.env.MLLD_DEBUG === 'true') {
        try { console.error(`[run.ts] /run command size: ${cmdBytes} bytes (max ~${CMD_MAX})`); } catch {}
      }
      if (cmdBytes > CMD_MAX) {
        const message = [
          'Command payload too large for /run execution (may exceed OS args+env limits).',
          `Command size: ${cmdBytes} bytes (max ~${CMD_MAX})`,
          'Suggestions:',
          '- Use `/run sh (@var) { echo "$var" | tool }` or `/exe ... = sh { ... }` to leverage heredocs',
          '- Pass file paths or stream via stdin (printf, here-strings)',
          '- Reduce or split the data',
          '',
          'Learn more: https://mlld.ai/docs/large-variables'
        ].join('\n');
        throw new MlldCommandExecutionError(
          message,
          directive.location,
          {
            command,
            exitCode: 1,
            duration: 0,
            stderr: message,
            workingDirectory: effectiveWorkingDirectory,
            directiveType: 'run'
          },
          env
        );
      }
    } catch (e) {
      if (e instanceof MlldCommandExecutionError) {
        throw e;
      }
      // Non-fatal sizing errors should not block execution
    }
    
    /**
     * Security check before command execution
     * WHY: Commands must be analyzed for potential security risks before execution
     * to prevent command injection, data exfiltration, and system damage.
     * SECURITY: Multi-layer defense with taint tracking, command analysis, and
     * policy enforcement. Blocks dangerous commands and warns about risky ones.
     * CONTEXT: Security manager is optional but when present, all commands are
     * analyzed. Analysis considers both command structure and taint level.
     */
    const security = env.getSecurityManager();
    if (security) {
      // Use command analyzer to check the command
      const securityManager = security as SecurityManager & { commandAnalyzer?: CommandAnalyzer };
      const analyzer = securityManager.commandAnalyzer;
      if (analyzer) {
        const analysis = await analyzer.analyze(command, commandTaint.taint);
        
        // Block immediately dangerous commands
        if (analysis.blocked) {
          const reason = analysis.risks[0]?.description || 'Security policy violation';
        throw new MlldCommandExecutionError(
          `Security: Command blocked - ${reason}`,
          directive.location,
          {
            command,
            exitCode: 1,
            duration: 0,
            stderr: `This command is blocked by security policy: ${reason}`,
            workingDirectory: effectiveWorkingDirectory,
            directiveType: 'run'
          },
          env
        );
        }
        // TODO: Add approval prompts for suspicious commands
        // Temporarily disable security warnings for cleaner output
        /*
        if (analysis.risks.length > 0) {
          console.warn(`⚠️  Security warning for command: ${command}`);
          for (const risk of analysis.risks) {
            console.warn(`   - ${risk.type}: ${risk.description}`);
          }
        }
        */
      }
    }
    
    // Execute the command with context for rich error reporting
    let stdinInput: string | undefined;
    if (withClause && 'stdin' in withClause) {
      stdinInput = await resolveStdinInput(withClause.stdin, env);
    }

    const commandOptions =
      stdinInput !== undefined || workingDirectory
        ? {
            ...(stdinInput !== undefined ? { input: stdinInput } : {}),
            ...(workingDirectory ? { workingDirectory } : {})
          }
        : undefined;
    setOutput(await env.executeCommand(command, commandOptions, {
      ...executionContext,
      streamingEnabled,
      pipelineId,
      suppressTerminal: hasStreamFormat || activeStreamingOptions.suppressTerminal === true,
      workingDirectory
    }));
    
  } else if (directive.subtype === 'runCode') {
    // Handle code execution
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Run code directive missing code');
    }
    
    // Verbatim code (no interpolation) with dedent to avoid top-level indent issues
    const code = dedentCommonIndent(extractRawTextContent(codeNodes));
    const workingDirectory = await resolveWorkingDirectory(
      (directive.values as any)?.workingDir,
      env,
      { sourceLocation: directive.location, directiveType: 'run' }
    );
    
    // Handle arguments passed to code blocks (e.g., /run js (@var1, @var2) {...})
    const args = directive.values?.args || [];
    const argValues: Record<string, any> =
      args.length === 0
        ? {}
        : await AutoUnwrapManager.executeWithPreservation(async () => {
            const extracted: Record<string, any> = {};
            for (let i = 0; i < args.length; i++) {
              const arg = args[i];

              if (arg && typeof arg === 'object' && arg.type === 'VariableReference') {
                // This is a variable reference like @myVar
                const varName = arg.identifier;
                const variable = env.getVariable(varName);
                if (!variable) {
                  throw new Error(`Variable not found: ${varName}`);
                }

                // Extract the variable value
                const { extractVariableValue } = await import('../utils/variable-resolution');
                const value = await extractVariableValue(variable, env);

                // Auto-unwrap LoadContentResult objects
                const unwrappedValue = AutoUnwrapManager.unwrap(value);

                // The parameter name in the code will be the variable name without @
                extracted[varName] = unwrappedValue;
              } else if (typeof arg === 'string') {
                // Simple string argument - shouldn't happen with current grammar
                // but handle it just in case
                extracted[`arg${i}`] = arg;
              }
            }
            return extracted;
          });
    
    // Execute the code (default to JavaScript) with context for errors
    const language = (directive.meta?.language as string) || 'javascript';
    setOutput(await AutoUnwrapManager.executeWithPreservation(async () => {
      return await env.executeCode(
        code,
        language,
        argValues,
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
    
    // Get arguments from the run directive
    const args = directive.values?.args || [];
    const argValues: Record<string, string> = {};
    
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
      setOutput(await env.executeCommand(command, workingDirectory ? { workingDirectory } : undefined, {
        ...executionContext,
        streamingEnabled,
        pipelineId,
        workingDirectory
      }));
      
    } else if (definition.type === 'commandRef') {
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
      
      // Recursively evaluate the referenced command with updated call stack
      // Note: We don't add definition.commandRef here because it will be added 
      // at the beginning of the runExec case when processing refDirective
      const result = await evaluateRun(refDirective, env, callStack);
      setOutput(result.value);
      
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
  const shouldEmitFinalOutput = !hasStreamFormat || !streamingEnabled;
  if (displayText && !directive.meta?.isDataValue && !directive.meta?.isEmbedded && !directive.meta?.isRHSRef && shouldEmitFinalOutput) {
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

function getPreExtractedRunCommand(context?: EvaluationContext): string | undefined {
  if (!context?.extractedInputs || context.extractedInputs.length === 0) {
    return undefined;
  }
  for (const input of context.extractedInputs) {
    if (
      input &&
      typeof input === 'object' &&
      'name' in input &&
      (input as any).name === '__run_command__' &&
      typeof (input as any).value === 'string'
    ) {
      return (input as any).value as string;
    }
  }
  return undefined;
}

function getPreExtractedExec(
  context: EvaluationContext | undefined,
  name: string
): ExecutableVariable | undefined {
  if (!context?.extractedInputs || context.extractedInputs.length === 0) {
    return undefined;
  }
  for (const input of context.extractedInputs) {
    if (
      input &&
      typeof input === 'object' &&
      'name' in input &&
      (input as Variable).name === name &&
      (input as Variable).type === 'executable'
    ) {
      return input as ExecutableVariable;
    }
  }
  return undefined;
}
