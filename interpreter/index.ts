import { parse, parseSync } from '@grammar/parser';
import { Environment } from './env/Environment';
import { DefaultEffectHandler, type EffectHandler } from './env/EffectHandler';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { resolveMlldMode } from '@core/utils/mode';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import * as path from 'path';
import { PathContextBuilder, type PathContext } from '@core/services/PathContextService';
import type {
  InterpretOptions,
  InterpretResult,
  StructuredEffect,
  ExportMap,
  StreamExecution as StreamExecutionHandle,
  SDKEvent
} from '@sdk/types';
import { getExpressionProvenance } from './utils/expression-provenance';
import { makeSecurityDescriptor } from '@core/types/security';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { StreamExecution } from '@sdk/stream-execution';
import { evaluateDirective } from './eval/directive';
import type { DirectiveNode } from '@core/types';

/**
 * Main entry point for the Mlld interpreter.
 * This replaces the complex service orchestration with a simple function.
 */
export async function interpret(
  source: string,
  options: InterpretOptions
): Promise<InterpretResult> {
  // Initialize error patterns on first use
  await initializePatterns();

  const languageMode = resolveMlldMode(
    options.mlldMode,
    options.filePath,
    'strict'
  );
  
  // Parse the source into AST (or use provided AST)
  const parseResult = options.ast
    ? { success: true as const, ast: options.ast }
    : await parse(source, { mode: languageMode });
  
  // Check if parsing was successful
  if (!parseResult.success || (parseResult as any).error) {
    const parseError = (parseResult as any).error || new Error('Unknown parse error');
    
    // Import MlldParseError for proper error handling
    const { MlldParseError, ErrorSeverity } = await import('@core/errors');
    
    // If capture errors is enabled, capture the error and exit
    if (options.captureErrors) {
      const { captureError } = await import('@core/errors/capture');
      const captureDir = await captureError(parseError, source, options.filePath || 'stdin');
      console.log(`Error captured to: ${captureDir}`);
      console.log('Edit the pattern.ts file and test with: mlld error-test ' + captureDir);
      process.exit(1);
    }
    
    // Check if Peggy's format method is available
    let peggyFormatted: string | undefined;
    if (typeof (parseError as any).format === 'function') {
      try {
        // Peggy expects the source to match location.source, but our parser doesn't set it
        // We need to manually set the source in the error's location for format() to work
        const peggyError = parseError as any;
        if (peggyError.location && !peggyError.location.source) {
          peggyError.location.source = options.filePath || 'stdin';
        }
        
        peggyFormatted = peggyError.format([{
          source: options.filePath || 'stdin',
          text: source
        }]);
        
        // Debug: Log what Peggy's format returns
        if (process.env.DEBUG_PEGGY) {
          console.log('Peggy formatted output:');
          console.log(peggyFormatted);
          console.log('---');
        }
      } catch (e) {
        // Fallback - format not available or failed
      }
    }
    
    // Create a proper MlldParseError with location information
    const location = (parseError as any).location;
    const position = location?.start || location || undefined;
    
    // Add filePath to the position/location if we have one
    if (position && options.filePath) {
      if ('line' in position) {
        // It's a Position, convert to Location with filePath
        position.filePath = options.filePath;
      } else {
        // It's a Location, add filePath
        position.filePath = options.filePath;
      }
    }
    
    // Check if we have enhanced location metadata from mlldError
    const mlldLocation = (parseError as any).mlldLocation;
    
    // Use pattern-based error enhancement
    const enhancedError = await enhanceParseError(parseError, source, options.filePath);
    
    // If we got an enhanced error, add peggyFormatted and mlldLocation to its details
    if (enhancedError) {
      enhancedError.details = {
        ...enhancedError.details,
        ...(peggyFormatted && { peggyFormatted }),
        ...(mlldLocation && { mlldLocation }),
        sourceContent: source // Store source for error display
      };
      throw enhancedError;
    }
    
    // Fallback to the old enhancement logic for now
    let enhancedMessage = parseError.message;
    
    // Detect common syntax errors and provide helpful guidance
    if (parseError.message.includes('Expected "@add" or whitespace but "@" found') && 
        source.includes('@text') && source.includes('(') && source.includes('@run')) {
      enhancedMessage = `${parseError.message}\n\n` +
        `Hint: For parameterized commands that execute shell commands, use @exec instead of @text:\n` +
        `  ❌ @text name(param) = @run [(command)]\n` +
        `  ✅ @exec name(param) = @run [(command)]\n\n` +
        `For parameterized text templates, use @add with template syntax:\n` +
        `  ✅ @text name(param) = @add [[template with {{param}}]]`;
    }
    
    throw new MlldParseError(
      enhancedMessage,
      position,
      {
        severity: ErrorSeverity.Fatal,
        cause: parseError,
        filePath: options.filePath,
        context: { 
          ...(peggyFormatted && { peggyFormatted }), 
          sourceContent: source 
        },
        mlldLocation
      }
    );
  }
  
  const mode = options.mode ?? 'document';
  const streamingDisabledEnv = process.env.MLLD_NO_STREAM === 'true';
  const streamingDisabledOption = options.streaming && options.streaming.enabled === false;
  const streamingDisabled = streamingDisabledEnv || streamingDisabledOption;
  const baseStreamingEnabled =
    mode === 'debug'
      ? false
      : options.streaming
        ? options.streaming.enabled !== false
        : !streamingDisabled;
  const streamingOptions = { ...(options.streaming ?? {}), enabled: baseStreamingEnabled };
  const recordEffects = options.recordEffects ?? (mode !== 'document');
  const provenanceEnabled = mode === 'debug' ? true : options.provenance === true;
  
  const ast = parseResult.ast;
  
  // Build or use provided PathContext
  let pathContext: PathContext;
  
  if (options.pathContext) {
    // Use explicitly provided context
    pathContext = options.pathContext;
  } else if (options.filePath) {
    // Build context from file path
    pathContext = await PathContextBuilder.fromFile(
      options.filePath,
      options.fileSystem
    );
  } else {
    // Build default context (stdin or REPL mode)
    const basePath = options.basePath || process.cwd();
    const projectRoot = await findProjectRoot(basePath, options.fileSystem);
    pathContext = {
      projectRoot,
      fileDirectory: basePath,
      executionDirectory: basePath,
      invocationDirectory: process.cwd()
    };
  }
  
  const effectHandler =
    options.effectHandler ??
    new DefaultEffectHandler({
      streaming: streamingOptions.enabled,
      recordEffects
    });

  // Create the root environment with PathContext
  const env = new Environment(
    options.fileSystem,
    options.pathService,
    pathContext,
    undefined,
    effectHandler
  );
  env.setStreamingManager(options.streamingManager ?? new StreamingManager());
  env.setProvenanceEnabled(provenanceEnabled);

  if (options.emitter) {
    env.enableSDKEvents(options.emitter);
  }

  if (options.allowAbsolutePaths !== undefined) {
    env.setAllowAbsolutePaths(options.allowAbsolutePaths);
  }

  if (options.dynamicModuleMode !== undefined) {
    env.setDynamicModuleMode(options.dynamicModuleMode);
  }

  // Test-only hook: if a resolverManager with fetchURL is provided, shim global fetch
  if ((options as any).resolverManager && typeof (options as any).resolverManager.fetchURL === 'function') {
    const rm = (options as any).resolverManager;
    (globalThis as any).__mlldFetchOverride = rm.fetchURL.bind(rm);
    (globalThis as any).fetch = async (url: string, _init?: any) => {
      const response = await rm.fetchURL(url);
      // If response already resembles a fetch Response, return it as-is
      if (response && typeof response.ok === 'boolean' && typeof response.text === 'function') {
        return response;
      }
      // Otherwise, wrap as a minimal Response-like object
      return {
        ok: true,
        text: async () => String(response)
      } as any;
    };
  }

  // Register built-in resolvers (async initialization)
  await env.registerBuiltinResolvers();

  if (options.dynamicModules && Object.keys(options.dynamicModules).length > 0) {
    const userDataModules: Record<string, string | Record<string, unknown>> = {};
    const otherModules: Record<string, string | Record<string, unknown>> = {};

    for (const [key, value] of Object.entries(options.dynamicModules)) {
      const normalized = key.toLowerCase();
      if (normalized === '@payload' || normalized === '@state') {
        userDataModules[key] = value;
      } else {
        otherModules[key] = value;
      }
    }

    if (Object.keys(userDataModules).length > 0) {
      env.registerDynamicModules(userDataModules, options.dynamicModuleSource, { literalStrings: true });
    }

    if (Object.keys(otherModules).length > 0) {
      env.registerDynamicModules(otherModules, options.dynamicModuleSource);
    }
  }

  // Configure local modules after resolvers are ready
  await env.configureLocalModules();
  
  // Set the current file path if provided (for error reporting)
  if (options.filePath) {
    env.setCurrentFilePath(options.filePath);
  }
  
  // Configure URL settings if provided
  if (options.urlConfig) {
    env.setURLConfig(options.urlConfig);
  }
  
  // Set output options if provided
  if (options.outputOptions) {
    env.setOutputOptions(options.outputOptions);
  }

  env.setStreamingOptions(streamingOptions);
  
  // Set stdin content if provided
  if (options.stdinContent !== undefined) {
    env.setStdinContent(options.stdinContent);
  }
  
  // Set import approval bypass if provided
  if (options.approveAllImports) {
    env.setApproveAllImports(options.approveAllImports);
  }
  
  // Set blank line normalization flag (default: true)
  if (options.normalizeBlankLines !== undefined) {
    env.setNormalizeBlankLines(options.normalizeBlankLines);
  }
  
  
  // Set trace enabled (default: true)
  if (options.enableTrace !== undefined) {
    env.setTraceEnabled(options.enableTrace);
  }
  
  // Set fuzzy matching for local files (default: true)
  if (options.localFileFuzzyMatch !== undefined) {
    env.setLocalFileFuzzyMatch(options.localFileFuzzyMatch);
  }
  
  // Set ephemeral mode if provided
  if (options.ephemeral) {
    await env.setEphemeralMode(options.ephemeral);
  }

  await applyConfigPolicyImports(env);
  
  // Cache the source content for error reporting
  if (options.filePath) {
    env.cacheSource(options.filePath, source);
  } else {
    env.cacheSource('<stdin>', source);
  }
  
  // Evaluate the AST
  const runExecution = async (): Promise<string> => {
    await evaluate(ast, env);

    // Flush any pending breaks before getting final output
    env.renderOutput();

    // Display collected errors with rich formatting if enabled
    if (options.outputOptions?.collectErrors) {
      await env.displayCollectedErrors();
    }

    // Get the document from the effect handler
    const activeEffectHandler = env.getEffectHandler();
    let output: string;
    
    if (activeEffectHandler && typeof activeEffectHandler.getDocument === 'function') {
      // Get the accumulated document from the effect handler
      output = activeEffectHandler.getDocument();

      // Apply output normalization if requested (default format is markdown)
      const format = options.format || 'markdown';
      if (options.useMarkdownFormatter !== false && format === 'markdown') {
        const { normalizeOutput } = await import('./output/normalizer');
        output = normalizeOutput(output);
      }
    } else {
      // Fallback to old node-based system if effect handler doesn't have getDocument
      const nodes = env.getNodes();
      
      if (process.env.DEBUG_WHEN) {
        console.log('Final nodes count:', nodes.length);
        nodes.forEach((node, i) => {
          console.log(`Node ${i}:`, node.type, node.type === 'Text' ? node.content : '');
        });
      }
      
      // Format the output
      output = await formatOutput(nodes, {
        format: options.format || 'markdown',
        variables: env.getAllVariables(),
        useMarkdownFormatter: options.useMarkdownFormatter,
        normalizeBlankLines: options.normalizeBlankLines
      });
    }
    
    // Call captureEnvironment callback if provided
    if (options.captureEnvironment) {
      options.captureEnvironment(env);
    }

    return output;
  };

  if (mode === 'stream') {
    const emitter = options.emitter ?? new ExecutionEmitter();
    const streamExecution = new StreamExecution(emitter, {
      abort: () => {
        env.cleanup();
      }
    });
    env.enableSDKEvents(emitter);

    void (async () => {
      try {
        const output = await runExecution();
        const structured = buildStructuredResult(env, output, provenanceEnabled);
        emitter.emit({ type: 'execution:complete', result: structured, timestamp: Date.now() });
        streamExecution.resolve(structured);
      } catch (error) {
        streamExecution.reject(error);
      }
    })();

    return streamExecution as unknown as StreamExecutionHandle;
  }

  const debugTrace: SDKEvent[] = [];
  let debugEmitter: ExecutionEmitter | undefined;
  const debugStart = Date.now();

  if (mode === 'debug') {
    debugEmitter = options.emitter ?? new ExecutionEmitter();
    const eventTypes: SDKEvent['type'][] = [
      'effect',
      'command:start',
      'command:complete',
      'stream:chunk',
      'stream:progress',
      'execution:complete',
      'debug:directive:start',
      'debug:directive:complete',
      'debug:variable:create',
      'debug:variable:access',
      'debug:guard:before',
      'debug:guard:after',
      'debug:export:registered',
      'debug:import:dynamic'
    ];
    for (const type of eventTypes) {
      debugEmitter.on(type, event => debugTrace.push(event));
    }
    env.enableSDKEvents(debugEmitter);
  }

  const output = await runExecution();

  if (mode === 'structured') {
    return buildStructuredResult(env, output, provenanceEnabled);
  }

  if (mode === 'debug') {
    const structured = buildStructuredResult(env, output, provenanceEnabled);
    const variables = Object.fromEntries(env.getAllVariables());
    const durationMs = Date.now() - debugStart;
    const debugResult = {
      ...structured,
      ast: ast as any,
      variables,
      trace: debugTrace,
      directiveTrace: env.getDirectiveTrace(),
      durationMs
    };
    return debugResult;
  }

  if (mode !== 'document') {
    throw new Error(`Interpret mode '${mode}' is not implemented yet.`);
  }

  return output;
}

