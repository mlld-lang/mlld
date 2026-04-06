import type {
  MlldNode,
  SourceLocation,
  DirectiveNode,
  ActiveCheckpointScope,
  CheckpointResumeMode
} from '@core/types';
import type { MlldMode } from '@core/types/mode';
import type { Variable, PipelineInput } from '@core/types/variable';
import { 
  createPathVariable,
  createSimpleTextVariable,
  createObjectVariable,
  isPipelineInput,
  isTextLike,
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { isDirectiveNode, isVariableReferenceNode, isTextNode } from '@core/types';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { VirtualFS, type VirtualFSSigningContext } from '@services/fs/VirtualFS';
import type { ResolvedURLConfig } from '@core/types/url-config';
import type {
  DirectiveTrace,
  RuntimeTraceCategory,
  RuntimeTraceEmissionLevel,
  RuntimeTraceEvent,
  RuntimeTraceLevel,
  RuntimeTraceOptions,
  RuntimeTraceScope
} from '@core/types/trace';
import { shouldEmitRuntimeTrace } from '@core/types/trace';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import type { EnvironmentConfig } from '@core/types/environment';
import { sanitizeSerializableValue } from '@core/errors/errorSerialization';
import { execSync } from 'child_process';
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
// Note: ImportApproval, ImmutableCache, and GistTransformer are now handled by ImportResolver
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldInterpreterError, MlldSecurityError } from '@core/errors';
import { SecurityManager } from '@security';
import {
  TaintTracker,
  appendAuditEvent,
  buildFileSigningMetadata,
  type SigService
} from '@core/security';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  createCapabilityContext,
  type SecurityDescriptor,
  type CapabilityContext,
  type CapabilityKind,
  type ImportType,
  type DataLabel
} from '@core/types/security';
import { extractUrlsFromValue } from '@core/security/url-provenance';
import type { StateWrite } from '@core/types/state';
import { mergeNeedsDeclarations, ALLOW_ALL_POLICY, type NeedsDeclaration, type PolicyCapabilities, type ProfilesDeclaration } from '@core/policy/needs';
import {
  mergePolicyConfigs,
  normalizePolicyConfig,
  type AuthConfig,
  type PolicyConfig
} from '@core/policy/union';
import { findDeniedShellCommand } from '@core/policy/guards';
import { RegistryManager, ProjectConfig } from '@core/registry';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { astLocationToSourceLocation } from '@core/types';
import {
  ResolverManager,
  DynamicModuleResolver,
  RegistryResolver,
  LocalResolver,
  GitHubResolver,
  HTTPResolver,
  ProjectPathResolver,
  PythonPackageResolver,
  PythonAliasResolver
} from '@core/resolvers';
import { logger } from '@core/utils/logger';
import * as shellQuote from 'shell-quote';
import { getTimeValue, getProjectPathValue } from '../utils/reserved-variables';
import { getExpressionProvenance } from '../utils/expression-provenance';
import { builtinTransformers, createTransformerVariable } from '../builtin/transformers';
import { NodeShadowEnvironment } from './NodeShadowEnvironment';
import { PythonShadowEnvironment } from './PythonShadowEnvironment';
import { CacheManager } from './CacheManager';
import { CommandUtils } from './CommandUtils';
import { DebugUtils } from './DebugUtils';
import { ErrorUtils, type CollectedError, type CommandExecutionContext } from './ErrorUtils';
import {
  CommandExecutorFactory,
  type CommandExecutionOptions,
  type ExecutorDependencies,
  type WorkspaceProvider
} from './executors';
import type { VariableProvider } from './executors/BashExecutor';
import { VariableManager, type IVariableManager, type VariableManagerContext } from './VariableManager';
import { ImportResolver, type IImportResolver, type ImportResolverContext, type FetchURLOptions } from './ImportResolver';
import type { PathContext } from '@core/services/PathContextService';
import { PathContextBuilder } from '@core/services/PathContextService';
import {
  normalizeEnvironmentPathContext,
  initializeRootBootstrap,
  buildVariableManagerDependencies,
  buildImportResolverDependencies
} from './bootstrap/EnvironmentBootstrap';
import { ShadowEnvironmentCapture, ShadowEnvironmentProvider } from './types/ShadowEnvironmentCapture';
import { EffectHandler, DefaultEffectHandler } from './EffectHandler';
import { McpImportManager } from '../mcp/McpImportManager';
import { OutputRenderer } from '@interpreter/output/renderer';
import type { OutputIntent } from '@interpreter/output/intent';
import { contentIntent, breakIntent, progressIntent, errorIntent } from '@interpreter/output/intent';
import { defaultStreamingOptions, type StreamingOptions } from '../eval/pipeline/streaming-options';
import { StreamBus, type StreamEvent } from '../eval/pipeline/stream-bus';
import { ExportManifest } from '../eval/import/ExportManifest';
import {
  ContextManager,
  type SecuritySnapshotLike,
  type PipelineContextSnapshot,
  type GuardContextSnapshot,
  type OperationContext,
  type DeniedContextSnapshot,
  type GuardHistoryEntry,
  type ToolCallRecord
} from './ContextManager';
import { HookManager } from '../hooks/HookManager';
import { HookRegistry } from '../hooks/HookRegistry';
import type { RecordDefinition } from '@core/types/record';
import type { ShelfDefinition } from '@core/types/shelf';
import type { CheckpointManager } from '../checkpoint/CheckpointManager';
import { checkpointPreHook } from '../hooks/checkpoint-pre-hook';
import { checkpointPostHook } from '../hooks/checkpoint-post-hook';
import { guardPreHook } from '../hooks/guard-pre-hook';
import { guardPostHook } from '../hooks/guard-post-hook';
import { taintPostHook } from '../hooks/taint-post-hook';

type RuntimeTraceShelfWriteState = {
  ts: string;
  scopeSignature: string;
  fingerprint: string;
  summary: unknown;
};
import { createKeepExecutable, createKeepStructuredExecutable } from './builtins';
import { createFyiVariable, createToolDocsExecutable } from './builtins/fyi';
import { createPolicyVariable } from './builtins/policy';
import { createShelfBuiltinVariable, createShelveVariable } from './builtins/shelve';
import { GuardRegistry, type SerializedGuardDefinition } from '../guards';
import type { ExecutionEmitter } from '@sdk/execution-emitter';
import type { SDKEvent, SDKGuardDenial, StreamingResult } from '@sdk/types';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { ImportApproval } from '@core/security/ImportApproval';
import type { ImmutableCache } from '@core/security/ImmutableCache';
import type { WorkspaceValue, WorkspaceMcpBridgeHandle } from '@core/types/workspace';
import { DEFAULT_CHECKPOINT_RESUME_MODE } from '@interpreter/checkpoint/policy';
import { extractGuardDenial } from '@interpreter/eval/guard-denial-events';
import {
  ValueHandleRegistry,
  type ValueHandleEntry,
  type IssueValueHandleOptions
} from './ValueHandleRegistry';

type EffectType = 'doc' | 'stdout' | 'stderr' | 'both' | 'file';

interface EffectOptions {
  path?: string;
  source?: SourceLocation;
  mode?: 'append' | 'write';
  metadata?: unknown;
}

interface ImportBindingInfo {
  source: string;
  location?: SourceLocation;
}

interface SecurityScopeFrame {
  kind: CapabilityKind;
  importType?: ImportType;
  metadata?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
  previousDescriptor: SecurityDescriptor;
  previousPolicy?: Readonly<Record<string, unknown>>;
}

interface SecurityRuntimeState {
  tracker: TaintTracker;
  descriptor: SecurityDescriptor;
  stack: SecurityScopeFrame[];
  policy?: Readonly<Record<string, unknown>>;
}

interface SecurityContextInput {
  descriptor: SecurityDescriptor;
  kind: CapabilityKind;
  importType?: ImportType;
  metadata?: Record<string, unknown>;
  operation?: Record<string, unknown>;
  policy?: Record<string, unknown>;
}

interface CommandExecutorFactoryPort {
  executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
  executeCode(
    code: string,
    language: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string>;
}

interface NormalizedCodeExecutionInput {
  metadata?: Record<string, any>;
  context?: CommandExecutionContext;
}

type ShadowFunctions = Map<string, any>;


/**
 * Environment holds all state and provides capabilities for evaluation.
 * This replaces StateService, ResolutionService, and capability injection.
 */
export class Environment
  implements
    VariableManagerContext,
    ImportResolverContext,
    ShadowEnvironmentProvider,
    WorkspaceProvider
{
  private nodes: MlldNode[] = [];
  private parent?: Environment;
  // Note: importStack is now handled by ImportResolver
  private urlConfig?: ResolvedURLConfig;
  // Note: importApproval and immutableCache are now handled by ImportResolver
  private currentFilePath?: string; // Track current file being processed
  private securityManager?: SecurityManager; // Central security coordinator
  private securityRuntime?: SecurityRuntimeState;
  private policyCapabilities: PolicyCapabilities = ALLOW_ALL_POLICY;
  private policySummary?: PolicyConfig;
  private policySummaryRequiresRuntimeGuards?: boolean;
  private standaloneAuthSummary?: Record<string, AuthConfig>;
  private allowedTools?: Set<string>;
  private allowedMcpServers?: Set<string>;
  private _exeLabels?: readonly string[];
  private moduleNeeds?: NeedsDeclaration;
  private moduleProfiles?: ProfilesDeclaration;
  private scopedEnvironmentConfig?: EnvironmentConfig;
  private registryManager?: RegistryManager; // Registry for mlld:// URLs
  private stdinContent?: string; // Cached stdin content
  private resolverManager?: ResolverManager; // New resolver system
  private reservedNames: Set<string> = new Set(); // Now dynamic based on registered resolvers
  private initialNodeCount: number = 0; // Track initial nodes to prevent duplicate merging
  
  // Path context for clear path handling
  private pathContext?: PathContext;
  // Legacy basePath for backward compatibility
  private basePath: string;
  // Project configuration (replaces direct LockFile usage)
  private projectConfig?: ProjectConfig;

  // Utility managers
  private cacheManager: CacheManager;
  private errorUtils: ErrorUtils;
  private commandExecutorFactory?: CommandExecutorFactoryPort;
  private variableManager: IVariableManager;
  private importResolver: IImportResolver;
  private contextManager: ContextManager;
  private hookManager: HookManager;
  private hookRegistry: HookRegistry;
  private guardRegistry: GuardRegistry;
  private pipelineGuardHistoryStore: { entries?: GuardHistoryEntry[] };
  private mcpImportManager?: McpImportManager;
  private mcpServerMap?: Record<string, string>;
  private recordDefinitions?: Map<string, RecordDefinition>;
  private shelfDefinitions?: Map<string, ShelfDefinition>;
  private shelfState?: Map<string, Map<string, unknown>>;
  private valueHandleRegistry?: ValueHandleRegistry;

  // Shadow environments for language-specific function injection
  private readonly shadowEnvs: Map<string, ShadowFunctions> = new Map();
  private nodeShadowEnv?: NodeShadowEnvironment;
  private pythonShadowEnv?: PythonShadowEnvironment;
  
  // Output management properties
  private outputOptions: CommandExecutionOptions = {
    showProgress: false,  // Default to false to avoid debug output in results
    maxOutputLines: 50,
    errorBehavior: 'continue',
    timeout: 30000,
    collectErrors: false
  };
  private streamingOptions: StreamingOptions = defaultStreamingOptions;
  private streamingManager?: StreamingManager;
  private streamingResult?: StreamingResult;
  private provenanceEnabled = false;

  private stateWrites: StateWrite[] = [];
  private stateWriteIndex = 0;
  private guardDenials: SDKGuardDenial[] = [];
  private readonly recordedGuardDenialErrors = new WeakSet<object>();
  private stateSnapshot?: Record<string, any>;
  private stateResolver?: DynamicModuleResolver;
  private stateLabels: DataLabel[] = [];
  private statePathLabels: Record<string, DataLabel[]> = {};
  
  // Import approval bypass flag
  private approveAllImports: boolean = false;

  // Ephemeral mode flag for error context
  private isEphemeralMode: boolean = false;

  // Dynamic module parsing mode (default: strict)
  private dynamicModuleMode?: MlldMode;
  
  // Track child environments for cleanup
  private childEnvironments: Set<Environment> = new Set();
  
  // Blank line normalization flag
  private normalizeBlankLines: boolean = true;
  
  // Development mode flag
  private localModulePath?: string;
  
  // Source cache for error reporting
  private sourceCache: Map<string, string> = new Map();
  // Per-execution module processing cache for idempotent import evaluation
  private moduleProcessingCache: Map<string, unknown>;
  
  // File interpolation circular detection
  private interpolationStack: Set<string> = new Set();
  private enableFileInterpolation: boolean = true;

  // Executable resolution circular detection
  private resolutionStack: Map<string, number> = new Map();

  // Active workspace stack for nested workspace-aware execution contexts.
  private workspaceStack: WorkspaceValue[] = [];
  private bridgeStack: WorkspaceMcpBridgeHandle[] = [];
  private scopeCleanups: Array<() => Promise<void>> = [];
  private sigService?: SigService;
  private signerIdentity = 'unknown';
  private readonly registeredSigAwareFileSystems = new WeakSet<VirtualFS>();

  // Auto-bridged LLM tool config, set by exe llm invocations with config.tools
  private llmToolConfig?: import('./executors/call-mcp-config').CallMcpConfig | null;

  // Current iteration file for <> placeholder
  private currentIterationFile?: any;
  
  // Directive trace for debugging
  private directiveTrace: DirectiveTrace[] = [];
  private traceEnabled: boolean = true; // Default to enabled
  private runtimeTraceLevel: RuntimeTraceLevel = 'off';
  private runtimeTraceOverrideLevel?: RuntimeTraceLevel;
  private runtimeTraceEvents: RuntimeTraceEvent[] = [];
  private runtimeTraceFilePath?: string;
  private runtimeTraceStderr = false;
  private runtimeTraceShelfWrites = new Map<string, RuntimeTraceShelfWriteState>();

  // Fuzzy matching for local files
  private localFileFuzzyMatch: FuzzyMatchConfig | boolean = true; // Default enabled
  // Allow absolute paths outside project root
  private allowAbsolutePaths: boolean = false;
  // Note: pathMatcher is now handled by ImportResolver
  
  // Default URL validation options (used if no config provided)
  private defaultUrlOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [] as string[],
    blockedDomains: [] as string[],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };
  
  // Effect handler for immediate output
  private effectHandler: EffectHandler;
  // Output renderer for intent-based output with break collapsing
  private outputRenderer: OutputRenderer;
  private sdkStreamingOptions: StreamingOptions = { ...defaultStreamingOptions };
  private sdkEmitter?: ExecutionEmitter;
  private sdkUnsubscribe?: () => void;
  private directiveTimings: number[] = [];

  // Import evaluation guard - prevents directive execution during import
  private isImportingContent: boolean = false;

  // Captured module environment used during imported executable invocation
  private capturedModuleEnv?: Map<string, Variable>;

  // Module isolation flag: when true, this environment is running an exe block from
  // an imported module and should NOT inherit variable visibility from the caller's scope.
  // This prevents collision errors when a module's internal variables have the same name
  // as variables in the caller. See mlld-1e23.
  private moduleIsolated: boolean = false;

  // Export manifest populated by /export directives within this environment
  private exportManifest?: ExportManifest;
  private checkpointManager?: CheckpointManager;
  private checkpointManagerFactory?: () => Promise<CheckpointManager | undefined>;
  private checkpointManagerInitPromise?: Promise<CheckpointManager | undefined>;
  private checkpointScriptResumeMode: CheckpointResumeMode = DEFAULT_CHECKPOINT_RESUME_MODE;
  private activeCheckpointScope?: ActiveCheckpointScope;
  private checkpointResumeOverride = false;

  // Tracks imported bindings to surface collisions across directives.
  private importBindings: Map<string, ImportBindingInfo> = new Map();
  // TODO: Introduce guard registration and evaluation using capability contexts.
  // Guard evaluation depth prevents reentrant guard execution
  private guardEvaluationDepth = 0;
  // Hook evaluation depth prevents user-hook reentrancy while hook bodies execute.
  private hookEvaluationDepth = 0;

  // ═══════════════════════════════════════════════════════════════
  // ZONE 1: Constructor & Bootstrap
  // ═══════════════════════════════════════════════════════════════

  // Constructor overloads
  constructor(
    fileSystem: IFileSystemService,
    pathService: IPathService,
    basePathOrContext: string | PathContext,
    parent?: Environment,
    effectHandler?: EffectHandler
  );
  
