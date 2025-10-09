import type { DirectiveNode, TextNode, MlldNode, VariableReference, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableVariable, ExecutableDefinition } from '@core/types/executable';
import { interpolate, evaluate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldCommandExecutionError } from '@core/errors';
import { TaintLevel } from '@security/taint';
import type { CommandAnalyzer, CommandAnalysis, CommandRisk } from '@security/command/analyzer/CommandAnalyzer';
import type { SecurityManager } from '@security/SecurityManager';
import { isExecutableVariable, createSimpleTextVariable } from '@core/types/variable';
import { executePipeline } from './pipeline';
import { checkDependencies, DefaultDependencyChecker } from './dependencies';
import { logger } from '@core/utils/logger';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { wrapExecResult } from '../utils/structured-exec';
import { asText, isStructuredValue } from '../utils/structured-value';
import { coerceValueForStdin } from '../utils/shell-value';

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
 * Determine the taint level of command arguments
 * WHY: Commands containing variables may include untrusted data from LLM outputs,
 * user inputs, or external sources that could enable command injection attacks.
 * SECURITY: Variables are conservatively marked as potentially tainted to trigger
 * additional security analysis before execution.
 * GOTCHA: Currently uses simple heuristic - any variable reference triggers taint.
 * Future versions should track actual data flow from untrusted sources.
 * CONTEXT: Called before every command execution to determine security analysis level.
 * TODO: Implement proper taint tracking through variable propagation
 */