// Re-export key types for convenience
export { Environment } from './env/Environment';
export type { EvalResult } from './core/interpreter';
export type { InterpretOptions, InterpretResult } from '@sdk/types';

function buildStructuredResult(env: Environment, output: string, provenanceEnabled?: boolean) {
  const resolvedProvenance = provenanceEnabled ?? env.isProvenanceEnabled();
  const effects = collectEffects(env.getEffectHandler(), resolvedProvenance);
  const exports = collectExports(env, resolvedProvenance);
  const streaming = env.getStreamingResult?.();
  return {
    output,
    effects,
    exports,
    stateWrites: env.getStateWrites(),
    environment: env,
    ...(streaming ? { streaming } : {})
  };
}

function collectEffects(handler: EffectHandler | undefined, provenanceEnabled: boolean): StructuredEffect[] {
  if (!handler || typeof handler.getEffects !== 'function') {
    return [];
  }
  return handler.getEffects().map(effect => ({
    ...effect,
    security: effect.capability?.security ?? makeSecurityDescriptor(),
    ...(provenanceEnabled && {
      provenance: (effect as any).provenance ?? effect.capability?.security ?? makeSecurityDescriptor()
    })
  }));
}

function collectExports(env: Environment, provenanceEnabled: boolean): ExportMap {
  const manifest = env.getExportManifest();
  const exports: ExportMap = {};
  if (!manifest) {
    return exports;
  }

  for (const name of manifest.getNames()) {
    const variableName = name.startsWith('@') ? name.slice(1) : name;
    const variable = env.getVariable(variableName);
    if (!variable) continue;
    const provenance =
      provenanceEnabled
        ? getExpressionProvenance(variable.value) ??
          variable.metadata?.security ??
          variable.security ??
          makeSecurityDescriptor()
        : undefined;
    exports[name] = {
      name,
      value: env.getVariableValue(variableName),
      metadata: {
        capability: variable.capability ?? variable.metadata?.capability,
        security:
          variable.metadata?.security ??
          variable.security ??
          makeSecurityDescriptor(),
        ...(provenance && { provenance })
      }
    };
  }

  return exports;
}

