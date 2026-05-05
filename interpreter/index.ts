import { randomUUID } from 'node:crypto';
import { parse, parseSync } from '@grammar/parser';
import { Environment } from './env/Environment';
import { DefaultEffectHandler, type EffectHandler } from './env/EffectHandler';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { resolveMlldMode } from '@core/utils/mode';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import { PathContextBuilder, type PathContext } from '@core/services/PathContextService';
import type {
  InterpretOptions,
  InterpretResult,
  StructuredEffect,
  ExportMap,
  StreamExecution as StreamExecutionHandle,
  SDKEvent
} from '@sdk/types';
import { getExpressionProvenance, setExpressionProvenance } from './utils/expression-provenance';
import { makeSecurityDescriptor } from '@core/types/security';
import { resolveIdentity, SigService } from '@core/security';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import {
  createArrayVariable,
  createObjectVariable,
  createSimpleTextVariable,
  type Variable,
  VariableMetadataUtils
} from '@core/types/variable';
import {
  applySecurityDescriptorToStructuredValue,
  ensureStructuredValue,
  isStructuredValue
} from './utils/structured-value';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { StreamExecution } from '@sdk/stream-execution';
import { evaluateDirective } from './eval/directive';
import type { DirectiveNode } from '@core/types';
import { isExeReturnControl } from './eval/exe-return';
import { boundary } from './utils/boundary';
import { CheckpointManager } from './checkpoint/CheckpointManager';
import { resolveCheckpointScriptName } from './checkpoint/script-name';
import { extractLeadingResumeDirective } from '@core/checkpoint/config';
import { DEFAULT_SCRIPT_CHECKPOINT_RESUME_MODE } from '@interpreter/checkpoint/policy';
import { finalizePendingCheckpointScope } from './eval/checkpoint';
import { VirtualFS } from '@services/fs/VirtualFS';
import { createExecutionFileWriter } from '@cli/commands/live-stdio-security';

function validateCheckpointOptions(options: InterpretOptions): void {
  if (options.noCheckpoint !== true) {
    return;
  }

  if (options.fresh || options.resume !== undefined || typeof options.fork === 'string') {
    throw new Error(
      'Cannot combine --no-checkpoint with --new/--fresh, --resume, or --fork.'
    );
  }
}

type ParsedResumeTarget =
  | { kind: 'function'; functionName: string }
  | { kind: 'function-index'; functionName: string; invocationIndex: number }
  | { kind: 'function-prefix'; functionName: string; prefix: string; invocationIndex?: number }
  | { kind: 'named-checkpoint'; checkpointName: string };

function parseResumePrefix(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    return null;
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'");
  }

  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1).replace(/\\`/g, '`');
  }

  return null;
}

function parseResumeTarget(target: string): ParsedResumeTarget | null {
  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }

  const parseFunctionTarget = (
    rawTarget: string,
    opts: { requireAtPrefix: boolean; allowBareFunction: boolean }
  ): ParsedResumeTarget | null => {
    const prefix = opts.requireAtPrefix ? '@' : '';
    const fuzzyMatch = rawTarget.match(new RegExp(`^${prefix}([^\\s:()]+)(?::(\\d+))?\\((.*)\\)$`));
    if (fuzzyMatch) {
      const functionName = fuzzyMatch[1];
      const invocationIndex =
        fuzzyMatch[2] !== undefined ? Number.parseInt(fuzzyMatch[2], 10) : undefined;
      const parsedPrefix = parseResumePrefix(fuzzyMatch[3]);
      if (!functionName || parsedPrefix === null) {
        return null;
      }
      if (invocationIndex !== undefined && !Number.isInteger(invocationIndex)) {
        return null;
      }
      return {
        kind: 'function-prefix',
        functionName,
        prefix: parsedPrefix,
        ...(invocationIndex === undefined ? {} : { invocationIndex })
      };
    }

    const indexedMatch = rawTarget.match(new RegExp(`^${prefix}([^\\s:()]+):(\\d+)$`));
    if (indexedMatch) {
      const functionName = indexedMatch[1];
      const invocationIndex = Number.parseInt(indexedMatch[2], 10);
      if (!functionName || !Number.isInteger(invocationIndex)) {
        return null;
      }
      return { kind: 'function-index', functionName, invocationIndex };
    }

    const functionMatch = rawTarget.match(new RegExp(`^${prefix}([^\\s:()]+)$`));
    if (opts.allowBareFunction && functionMatch) {
      const functionName = functionMatch[1];
      if (!functionName) {
        return null;
      }
      return { kind: 'function', functionName };
    }

    return null;
  };

  if (trimmed.startsWith('@')) {
    return parseFunctionTarget(trimmed, { requireAtPrefix: true, allowBareFunction: true });
  }

  // Backward compatibility: legacy unprefixed function target forms.
  const legacyFunctionTarget = parseFunctionTarget(trimmed, {
    requireAtPrefix: false,
    allowBareFunction: false
  });
  if (legacyFunctionTarget) {
    return legacyFunctionTarget;
  }

  const namedCheckpoint = parseResumePrefix(trimmed);
  if (namedCheckpoint !== null) {
    return { kind: 'named-checkpoint', checkpointName: namedCheckpoint };
  }

  return { kind: 'named-checkpoint', checkpointName: trimmed };
}