function determineTaintLevel(nodes: MlldNode[], env: Environment): TaintLevel {
  // For now, use a simple heuristic:
  // - If any variable is used, assume it could be tainted
  // - TODO: Implement proper taint tracking through variable propagation
  
  for (const node of nodes) {
    if (node.type === 'VariableReference') {
      // Check if this variable came from LLM output or user input
      const varName = node.identifier;
      if (varName) {
        // TODO: Get actual taint level from variable metadata
        // For now, be conservative and assume variables could be tainted
        return TaintLevel.REGISTRY_WARNING;
      }
    }
  }
  
  // Literal commands are trusted
  return TaintLevel.TRUSTED;
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
  callStack: string[] = []
): Promise<EvalResult> {
  // Check if we're importing - skip execution if so
  if (env.getIsImporting()) {
    return { value: null, env };
  }

  let outputValue: unknown;
  let outputText: string;

  const setOutput = (value: unknown) => {
    const wrapped = wrapExecResult(value);
    outputValue = wrapped;
    outputText = asText(wrapped as any);
  };

  setOutput('');
  // Track source node to optionally enable stage-0 retry
  let sourceNodeForPipeline: any | undefined;

  // Create execution context with source information
  const executionContext = {
    sourceLocation: directive.location,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: directive.meta?.directiveType as string || 'run'
  };
  
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
  
  if (directive.subtype === 'runCommand') {
    // Handle command execution
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    // Interpolate command (resolve variables) with shell command context
    const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);

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
            workingDirectory: env.getBasePath(),
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
      // Determine taint level based on command nodes
      const taintLevel = determineTaintLevel(commandNodes, env);
      
      // Use command analyzer to check the command
      const securityManager = security as SecurityManager & { commandAnalyzer?: CommandAnalyzer };
      const analyzer = securityManager.commandAnalyzer;
      if (analyzer) {
        const analysis = await analyzer.analyze(command, taintLevel);
        
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
              workingDirectory: env.getBasePath(),
              directiveType: 'run'
            },
            env
          );
        }
        
        // Block LLM output execution
        if (taintLevel === TaintLevel.LLM_OUTPUT) {
          throw new MlldCommandExecutionError(
            'Security: Cannot execute LLM-generated commands',
            directive.location,
            {
              command,
              exitCode: 1,
              duration: 0,
              stderr: 'Commands generated by LLMs cannot be executed for security reasons',
              workingDirectory: env.getBasePath(),
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

    const commandOptions = stdinInput !== undefined ? { input: stdinInput } : undefined;
    setOutput(await env.executeCommand(command, commandOptions, executionContext));
    
  } else if (directive.subtype === 'runCode') {
    // Handle code execution
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Run code directive missing code');
    }
    
    // Verbatim code (no interpolation) with dedent to avoid top-level indent issues
    const code = dedentCommonIndent(extractRawTextContent(codeNodes));
    
    // Handle arguments passed to code blocks (e.g., /run js (@var1, @var2) {...})
    const args = directive.values?.args || [];
    const argValues: Record<string, any> = {};
    
    if (args.length > 0) {
      // Process each argument
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
          argValues[varName] = unwrappedValue;
        } else if (typeof arg === 'string') {
          // Simple string argument - shouldn't happen with current grammar
          // but handle it just in case
          argValues[`arg${i}`] = arg;
        }
      }
    }
    
    // Execute the code (default to JavaScript) with context for errors
    const language = (directive.meta?.language as string) || 'javascript';
    setOutput(await AutoUnwrapManager.executeWithPreservation(async () => {
      return await env.executeCode(code, language, argValues, executionContext);
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
      
      // Extract Variable value for field access - WHY: Need raw object to navigate fields
      const { extractVariableValue } = await import('../utils/variable-resolution');
      let value = await extractVariableValue(baseVar, env);
      
      // Navigate through the field access chain
      for (const field of varRef.fields) {
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
        let capturedShadowEnvs = value.metadata?.capturedShadowEnvs;
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
          metadata: {
            ...(value.metadata || {}),
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
      
      const variable = env.getVariable(commandName);
      if (!variable || !isExecutableVariable(variable)) {
        throw new Error(`Executable variable not found: ${commandName}`);
      }
      execVar = variable;
    }
    
    // Get the executable definition from metadata
    const definition = execVar.metadata?.executableDef as ExecutableDefinition;
    if (!definition) {
      // For field access, provide more helpful error message
      const fullPath = identifierNode.type === 'VariableReference' && (identifierNode as VariableReference).fields && (identifierNode as VariableReference).fields.length > 0
        ? `${(identifierNode as VariableReference).identifier}.${(identifierNode as VariableReference).fields.map(f => f.value).join('.')}`
        : commandName;
      throw new Error(`Executable ${fullPath} has no definition in metadata`);
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
          argValue = await interpolate([arg], env, InterpolationContext.Default);
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
      
      // TODO: Remove this workaround when issue #51 is fixed
      // Strip leading '[' from first command segment if present
      const cleanTemplate = definition.commandTemplate.map((seg: MlldNode, idx: number) => {
        if (idx === 0 && seg.type === 'Text' && 'content' in seg && seg.content.startsWith('[')) {
          return { ...seg, content: seg.content.substring(1) };
        }
        return seg;
      });
      
      // Interpolate the command template with parameters
      const command = await interpolate(cleanTemplate, tempEnv, InterpolationContext.ShellCommand);
      
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
                workingDirectory: env.getBasePath(),
                directiveType: 'run'
              },
              env
            );
          }
        }
      }
      
      // Pass context for exec command errors too
      setOutput(await env.executeCommand(command, undefined, executionContext));
      
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
      // Interpolate the code template with parameters
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
      }
      
      // Interpolate executable code templates with parameters (canonical behavior)
      const code = await interpolate(definition.codeTemplate, tempEnv, InterpolationContext.ShellCommand);
      if (process.env.DEBUG_EXEC) {
        logger.debug('run.ts code execution debug:', {
          codeTemplate: definition.codeTemplate,
          interpolatedCode: code,
          argValues
        });
      }
      
      // Pass captured shadow environments to code execution
      const codeParams = { ...argValues };
      const capturedEnvs = execVar.metadata?.capturedShadowEnvs;
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
        const rawValue = whenResult.value as any;
        if (rawValue && typeof rawValue === 'object' && (rawValue as any).__whenEffect === 'show') {
          setOutput((rawValue as any).text ?? '');
        } else if (isStructuredValue(rawValue) && rawValue.data && typeof rawValue.data === 'object' && (rawValue.data as any).__whenEffect === 'show') {
          setOutput((rawValue.data as any).text ?? asText(rawValue));
        } else {
          setOutput(rawValue);
        }
        
        logger.debug('🎯 mlld-when result:', {
          outputType: typeof outputValue,
          outputValue: outputText.substring(0, 100)
        });
      } else {
        setOutput(await AutoUnwrapManager.executeWithPreservation(async () => {
          return await env.executeCode(code, definition.language || 'javascript', codeParams, executionContext);
        }));
      }
    } else if (definition.type === 'template') {
      // Handle template executables
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
      }
      
      setOutput(await interpolate(definition.template, tempEnv, InterpolationContext.Default));
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
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execInvocation, env);
    setOutput(result.value);
    sourceNodeForPipeline = execInvocation;
    
  } else if (directive.subtype === 'runExecReference') {
    // Handle exec reference nodes in run directive (from @when actions)
    const execRef = directive.values?.execRef;
    if (!execRef) {
      throw new Error('Run exec reference directive missing exec reference');
    }

    // Evaluate the exec invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execRef, env);
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
    // Check dependencies first if specified
    if (withClause.needs) {
      const checker = new DefaultDependencyChecker();
      await checkDependencies(withClause.needs, checker, directive.location);
    }
    
    // Apply pipeline transformations if specified
    if (withClause.pipeline && withClause.pipeline.length > 0) {
      // Use unified pipeline processor
      const { processPipeline } = await import('./pipeline/unified-processor');
      // Stage-0 retry is always enabled when we have a source node
      const enableStage0 = !!sourceNodeForPipeline;
      const pipelineInput = outputValue;
      const valueForPipeline = enableStage0
        ? { value: pipelineInput, metadata: { isRetryable: true, sourceFunction: sourceNodeForPipeline } }
        : pipelineInput;
      const pipelineResult = await processPipeline({
        value: valueForPipeline,
        env,
        directive,
        pipeline: withClause.pipeline,
        format: withClause.format as string | undefined,
        isRetryable: enableStage0,
        location: directive.location
      });
      setOutput(pipelineResult);
    }
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
  if (displayText && !directive.meta?.isDataValue && !directive.meta?.isEmbedded && !directive.meta?.isRHSRef) {
    env.emitEffect('both', displayText);
  }
  
  // Return the output value
  return {
    value: outputValue,
    env
  };
}