function derivePolicyAlias(reference: string, index: number, used: Set<string>): string {
  const strippedRegistry = reference.replace(/^registry:@/, '').replace(/^@/, '');
  const parts = strippedRegistry.split(/[\\/]/);
  const lastPart = parts[parts.length - 1] || '';
  const baseName = lastPart.replace(/\.[^.]+$/, '') || `policy${index + 1}`;
  let alias = baseName.replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(alias)) {
    alias = `policy_${alias}`;
  }
  if (!alias) {
    alias = `policy${index + 1}`;
  }

  let candidate = alias;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${alias}_${counter++}`;
  }
  used.add(candidate);
  return candidate;
}

async function applyConfigPolicyImports(env: Environment): Promise<void> {
  const projectConfig = env.getProjectConfig?.();
  if (!projectConfig) {
    return;
  }

  const policyImports = projectConfig.getPolicyImports?.() ?? [];
  const policyEnvironment = projectConfig.getPolicyEnvironment?.();
  if (policyImports.length === 0 && !policyEnvironment) {
    return;
  }

  const configPath = projectConfig.getConfigFilePath?.();
  const previousFilePath = env.getCurrentFilePath();
  if (configPath) {
    env.setCurrentFilePath(configPath);
  }

  const usedAliases = new Set<string>();
  for (let i = 0; i < policyImports.length; i++) {
    const reference = policyImports[i];
    const alias = derivePolicyAlias(reference, i, usedAliases);
    const directiveSource = `/import policy @${alias} from "${reference}"`;
    const nodes = parseSync(directiveSource);
    const directive = nodes[0] as DirectiveNode;
    await evaluateDirective(directive, env);
  }

  if (policyEnvironment) {
    env.setPolicyEnvironment(policyEnvironment);
  }

  if (configPath) {
    env.setCurrentFilePath(previousFilePath);
  }
}