function readLiteralCheckpointName(rawName: unknown): string | null {
  if (typeof rawName === 'string') {
    return rawName.trim();
  }
  if (rawName && typeof rawName === 'object') {
    const literal = rawName as Record<string, unknown>;
    if (literal.type === 'Literal' && typeof literal.value === 'string') {
      return literal.value.trim();
    }
  }
  return null;
}

function collectDeclaredCheckpointNames(ast: readonly unknown[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const readCheckpointContext = (value: Record<string, unknown>): string | undefined => {
    const meta =
      value.meta && typeof value.meta === 'object'
        ? (value.meta as Record<string, unknown>)
        : undefined;
    return typeof meta?.checkpointContext === 'string' ? meta.checkpointContext : undefined;
  };

  const visit = (node: unknown, insideExeBody: boolean): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, insideExeBody);
      }
      return;
    }

    const value = node as Record<string, unknown>;
    const isDirective = value.type === 'Directive';
    const isCheckpoint = isDirective && value.kind === 'checkpoint';
    const isExeDirective = isDirective && value.kind === 'exe';

    if (isCheckpoint) {
      const values =
        value.values && typeof value.values === 'object'
          ? (value.values as Record<string, unknown>)
          : undefined;
      const literalName = readLiteralCheckpointName(values?.name);
      const checkpointContext = readCheckpointContext(value);
      const isValidCheckpointContext =
        checkpointContext === undefined || checkpointContext === 'top-level-when-direct';
      if (literalName && !insideExeBody && isValidCheckpointContext && !seen.has(literalName)) {
        seen.add(literalName);
        names.push(literalName);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const childInsideExeBody = isExeDirective && key === 'values' ? true : insideExeBody;
      visit(child, childInsideExeBody);
    }
  };

  visit(ast, false);
  return names;
}

function hasPolicyDirective(ast: readonly unknown[]): boolean {
  return ast.some((node) => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    const directive = node as { type?: unknown; kind?: unknown };
    return directive.type === 'Directive' && directive.kind === 'policy';
  });
}

function resolveSigFileSystem(fileSystem: IFileSystemService): IFileSystemService {
  if (fileSystem instanceof VirtualFS) {
    return fileSystem.getBackingFileSystem() ?? fileSystem;
  }
  return fileSystem;
}

const RUNTIME_OBJECT_SOURCE = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
} as const;