  constructor(
    private fileSystem: IFileSystemService,
    private pathService: IPathService,
    basePathOrContext: string | PathContext,
    parent?: Environment,
    effectHandler?: EffectHandler
  ) {
    const normalizedPathContext = normalizeEnvironmentPathContext(basePathOrContext);
    this.basePath = normalizedPathContext.basePath;
    this.pathContext = normalizedPathContext.pathContext;
    this.parent = parent;
    this.valueHandleRegistry = parent?.valueHandleRegistry ?? new ValueHandleRegistry();
    if (parent) {
      this.streamingOptions = { ...parent.streamingOptions };
    }
    
    // Initialize effect handler: use provided, inherit from parent, or create default
    this.effectHandler = effectHandler || parent?.effectHandler || new DefaultEffectHandler();

    // Initialize output renderer: inherit from parent to share break collapsing state
    // OutputRenderer accepts a callback entrypoint; this keeps intent->effect routing local.
    this.outputRenderer = parent?.outputRenderer || new OutputRenderer((intent) => {
      this.intentToEffect(intent);
    });

    if (parent) {
      this.contextManager = parent.contextManager;
      this.hookManager = parent.hookManager;
      this.hookRegistry = parent.hookRegistry.createChild();
      this.guardRegistry = parent.guardRegistry.createChild();
      this.checkpointManager = parent.checkpointManager;
      this.checkpointManagerFactory = parent.checkpointManagerFactory;
      this.checkpointManagerInitPromise = parent.checkpointManagerInitPromise;
    } else {
      this.contextManager = new ContextManager();
      this.hookManager = new HookManager();
      this.hookRegistry = new HookRegistry();
      this.guardRegistry = new GuardRegistry();
      this.registerBuiltinHooks();
    }
    this.pipelineGuardHistoryStore = parent ? parent.pipelineGuardHistoryStore : {};
    this.moduleProcessingCache = parent ? parent.moduleProcessingCache : new Map();
    
    // Inherit reserved names from parent environment
    if (parent) {
      this.reservedNames = new Set(parent.reservedNames);
      // Inherit fuzzy match configuration from parent
      this.localFileFuzzyMatch = parent.localFileFuzzyMatch;
    }
    this.reservedNames.add('fyi');
    this.reservedNames.add('shelf');
    this.reservedNames.add('shelve');
    this.reservedNames.add('toolDocs');
    
    // Initialize security/registry/resolver bootstrap for root environments only
    if (!parent) {
      const bootstrap = initializeRootBootstrap({
        fileSystem: this.fileSystem,
        pathContext: this.pathContext,
        basePath: this.basePath
      });
      this.securityManager = bootstrap.securityManager;
      this.registryManager = bootstrap.registryManager;
      this.projectConfig = bootstrap.projectConfig;
      this.resolverManager = bootstrap.resolverManager;
      this.localModulePath = bootstrap.localModulePath;
      this.allowAbsolutePaths = bootstrap.allowAbsolutePaths;
    }
    
    // Initialize utility managers
    // Child environments share stateless/global managers with parent
    if (parent) {
      this.cacheManager = parent.cacheManager;
      this.errorUtils = parent.errorUtils;
    } else {
      this.cacheManager = new CacheManager(undefined, this.urlConfig);
      this.errorUtils = new ErrorUtils();
    }
    
    const variableManagerDependencies = buildVariableManagerDependencies({
      cacheManager: this.cacheManager,
      getCurrentFilePath: this.getCurrentFilePath.bind(this),
      getReservedNames: () => this.reservedNames,
      getParent: () => this.parent,
      getCapturedModuleEnv: () => this.capturedModuleEnv,
      isModuleIsolated: () => this.moduleIsolated,
      getResolverManager: this.getResolverManager.bind(this),
      createDebugObject: this.createDebugObject.bind(this),
      getEnvironmentVariables: this.getEnvironmentVariables.bind(this),
      getStdinContent: () => this.stdinContent,
      getFsService: () => this.fileSystem,
      getPathService: () => this.pathService,
      getSecurityManager: () => this.securityManager,
      getBasePath: this.getProjectRoot.bind(this),
      getFileDirectory: this.getFileDirectory.bind(this),
      getExecutionDirectory: this.getExecutionDirectory.bind(this),
      getPipelineContext: this.getPipelineContext.bind(this),
      getSecuritySnapshot: this.getSecuritySnapshot.bind(this),
      getActiveBridge: this.getActiveBridge.bind(this),
      recordSecurityDescriptor: this.recordSecurityDescriptor.bind(this),
      getContextManager: () => this.contextManager,
      getLlmToolConfig: this.getLlmToolConfig.bind(this)
    });
    this.variableManager = new VariableManager(variableManagerDependencies);
    
    // Initialize reserved variables if this is the root environment
    if (!parent) {
      this.variableManager.initializeReservedVariables();
      
      // Initialize built-in transformers
      this.initializeBuiltinTransformers();

      // Register keep/keepStructured builtins
      this.registerKeepBuiltins();
      this.registerPolicyBuiltins();
      this.registerToolDocsBuiltin();
      
      // Reserve module prefixes from resolver configuration and create path variables
      this.reserveModulePrefixes();
    }

    // Initialize import resolver
    // Child environments get parent's resolver temporarily; createChild/createChildEnvironment
    // replaces it with a proper child resolver. This avoids creating a full ImportResolver
    // (with 13 closure dependencies) that is immediately discarded.
    if (parent) {
      this.importResolver = parent.importResolver;
    } else {
      this.importResolver = new ImportResolver(
        buildImportResolverDependencies({
          fileSystem: this.fileSystem,
          pathService: this.pathService,
          pathContext: this.pathContext,
          basePath: this.basePath,
          cacheManager: this.cacheManager,
          getSecurityManager: this.getSecurityManager.bind(this),
          getRegistryManager: this.getRegistryManager.bind(this),
          getResolverManager: this.getResolverManager.bind(this),
          getParent: () => this.parent,
          getCurrentFilePath: this.getCurrentFilePath.bind(this),
          getApproveAllImports: () => this.approveAllImports,
          getLocalFileFuzzyMatch: () => this.localFileFuzzyMatch,
          getURLConfig: () => this.urlConfig,
          getDefaultUrlOptions: () => this.defaultUrlOptions,
          getAllowAbsolutePaths: () => this.allowAbsolutePaths
        })
      );
    }

    // Ensure keep/keepStructured helpers are available even from child environments
    this.getRootEnvironment().registerKeepBuiltins();
    this.getRootEnvironment().registerPolicyBuiltins();
    this.getRootEnvironment().registerToolDocsBuiltin();

    // Command executor factory: eagerly create for root environments, lazy-init for children.
    // Most child environments (e.g., for-loop iterations doing field access) never execute
    // commands, so this avoids creating a CommandExecutorFactory + 7 closure dependencies
    // for each of the potentially tens of thousands of iteration environments.
    if (!parent) {
      this.commandExecutorFactory = this.getCommandExecutorFactory();
    }
  }
  
  /**
   * Register built-in function resolvers (async initialization)
   * This should be called after the Environment is constructed
   */
  async registerBuiltinResolvers(): Promise<void> {
    if (!this.resolverManager) {
      return;
    }

    // Import and register built-in function resolvers
    const { NowResolver, DebugResolver, InputResolver, KeychainResolver } = await import('@core/resolvers/builtin');

    // Create InputResolver with current stdin content
    const inputResolver = new InputResolver(this.stdinContent);

    // Register the resolvers
    this.resolverManager.registerResolver(new NowResolver());
    this.resolverManager.registerResolver(new DebugResolver());
    this.resolverManager.registerResolver(inputResolver);
    this.resolverManager.registerResolver(new KeychainResolver());

    // Only reserve names for built-in function resolvers (not file/module resolvers)
    // Function resolvers are those that provide computed values like now, debug, etc.
    const functionResolvers = ['now', 'debug', 'input', 'base', 'root', 'keychain'];
    for (const name of functionResolvers) {
      this.reservedNames.add(name);
    }
    
    logger.debug(`Reserved resolver names: ${Array.from(this.reservedNames).join(', ')}`);
  }

  registerDynamicModules(
    modules: Record<string, string | Record<string, unknown>>,
    source?: string,
    options?: {
      literalStrings?: boolean;
      moduleFieldLabels?: Record<string, Record<string, readonly string[]>>;
    }
  ): void {
    if (!this.resolverManager) {
      throw new Error('ResolverManager not available');
    }

    let resolver: DynamicModuleResolver;
    const existing = this.resolverManager.getResolver('dynamic');

    if (existing instanceof DynamicModuleResolver) {
      const normalized = new DynamicModuleResolver(modules, {
        source,
        literalStrings: options?.literalStrings,
        moduleFieldLabels: options?.moduleFieldLabels
      });

      for (const [path, content] of normalized.getSerializedModules()) {
        existing.updateModule(path, content);
      }

      resolver = existing;
      logger.debug(`Updated dynamic modules: ${Object.keys(modules).length}${source ? ` (source: ${source})` : ''}`);
    } else {
      resolver = new DynamicModuleResolver(modules, {
        source,
        literalStrings: options?.literalStrings,
        moduleFieldLabels: options?.moduleFieldLabels
      });
      this.resolverManager.registerResolver(resolver);
      logger.debug(`Registered dynamic modules: ${Object.keys(modules).length}${source ? ` (source: ${source})` : ''}`);
    }

    // Track @state snapshot for live reads/updates
    if (Object.prototype.hasOwnProperty.call(modules, '@state')) {
      const stateValue = modules['@state'];
      if (stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
        this.registerDynamicStateSnapshot(
          stateValue as Record<string, any>,
          resolver,
          source
        );
      }
    }
  }