const RUNTIME_VALUE_SOURCE = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function normalizePayloadLabels(
  payloadLabels?: Record<string, readonly string[]>
): Record<string, string[]> | undefined {
  if (!payloadLabels || typeof payloadLabels !== 'object') {
    return undefined;
  }

  const normalized: Record<string, string[]> = {};
  for (const [key, labels] of Object.entries(payloadLabels)) {
    if (!Array.isArray(labels)) {
      continue;
    }

    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const label of labels) {
      if (typeof label !== 'string') {
        continue;
      }
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      deduped.push(trimmed);
    }

    if (deduped.length > 0) {
      normalized[key] = deduped;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function applyPayloadFieldDescriptor(value: unknown, labels: readonly string[]): unknown {
  const descriptor = makeSecurityDescriptor({ labels: Array.from(labels) });

  if (isStructuredValue(value)) {
    applySecurityDescriptorToStructuredValue(value, descriptor);
    return value;
  }

  if (value && typeof value === 'object') {
    setExpressionProvenance(value, descriptor);
    return value;
  }

  const structured = ensureStructuredValue(value);
  applySecurityDescriptorToStructuredValue(structured, descriptor);
  return structured;
}

function applyPayloadFieldLabels(
  payloadValue: unknown,
  payloadLabels?: Record<string, string[]>
): unknown {
  if (!payloadLabels || !payloadValue || typeof payloadValue !== 'object' || Array.isArray(payloadValue)) {
    return payloadValue;
  }

  const payloadObject = payloadValue as Record<string, unknown>;
  const decorated: Record<string, unknown> = { ...payloadObject };

  for (const [field, labels] of Object.entries(payloadLabels)) {
    if (!(field in decorated)) {
      continue;
    }
    decorated[field] = applyPayloadFieldDescriptor(decorated[field], labels);
  }

  return decorated;
}

function createRuntimePayloadVariable(payloadValue: unknown): Variable {
  if (Array.isArray(payloadValue)) {
    return createArrayVariable('payload', payloadValue, true, RUNTIME_OBJECT_SOURCE);
  }

  if (payloadValue && typeof payloadValue === 'object') {
    return createObjectVariable('payload', payloadValue as Record<string, unknown>, true, RUNTIME_OBJECT_SOURCE);
  }

  return createSimpleTextVariable(
    'payload',
    payloadValue === undefined || payloadValue === null ? '' : String(payloadValue),
    RUNTIME_VALUE_SOURCE
  );
}

function buildPayloadMetadataMap(payloadLabels?: Record<string, string[]>) {
  if (!payloadLabels) {
    return undefined;
  }

  const metadataMap = Object.fromEntries(
    Object.entries(payloadLabels)
      .map(([field, labels]) => [
        field,
        VariableMetadataUtils.serializeSecurityMetadata({
          security: makeSecurityDescriptor({ labels })
        })
      ])
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>>] => Boolean(entry[1]))
  );

  return Object.keys(metadataMap).length > 0 ? metadataMap : undefined;
}