  /**
   * Reserve module prefixes from resolver configuration and create path variables
   * This prevents variables from using names that conflict with module prefixes
   * and makes prefixes available as path variables for file references
   */
  private reserveModulePrefixes(): void {
    if (!this.resolverManager) {
      return;
    }
    
    // Get configured prefixes from resolver manager
    const prefixes = this.resolverManager.getPrefixConfigs();
    
    for (const prefixConfig of prefixes) {
      // Extract the name from prefix (e.g., "@work/" -> "work")
      const match = prefixConfig.prefix.match(/^@(\w+)\//);
      if (match) {
        const prefixName = match[1];
        this.reservedNames.add(prefixName);
        logger.debug(`Reserved module prefix name: ${prefixName}`);
        
        // Create a path variable for prefixes that have a basePath
        if (prefixConfig.config?.basePath) {
          const pathVar = createPathVariable(
            prefixName,
            prefixConfig.config.basePath,
            prefixConfig.config.basePath,
            false, // Not a URL
            path.isAbsolute(prefixConfig.config.basePath), // Check if absolute
            {
              directive: 'var',
              syntax: 'quoted',
              hasInterpolation: false,
              isMultiLine: false
            },
            {
              mx: {
                definedAt: { line: 0, column: 0, filePath: '<prefix-config>' }
              },
              internal: {
                isReserved: true,
                isPrefixPath: true,
                prefixConfig: prefixConfig
              }
            }
          );
          this.variableManager.setVariable(prefixName, pathVar);
          logger.debug(`Created path variable for prefix: @${prefixName} -> ${prefixConfig.config.basePath}`);
        }
      }
    }
  }
  
  
  /**
   * Initialize built-in transformers (JSON, XML, CSV, MD)
   * Only called for root environment (non-child)
   */
  private initializeBuiltinTransformers(): void {
    
    for (const transformer of builtinTransformers) {
      // Create uppercase canonical version
      const upperVar = createTransformerVariable(
        transformer.uppercase,
        transformer.implementation,
        transformer.description,
        true
      );
      this.variableManager.setVariable(transformer.uppercase, upperVar);
      
      // Create lowercase alias for ergonomics
      const lowerVar = createTransformerVariable(
        transformer.name,
        transformer.implementation,
        transformer.description,
        false
      );
      this.variableManager.setVariable(transformer.name, lowerVar);
      
      if (transformer.variants && transformer.variants.length > 0) {
        const lowerInternal = (lowerVar.internal ??= {});
        const upperInternal = (upperVar.internal ??= {});
        const lowerVariantMap =
          (lowerInternal.transformerVariants as Record<string, any> | undefined) ??
          (lowerInternal.transformerVariants = {});
        const upperVariantMap =
          (upperInternal.transformerVariants as Record<string, any> | undefined) ??
          (upperInternal.transformerVariants = {});
        for (const variant of transformer.variants) {
          const lowerVariant = createTransformerVariable(
            `${transformer.name}.${variant.field}`,
            variant.implementation,
            variant.description,
            false
          );
          const upperVariant = createTransformerVariable(
            `${transformer.uppercase}_${variant.field.toUpperCase()}`,
            variant.implementation,
            variant.description,
            true
          );

          (lowerVar.value as Record<string, unknown>)[variant.field] = lowerVariant;
          (upperVar.value as Record<string, unknown>)[variant.field] = upperVariant;

          lowerVariantMap[variant.field] = lowerVariant;
          upperVariantMap[variant.field] = upperVariant;
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ZONE 2: Security, Policy & State Runtime
  // ═══════════════════════════════════════════════════════════════

  // Import evaluation guard methods
  setImporting(value: boolean): void {
    this.isImportingContent = value;
  }

  getIsImporting(): boolean {
    // Only return true for this specific environment, don't inherit from parent
    // This prevents the import guard from leaking into child environments during normal execution
    return this.isImportingContent;
  }

  setCapturedModuleEnv(env: Map<string, Variable> | undefined): void {
    this.capturedModuleEnv = env;
    // When a captured module env is set, this environment is module-isolated
    // This means it should NOT check the caller's scope for variable collisions
    this.moduleIsolated = env !== undefined;
  }

  getCapturedModuleEnv(): Map<string, Variable> | undefined {
    return this.capturedModuleEnv;
  }

  isModuleIsolated(): boolean {
    return this.moduleIsolated;
  }

  setModuleIsolated(isolated: boolean): void {
    this.moduleIsolated = isolated;
  }

  setExportManifest(manifest: ExportManifest | null | undefined): void {
    this.exportManifest = manifest ?? undefined;
  }

  getExportManifest(): ExportManifest | null {
    return this.exportManifest ?? null;
  }

  hasExplicitExports(): boolean {
    return Boolean(this.exportManifest?.hasEntries());
  }

  getImportBinding(name: string): ImportBindingInfo | undefined {
    return this.importBindings.get(name);
  }

  setImportBinding(name: string, info: ImportBindingInfo): void {
    this.importBindings.set(name, info);
  }

  getSecurityManager(): SecurityManager | undefined {
    // Get from this environment or parent
    if (this.securityManager) return this.securityManager;
    return this.parent?.getSecurityManager();
  }

  getModuleNeeds(): NeedsDeclaration | undefined {
    if (this.moduleNeeds) return this.moduleNeeds;
    return this.parent?.getModuleNeeds();
  }

  recordModuleNeeds(needs: NeedsDeclaration): void {
    this.moduleNeeds = mergeNeedsDeclarations(this.moduleNeeds, needs);
  }

  getModuleProfiles(): ProfilesDeclaration | undefined {
    if (this.moduleProfiles) return this.moduleProfiles;
    return this.parent?.getModuleProfiles();
  }

  recordModuleProfiles(profiles: ProfilesDeclaration): void {
    if (!profiles || Object.keys(profiles).length === 0) {
      return;
    }
    if (!this.moduleProfiles) {
      this.moduleProfiles = { ...profiles };
      return;
    }
    this.moduleProfiles = { ...this.moduleProfiles, ...profiles };
  }

  getPolicyCapabilities(): PolicyCapabilities {
    if (this.policyCapabilities) return this.policyCapabilities;
    if (this.parent) return this.parent.getPolicyCapabilities();
    return ALLOW_ALL_POLICY;
  }

  setPolicyCapabilities(policy: PolicyCapabilities): void {
    this.policyCapabilities = policy;
  }

  getPolicySummary(): PolicyConfig | undefined {
    if (this.policySummary) return this.policySummary;
    return this.parent?.getPolicySummary();
  }

  setPolicySummary(
    policy?: PolicyConfig | null,
    options?: { synthesizeGuards?: boolean }
  ): void {
    this.policySummary = policy ?? undefined;
    if (policy) {
      this.policySummaryRequiresRuntimeGuards = options?.synthesizeGuards ?? true;
      return;
    }
    this.policySummaryRequiresRuntimeGuards = false;
  }

  shouldSynthesizePolicyGuards(): boolean {
    if (this.policySummaryRequiresRuntimeGuards !== undefined) {
      return this.policySummaryRequiresRuntimeGuards;
    }
    return this.parent?.shouldSynthesizePolicyGuards() ?? false;
  }

  getStandaloneAuthSummary(): Record<string, AuthConfig> | undefined {
    if (this.standaloneAuthSummary) {
      return this.standaloneAuthSummary;
    }
    return this.parent?.getStandaloneAuthSummary();
  }

  recordStandaloneAuthConfig(name: string, config: AuthConfig): void {
    const authName = typeof name === 'string' ? name.trim() : '';
    if (!authName || !config) {
      return;
    }
    this.standaloneAuthSummary = {
      ...(this.standaloneAuthSummary ?? {}),
      [authName]: config
    };
  }

  getScopedEnvironmentConfig(): EnvironmentConfig | undefined {
    if (this.scopedEnvironmentConfig) return this.scopedEnvironmentConfig;
    return this.parent?.getScopedEnvironmentConfig();
  }

  setScopedEnvironmentConfig(config?: EnvironmentConfig | null): void {
    if (config === null || config === undefined) {
      this.scopedEnvironmentConfig = undefined;
      return;
    }
    this.scopedEnvironmentConfig = config;
  }

  setExeLabels(labels: readonly string[]): void {
    this._exeLabels = labels;
  }

  issueHandle(value: unknown, options: IssueValueHandleOptions = {}) {
    const root = this.getRootEnvironment();
    if (!root.valueHandleRegistry) {
      root.valueHandleRegistry = new ValueHandleRegistry();
    }
    const issued = root.valueHandleRegistry.issue(value, options);
    this.emitRuntimeTrace('verbose', 'handle', 'handle.mint', {
      handle: issued.handle,
      preview: issued.preview,
      source: issued.metadata?.source,
      value: this.summarizeTraceValue(value)
    });
    return issued;
  }

  resolveHandle(handle: string): unknown {
    const root = this.getRootEnvironment();
    const entry = root.valueHandleRegistry?.resolve(handle);
    if (!entry) {
      this.emitRuntimeTrace('verbose', 'handle', 'handle.resolve_fail', {
        handle,
        success: false
      });
      throw new MlldSecurityError(`Unknown handle '${handle}'`, {
        code: 'HANDLE_NOT_FOUND',
        details: { handle }
      });
    }
    this.emitRuntimeTrace('verbose', 'handle', 'handle.resolve', {
      handle,
      success: true,
      value: this.summarizeTraceValue(entry.value)
    });
    return entry.value;
  }

  getIssuedHandles(): readonly ValueHandleEntry[] {
    const root = this.getRootEnvironment();
    return root.valueHandleRegistry?.getEntries() ?? [];
  }

  findIssuedHandlesByCanonicalValue(value: unknown): readonly ValueHandleEntry[] {
    const root = this.getRootEnvironment();
    return root.valueHandleRegistry?.findByCanonicalValue(value) ?? [];
  }

  getExeLabels(): readonly string[] | undefined {
    if (this._exeLabels) return this._exeLabels;
    return this.parent?.getExeLabels();
  }

  getAllowedTools(): Set<string> | undefined {
    if (this.allowedTools) return this.allowedTools;
    return this.parent?.getAllowedTools();
  }

  private normalizeToolScopeName(toolName: string): string {
    return toolName.trim().toLowerCase();
  }

  setAllowedTools(tools?: Iterable<string> | null): void {
    if (!tools) {
      if (this.parent?.getAllowedTools()) {
        throw new Error('Tool scope cannot widen beyond parent environment');
      }
      this.allowedTools = undefined;
      return;
    }

    const normalized = new Set<string>();
    for (const tool of tools) {
      if (typeof tool !== 'string') {
        continue;
      }
      const trimmed = this.normalizeToolScopeName(tool);
      if (trimmed.length > 0) {
        normalized.add(trimmed);
      }
    }

    const parentAllowed = this.parent?.getAllowedTools();
    if (parentAllowed) {
      const invalid = Array.from(normalized).filter(tool => !parentAllowed.has(tool));
      if (invalid.length > 0) {
        throw new Error(`Tool scope cannot add tools outside parent: ${invalid.join(', ')}`);
      }
    }

    this.allowedTools = normalized;
  }

  isToolAllowed(toolName: string, mcpName?: string): boolean {
    const allowed = this.getAllowedTools();
    if (!allowed) {
      return true;
    }
    if (allowed.size === 0) {
      return false;
    }
    if (allowed.has('*')) {
      return true;
    }
    const normalizedToolName = this.normalizeToolScopeName(toolName);
    if (normalizedToolName && allowed.has(normalizedToolName)) {
      return true;
    }
    const normalizedMcpName = mcpName ? this.normalizeToolScopeName(mcpName) : '';
    if (normalizedMcpName && allowed.has(normalizedMcpName)) {
      return true;
    }
    return false;
  }

  getAllowedMcpServers(): Set<string> | undefined {
    if (this.allowedMcpServers) return this.allowedMcpServers;
    return this.parent?.getAllowedMcpServers();
  }

  setAllowedMcpServers(servers?: Iterable<string> | null): void {
    if (!servers) {
      if (this.parent?.getAllowedMcpServers()) {
        throw new Error('MCP scope cannot widen beyond parent environment');
      }
      this.allowedMcpServers = undefined;
      return;
    }

    const normalized = new Set<string>();
    for (const server of servers) {
      if (typeof server !== 'string') {
        continue;
      }
      const trimmed = server.trim();
      if (trimmed.length > 0) {
        normalized.add(trimmed);
      }
    }

    const parentAllowed = this.parent?.getAllowedMcpServers();
    if (parentAllowed) {
      const invalid = Array.from(normalized).filter(server => !parentAllowed.has(server));
      if (invalid.length > 0) {
        throw new Error(`MCP scope cannot add servers outside parent: ${invalid.join(', ')}`);
      }
    }

    this.allowedMcpServers = normalized;
  }

  isMcpServerAllowed(serverSpec?: string | null): boolean {
    const allowed = this.getAllowedMcpServers();
    if (!allowed) {
      return true;
    }
    if (allowed.size === 0) {
      return false;
    }
    if (allowed.has('*')) {
      return true;
    }
    if (!serverSpec || typeof serverSpec !== 'string') {
      return false;
    }
    const normalized = serverSpec.trim();
    if (!normalized) {
      return false;
    }
    return allowed.has(normalized);
  }

  enforceToolAllowed(
    toolName: string,
    options?: { sourceLocation?: SourceLocation; mcpName?: string; reason?: string }
  ): void {
    if (this.isToolAllowed(toolName, options?.mcpName)) {
      return;
    }
    throw new MlldSecurityError(
      options?.reason ?? `Tool '${toolName}' denied by env.tools`,
      {
        code: 'ENV_TOOL_DENIED',
        sourceLocation: options?.sourceLocation,
        env: this
      }
    );
  }

  enforceMcpServerAllowed(
    serverSpec: string | undefined,
    options?: { sourceLocation?: SourceLocation }
  ): void {
    if (this.isMcpServerAllowed(serverSpec)) {
      return;
    }
    const target = serverSpec && serverSpec.trim().length > 0 ? serverSpec : '<unknown>';
    throw new MlldSecurityError(
      `MCP server '${target}' denied by env.mcps`,
      {
        code: 'ENV_MCP_DENIED',
        sourceLocation: options?.sourceLocation,
        env: this
      }
    );
  }

  setPolicyContext(policy?: Record<string, unknown> | null): void {
    const runtime = this.ensureSecurityRuntime();
    runtime.policy = policy ?? undefined;
  }

  setPolicyEnvironment(environment?: string | null): void {
    const existing = (this.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
    const nextContext = {
      tier: (existing as any).tier ?? null,
      configs: (existing as any).configs ?? {},
      activePolicies: (existing as any).activePolicies ?? [],
      environment: environment ?? null
    };
    this.setPolicyContext(nextContext);
  }

  getPolicyContext(): Record<string, unknown> | undefined {
    if (this.securityRuntime?.policy) {
      return this.securityRuntime.policy as Record<string, unknown>;
    }
    return this.parent?.getPolicyContext();
  }

  getProjectConfig(): ProjectConfig | undefined {
    if (this.projectConfig) {
      return this.projectConfig;
    }
    return this.parent?.getProjectConfig();
  }

  recordPolicyConfig(alias: string, config: any): void {
    const normalizedConfig = normalizePolicyConfig(config);
    this.policySummary = mergePolicyConfigs(this.policySummary, normalizedConfig);

    const existing = (this.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
    const existingPolicies = (existing as any).activePolicies;
    const activePolicies = Array.isArray(existingPolicies) ? [...existingPolicies] : [];
    if (!activePolicies.includes(alias)) {
      activePolicies.push(alias);
    }

    const nextContext = {
      tier: (existing as any).tier ?? null,
      configs: this.policySummary ?? {},
      activePolicies,
      ...((existing as any).environment ? { environment: (existing as any).environment } : {})
    };
    this.setPolicyContext(nextContext);
  }

  registerRecordDefinition(name: string, definition: RecordDefinition): void {
    const recordName = typeof name === 'string' ? name.trim() : '';
    if (!recordName) {
      return;
    }
    if (!this.recordDefinitions) {
      this.recordDefinitions = new Map();
    }
    this.recordDefinitions.set(recordName, definition);
  }

  getRecordDefinition(name: string): RecordDefinition | undefined {
    const recordName = typeof name === 'string' ? name.trim() : '';
    if (!recordName) {
      return undefined;
    }
    return this.recordDefinitions?.get(recordName) ?? this.parent?.getRecordDefinition(recordName);
  }

  registerShelfDefinition(name: string, definition: ShelfDefinition): void {
    const shelfName = typeof name === 'string' ? name.trim() : '';
    if (!shelfName) {
      return;
    }
    if (!this.shelfDefinitions) {
      this.shelfDefinitions = new Map();
    }
    this.shelfDefinitions.set(shelfName, definition);
  }

  getShelfDefinition(name: string): ShelfDefinition | undefined {
    const shelfName = typeof name === 'string' ? name.trim() : '';
    if (!shelfName) {
      return undefined;
    }
    return this.shelfDefinitions?.get(shelfName) ?? this.parent?.getShelfDefinition(shelfName);
  }

  getAllShelfDefinitions(): Map<string, ShelfDefinition> {
    const merged = this.parent?.getAllShelfDefinitions() ?? new Map<string, ShelfDefinition>();
    if (this.shelfDefinitions) {
      for (const [name, definition] of this.shelfDefinitions.entries()) {
        merged.set(name, definition);
      }
    }
    return merged;
  }

  private getShelfOwner(name: string): Environment | undefined {
    const shelfName = typeof name === 'string' ? name.trim() : '';
    if (!shelfName) {
      return undefined;
    }
    if (this.shelfDefinitions?.has(shelfName)) {
      return this;
    }
    return this.parent?.getShelfOwner(shelfName);
  }

  private ensureShelfStateBucket(shelfName: string): Map<string, unknown> {
    if (!this.shelfState) {
      this.shelfState = new Map();
    }
    const existing = this.shelfState.get(shelfName);
    if (existing) {
      return existing;
    }
    const bucket = new Map<string, unknown>();
    this.shelfState.set(shelfName, bucket);
    return bucket;
  }

  readShelfSlot(shelfName: string, slotName: string): unknown {
    const owner = this.getShelfOwner(shelfName);
    if (!owner) {
      return undefined;
    }
    const value = owner.shelfState?.get(shelfName)?.get(slotName);
    const slotRef = `@${shelfName}.${slotName}`;
    const readTs = new Date().toISOString();
    this.maybeEmitRuntimeTraceStaleShelfRead(slotRef, value, readTs);
    this.emitRuntimeTrace('verbose', 'shelf', 'shelf.read', {
      slot: slotRef,
      found: value !== undefined,
      value: this.summarizeTraceValue(value)
    });
    return value;
  }

  writeShelfSlot(
    shelfName: string,
    slotName: string,
    value: unknown,
    options: {
      traceEvent?: string;
      action?: string;
      traceData?: Record<string, unknown>;
    } = {}
  ): void {
    const owner = this.getShelfOwner(shelfName);
    if (!owner) {
      throw new Error(`Shelf '@${shelfName}' is not defined`);
    }
    owner.ensureShelfStateBucket(shelfName).set(slotName, value);
    const slotRef = `@${shelfName}.${slotName}`;
    this.recordRuntimeTraceShelfWrite(slotRef, value);
    this.emitRuntimeTrace('effects', 'shelf', options.traceEvent ?? 'shelf.write', {
      slot: slotRef,
      action: options.action ?? 'write',
      success: true,
      value: this.summarizeTraceValue(value),
      ...(options.traceData ?? {})
    });
  }

  clearShelfSlot(shelfName: string, slotName: string): void {
    const owner = this.getShelfOwner(shelfName);
    if (!owner) {
      return;
    }
    const removed = owner.shelfState?.get(shelfName)?.delete(slotName) ?? false;
    const slotRef = `@${shelfName}.${slotName}`;
    if (removed) {
      this.recordRuntimeTraceShelfWrite(slotRef, undefined);
    }
    this.emitRuntimeTrace('effects', 'shelf', 'shelf.clear', {
      slot: slotRef,
      action: 'clear',
      success: removed
    });
  }

  getSecuritySnapshot(): SecuritySnapshotLike | undefined {
    if (this.securityRuntime) {
      const top = this.securityRuntime.stack[this.securityRuntime.stack.length - 1];
      return {
        labels: this.securityRuntime.descriptor.labels,
        sources: this.securityRuntime.descriptor.sources,
        taint: this.securityRuntime.descriptor.taint,
        attestations: this.securityRuntime.descriptor.attestations,
        urls: this.securityRuntime.descriptor.urls,
        tools: this.securityRuntime.descriptor.tools,
        policy: this.securityRuntime.policy,
        operation: top?.operation
      };
    }
    return this.parent?.getSecuritySnapshot();
  }

  getLocalSecurityDescriptor(): SecurityDescriptor | undefined {
    const descriptor = this.securityRuntime?.descriptor;
    if (!descriptor) {
      return undefined;
    }
    if (
      descriptor.labels.length === 0
      && descriptor.taint.length === 0
      && descriptor.attestations.length === 0
      && descriptor.sources.length === 0
      && (descriptor.urls?.length ?? 0) === 0
      && (descriptor.tools?.length ?? 0) === 0
    ) {
      return undefined;
    }
    return descriptor;
  }

  private snapshotToDescriptor(snapshot?: SecuritySnapshotLike): SecurityDescriptor | undefined {
    if (!snapshot) {
      return undefined;
    }
    return makeSecurityDescriptor({
      labels: snapshot.labels,
      taint: snapshot.taint,
      attestations: snapshot.attestations,
      sources: snapshot.sources,
      urls: snapshot.urls,
      tools: snapshot.tools,
      policyContext: snapshot.policy
    });
  }

  pushSecurityContext(input: SecurityContextInput): void {
    const runtime = this.ensureSecurityRuntime();
    const previousDescriptor = runtime.descriptor;
    const merged = mergeDescriptors(previousDescriptor, input.descriptor);
    const policy = input.policy ?? runtime.policy;
    runtime.stack.push({
      kind: input.kind,
      importType: input.importType,
      metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
      operation: input.operation ? Object.freeze({ ...input.operation }) : undefined,
      previousDescriptor,
      previousPolicy: runtime.policy
    });
    runtime.descriptor = merged;
    runtime.policy = policy;
  }

  popSecurityContext(): CapabilityContext | undefined {
    const runtime = this.securityRuntime;
    if (!runtime) {
      return undefined;
    }
    const frame = runtime.stack.pop();
    if (!frame) {
      return undefined;
    }
    const descriptor = runtime.descriptor;
    const context = createCapabilityContext({
      kind: frame.kind,
      importType: frame.importType,
      descriptor,
      metadata: frame.metadata,
      policy: runtime.policy,
      operation: frame.operation
    });
    runtime.descriptor = frame.previousDescriptor;
    runtime.policy = frame.previousPolicy;
    return context;
  }

  mergeSecurityDescriptors(
    ...descriptors: Array<SecurityDescriptor | undefined>
  ): SecurityDescriptor {
    return mergeDescriptors(...descriptors);
  }

  recordSecurityDescriptor(descriptor: SecurityDescriptor | undefined): void {
    if (!descriptor) {
      return;
    }
    const runtime = this.ensureSecurityRuntime();
    runtime.descriptor = mergeDescriptors(runtime.descriptor, descriptor);
  }

  recordKnownUrls(urls: readonly string[] | undefined): void {
    this.contextManager.recordKnownUrls(urls);
  }

  getKnownUrls(): readonly string[] {
    return this.contextManager.getKnownUrls();
  }

  recordKnownUrlsFromValue(value: unknown): readonly string[] {
    const urls = extractUrlsFromValue(value);
    this.recordKnownUrls(urls);
    return urls;
  }

  recordStateWrite(write: Omit<StateWrite, 'index' | 'timestamp'> & { index?: number; timestamp?: string }): void {
    const root = this.getRootEnvironment();
    const entry: StateWrite = {
      ...write,
      index: write.index ?? root.stateWriteIndex++,
      timestamp: write.timestamp ?? new Date().toISOString()
    };
    root.stateWrites.push(entry);
    root.applyStateWriteToSnapshot(entry);

    if (root.hasSDKEmitter()) {
      root.emitSDKEvent({
        type: 'state:write',
        write: entry,
        timestamp: Date.now()
      } as SDKEvent);
    }
  }

  getStateWrites(): StateWrite[] {
    return this.getRootEnvironment().stateWrites;
  }

  recordGuardDenial(denial: SDKGuardDenial): void {
    const root = this.getRootEnvironment();
    const entry: SDKGuardDenial = {
      ...denial,
      labels: Array.isArray(denial.labels) ? [...denial.labels] : [],
      args: denial.args ? { ...denial.args } : null
    };
    root.guardDenials.push(entry);

    if (root.hasSDKEmitter()) {
      root.emitSDKEvent({
        type: 'guard_denial',
        guard_denial: entry,
        timestamp: Date.now()
      } as SDKEvent);
    }
  }

  recordGuardDenialFromError(error: unknown): void {
    if (!error || typeof error !== 'object') {
      return;
    }

    const root = this.getRootEnvironment();
    if (root.recordedGuardDenialErrors.has(error as object)) {
      return;
    }

    const denial = extractGuardDenial(error);
    if (!denial) {
      return;
    }

    root.recordedGuardDenialErrors.add(error as object);
    root.recordGuardDenial(denial);
  }

  getGuardDenials(): SDKGuardDenial[] {
    const root = this.getRootEnvironment();
    return root.guardDenials.map(denial => ({
      ...denial,
      labels: [...denial.labels],
      args: denial.args ? { ...denial.args } : null
    }));
  }

  hasDynamicStateSnapshot(): boolean {
    return this.getRootEnvironment().stateSnapshot !== undefined;
  }

  applyExternalStateUpdate(path: string, value: unknown, labels?: string[]): void {
    const root = this.getRootEnvironment();
    if (!root.stateSnapshot) {
      throw new Error('No dynamic @state snapshot is available for this execution');
    }

    if (!root.setStateSnapshotValue(path, value)) {
      throw new Error('State update path is required');
    }

    root.setStatePathLabels(path, root.normalizeStateUpdateLabels(labels));

    root.refreshStateVariable();
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ZONE 3: Variable & Resolver Management
  // ═══════════════════════════════════════════════════════════════

  getRegistryManager(): RegistryManager | undefined {
    // Get from this environment or parent
    if (this.registryManager) return this.registryManager;
    return this.parent?.getRegistryManager();
  }

  setMcpServerMap(map: Record<string, string>): void {
    this.mcpServerMap = map;
  }

  getMcpServerMap(): Record<string, string> | undefined {
    if (this.mcpServerMap) return this.mcpServerMap;
    return this.parent?.getMcpServerMap();
  }

  getMcpImportManager(): McpImportManager {
    if (this.parent) {
      return this.parent.getMcpImportManager();
    }
    if (!this.mcpImportManager) {
      this.mcpImportManager = new McpImportManager(this);
    }
    return this.mcpImportManager;
  }
  
  getResolverManager(): ResolverManager | undefined {
    // Get from this environment or parent
    if (this.resolverManager) return this.resolverManager;
    return this.parent?.getResolverManager();
  }

  getFileSystemService(): IFileSystemService {
    return this.fileSystem;
  }

  setSigService(service: SigService | undefined): void {
    const root = this.getRootEnvironment();
    root.sigService = service;
    if (!service) {
      return;
    }
    root.registerSigAwareFileSystem(root.fileSystem);
    for (const workspace of root.workspaceStack) {
      root.registerSigAwareFileSystem(workspace.fs);
    }
  }

  getSigService(): SigService | undefined {
    return this.getRootEnvironment().sigService;
  }

  setSignerIdentity(identity: string): void {
    const root = this.getRootEnvironment();
    const normalized = identity.trim();
    root.signerIdentity = normalized.length > 0 ? normalized : 'unknown';
  }

  getSignerIdentity(): string {
    return this.getRootEnvironment().signerIdentity;
  }

  canDirectlySignFileSystem(fileSystem: IFileSystemService): boolean {
    if (fileSystem.isVirtual?.()) {
      return false;
    }
    return fileSystem === this.getRootEnvironment().fileSystem;
  }

  registerSigAwareFileSystem(fileSystem?: IFileSystemService): void {
    const root = this.getRootEnvironment();
    if (!root.sigService) {
      return;
    }
    if (!(fileSystem instanceof VirtualFS)) {
      return;
    }
    if (root.registeredSigAwareFileSystems.has(fileSystem)) {
      return;
    }

    root.registeredSigAwareFileSystems.add(fileSystem);
    fileSystem.onFlush(async (targetPath, signingContext) => {
      if (!signingContext) {
        return;
      }
      await root.signFileIntegrity(targetPath, signingContext);
    });
  }

  async signFileIntegrity(
    filePath: string,
    signingContext: VirtualFSSigningContext
  ): Promise<void> {
    const root = this.getRootEnvironment();
    const sigService = root.sigService;
    if (!sigService || sigService.isExcluded(filePath)) {
      return;
    }

    try {
      await sigService.sign(
        filePath,
        signingContext.identity,
        buildFileSigningMetadata(signingContext.taint)
      );
    } catch (error: any) {
      await appendAuditEvent(root.fileSystem, root.getProjectRoot(), {
        event: 'sign-error',
        path: filePath,
        detail: error?.message ?? 'Unknown signing error'
      });
    }
  }
  
  // --- File Interpolation Support ---
  
  /**
   * Check if file interpolation is enabled
   */
  isFileInterpolationEnabled(): boolean {
    if (this.parent) return this.parent.isFileInterpolationEnabled();
    return this.enableFileInterpolation;
  }
  
  /**
   * Set file interpolation enabled state
   */
  setFileInterpolationEnabled(enabled: boolean): void {
    if (this.parent) {
      this.parent.setFileInterpolationEnabled(enabled);
    } else {
      this.enableFileInterpolation = enabled;
    }
  }
  
  /**
   * Check if a file path is in the interpolation stack (circular reference detection)
   */
  isInInterpolationStack(path: string): boolean {
    if (this.interpolationStack.has(path)) return true;
    return this.parent?.isInInterpolationStack(path) || false;
  }
  
  /**
   * Add a file path to the interpolation stack
   * Each environment maintains its own stack to support parallel execution
   */
  pushInterpolationStack(path: string): void {
    this.interpolationStack.add(path);
  }

  /**
   * Remove a file path from the interpolation stack
   * Each environment maintains its own stack to support parallel execution
   */
  popInterpolationStack(path: string): void {
    this.interpolationStack.delete(path);
  }

  /**
   * Get the current recursive call depth for an executable.
   * Sums counts up the parent chain so each branch tracks its own depth independently.
   */
  getCallDepth(identifier: string): number {
    return (this.resolutionStack.get(identifier) ?? 0)
         + (this.parent?.getCallDepth(identifier) ?? 0);
  }

  /**
   * Check if an executable is currently being resolved (circular reference detection).
   * Returns true if call depth > 0 in any ancestor environment.
   */
  isResolving(identifier: string): boolean {
    return this.getCallDepth(identifier) > 0;
  }

  /**
   * Mark an executable as being resolved (increments depth counter)
   */
  beginResolving(identifier: string): void {
    this.resolutionStack.set(identifier, (this.resolutionStack.get(identifier) ?? 0) + 1);
  }

  /**
   * Mark an executable as finished resolving (decrements depth counter)
   */
  endResolving(identifier: string): void {
    const n = this.resolutionStack.get(identifier) ?? 0;
    n <= 1
      ? this.resolutionStack.delete(identifier)
      : this.resolutionStack.set(identifier, n - 1);
  }

  /**
   * Get the current iteration file for <> placeholder
   */
  getCurrentIterationFile(): any {
    return this.currentIterationFile || this.parent?.getCurrentIterationFile();
  }
  
  /**
   * Set the current iteration file for <> placeholder
   */
  setCurrentIterationFile(file: any): void {
    this.currentIterationFile = file;
  }
  
  // --- Variable Management ---
  
  setVariable(name: string, variable: Variable): void {
    this.variableManager.setVariable(name, variable);
    if (this.hasSDKEmitter()) {
      const provenance = this.getVariableProvenance(variable);
      this.emitSDKEvent({
        type: 'debug:variable:create',
        name,
        variable,
        timestamp: Date.now(),
        ...(provenance && { provenance })
      });
    }
  }

  /**
   * Set a parameter variable without checking for import conflicts.
   * Used for temporary parameter variables in exec functions.
   */
  setParameterVariable(name: string, variable: Variable): void {
    this.variableManager.setParameterVariable(name, variable);
  }

  /**
   * Update an existing variable's value in place.
   * Used for augmented assignment (+=) on local let bindings.
   */
  updateVariable(name: string, variable: Variable): void {
    this.variableManager.updateVariable(name, variable);
  }

  getVariable(name: string): Variable | undefined {
    const variable =
      name === 'fyi'
        ? createFyiVariable(this)
        : name === 'shelf'
          ? (this.isShelfBuiltinAvailable() ? createShelfBuiltinVariable(this) : undefined)
        : name === 'shelve'
          ? (this.isShelfBuiltinAvailable() ? createShelveVariable(this) : undefined)
        : this.variableManager.getVariable(name);
    if (this.hasSDKEmitter()) {
      const provenance = this.getVariableProvenance(variable);
      this.emitSDKEvent({
        type: 'debug:variable:access',
        name,
        timestamp: Date.now(),
        ...(provenance && { provenance })
      });
    }
    return variable;
  }

  /**
   * Get the value of a variable, handling special cases
   * This is a convenience method for consumers
   */
  getVariableValue(name: string): any {
    return this.variableManager.getVariableValue(name);
  }

  private getVariableProvenance(variable?: Variable): SecurityDescriptor | undefined {
    if (!this.isProvenanceEnabled()) {
      return undefined;
    }
    return (
      getExpressionProvenance((variable as any)?.value ?? variable) ??
      variable?.metadata?.security ??
      variable?.security ??
      this.snapshotToDescriptor(this.getSecuritySnapshot()) ??
      makeSecurityDescriptor()
    );
  }
  
  /**
   * Get a resolver variable with proper async resolution
   * This handles context-dependent behavior for resolvers
   */
  async getResolverVariable(name: string): Promise<Variable | undefined> {
    if (!this.reservedNames.has(name)) {
      return undefined;
    }

    if (name === 'fyi') {
      return createFyiVariable(this);
    }

    if (name === 'shelf') {
      return this.isShelfBuiltinAvailable() ? createShelfBuiltinVariable(this) : undefined;
    }

    if (name === 'shelve') {
      return this.isShelfBuiltinAvailable() ? createShelveVariable(this) : undefined;
    }

    if (name === 'keychain') {
      throw new MlldInterpreterError(
        'Direct keychain access is not available. Use policy.auth with using auth:*.',
        { code: 'KEYCHAIN_DIRECT_ACCESS_DENIED' }
      );
    }

    if (name === 'debug') {
      return this.createDebugVariable(this.createDebugObject(3));
    }

    const cached = this.cacheManager.getResolverVariable(name);
    if (cached?.internal?.needsResolution === false) {
      return cached;
    }

    const resolverManager = this.getResolverManager();
    if (!resolverManager) {
      return this.createPendingResolverVariable(name);
    }

    try {
      const resolverContent = await resolverManager.resolve(`@${name}`, { context: 'variable' });
      const resolvedVar = this.convertResolverContent(name, resolverContent);
      this.projectResolverSecurityMetadata(resolvedVar, resolverContent);
      this.cacheManager.setResolverVariable(name, resolvedVar);
      return resolvedVar;
    } catch (error) {
      console.warn(`Failed to resolve variable @${name}: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  hasVariable(name: string): boolean {
    if (name === 'fyi') {
      return true;
    }
    if (name === 'shelf' || name === 'shelve') {
      return this.isShelfBuiltinAvailable();
    }
    return this.variableManager.hasVariable(name);
  }

  private isShelfBuiltinAvailable(): boolean {
    const scopedConfig = this.getScopedEnvironmentConfig() as
      | ({ shelf?: { __mlldShelfScope?: boolean; writeSlots?: unknown[] } } & Record<string, unknown>)
      | undefined;
    const scopedShelf = scopedConfig?.shelf;
    if (scopedShelf && typeof scopedShelf === 'object' && scopedShelf.__mlldShelfScope === true) {
      return Array.isArray(scopedShelf.writeSlots) && scopedShelf.writeSlots.length > 0;
    }
    return true;
  }
  
  /**
   * Get a transform function by name
   * First checks variables, then built-in transform implementations
   */
  getTransform(name: string): Function | undefined {
    const variable = this.getVariable(name);
    if (variable && typeof variable === 'object' && '__executable' in variable) {
      return variable;
    }

    const builtin = builtinTransformers.find(
      transformer => transformer.name === name || transformer.uppercase === name
    );
    if (builtin) {
      return builtin.implementation;
    }

    return undefined;
  }
  
  // --- Frontmatter Support ---
  
  /**
   * Set frontmatter data for this environment
   * Creates both @fm and @frontmatter as aliases to the same data
   */
  setFrontmatter(data: Record<string, unknown>): void {
    const frontmatterVariable = createObjectVariable(
      'frontmatter',
      data,
      true,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        mx: {
          source: 'frontmatter',
          definedAt: { line: 0, column: 0, filePath: '<frontmatter>' }
        },
        internal: {
          isSystem: true,
          immutable: true
        }
      }
    );

    this.variableManager.setVariable('fm', frontmatterVariable);
    this.variableManager.setVariable('frontmatter', frontmatterVariable);
  }
  
  // --- Node Management ---
  
  addNode(node: MlldNode): void {
    this.nodes.push(node);
  }
  
  getNodes(): MlldNode[] {
    return this.nodes;
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE 4: Operation & Pipeline Context
  // ═══════════════════════════════════════════════════════════════

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getHookManager(): HookManager {
    return this.hookManager;
  }

  getHookRegistry(): HookRegistry {
    return this.hookRegistry;
  }

  getGuardRegistry(): GuardRegistry {
    return this.guardRegistry;
  }

  setCheckpointManager(manager: CheckpointManager | undefined): void {
    const root = this.getRootEnvironment();
    root.checkpointManager = manager;
    root.checkpointManagerFactory = undefined;
    root.checkpointManagerInitPromise = undefined;
    this.checkpointManager = manager;
  }

  setCheckpointManagerFactory(
    factory: (() => Promise<CheckpointManager | undefined>) | undefined
  ): void {
    const root = this.getRootEnvironment();
    root.checkpointManagerFactory = factory;
    root.checkpointManagerInitPromise = undefined;
    root.checkpointManager = undefined;
    this.checkpointManager = undefined;
  }

  async ensureCheckpointManager(): Promise<CheckpointManager | undefined> {
    const root = this.getRootEnvironment();
    if (root.checkpointManager) {
      return root.checkpointManager;
    }

    if (!root.checkpointManagerFactory) {
      return undefined;
    }

    if (!root.checkpointManagerInitPromise) {
      root.checkpointManagerInitPromise = root
        .checkpointManagerFactory()
        .then(manager => {
          root.checkpointManager = manager;
          return manager;
        })
        .finally(() => {
          root.checkpointManagerInitPromise = undefined;
        });
    }

    const manager = await root.checkpointManagerInitPromise;
    this.checkpointManager = manager;
    return manager;
  }

  getCheckpointManager(): CheckpointManager | undefined {
    const root = this.getRootEnvironment();
    return root.checkpointManager;
  }

  setCheckpointScriptResumeMode(mode: CheckpointResumeMode): void {
    const root = this.getRootEnvironment();
    root.checkpointScriptResumeMode = mode;
    this.checkpointScriptResumeMode = mode;
  }

  getCheckpointScriptResumeMode(): CheckpointResumeMode {
    const root = this.getRootEnvironment();
    return root.checkpointScriptResumeMode;
  }

  setCheckpointResumeOverride(enabled: boolean): void {
    const root = this.getRootEnvironment();
    root.checkpointResumeOverride = enabled;
    this.checkpointResumeOverride = enabled;
  }

  hasCheckpointResumeOverride(): boolean {
    const root = this.getRootEnvironment();
    return root.checkpointResumeOverride === true;
  }

  setActiveCheckpointScope(scope: ActiveCheckpointScope | undefined): void {
    const root = this.getRootEnvironment();
    root.activeCheckpointScope = scope;
    this.activeCheckpointScope = scope;
  }

  getActiveCheckpointScope(): ActiveCheckpointScope | undefined {
    const root = this.getRootEnvironment();
    return root.activeCheckpointScope;
  }

  /**
   * Set pipeline execution context
   */
  setPipelineContext(context: PipelineContextSnapshot): void {
    this.contextManager.pushPipelineContext(context);
  }

  /**
   * Clear pipeline execution context
   */
  clearPipelineContext(): void {
    this.contextManager.popPipelineContext();
  }

  updatePipelineContext(context: PipelineContextSnapshot): void {
    this.contextManager.replacePipelineContext(context);
  }

  /**
   * Get current pipeline context
   */
  getPipelineContext(): PipelineContextSnapshot | undefined {
    return this.contextManager.peekPipelineContext();
  }

  getPipelineGuardHistory(): GuardHistoryEntry[] {
    if (!this.pipelineGuardHistoryStore.entries) {
      this.pipelineGuardHistoryStore.entries = [];
    }
    return this.pipelineGuardHistoryStore.entries;
  }

  recordPipelineGuardHistory(entry: GuardHistoryEntry): void {
    this.getPipelineGuardHistory().push(entry);
  }

  resetPipelineGuardHistory(): void {
    const history = this.getPipelineGuardHistory();
    history.splice(0, history.length);
  }

  serializeLocalGuards(): SerializedGuardDefinition[] {
    return this.guardRegistry.serializeOwn();
  }

  serializeGuardsByNames(names: readonly string[]): SerializedGuardDefinition[] {
    return this.guardRegistry.serializeByNames(names);
  }

  registerSerializedGuards(definitions: SerializedGuardDefinition[] | undefined | null): void {
    if (!definitions || definitions.length === 0) {
      return;
    }
    this.guardRegistry.importSerialized(definitions);
  }

  async withOpContext<T>(context: OperationContext, fn: () => Promise<T> | T): Promise<T> {
    return this.contextManager.withOperation(context, fn);
  }

  updateOpContext(update: Partial<OperationContext>): void {
    this.contextManager.updateOperation(update);
  }

  getEnclosingExeLabels(): readonly string[] {
    return this.contextManager.getEnclosingExeLabels();
  }

  setToolsAvailability(allowed: readonly string[], denied: readonly string[]): void {
    this.contextManager.setToolAvailability(allowed, denied);
  }

  recordToolCall(call: ToolCallRecord): void {
    this.contextManager.recordToolCall(call);
  }

  resetToolCalls(): void {
    this.contextManager.resetToolCalls();
  }

  async withPipeContext<T>(
    context: PipelineContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withPipelineContext(context, fn);
  }

  async withGuardContext<T>(
    context: GuardContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withGuardContext(context, fn);
  }

  async withGuardSuppression<T>(fn: () => Promise<T> | T): Promise<T> {
    this.guardEvaluationDepth += 1;
    try {
      return await fn();
    } finally {
      this.guardEvaluationDepth = Math.max(0, this.guardEvaluationDepth - 1);
    }
  }

  shouldSuppressGuards(): boolean {
    if (this.guardEvaluationDepth > 0) {
      return true;
    }
    return this.parent?.shouldSuppressGuards() ?? false;
  }

  async withHookSuppression<T>(fn: () => Promise<T> | T): Promise<T> {
    this.hookEvaluationDepth += 1;
    try {
      return await fn();
    } finally {
      this.hookEvaluationDepth = Math.max(0, this.hookEvaluationDepth - 1);
    }
  }

  shouldSuppressUserHooks(): boolean {
    if (this.hookEvaluationDepth > 0 || this.guardEvaluationDepth > 0) {
      return true;
    }
    return this.parent?.shouldSuppressUserHooks() ?? false;
  }

  async withDeniedContext<T>(
    context: DeniedContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withDeniedContext(context, fn);
  }

  pushExecutionContext(type: string, context: unknown): void {
    this.contextManager.pushGenericContext(type, context);
  }

  popExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextManager.popGenericContext<T>(type);
  }

  getExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextManager.peekGenericContext<T>(type);
  }

  async withExecutionContext<T>(
    type: string,
    context: unknown,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextManager.withGenericContext(type, context, fn);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ZONE 5: Output, Effects & SDK Events
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Emit an effect immediately rather than storing as a node.
   * This enables immediate output during for loops and pipelines.
   */
  emitEffect(
    type: EffectType,
    content: string,
    options?: EffectOptions
  ): void {
    if (!this.effectHandler) {
      console.error('[WARNING] No effect handler available!');
      return;
    }

    if (type === 'doc' && this.isImportingContent) {
      return;
    }

    if ((type === 'doc' || type === 'both') && content && !/^\n+$/.test(content)) {
      this.outputRenderer.render();
    }

    const snapshot = this.getSecuritySnapshot();
    let capability: CapabilityContext | undefined;
    if (snapshot) {
      const descriptor = makeSecurityDescriptor({
        labels: snapshot.labels,
        taint: snapshot.taint,
        sources: snapshot.sources,
        policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
      });
      capability = createCapabilityContext({
        kind: 'effect',
        descriptor,
        metadata: {
          effectType: type,
          path: options?.path
        },
        operation: snapshot.operation ?? {
          kind: 'effect',
          effectType: type
        }
      });
      this.recordSecurityDescriptor(descriptor);
    }

    const effect = {
      type,
      content,
      path: options?.path,
      source: options?.source,
      mode: options?.mode,
      metadata: options?.metadata,
      capability
    };

    this.effectHandler.handleEffect(effect);

    if (this.hasSDKEmitter()) {
      const provenance = this.isProvenanceEnabled()
        ? capability?.security ?? makeSecurityDescriptor()
        : undefined;
      this.emitSDKEvent({
        type: 'effect',
        effect: {
          ...effect,
          security: capability?.security ?? makeSecurityDescriptor(),
          ...(provenance && { provenance })
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Convert an OutputIntent to an Effect and emit it
   *
   * Internal method used by OutputRenderer callback to route
   * intents through the effect system.
   */
  private intentToEffect(intent: OutputIntent): void {
    let effectType: EffectType;

    switch (intent.type) {
      case 'content':
        effectType = 'doc';
        break;
      case 'break':
        effectType = 'doc';
        break;
      case 'progress':
        effectType = 'stdout';
        break;
      case 'error':
        effectType = 'stderr';
        break;
      default:
        effectType = 'doc';
    }

    this.emitEffect(effectType, intent.value, undefined);
  }

  /**
   * Emit an output intent
   *
   * New intent-based output system that supports:
   * - Collapsible break normalization
   * - Smart buffering for streaming
   * - Visibility control
   *
   * This is the preferred method for new code.
   */
  emitIntent(intent: OutputIntent): void {
    this.outputRenderer.emit(intent);
  }

  /**
   * Render final output (flushes pending breaks)
   *
   * Call this at the end of document execution to ensure
   * all pending intents are flushed.
   */
  renderOutput(): void {
    this.outputRenderer.render();
  }

  /**
   * Get the current effect handler (mainly for testing).
   */
  getEffectHandler(): EffectHandler {
    return this.effectHandler;
  }
  
  /**
   * Set a custom effect handler (mainly for testing).
   */
  setEffectHandler(handler: EffectHandler): void {
    this.effectHandler = handler;
  }
  
  private registerBuiltinHooks(): void {
    this.hookManager.registerPre(checkpointPreHook);
    this.hookManager.registerPre(guardPreHook);
    this.hookManager.registerPost(guardPostHook);
    this.hookManager.registerPost(taintPostHook);
    this.hookManager.registerPost(checkpointPostHook);
  }

  private registerKeepBuiltins(): void {
    try {
      if (this.variableManager.hasVariable('keep') && this.variableManager.hasVariable('keepStructured')) {
        return;
      }
      const keepExec = createKeepExecutable();
      const keepStructuredExec = createKeepStructuredExecutable();
      this.variableManager.setVariable('keep', keepExec as any);
      this.variableManager.setVariable('keepStructured', keepStructuredExec as any);
    } catch (error) {
      logger.warn('Failed to register keep builtins', error);
    }
  }

  private registerPolicyBuiltins(): void {
    try {
      if (this.variableManager.hasVariable('policy')) {
        return;
      }
      this.variableManager.setVariable('policy', createPolicyVariable(this) as any);
    } catch (error) {
      logger.warn('Failed to register policy builtins', error);
    }
  }

  private registerToolDocsBuiltin(): void {
    try {
      if (this.variableManager.hasVariable('toolDocs')) {
        return;
      }
      this.variableManager.setVariable('toolDocs', createToolDocsExecutable(this) as any);
    } catch (error) {
      logger.warn('Failed to register toolDocs builtin', error);
    }
  }

  private getRootEnvironment(): Environment {
    let current: Environment = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  enableSDKEvents(emitter: ExecutionEmitter): void {
    const root = this.getRootEnvironment();
    root.setSdkStreamingOptions(this.getStreamingOptions());
    root.enableSdkEmitter(emitter, this.getStreamingBus());
  }

  emitSDKEvent(event: SDKEvent): void {
    const root = this.getRootEnvironment();
    root.sdkEmitter?.emit(event);
  }
  
  /**
   * Get the parent environment (if this is a child environment).
   */
  getParent(): Environment | undefined {
    return this.parent;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ZONE 6: Command & Code Execution
  // ═══════════════════════════════════════════════════════════════

  // --- Shadow Environment Management ---
  
  /**
   * Set shadow environment functions for a specific language
   * 
   * WHY: Shadow environments enable mlld /exec functions to be called from
   * within JavaScript or Node.js code blocks, creating seamless integration
   * where mlld functions become regular functions in the target language.
   * 
   * GOTCHA: Each function wrapper includes references to ALL shadow functions
   * to enable cross-function calls (e.g., calculate calling add and multiply).
   * Functions must be defined before the shadow environment that contains them.
   * 
   * CONTEXT: Called by /exe directive when evaluating environment declarations
   * like: /exe js = { add, multiply, calculate }
   * 
   * @param language The language identifier (js, node, python, etc.)
   * @param functions Map of function names to their implementations
   */
  setShadowEnv(language: string, functions: Map<string, any>): void {
    if (language === 'node' || language === 'nodejs') {
      const nodeEnv = this.ensureNodeShadowEnv();
      for (const [name, fn] of functions) {
        nodeEnv.addFunction(name, fn);
      }
      return;
    }

    if (language === 'python' || language === 'py') {
      this.ensurePythonShadowEnv();
      this.shadowEnvs.set(language, functions);
      return;
    }

    this.shadowEnvs.set(language, functions);
  }
  
  /**
   * Get shadow environment functions for a specific language
   * WHY: Language executors (JavaScript, Node.js) need access to user-defined functions
   * during code execution. Shadow environments provide this without variable pollution.
   * GOTCHA: Returns a Map, not an object. Functions are stored by reference and may
   * have been defined in parent environments - this method walks the scope chain.
   * CONTEXT: Called by JavaScriptExecutor and NodeExecutor when building the execution
   * context for code blocks that might reference shadow functions.
   * @param language The language identifier (js, javascript, node, nodejs, etc.)
   * @returns Map of function names to implementations, or undefined if not set
   */
  getShadowEnv(language: string): Map<string, any> | undefined {
    if (language === 'node' || language === 'nodejs') {
      const nodeEnv = this.getNodeShadowEnv();
      if (!nodeEnv) {
        return undefined;
      }
      return this.toNodeFunctionMap(nodeEnv);
    }

    return this.shadowEnvs.get(language) ?? this.parent?.getShadowEnv(language);
  }
  
  /**
   * Get Node shadow environment instance with parent environment fallback
   * WHY: Node.js execution requires a VM-based isolated context for security and
   * proper module resolution. The NodeShadowEnvironment wraps Node's vm module.
   * GOTCHA: This returns the instance itself, not the functions. Parent environments
   * are checked if the current environment doesn't have a Node shadow env.
   * CONTEXT: Used internally by getShadowEnv() for Node.js language execution and
   * by NodeExecutor for running Node.js code blocks.
   * @returns NodeShadowEnvironment instance or undefined if not available
   */
  getNodeShadowEnv(): NodeShadowEnvironment | undefined {
    return this.nodeShadowEnv ?? this.parent?.getNodeShadowEnv();
  }
  
  /**
   * Get or create Node shadow environment instance
   * @returns NodeShadowEnvironment instance (always creates one if needed)
   */
  getOrCreateNodeShadowEnv(): NodeShadowEnvironment {
    if (this.nodeShadowEnv) {
      return this.nodeShadowEnv;
    }

    const parentNodeEnv = this.parent?.getNodeShadowEnv();
    if (parentNodeEnv) {
      return parentNodeEnv;
    }

    this.nodeShadowEnv = this.createNodeShadowEnv();
    return this.nodeShadowEnv;
  }

  /**
   * Get Python shadow environment instance with parent environment fallback
   * @returns PythonShadowEnvironment instance or undefined if not available
   */
  getPythonShadowEnv(): PythonShadowEnvironment | undefined {
    return this.pythonShadowEnv ?? this.parent?.getPythonShadowEnv();
  }

  /**
   * Get or create Python shadow environment instance
   * @returns PythonShadowEnvironment instance (always creates one if needed)
   */
  getOrCreatePythonShadowEnv(): PythonShadowEnvironment {
    if (this.pythonShadowEnv) {
      return this.pythonShadowEnv;
    }

    const parentPythonEnv = this.parent?.getPythonShadowEnv();
    if (parentPythonEnv) {
      return parentPythonEnv;
    }

    this.pythonShadowEnv = this.createPythonShadowEnv();
    return this.pythonShadowEnv;
  }

  /**
   * Captures all shadow environments for lexical scoping in executables
   * WHY: When executables are defined, they may reference shadow functions.
   * This capture preserves the lexical scope, allowing imported functions
   * to access their original shadow environment.
   * CONTEXT: Called during executable creation in exe.ts
   * @returns Object containing all language shadow environments
   */
  captureAllShadowEnvs(): ShadowEnvironmentCapture {
    const capture: ShadowEnvironmentCapture = {};

    const jsEnv = this.shadowEnvs.get('js');
    if (jsEnv && jsEnv.size > 0) {
      capture.js = new Map(jsEnv);
    }

    const javascriptEnv = this.shadowEnvs.get('javascript');
    if (javascriptEnv && javascriptEnv.size > 0) {
      capture.javascript = new Map(javascriptEnv);
    }

    if (this.nodeShadowEnv) {
      const nodeMap = this.toNodeFunctionMap(this.nodeShadowEnv);
      if (nodeMap.size > 0) {
        capture.node = nodeMap;
        capture.nodejs = nodeMap;
      }
    }

    const pythonEnv = this.shadowEnvs.get('python');
    if (pythonEnv && pythonEnv.size > 0) {
      capture.python = new Map(pythonEnv);
      capture.py = capture.python;
    }

    const pyEnv = this.shadowEnvs.get('py');
    if (pyEnv && pyEnv.size > 0 && !capture.python) {
      capture.py = new Map(pyEnv);
      capture.python = capture.py;
    }

    return capture;
  }

  /**
   * Check if this environment has any shadow environments defined
   * Used to avoid unnecessary capture operations
   */
  hasShadowEnvs(): boolean {
    for (const env of this.shadowEnvs.values()) {
      if (env.size > 0) {
        return true;
      }
    }

    return this.nodeShadowEnv !== undefined || this.pythonShadowEnv !== undefined;
  }

  /**
   * Capture the current module environment (variables) for executables
   * This allows imported executables to access their sibling functions
   */
  captureModuleEnvironment(): Map<string, Variable> {
    return new Map(this.variableManager.getVariables());
  }

  // --- Capabilities ---

  private isIgnorableWorkspaceReadError(error: unknown): boolean {
    const code = (error as { code?: string } | undefined)?.code;
    return code === 'ENOENT' || code === 'EISDIR';
  }

  private buildWorkspaceReadCandidates(pathOrUrl: string): string[] {
    const candidate = String(pathOrUrl ?? '').trim();
    if (!candidate) {
      return [];
    }

    if (candidate.startsWith('@base/') || candidate.startsWith('@root/')) {
      const projectRoot = this.getProjectRoot();
      return [path.resolve(projectRoot, candidate.slice(6))];
    }

    if (path.isAbsolute(candidate)) {
      return [path.resolve(candidate)];
    }

    if (candidate.startsWith('@')) {
      return [];
    }

    return [path.resolve(this.getFileDirectory(), candidate)];
  }

  private async readFromActiveWorkspace(pathOrUrl: string): Promise<string | undefined> {
    const workspace = this.getActiveWorkspace();
    if (!workspace || this.isURL(pathOrUrl)) {
      return undefined;
    }

    for (const candidatePath of this.buildWorkspaceReadCandidates(pathOrUrl)) {
      try {
        return await workspace.fs.readFile(candidatePath);
      } catch (error) {
        if (this.isIgnorableWorkspaceReadError(error)) {
          continue;
        }
        throw error;
      }
    }

    return undefined;
  }
  
  async readFile(pathOrUrl: string): Promise<string> {
    const workspaceRead = await this.readFromActiveWorkspace(pathOrUrl);
    if (workspaceRead !== undefined) {
      return workspaceRead;
    }
    return this.importResolver.readFile(pathOrUrl);
  }
  
  /**
   * Resolve a module reference using the ResolverManager
   * This handles @prefix/ patterns and registry lookups for @user/module
   */
  async resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ content: string; contentType: 'module' | 'data' | 'text'; metadata?: any; mx?: any; resolverName?: string }> {
    return this.importResolver.resolveModule(reference, context);
  }
  
  /**
   * Create the @INPUT value by merging stdin content with environment variables
   */

  /**
   * Get raw stdin content for legacy @stdin imports
   * This preserves the original behavior for @import from "@stdin"
   */
  getRawStdinContent(): string {
    return this.stdinContent || '';
  }

  /**
   * Get environment variables if enabled
   */
  private getEnvironmentVariables(): Record<string, string> {
    // Get project config from root environment
    let projectConfig: ProjectConfig | undefined;
    let currentEnv: Environment | undefined = this;

    // Walk up to root environment to find project config
    while (currentEnv) {
      if (currentEnv.projectConfig) {
        projectConfig = currentEnv.projectConfig;
        break;
      }
      currentEnv = currentEnv.parent;
    }

    // If no project config or no allowed vars configured, return empty
    if (!projectConfig) {
      return {};
    }

    // Get allowed environment variable names
    const allowedVars = projectConfig.getAllowedEnvVars();
    if (allowedVars.length === 0) {
      return {};
    }

    const envVars: Record<string, string> = {};

    // Only include allowed environment variables
    for (const varName of allowedVars) {
      const value = process.env[varName];
      if (value !== undefined) {
        envVars[varName] = value;
      }
    }

    return envVars;
  }

  /**
   * Set stdin content for this environment (typically only on root)
   */
  setStdinContent(content: string): void {
    if (!this.parent) {
      // Only store on root environment
      this.stdinContent = content;
      
      // Update the InputResolver if it exists
      if (this.resolverManager) {
        const inputResolver = this.resolverManager.getResolver('input');
        if (inputResolver && 'setStdinContent' in inputResolver) {
          (inputResolver as any).setStdinContent(content);
        }
      }
      
      // Reinitialize reserved variables to update @INPUT with new content
      this.variableManager.initializeReservedVariables();
    } else {
      // Delegate to parent
      this.parent.setStdinContent(content);
    }
  }
  
  /**
   * Read stdin content (cached)
   */
  readStdin(): string {
    // Check root environment for stdin content
    if (!this.parent) {
      return this.stdinContent || '';
    }
    // Delegate to parent
    return this.parent.readStdin();
  }
  

  async executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    this.enforceToolAllowed('bash', {
      sourceLocation: context?.sourceLocation,
      reason: "Command execution requires 'Bash' in env.tools"
    });
    const finalOptions = { ...this.outputOptions, ...options };
    const bus = this.getStreamingBus();
    const contextWithBus = { ...context, bus };
    return this.getCommandExecutorFactory().executeCommand(command, finalOptions, contextWithBus);
  }
  
  async executeCode(
    code: string, 
    language: string, 
    params?: Record<string, any>,
    metadata?: Record<string, any> | CommandExecutionContext,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    const normalized = this.normalizeCodeExecutionInput(metadata, options, context);
    const normalizedLanguage = language.trim().toLowerCase();
    if (normalizedLanguage === 'sh' || normalizedLanguage === 'bash') {
      this.enforceToolAllowed('bash', {
        sourceLocation: normalized.context?.sourceLocation,
        reason: "Shell execution requires 'Bash' in env.tools"
      });
      const policySummary = this.getPolicySummary();
      if (policySummary) {
        const deniedShellCommand = findDeniedShellCommand(policySummary, code);
        if (deniedShellCommand) {
          throw new MlldSecurityError(
            `${deniedShellCommand.reason} in shell block (matched: ${deniedShellCommand.commandText})`,
            {
              code: 'POLICY_CAPABILITY_DENIED',
              sourceLocation: normalized.context?.sourceLocation,
              env: this
            }
          );
        }
      }
    }
    const finalParams = this.injectAmbientMx(language, params);
    const bus = this.getStreamingBus();
    const contextWithBus = { ...normalized.context, bus };
    const mergedOptions = { ...this.outputOptions, ...options };

    return this.getCommandExecutorFactory().executeCode(
      code,
      language,
      finalParams,
      normalized.metadata,
      mergedOptions,
      contextWithBus
    );
  }

  
  
  async resolvePath(inputPath: string): Promise<string> {
    return this.importResolver.resolvePath(inputPath);
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE 7: Child Environment & Scope Lifecycle
  // ═══════════════════════════════════════════════════════════════

  private createLifecycleChild(
    childContext: PathContext | string,
    options: {
      importResolverBasePath?: string;
      includeInitialNodeCount?: boolean;
      includeModuleIsolation?: boolean;
      includeTraceInheritance?: boolean;
      inheritPolicy?: boolean;
      trackForCleanup?: boolean;
    }
  ): Environment {
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      childContext,
      this,
      this.effectHandler
    );

    child.allowAbsolutePaths = this.allowAbsolutePaths;
    child.streamingOptions = { ...this.streamingOptions };
    child.provenanceEnabled = this.provenanceEnabled;

    if (options.includeInitialNodeCount) {
      child.initialNodeCount = this.nodes.length;
    }

    if (options.includeModuleIsolation) {
      child.moduleIsolated = this.moduleIsolated;
      child.capturedModuleEnv = this.capturedModuleEnv;
    }

    if (options.includeTraceInheritance) {
      child.traceEnabled = this.traceEnabled;
      child.directiveTrace = this.directiveTrace;
      child.runtimeTraceLevel = this.runtimeTraceLevel;
      child.runtimeTraceEvents = this.runtimeTraceEvents;
      child.runtimeTraceFilePath = this.runtimeTraceFilePath;
      child.runtimeTraceStderr = this.runtimeTraceStderr;
    }

    if (this.allowedTools) {
      child.setAllowedTools(this.allowedTools);
    }
    if (this.allowedMcpServers) {
      child.setAllowedMcpServers(this.allowedMcpServers);
    }

    child.importResolver = this.importResolver.createChildResolver(
      options.importResolverBasePath,
      () => child.allowAbsolutePaths
    );

    if (options.inheritPolicy) {
      child.setPolicyCapabilities(this.getPolicyCapabilities());
      const policyContext = this.getPolicyContext();
      if (policyContext) {
        child.setPolicyContext({ ...policyContext });
      }
    }

    if (options.trackForCleanup) {
      this.childEnvironments.add(child);
    }

    child.workspaceStack = [...this.workspaceStack];
    child.bridgeStack = [...this.bridgeStack];

    return child;
  }
  
  // --- Scope Management ---

  pushActiveWorkspace(workspace: WorkspaceValue): void {
    this.workspaceStack.push(workspace);
    this.registerSigAwareFileSystem(workspace.fs);
  }

  popActiveWorkspace(): WorkspaceValue | undefined {
    return this.workspaceStack.pop();
  }

  getActiveWorkspace(): WorkspaceValue | undefined {
    return this.workspaceStack[this.workspaceStack.length - 1];
  }

  pushBridge(bridge: WorkspaceMcpBridgeHandle): void {
    this.bridgeStack.push(bridge);
  }

  popBridge(): WorkspaceMcpBridgeHandle | undefined {
    return this.bridgeStack.pop();
  }

  getActiveBridge(): WorkspaceMcpBridgeHandle | undefined {
    if (this.bridgeStack.length > 0) {
      return this.bridgeStack[this.bridgeStack.length - 1];
    }
    return this.parent?.getActiveBridge();
  }

  setLlmToolConfig(config: import('./executors/call-mcp-config').CallMcpConfig | null): void {
    this.llmToolConfig = config;
    this.contextManager.setAvailableTools(config?.availableTools ?? []);
  }

  getLlmToolConfig(): import('./executors/call-mcp-config').CallMcpConfig | null | undefined {
    if (this.llmToolConfig !== undefined) return this.llmToolConfig;
    return this.parent?.getLlmToolConfig();
  }

  registerScopeCleanup(fn: () => Promise<void>): void {
    this.scopeCleanups.push(fn);
  }

  async runScopeCleanups(): Promise<void> {
    const cleanups = this.scopeCleanups.splice(0);
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch {
        // Best-effort cleanup.
      }
    }
  }
  
  /**
   * Create a child environment with isolated variable scope
   * WHY: Child environments enable proper scoping for imports, function calls, and
   * control flow blocks. Variables defined in children don't pollute the parent.
   * GOTCHA: Shadow environments are NOT inherited - each environment manages its
   * own language-specific functions, preventing cross-scope function pollution.
   * SECURITY: Child isolation prevents variable leakage between execution contexts.
   */
  createChild(newBasePath?: string): Environment {
    const childContext = this.resolveChildContext(newBasePath);
    return this.createLifecycleChild(childContext, {
      importResolverBasePath: newBasePath,
      includeInitialNodeCount: true,
      includeModuleIsolation: true,
      inheritPolicy: true,
      trackForCleanup: true
    });
  }
  
  mergeChild(child: Environment): void {
    for (const [name, variable] of child.variableManager.getVariables()) {
      const importPath = variable.mx?.importPath;
      if (importPath === 'let' || importPath === 'exe-param') {
        continue;
      }
      this.variableManager.setVariable(name, variable);
    }
    const childDescriptor = child.getLocalSecurityDescriptor();
    if (childDescriptor) {
      this.recordSecurityDescriptor(childDescriptor);
    }
    this.nodes.push(...child.nodes);
  }
  
  // --- Special Variables ---
  
  async getProjectPath(): Promise<string> {
    return this.importResolver.getProjectPath();
  }
  
  // --- Utility Methods ---
  
  getAllVariables(): Map<string, Variable> {
    return this.variableManager.getAllVariables();
  }

  getCurrentVariables(): Map<string, Variable> {
    return this.variableManager.getCurrentVariables();
  }
  
  // --- URL Support Methods ---
  
  isURL(path: string): boolean {
    return this.importResolver.isURL(path);
  }
  
  areURLsEnabled(): boolean {
    return this.importResolver.areURLsEnabled();
  }
  
  async validateURL(url: string): Promise<void> {
    return this.importResolver.validateURL(url);
  }
  
  async fetchURL(url: string, options?: FetchURLOptions): Promise<string> {
    const content = await this.importResolver.fetchURL(url, options);
    this.recordKnownUrls([url]);
    this.recordKnownUrlsFromValue(content);
    return content;
  }
  
  // Note: getURLCacheTTL is now handled by ImportResolver via CacheManager
  
  setURLOptions(options: Partial<typeof this.defaultUrlOptions>): void {
    this.defaultUrlOptions = { ...this.defaultUrlOptions, ...options };
  }

  /**
   * Get URLCache manager
   */
  /**
   * Fetch URL with full response metadata for content loading
   */
  async fetchURLWithMetadata(url: string): Promise<{
    content: string;
    headers: Record<string, string>;
    status: number;
  }> {
    const response = await this.importResolver.fetchURLWithMetadata(url);
    this.recordKnownUrls([url]);
    this.recordKnownUrlsFromValue(response.content);
    return response;
  }
  
  setURLConfig(config: ResolvedURLConfig): void {
    this.cacheManager.setURLConfig(config);
    this.urlConfig = config;
  }

  /**
   * Configure allowance of absolute paths outside project root
   */
  setAllowAbsolutePaths(allow: boolean): void {
    this.allowAbsolutePaths = allow;
  }

  getAllowAbsolutePaths(): boolean {
    return this.allowAbsolutePaths;
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE 8: Runtime Configuration
  // ═══════════════════════════════════════════════════════════════

  // --- Output Management Methods ---
  
  setOutputOptions(options: Partial<CommandExecutionOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
  }

  setStreamingOptions(options: Partial<StreamingOptions> | undefined): void {
    const next = options ? { ...this.streamingOptions, ...options } : { ...defaultStreamingOptions };
    this.streamingOptions = next;
    if (!this.parent) {
      this.setSdkStreamingOptions(next);
    }
  }

  getStreamingOptions(): StreamingOptions {
    return { ...this.streamingOptions };
  }

  setStreamingManager(manager: StreamingManager): void {
    const root = this.getRootEnvironment();
    root.streamingManager = manager;
  }

  getStreamingManager(): StreamingManager {
    const root = this.getRootEnvironment();
    if (!root.streamingManager) {
      root.streamingManager = new StreamingManager();
    }
    return root.streamingManager;
  }

  getStreamingBus(): StreamBus {
    return this.getStreamingManager().getBus();
  }

  setStreamingResult(result: StreamingResult | undefined): void {
    const root = this.getRootEnvironment();
    root.streamingResult = result;
  }

  getStreamingResult(): StreamingResult | undefined {
    return this.getRootEnvironment().streamingResult;
  }

  setProvenanceEnabled(enabled: boolean): void {
    const root = this.getRootEnvironment();
    root.provenanceEnabled = enabled;
  }

  isProvenanceEnabled(): boolean {
    return this.getRootEnvironment().provenanceEnabled;
  }
  
  /**
   * Set import approval bypass flag
   */
  setApproveAllImports(approve: boolean): void {
    this.approveAllImports = approve;
  }

  /**
   * Set dynamic module parsing mode
   */
  setDynamicModuleMode(mode: MlldMode | undefined): void {
    this.dynamicModuleMode = mode;
  }

  /**
   * Get dynamic module parsing mode (defaults to 'strict')
   */
  getDynamicModuleMode(): MlldMode {
    return this.dynamicModuleMode ?? 'strict';
  }

  /**
   * Set blank line normalization flag
   */
  setNormalizeBlankLines(normalize: boolean): void {
    this.normalizeBlankLines = normalize;
  }
  
  /**
   * Set fuzzy matching configuration for local file imports
   */
  setLocalFileFuzzyMatch(config: FuzzyMatchConfig | boolean): void {
    this.localFileFuzzyMatch = config;
  }
  
  /**
   * Set ephemeral mode for CI/serverless environments
   * This configures in-memory caching with no persistence
   */
  async setEphemeralMode(ephemeral: boolean): Promise<void> {
    if (!ephemeral || this.parent) {
      // Only configure ephemeral mode on root environment
      return;
    }

    this.isEphemeralMode = true;
    this.approveAllImports = true;

    const reconfigured = await this.reconfigureForEphemeral({
      fileSystem: this.fileSystem,
      pathContext: this.pathContext,
      projectRoot: this.getProjectRoot(),
      hasRegistryManager: Boolean(this.registryManager),
      hasResolverManager: Boolean(this.resolverManager)
    });

    if (reconfigured.registryManager) {
      this.registryManager = reconfigured.registryManager;
    }

    if (reconfigured.resolverManager) {
      this.resolverManager = reconfigured.resolverManager;
      await this.registerBuiltinResolvers();
    }

    this.importResolver = new ImportResolver(
      buildImportResolverDependencies({
      fileSystem: this.fileSystem,
      pathService: this.pathService,
      pathContext: this.pathContext,
      basePath: this.basePath,
      cacheManager: this.cacheManager,
      getSecurityManager: this.getSecurityManager.bind(this),
      getRegistryManager: this.getRegistryManager.bind(this),
      getResolverManager: this.getResolverManager.bind(this),
      getParent: () => this.parent,
      getCurrentFilePath: this.getCurrentFilePath.bind(this),
      getApproveAllImports: () => this.approveAllImports,
      getLocalFileFuzzyMatch: () => this.localFileFuzzyMatch,
      getURLConfig: () => this.urlConfig,
      getDefaultUrlOptions: () => this.defaultUrlOptions,
      getAllowAbsolutePaths: () => this.allowAbsolutePaths
      })
    );
  }
  
  /**
   * Get blank line normalization flag
   */
  getNormalizeBlankLines(): boolean {
    return this.normalizeBlankLines;
  }
  
  /**
   * Configure local module support once resolvers are ready
   */
  async configureLocalModules(): Promise<void> {
    if (!this.resolverManager) {
      return;
    }

    const localPath = this.localModulePath;
    if (!localPath) {
      return;
    }

    let exists = false;
    try {
      exists = await this.fileSystem.exists(localPath);
    } catch {
      exists = false;
    }

    if (!exists) {
      logger.debug(`Local modules path not found: ${localPath}`);
      return;
    }

    let currentUser: string | undefined;
    const skipGitHubUserLookup =
      process.env.MLLD_TEST === '1' || process.env.NODE_ENV === 'test';

    if (!skipGitHubUserLookup) {
      try {
        const authService = GitHubAuthService.getInstance();
        if (typeof authService?.getGitHubUser === 'function') {
          const user = await Promise.race([
            authService.getGitHubUser(),
            new Promise<null>(resolve => {
              setTimeout(() => resolve(null), 1500);
            })
          ]);
          currentUser = user?.login?.toLowerCase();
        }
      } catch {
        currentUser = undefined;
      }
    }

    const prefixes = this.projectConfig?.getResolverPrefixes() ?? [];
    const allowedAuthors = prefixes
      .filter(prefixConfig => prefixConfig.prefix && prefixConfig.prefix.startsWith('@') && prefixConfig.resolver !== 'REGISTRY')
      .map(prefixConfig => prefixConfig.prefix.replace(/^@/, '').replace(/\/$/, '').toLowerCase());

    await this.resolverManager.configureLocalModules(localPath, {
      currentUser,
      allowedAuthors
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ZONE 9: Diagnostics & Debugging
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create the debug object with environment information
   * @param version - 1 = full JSON, 2 = reduced/useful, 3 = markdown format
   */
  private createDebugObject(version: number = 2): any {
    // TODO: Add security toggle from mlld.lock.json when available
    // For now, assume debug is enabled

    // Use DebugUtils for debug object creation
    const allVars = this.getAllVariables();
    return DebugUtils.createDebugObject(allVars, this.reservedNames, version);
  }

  getCollectedErrors(): CollectedError[] {
    return this.errorUtils.getCollectedErrors();
  }
  
  clearCollectedErrors(): void {
    this.errorUtils.clearCollectedErrors();
  }
  
  async displayCollectedErrors(): Promise<void> {
    const errors = this.errorUtils.getCollectedErrors();
    if (errors.length === 0) {
      return;
    }

    console.log(`\n❌ ${errors.length} error${errors.length > 1 ? 's' : ''} occurred:\n`);

    const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
    const formatter = new ErrorFormatSelector(this.fileSystem);

    for (let i = 0; i < errors.length; i++) {
      const item = errors[i];
      console.log(`${i + 1}. Command execution failed:`);

      try {
        const formatted = await formatter.formatForCLI(item.error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: this.basePath,
          workingDirectory: (process as NodeJS.Process).cwd(),
          contextLines: 2
        });
        console.log(formatted);
      } catch (formatError) {
        console.log(`   ├─ Command: ${item.command}`);
        console.log(`   ├─ Duration: ${item.duration}ms`);
        if (formatError instanceof Error) {
          console.log(`   ├─ ${item.error.message}`);
        }
        if (item.error.details?.exitCode !== undefined) {
          console.log(`   ├─ Exit code: ${item.error.details.exitCode}`);
        }
        console.log('   └─ Use --verbose to see full output\n');
      }
    }

    console.log('💡 Use --verbose to see full command output');
    console.log('💡 Use --help error-handling for error handling options\n');
  }
  
  // --- Import Tracking (for circular import detection) ---
  
  isImporting(path: string): boolean {
    return this.importResolver.isImporting(path);
  }
  
  beginImport(path: string): void {
    this.importResolver.beginImport(path);
  }
  
  endImport(path: string): void {
    this.importResolver.endImport(path);
  }
  
  createChildEnvironment(): Environment {
    const childContext = this.resolveChildContext();
    return this.createLifecycleChild(childContext, {
      includeTraceInheritance: true
    });
  }
  
  // --- Directive Trace (for debugging) ---
  
  /**
   * Push a directive onto the trace stack
   */
  pushDirective(
    directive: string,
    varName?: string,
    location?: SourceLocation
  ): void {
    const start = Date.now();
    this.directiveTimings.push(start);

    const provenance = this.isProvenanceEnabled()
      ? this.snapshotToDescriptor(this.getSecuritySnapshot())
      : undefined;
    if (this.hasSDKEmitter()) {
      this.emitSDKEvent({
        type: 'debug:directive:start',
        directive,
        timestamp: start,
        ...(provenance && { provenance })
      });
    }

    if (!this.traceEnabled) {
      return;
    }

    const fileName = this.currentFilePath ? path.basename(this.currentFilePath) : 'unknown';
    const lineNumber = (location as any)?.start?.line ?? (location as any)?.line ?? 'unknown';

    this.directiveTrace.push({
      directive,
      varName,
      location: `${fileName}:${lineNumber}`,
      depth: this.directiveTrace.length
    });
  }
  
  /**
   * Pop a directive from the trace stack
   */
  popDirective(): void {
    const start = this.directiveTimings.pop();
    const entry = this.traceEnabled ? this.directiveTrace.pop() : undefined;

    const provenance = this.isProvenanceEnabled()
      ? this.snapshotToDescriptor(this.getSecuritySnapshot())
      : undefined;
    if (this.hasSDKEmitter() && start && entry) {
      const durationMs = Date.now() - start;
      this.emitSDKEvent({
        type: 'debug:directive:complete',
        directive: entry.directive,
        durationMs,
        timestamp: Date.now(),
        ...(provenance && { provenance })
      });
    }
  }
  
  /**
   * Get a copy of the current directive trace
   */
  getDirectiveTrace(): DirectiveTrace[] {
    return [...this.directiveTrace];
  }
  
  /**
   * Mark the last directive in the trace as failed
   */
  markLastDirectiveFailed(errorMessage: string): void {
    if (this.directiveTrace.length === 0) {
      return;
    }
    const lastEntry = this.directiveTrace[this.directiveTrace.length - 1];
    lastEntry.failed = true;
    lastEntry.errorMessage = errorMessage;
  }
  
  /**
   * Set whether tracing is enabled
   */
  setTraceEnabled(enabled: boolean): void {
    this.traceEnabled = enabled;
    if (!enabled) {
      this.directiveTrace = [];
    }
  }

  setRuntimeTrace(level: RuntimeTraceLevel, options: RuntimeTraceOptions = {}): void {
    const root = this.getRootEnvironment();
    root.runtimeTraceLevel = level;
    root.runtimeTraceFilePath = options.filePath
      ? path.resolve(options.filePath)
      : undefined;
    root.runtimeTraceStderr = options.stderr === true;
    if (level === 'off') {
      root.runtimeTraceEvents = [];
      root.runtimeTraceShelfWrites.clear();
    }
    this.runtimeTraceLevel = root.runtimeTraceLevel;
    this.runtimeTraceFilePath = root.runtimeTraceFilePath;
    this.runtimeTraceStderr = root.runtimeTraceStderr;
  }

  setRuntimeTraceOverride(level?: RuntimeTraceLevel): void {
    this.runtimeTraceOverrideLevel = level;
  }

  getRuntimeTraceLevel(): RuntimeTraceLevel {
    if (this.runtimeTraceOverrideLevel !== undefined) {
      return this.runtimeTraceOverrideLevel;
    }
    if (this.parent) {
      return this.parent.getRuntimeTraceLevel();
    }
    return this.runtimeTraceLevel;
  }

  getRuntimeTraceEvents(): RuntimeTraceEvent[] {
    return [...this.getRootEnvironment().runtimeTraceEvents];
  }

  emitRuntimeTrace(
    requiredLevel: RuntimeTraceEmissionLevel,
    category: RuntimeTraceCategory,
    event: string,
    data: Record<string, unknown>,
    scope?: Partial<RuntimeTraceScope>
  ): void {
    const root = this.getRootEnvironment();
    if (!shouldEmitRuntimeTrace(this.getRuntimeTraceLevel(), requiredLevel)) {
      return;
    }

    const payload: RuntimeTraceEvent = {
      ts: new Date().toISOString(),
      level: requiredLevel,
      category,
      event,
      scope: this.buildRuntimeTraceScope(scope),
      data: sanitizeSerializableValue(data) as Record<string, unknown>
    };

    root.runtimeTraceEvents.push(payload);

    if (root.runtimeTraceFilePath) {
      try {
        mkdirSync(path.dirname(root.runtimeTraceFilePath), { recursive: true });
        appendFileSync(root.runtimeTraceFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
      } catch {
        // Best-effort file sink; trace collection still succeeds in memory.
      }
    }

    if (root.runtimeTraceStderr) {
      process.stderr.write(`${this.formatRuntimeTraceLine(payload)}\n`);
    }
  }

  summarizeTraceValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return value.length > 160 ? `${value.slice(0, 157)}...` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return {
        kind: 'array',
        length: value.length
      };
    }
    if (typeof value === 'object') {
      if ('handle' in (value as Record<string, unknown>) && typeof (value as any).handle === 'string') {
        return { handle: (value as any).handle };
      }
      const keys = Object.keys(value as Record<string, unknown>);
      return {
        kind: 'object',
        keys: keys.slice(0, 8),
        size: keys.length
      };
    }
    return String(value);
  }

  private buildRuntimeTraceScope(
    overrides?: Partial<RuntimeTraceScope>
  ): RuntimeTraceScope {
    const scope: RuntimeTraceScope = {};
    const operation = this.contextManager.peekOperation();
    const guard = this.contextManager.peekGuardContext();
    const pipeline = this.getPipelineContext();
    const scopedConfig = this.getScopedEnvironmentConfig();
    const bridge = this.getActiveBridge();

    if (operation?.type === 'exe' && operation.name) {
      scope.exe = operation.name.startsWith('@') ? operation.name : `@${operation.name}`;
    } else if (operation?.name) {
      scope.operation = operation.name.startsWith('@') ? operation.name : `@${operation.name}`;
    } else if (operation?.named) {
      scope.operation = operation.named;
    } else if (operation?.type) {
      scope.operation = operation.type;
    }

    const guardTry =
      typeof guard?.try === 'number'
        ? guard.try
        : typeof guard?.attempt === 'number'
          ? guard.attempt
          : undefined;
    if (guardTry !== undefined) {
      scope.guard_try = guardTry;
    }

    if (typeof pipeline?.stage === 'number') {
      scope.pipeline_stage = pipeline.stage;
    }

    if (typeof scopedConfig?.name === 'string' && scopedConfig.name.trim().length > 0) {
      scope.box = scopedConfig.name.trim();
    } else if (bridge?.mcpConfigPath) {
      scope.box = bridge.mcpConfigPath;
    }

    return {
      ...scope,
      ...(overrides ?? {})
    };
  }

  private buildRuntimeTraceScopeSignature(
    overrides?: Partial<RuntimeTraceScope>
  ): string {
    return JSON.stringify(this.buildRuntimeTraceScope(overrides));
  }

  private getRuntimeTraceValueFingerprint(value: unknown): string {
    const sanitized = sanitizeSerializableValue(value);
    if (sanitized === undefined) {
      return JSON.stringify({ __runtimeTraceUndefined: true });
    }
    return JSON.stringify(sanitized);
  }

  private recordRuntimeTraceShelfWrite(slot: string, value: unknown): void {
    if (this.getRuntimeTraceLevel() === 'off') {
      return;
    }

    const root = this.getRootEnvironment();
    root.runtimeTraceShelfWrites.set(slot, {
      ts: new Date().toISOString(),
      scopeSignature: this.buildRuntimeTraceScopeSignature(),
      fingerprint: this.getRuntimeTraceValueFingerprint(value),
      summary: this.summarizeTraceValue(value)
    });
  }

  private maybeEmitRuntimeTraceStaleShelfRead(
    slot: string,
    value: unknown,
    readTs: string
  ): void {
    if (this.getRuntimeTraceLevel() === 'off') {
      return;
    }

    const root = this.getRootEnvironment();
    const lastWrite = root.runtimeTraceShelfWrites.get(slot);
    if (!lastWrite) {
      return;
    }

    if (lastWrite.scopeSignature !== this.buildRuntimeTraceScopeSignature()) {
      return;
    }

    const currentFingerprint = this.getRuntimeTraceValueFingerprint(value);
    if (currentFingerprint === lastWrite.fingerprint) {
      return;
    }

    this.emitRuntimeTrace('effects', 'shelf', 'shelf.stale_read', {
      slot,
      writeTs: lastWrite.ts,
      readTs,
      expected: lastWrite.summary,
      actual: this.summarizeTraceValue(value),
      message: 'shelf.read returned stale data after shelf.write in the same context'
    });
  }

  private formatRuntimeTraceLine(event: RuntimeTraceEvent): string {
    const scopeTokens = Object.entries(event.scope)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${this.formatRuntimeTraceScalar(value)}`);
    const dataTokens = Object.entries(event.data)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${this.formatRuntimeTraceScalar(value)}`);
    const tokens = [
      `[trace:${event.category}]`,
      event.event,
      ...scopeTokens,
      ...dataTokens
    ];
    return tokens.join(' ');
  }

  private formatRuntimeTraceScalar(value: unknown): string {
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value === null) {
      return 'null';
    }
    if (value === undefined) {
      return 'undefined';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  
  /**
   * Check if tracing is enabled
   */
  isTraceEnabled(): boolean {
    return this.traceEnabled;
  }
  
  // --- Source Cache Methods ---
  
  /**
   * Cache source content for error reporting
   * @param filePath The file path to cache
   * @param content The source content
   */
  cacheSource(filePath: string, content: string): void {
    if (this.parent) {
      this.parent.cacheSource(filePath, content);
      return;
    }
    this.sourceCache.set(filePath, content);
  }
  
  /**
   * Retrieve cached source content for error reporting
   * @param filePath The file path to retrieve
   * @returns The cached source content or undefined
   */
  getSource(filePath: string): string | undefined {
    const source = this.sourceCache.get(filePath);
    if (source !== undefined) {
      return source;
    }
    return this.parent?.getSource(filePath);
  }

  getModuleProcessingCacheEntry<T = unknown>(key: string): T | undefined {
    return this.moduleProcessingCache.get(key) as T | undefined;
  }

  setModuleProcessingCacheEntry(key: string, value: unknown): void {
    this.moduleProcessingCache.set(key, value);
  }

  private ensureSecurityRuntime(): SecurityRuntimeState {
    if (!this.securityRuntime) {
      this.securityRuntime = {
        tracker: new TaintTracker(),
        descriptor: makeSecurityDescriptor(),
        stack: [],
        policy: undefined
      };
    }
    return this.securityRuntime;
  }

  private registerDynamicStateSnapshot(
    snapshot: Record<string, any>,
    resolver: DynamicModuleResolver,
    source?: string
  ): void {
    const root = this.getRootEnvironment();
    root.stateSnapshot = snapshot;
    root.stateResolver = resolver;
    const labels: DataLabel[] = ['src:dynamic'];
    if (source) {
      labels.push(`src:${source}` as DataLabel);
    }
    root.stateLabels = labels;
    root.statePathLabels = {};
    root.refreshStateVariable();
  }

  private applyStateWriteToSnapshot(write: StateWrite): void {
    if (!this.stateSnapshot) {
      return;
    }

    if (!this.setStateSnapshotValue(write.path, write.value)) {
      return;
    }

    this.setStatePathLabels(write.path, this.normalizeStateUpdateLabels(write.security?.labels));
    this.refreshStateVariable();
  }

  private setStateSnapshotValue(pathValue: string, value: unknown): boolean {
    if (!this.stateSnapshot) {
      return false;
    }

    const pathParts = (pathValue || '').split('.').filter(Boolean);
    if (pathParts.length === 0) {
      return false;
    }

    let target: any = this.stateSnapshot;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const key = pathParts[i];
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      target = target[key];
    }

    const lastKey = pathParts[pathParts.length - 1];
    target[lastKey] = value;
    return true;
  }

  private normalizeStateUpdateLabels(labels?: readonly string[]): DataLabel[] {
    if (!Array.isArray(labels)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: DataLabel[] = [];
    for (const label of labels) {
      if (typeof label !== 'string') {
        continue;
      }
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed as DataLabel);
    }

    return normalized;
  }

  private setStatePathLabels(pathValue: string, labels: readonly DataLabel[]): void {
    const normalizedPath = (pathValue || '').trim();
    if (!normalizedPath) {
      return;
    }

    if (labels.length === 0) {
      delete this.statePathLabels[normalizedPath];
      return;
    }

    this.statePathLabels[normalizedPath] = [...labels];
  }

  private buildStateFieldLabelMap(): Record<string, DataLabel[]> {
    const fieldLabels: Record<string, DataLabel[]> = {};

    for (const [pathValue, labels] of Object.entries(this.statePathLabels)) {
      const topLevelField = (pathValue || '').split('.').filter(Boolean)[0];
      if (!topLevelField || labels.length === 0) {
        continue;
      }

      const existing = fieldLabels[topLevelField] ?? [];
      const seen = new Set(existing);
      const merged = [...existing];
      for (const label of labels) {
        if (seen.has(label)) {
          continue;
        }
        seen.add(label);
        merged.push(label);
      }
      fieldLabels[topLevelField] = merged;
    }

    return fieldLabels;
  }

  private buildStateNamespaceMetadataMap(fieldLabels: Record<string, DataLabel[]>) {
    const metadataMap = Object.fromEntries(
      Object.entries(fieldLabels)
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

  private refreshStateVariable(): void {
    if (!this.stateSnapshot) {
      return;
    }

    const fieldLabels = this.buildStateFieldLabelMap();
    const namespaceMetadata = this.buildStateNamespaceMetadataMap(fieldLabels);

    const stateVar = createObjectVariable(
      'state',
      this.stateSnapshot,
      true,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      }
    );

    if (this.stateLabels.length > 0) {
      stateVar.mx.labels = [...this.stateLabels];
      stateVar.mx.taint = [...this.stateLabels];
      stateVar.mx.sources = [...this.stateLabels];
    }

    stateVar.internal = {
      ...(stateVar.internal ?? {}),
      ...(namespaceMetadata ? { namespaceMetadata } : {}),
      isReserved: true,
      isSystem: true
    };

    if (this.variableManager.hasVariable('state')) {
      this.variableManager.updateVariable('state', stateVar);
    } else {
      this.variableManager.setVariable('state', stateVar);
    }

    if (this.stateResolver) {
      try {
        this.stateResolver.setModuleFieldLabels('@state', fieldLabels);
        this.stateResolver.updateModule('@state', this.stateSnapshot);
      } catch (error) {
        logger.warn('Failed to update dynamic @state module after state write', { error });
      }
    }
  }

  private createDebugVariable(debugValue: string): Variable {
    return createObjectVariable(
      'debug',
      debugValue,
      false,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        mx: {
          definedAt: { line: 0, column: 0, filePath: '<reserved>' }
        },
        internal: {
          isReserved: true
        }
      }
    );
  }

  private createPendingResolverVariable(name: string): Variable {
    return createSimpleTextVariable(
      name,
      `@${name}`,
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        mx: {
          definedAt: { line: 0, column: 0, filePath: '<resolver>' }
        },
        internal: {
          isReserved: true,
          isResolver: true,
          resolverName: name,
          needsResolution: true
        }
      }
    );
  }

  private convertResolverContent(name: string, resolverContent: any): Variable {
    let varType: 'text' | 'data' = 'text';
    let varValue: any = resolverContent.content.content;

    if (resolverContent.content.contentType === 'data') {
      varType = 'data';
      if (typeof varValue === 'string') {
        try {
          varValue = JSON.parse(varValue);
        } catch {
          // Keep raw value when JSON parsing fails.
        }
      }
    }

    const resolverSource = {
      directive: 'var',
      syntax: varType === 'data' ? 'object' : 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;

    return varType === 'data'
      ? createObjectVariable(name, varValue, true, resolverSource, {
          mx: {
            definedAt: { line: 0, column: 0, filePath: '<resolver>' }
          },
          internal: {
            isReserved: true,
            isResolver: true,
            resolverName: name,
            needsResolution: false
          }
        })
      : createSimpleTextVariable(name, varValue, resolverSource, {
          mx: {
            definedAt: { line: 0, column: 0, filePath: '<resolver>' }
          },
          internal: {
            isReserved: true,
            isResolver: true,
            resolverName: name,
            needsResolution: false
          }
        });
  }

  private projectResolverSecurityMetadata(variable: Variable, resolverContent: any): void {
    const resolverMx = resolverContent.content.mx ?? resolverContent.content.metadata;
    const resolverLabels =
      resolverMx && Array.isArray((resolverMx as any).labels)
        ? ((resolverMx as any).labels as DataLabel[])
        : undefined;
    const resolverTaint =
      resolverMx && Array.isArray((resolverMx as any).taint)
        ? ((resolverMx as any).taint as DataLabel[])
        : undefined;
    const resolverSources =
      resolverMx && typeof (resolverMx as any).source === 'string'
        ? ([(resolverMx as any).source] as string[])
        : undefined;

    if (!resolverLabels && !resolverTaint && !resolverSources) {
      return;
    }

    const descriptor = makeSecurityDescriptor({
      labels: resolverLabels,
      taint: resolverTaint,
      sources: resolverSources
    });

    if (!variable.mx) {
      variable.mx = {} as any;
    }
    updateVarMxFromDescriptor(variable.mx, descriptor);
    if ((variable.mx as any).mxCache) {
      delete (variable.mx as any).mxCache;
    }
  }

  private resolveChildContext(newBasePath?: string): PathContext | string {
    if (!this.pathContext) {
      return newBasePath || this.basePath;
    }

    if (!newBasePath) {
      return this.pathContext;
    }

    return {
      ...this.pathContext,
      fileDirectory: newBasePath,
      executionDirectory: newBasePath
    };
  }

  private getCommandExecutorFactory(): CommandExecutorFactoryPort {
    if (!this.commandExecutorFactory) {
      const dependencies: ExecutorDependencies = {
        errorUtils: this.errorUtils,
        workingDirectory: this.getExecutionDirectory(),
        shadowEnvironment: this,
        nodeShadowProvider: this,
        pythonShadowProvider: this,
        variableProvider: this.variableManager as VariableProvider,
        getStreamingBus: () => this.getStreamingBus(),
        workspaceProvider: this
      };
      this.commandExecutorFactory = new CommandExecutorFactory(dependencies);
    }
    return this.commandExecutorFactory;
  }

  private injectAmbientMx(
    language: string,
    params: Record<string, any> | undefined
  ): Record<string, any> {
    let finalParams = params || {};
    const lang = (language || '').toLowerCase();
    const shouldInjectContext =
      lang === 'js' || lang === 'javascript' || lang === 'node' || lang === 'nodejs';

    if (!shouldInjectContext) {
      return finalParams;
    }

    try {
      const testCtxVar = this.getVariable('test_mx');
      const bridge = this.getActiveBridge();
      const boxContext = bridge
        ? { mcpConfigPath: bridge.mcpConfigPath, socketPath: bridge.socketPath }
        : null;
      const mxValue = testCtxVar
        ? (testCtxVar.value as any)
        : this.getContextManager().buildAmbientContext({
            pipelineContext: this.getPipelineContext(),
            securitySnapshot: this.getSecuritySnapshot(),
            boxContext
          });
      if (!('mx' in finalParams)) {
        finalParams = { ...finalParams, mx: Object.freeze(mxValue) };
      }
    } catch {
      // Best-effort ambient context injection.
    }

    return finalParams;
  }

  private normalizeCodeExecutionInput(
    metadata: Record<string, any> | CommandExecutionContext | undefined,
    options: CommandExecutionOptions | undefined,
    context: CommandExecutionContext | undefined
  ): NormalizedCodeExecutionInput {
    if (metadata && !context && !options && 'sourceLocation' in metadata) {
      return {
        metadata: undefined,
        context: metadata as CommandExecutionContext
      };
    }

    if (metadata && !context && !options && 'directiveType' in metadata) {
      return {
        metadata: undefined,
        context: metadata as CommandExecutionContext
      };
    }

    return {
      metadata: metadata as Record<string, any> | undefined,
      context
    };
  }

  private hasSDKEmitter(): boolean {
    return this.getRootEnvironment().sdkEmitter !== undefined;
  }

  private setSdkStreamingOptions(options: StreamingOptions): void {
    this.sdkStreamingOptions = { ...options };
  }

  private enableSdkEmitter(emitter: ExecutionEmitter, bus: StreamBus): void {
    this.sdkEmitter = emitter;
    this.cleanupSdkSubscription();

    this.sdkUnsubscribe = bus.subscribe(event => {
      this.emitMappedSdkEvents(event);
    });
  }

  private emitMappedSdkEvents(event: StreamEvent): void {
    const streamEvent = this.mapSdkStreamEvent(event);
    if (streamEvent) {
      this.sdkEmitter?.emit(streamEvent as SDKEvent);
    }

    const commandEvent = this.mapSdkCommandEvent(event);
    if (commandEvent) {
      this.sdkEmitter?.emit(commandEvent as SDKEvent);
    }
  }

  private cleanupSdkSubscription(): void {
    if (!this.sdkUnsubscribe) {
      return;
    }
    try {
      this.sdkUnsubscribe();
    } finally {
      this.sdkUnsubscribe = undefined;
    }
  }

  private cleanupSdkEmitter(): void {
    this.cleanupSdkSubscription();
    this.sdkEmitter = undefined;
  }

  private mapSdkStreamEvent(event: StreamEvent): SDKEvent | null {
    const streamingSuppressed = this.sdkStreamingOptions.enabled === false;
    if (streamingSuppressed && event.type === 'CHUNK') {
      return null;
    }
    if (event.type === 'CHUNK') {
      return { type: 'stream:chunk', event } as SDKEvent;
    }
    return { type: 'stream:progress', event } as SDKEvent;
  }

  private mapSdkCommandEvent(event: StreamEvent): SDKEvent | null {
    switch (event.type) {
      case 'STAGE_START':
        return {
          type: 'command:start',
          command: (event.command as any)?.rawIdentifier,
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          timestamp: event.timestamp
        } as SDKEvent;
      case 'STAGE_SUCCESS':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          durationMs: event.durationMs,
          timestamp: event.timestamp
        } as SDKEvent;
      case 'STAGE_FAILURE':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          error: event.error,
          timestamp: event.timestamp
        } as SDKEvent;
      default:
        return null;
    }
  }

  private ensureNodeShadowEnv(): NodeShadowEnvironment {
    if (!this.nodeShadowEnv) {
      this.nodeShadowEnv = this.createNodeShadowEnv();
    }
    return this.nodeShadowEnv;
  }

  private ensurePythonShadowEnv(): PythonShadowEnvironment {
    if (!this.pythonShadowEnv) {
      this.pythonShadowEnv = this.createPythonShadowEnv();
    }
    return this.pythonShadowEnv;
  }

  private createNodeShadowEnv(): NodeShadowEnvironment {
    return new NodeShadowEnvironment(
      this.getFileDirectory(),
      this.getCurrentFilePath()
    );
  }

  private createPythonShadowEnv(): PythonShadowEnvironment {
    return new PythonShadowEnvironment(
      this.getFileDirectory(),
      this.getCurrentFilePath()
    );
  }

  private toNodeFunctionMap(nodeShadowEnv: NodeShadowEnvironment): ShadowFunctions {
    const context = nodeShadowEnv.getContext();
    const map: ShadowFunctions = new Map();
    for (const name of nodeShadowEnv.getFunctionNames()) {
      if (context[name]) {
        map.set(name, context[name]);
      }
    }
    return map;
  }

  private cleanupShadowEnvs(): void {
    if (this.nodeShadowEnv) {
      this.nodeShadowEnv.cleanup();
      this.nodeShadowEnv = undefined;
    }

    if (this.pythonShadowEnv) {
      void this.pythonShadowEnv.cleanup();
      this.pythonShadowEnv = undefined;
    }

    this.shadowEnvs.clear();
  }

  private async reconfigureForEphemeral(input: {
    fileSystem: IFileSystemService;
    pathContext?: PathContext;
    projectRoot: string;
    hasRegistryManager: boolean;
    hasResolverManager: boolean;
  }): Promise<{
    registryManager?: RegistryManager;
    resolverManager?: ResolverManager;
  }> {
    const [{ InMemoryModuleCache }, { NoOpLockFile }] = await Promise.all([
      import('@core/registry/InMemoryModuleCache'),
      import('@core/registry/NoOpLockFile')
    ]);

    const moduleCache = new InMemoryModuleCache();
    const lockFile = new NoOpLockFile(path.join(input.projectRoot, 'mlld.lock.json'));

    const result: {
      registryManager?: RegistryManager;
      resolverManager?: ResolverManager;
    } = {};

    if (input.hasRegistryManager) {
      result.registryManager = new RegistryManager(input.pathContext || input.projectRoot);
    }

    if (input.hasResolverManager) {
      const resolverManager = new ResolverManager(
        undefined,
        moduleCache,
        lockFile
      );

      resolverManager.registerResolver(new ProjectPathResolver(input.fileSystem));
      resolverManager.registerResolver(new RegistryResolver());

      const pythonResolverOptions = { projectRoot: input.projectRoot };
      resolverManager.registerResolver(new PythonPackageResolver(pythonResolverOptions));
      resolverManager.registerResolver(new PythonAliasResolver(pythonResolverOptions));

      resolverManager.registerResolver(new LocalResolver(input.fileSystem));
      resolverManager.registerResolver(new GitHubResolver());
      resolverManager.registerResolver(new HTTPResolver());

      resolverManager.configurePrefixes([
        {
          prefix: '@base',
          resolver: 'base',
          type: 'io',
          config: {
            basePath: input.projectRoot,
            readonly: false
          }
        },
        {
          prefix: '@root',
          resolver: 'base',
          type: 'io',
          config: {
            basePath: input.projectRoot,
            readonly: false
          }
        }
      ]);

      result.resolverManager = resolverManager;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE 10: Path Context & Property Accessors
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the PathContext for this environment
   */
  getPathContext(): PathContext | undefined {
    return this.pathContext || this.parent?.getPathContext();
  }

  /**
   * Get the project root directory
   */
  getProjectRoot(): string {
    const context = this.getPathContext();
    if (context) {
      return context.projectRoot;
    }
    // Fallback to basePath for legacy mode
    return this.basePath;
  }

  /**
   * Check if running in ephemeral mode
   */
  isEphemeral(): boolean {
    return this.isEphemeralMode;
  }

  /**
   * Get the file directory (directory of current .mld file)
   */
  getFileDirectory(): string {
    const context = this.getPathContext();
    if (context) {
      return context.fileDirectory;
    }
    // In legacy mode, use basePath
    return this.basePath;
  }

  /**
   * Get the execution directory (where commands run)
   * If we have an inferred project root and the file is within the project,
   * use the project root. Otherwise use the script's directory.
   */
  getExecutionDirectory(): string {
    const context = this.getPathContext();
    if (context) {
      // Check if file directory is within the project root
      const isFileInProject = context.fileDirectory.startsWith(context.projectRoot);

      // If we have an inferred project root (different from file directory)
      // AND the file is within the project, use project root for commands
      if (isFileInProject &&
          context.projectRoot &&
          context.projectRoot !== context.fileDirectory) {
        return context.projectRoot;
      }
      // Otherwise use the file's directory (script location)
      return context.fileDirectory;
    }
    // Fallback in legacy mode
    return this.basePath;
  }

  /**
   * Get the project root directory for @base/@root path operations.
   */
  getBasePath(): string {
    return this.getProjectRoot();
  }

  getCurrentFilePath(): string | undefined {
    return this.currentFilePath || this.parent?.getCurrentFilePath();
  }

  setCurrentFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
  }
  
  // --- ImportResolverContext Implementation ---
  
  getImportApproval(): ImportApproval | undefined {
    return this.importResolver.getImportApproval();
  }
  
  getImmutableCache(): ImmutableCache | undefined {
    return this.importResolver.getImmutableCache();
  }
  
  /**
   * Clean up resources that might keep the event loop alive
   */
  cleanup(): void {
    logger.debug('Environment cleanup called');
    void this.runScopeCleanups();
    
    if (!this.parent) {
      try {
        this.cleanupSdkEmitter();
      } catch (error) {
        // Silently handle cleanup errors
      }
    }
    if (!this.parent) {
      this.streamingResult = undefined;
    }

    if (!this.parent && this.mcpImportManager) {
      this.mcpImportManager.closeAll();
      this.mcpImportManager = undefined;
    }

    logger.debug('Cleaning up shadow environments');
    this.cleanupShadowEnvs();
    
    // Clean up child environments recursively
    logger.debug(`Cleaning up ${this.childEnvironments.size} child environments`);
    for (const child of this.childEnvironments) {
      child.cleanup();
    }
    this.childEnvironments.clear();
    
    // Clear any other resources that might keep event loop alive
    logger.debug('Clearing caches');
    this.cacheManager.clearAllCaches();
    this.moduleProcessingCache.clear();
    this.commandExecutorFactory = undefined;
    
    // Clear import stack to prevent memory leaks (now handled by ImportResolver)
    // this.importStack.clear(); // Moved to ImportResolver
    
    logger.debug('Cleanup complete');
  }
}