async function applyResumeTargetInvalidation(
  checkpointManager: CheckpointManager,
  resume: string | true | undefined
): Promise<void> {
  if (resume === undefined || resume === true) {
    return;
  }

  const parsed = parseResumeTarget(resume);
  if (!parsed) {
    throw new Error(
      `Invalid --resume target "${resume}". Expected checkpoint-name, @function, @function:index, or @function("prefix").`
    );
  }

  if (parsed.kind === 'named-checkpoint') {
    await checkpointManager.invalidateFromNamedCheckpoint(parsed.checkpointName);
    return;
  }

  if (parsed.kind === 'function') {
    await checkpointManager.invalidateFunction(parsed.functionName);
    return;
  }

  if (parsed.kind === 'function-index') {
    await checkpointManager.invalidateFunctionSite(parsed.functionName, parsed.invocationIndex);
    return;
  }

  await checkpointManager.invalidateFunctionFrom(
    parsed.functionName,
    parsed.prefix,
    parsed.invocationIndex
  );
}

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
  validateCheckpointOptions(options);

  const languageMode = resolveMlldMode(
    options.mlldMode,
    options.filePath,
    'strict'
  );
  
  // Parse the source into AST (or use provided AST). Pass grammarSource so
  // every node's location.source carries the entry-point file path — without
  // this, downstream evaluators fall back to env.getCurrentFilePath(), which
  // mis-attributes cross-module errors (e.g. recursion guards) to the wrong
  // file.
  const parseResult = options.ast
    ? { success: true as const, ast: options.ast }
    : await parse(source, { mode: languageMode, grammarSource: options.filePath });
  
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
  const streamingDisabledEnv =
    process.env.MLLD_NO_STREAM === 'true' || process.env.MLLD_NO_STREAMING === 'true';
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
  const leadingResumeDirective = extractLeadingResumeDirective(source);
  const scriptResumeMode =
    leadingResumeDirective.resumeMode ?? DEFAULT_SCRIPT_CHECKPOINT_RESUME_MODE;
  const declaredCheckpointNames = collectDeclaredCheckpointNames(ast);
  
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
  env.setSigService(new SigService(pathContext.projectRoot, resolveSigFileSystem(options.fileSystem)));
  env.setRetainCompletedSessionHistory(mode !== 'document');
  const signingIdentity = (options as { signingIdentity?: unknown }).signingIdentity;
  const signingContext = (options as { signingContext?: Record<string, unknown> | undefined }).signingContext;
  env.setSignerIdentity(
    typeof signingIdentity === 'string' && signingIdentity.trim().length > 0
      ? signingIdentity.trim()
      : await resolveIdentity({
          tier: 'agent',
          projectRoot: pathContext.projectRoot,
          fileSystem: resolveSigFileSystem(options.fileSystem),
          scriptPath: options.filePath,
          ...(signingContext && typeof signingContext === 'object' ? signingContext : {})
        })
  );
  env.setStreamingManager(options.streamingManager ?? new StreamingManager());
  if ((options as any).mcpServers) {
    env.setMcpServerMap((options as any).mcpServers);
  }
  env.setProvenanceEnabled(provenanceEnabled);
  env.setCheckpointScriptResumeMode(scriptResumeMode);
  env.setCheckpointResumeOverride(options.resume !== undefined);

  const checkpointScriptName = resolveCheckpointScriptName(
    options.filePath,
    options.checkpointScriptName
  );
  if (options.noCheckpoint !== true && checkpointScriptName) {
    env.setCheckpointManagerFactory(async () => {
      const checkpointManager = new CheckpointManager(checkpointScriptName, {
        scriptPath: options.filePath,
        ...(typeof options.fork === 'string' && options.fork.length > 0
          ? { forkScriptName: options.fork }
          : {}),
        ...(typeof options.checkpointCacheRootDir === 'string' &&
        options.checkpointCacheRootDir.length > 0
          ? { cacheRootDir: options.checkpointCacheRootDir }
          : {})
      });
      await checkpointManager.load();
      if (options.fresh) {
        await checkpointManager.clear();
      }
      checkpointManager.augmentNamedCheckpointsFromSource(declaredCheckpointNames);
      await applyResumeTargetInvalidation(checkpointManager, options.resume);
      checkpointManager.beginRun();
      return checkpointManager;
    });

    const shouldEagerInitializeCheckpoint =
      options.fresh === true ||
      options.resume !== undefined ||
      (typeof options.fork === 'string' && options.fork.length > 0);

    if (shouldEagerInitializeCheckpoint) {
      await env.ensureCheckpointManager();
    }
  } else {
    env.setCheckpointManagerFactory(undefined);
  }

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

  if (hasPolicyDirective(ast)) {
    await env.getSigService()?.init();
  }

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
      const payloadKey = Object.prototype.hasOwnProperty.call(userDataModules, '@payload')
        ? '@payload'
        : Object.prototype.hasOwnProperty.call(userDataModules, '@Payload')
          ? '@Payload'
          : null;
      const stateKey = Object.prototype.hasOwnProperty.call(userDataModules, '@state')
        ? '@state'
        : Object.prototype.hasOwnProperty.call(userDataModules, '@State')
          ? '@State'
          : null;
      const payloadLabels = normalizePayloadLabels(options.payloadLabels);

      if (payloadKey) {
        const payloadValue = userDataModules[payloadKey];
        const payloadMetadataMap = buildPayloadMetadataMap(payloadLabels);
        env.registerDynamicModules(
          { [payloadKey]: payloadValue },
          options.dynamicModuleSource,
          {
            literalStrings: true,
            moduleFieldLabels: payloadLabels ? { [payloadKey]: payloadLabels } : undefined
          }
        );

        const decoratedPayloadValue = applyPayloadFieldLabels(payloadValue, payloadLabels);
        env.recordKnownUrlsFromValue(decoratedPayloadValue);
        const payloadVar = createRuntimePayloadVariable(decoratedPayloadValue);
        payloadVar.internal = {
          ...(payloadVar.internal ?? {}),
          ...(payloadMetadataMap ? { namespaceMetadata: payloadMetadataMap } : {}),
          isReserved: true,
          isSystem: true
        };
        env.setVariable('payload', payloadVar);
      }

      if (stateKey) {
        env.registerDynamicModules(
          { [stateKey]: userDataModules[stateKey] },
          options.dynamicModuleSource,
          { literalStrings: true }
        );
      }
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

  if (
    options.trace !== undefined ||
    options.traceMemory === true ||
    options.traceFile !== undefined ||
    options.traceStderr !== undefined
  ) {
    env.setRuntimeTrace(
      options.trace ?? 'off',
      {
        filePath: options.traceFile,
        stderr: options.traceStderr,
        memory: options.traceMemory,
        retainLimit: mode === 'document' ? 0 : undefined
      }
    );
  }
  env.emitRuntimeMemoryTrace('run', 'start', {
    data: {
      mode,
      filePath: options.filePath
    }
  });
  env.emitRuntimeMemoryTrace('parse', 'finish', {
    data: {
      nodeCount: Array.isArray(ast) ? ast.length : undefined,
      fromCache: options.ast !== undefined
    }
  });
  
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
    env.emitRuntimeMemoryTrace('evaluation', 'start');

    try {
      const evaluationResult = await env.withExecutionContext(
        'exe',
        { allowReturn: true, scope: 'script', hasFunctionBoundary: false },
        async () => evaluate(ast, env)
      );

      env.emitRuntimeMemoryTrace('evaluation', 'finish');

      await finalizePendingCheckpointScope(env);

      // Script-level return is explicit final output. Non-return final values are ignored.
      if (isExeReturnControl(evaluationResult.value)) {
        const materialized = boundary.display(evaluationResult.value.value);
        if (materialized.text.length > 0) {
          env.emitEffect('both', materialized.text);
        }
      }

      // Flush any pending breaks before getting final output
      env.renderOutput();

      // Display collected errors with rich formatting if enabled
      if (options.outputOptions?.collectErrors) {
        await env.displayCollectedErrors();
      }

      // Get the document from the effect handler
      const activeEffectHandler = env.getEffectHandler();
      let output: string;

      const format = options.format || 'markdown';

      if (activeEffectHandler && typeof activeEffectHandler.getDocument === 'function') {
        // Get the accumulated document from the effect handler
        output = activeEffectHandler.getDocument();

        // Apply output normalization if requested (default format is markdown)
        if (options.useMarkdownFormatter !== false && format === 'markdown') {
          const { normalizeOutput } = await import('./output/normalizer');
          output = normalizeOutput(output);
        }
      } else {
        // Fallback to old node-based system if effect handler doesn't have getDocument
        const nodes = env.getNodes();

        // Format the output
        output = await formatOutput(nodes, {
          format: 'markdown',
          variables: env.getAllVariables(),
          useMarkdownFormatter: options.useMarkdownFormatter,
          normalizeBlankLines: options.normalizeBlankLines
        });
      }

      if (format === 'xml') {
        const { applyOutputFormatToText } = await import('./output/formatter');
        output = await applyOutputFormatToText(output, format);
      }
    
      // Call captureEnvironment callback if provided
      if (options.captureEnvironment) {
        options.captureEnvironment(env);
      }

      env.emitRuntimeMemoryTrace('run', 'finish');
      return output;
    } catch (error) {
      env.emitRuntimeMemoryTrace('run', 'finish', {
        data: {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  };

  if (mode === 'stream') {
    const emitter = options.emitter ?? new ExecutionEmitter();
    const writeFile =
      options.filePath && typeof options.filePath === 'string'
        ? await createExecutionFileWriter({
            requestId: randomUUID(),
            scriptPath: options.filePath,
            fileSystem: options.fileSystem
          })
        : undefined;
    const streamExecution = new StreamExecution(emitter, {
      abort: () => {
        env.cleanup();
      },
      updateState: async (path: string, value: unknown, labels?: string[]) => {
        env.applyExternalStateUpdate(path, value, labels);
      },
      writeFile
    });
    env.enableSDKEvents(emitter);

    void (async () => {
      try {
        const output = await runExecution();
        const structured = buildStructuredResult(env, output, provenanceEnabled);
        emitter.emit({ type: 'execution:complete', result: structured, timestamp: Date.now() });
        streamExecution.resolve(structured);
      } catch (error) {
        env.recordGuardDenialFromError(error);
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
      'state:write',
      'session_write',
      'guard_denial',
      'trace_event',
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

  let output: string;
  try {
    output = await runExecution();
  } catch (error) {
    env.recordGuardDenialFromError(error);
    throw error;
  }

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
    sessions: env.getCompletedSessions(),
    denials: env.getGuardDenials(),
    traceEvents: env.getRuntimeTraceEvents(),
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
