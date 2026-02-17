import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { MlldMode } from '@core/types/mode';
import type { Variable, PipelineInput } from '@core/types/variable';
import { 
  createPathVariable,
  createSimpleTextVariable,
  createObjectVariable,
  isPipelineInput,
  isTextLike,
} from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { isDirectiveNode, isVariableReferenceNode, isTextNode } from '@core/types';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { ResolvedURLConfig } from '@core/config/types';
import type { DirectiveTrace } from '@core/types/trace';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import type { EnvironmentConfig } from '@core/types/environment';
import { execSync } from 'child_process';
import * as path from 'path';
// Note: ImportApproval, ImmutableCache, and GistTransformer are now handled by ImportResolver
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldInterpreterError, MlldSecurityError } from '@core/errors';
import { SecurityManager } from '@security';
import { TaintTracker } from '@core/security';
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
import type { StateWrite } from '@core/types/state';
import { mergeNeedsDeclarations, ALLOW_ALL_POLICY, type NeedsDeclaration, type PolicyCapabilities, type ProfilesDeclaration } from '@core/policy/needs';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
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
  type ExecutorDependencies
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
import { guardPreHook } from '../hooks/guard-pre-hook';
import { guardPostHook } from '../hooks/guard-post-hook';
import { taintPostHook } from '../hooks/taint-post-hook';
import { createKeepExecutable, createKeepStructuredExecutable } from './builtins';
import { GuardRegistry, type SerializedGuardDefinition } from '../guards';
import type { ExecutionEmitter } from '@sdk/execution-emitter';
import type { SDKEvent, StreamingResult } from '@sdk/types';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { ImportApproval } from '@core/security/ImportApproval';
import type { ImmutableCache } from '@core/security/ImmutableCache';

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
export class Environment implements VariableManagerContext, ImportResolverContext, ShadowEnvironmentProvider {
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
  private allowedTools?: Set<string>;
  private allowedMcpServers?: Set<string>;
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
  private guardRegistry: GuardRegistry;
  private pipelineGuardHistoryStore: { entries?: GuardHistoryEntry[] };
  private mcpImportManager?: McpImportManager;

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
  private stateSnapshot?: Record<string, any>;
  private stateResolver?: DynamicModuleResolver;
  private stateLabels: DataLabel[] = [];
  
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
  
  // File interpolation circular detection
  private interpolationStack: Set<string> = new Set();
  private enableFileInterpolation: boolean = true;

  // Executable resolution circular detection
  private resolutionStack: Set<string> = new Set();

  // Current iteration file for <> placeholder
  private currentIterationFile?: any;
  
  // Directive trace for debugging
  private directiveTrace: DirectiveTrace[] = [];
  private traceEnabled: boolean = true; // Default to enabled

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

  // Tracks imported bindings to surface collisions across directives.
  private importBindings: Map<string, ImportBindingInfo> = new Map();
  // TODO: Introduce guard registration and evaluation using capability contexts.
  // Guard evaluation depth prevents reentrant guard execution
  private guardEvaluationDepth = 0;

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
      this.guardRegistry = parent.guardRegistry.createChild();
    } else {
      this.contextManager = new ContextManager();
      this.hookManager = new HookManager();
      this.guardRegistry = new GuardRegistry();
      this.registerBuiltinHooks();
    }
    this.pipelineGuardHistoryStore = parent ? parent.pipelineGuardHistoryStore : {};
    
    // Inherit reserved names from parent environment
    if (parent) {
      this.reservedNames = new Set(parent.reservedNames);
      // Inherit fuzzy match configuration from parent
      this.localFileFuzzyMatch = parent.localFileFuzzyMatch;
    }
    
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
      recordSecurityDescriptor: this.recordSecurityDescriptor.bind(this),
      getContextManager: () => this.contextManager
    });
    this.variableManager = new VariableManager(variableManagerDependencies);
    
    // Initialize reserved variables if this is the root environment
    if (!parent) {
      this.variableManager.initializeReservedVariables();
      
      // Initialize built-in transformers
      this.initializeBuiltinTransformers();

      // Register keep/keepStructured builtins
      this.registerKeepBuiltins();
      
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
    options?: { literalStrings?: boolean }
  ): void {
    if (!this.resolverManager) {
      throw new Error('ResolverManager not available');
    }

    let resolver: DynamicModuleResolver;
    const existing = this.resolverManager.getResolver('dynamic');

    if (existing instanceof DynamicModuleResolver) {
      const normalized = new DynamicModuleResolver(modules, {
        source,
        literalStrings: options?.literalStrings
      });

      for (const [path, content] of normalized.getSerializedModules()) {
        existing.updateModule(path, content);
      }

      resolver = existing;
      logger.debug(`Updated dynamic modules: ${Object.keys(modules).length}${source ? ` (source: ${source})` : ''}`);
    } else {
      resolver = new DynamicModuleResolver(modules, { source, literalStrings: options?.literalStrings });
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

  getSecuritySnapshot(): SecuritySnapshotLike | undefined {
    if (this.securityRuntime) {
      const top = this.securityRuntime.stack[this.securityRuntime.stack.length - 1];
      return {
        labels: this.securityRuntime.descriptor.labels,
        sources: this.securityRuntime.descriptor.sources,
        taint: this.securityRuntime.descriptor.taint,
        policy: this.securityRuntime.policy,
        operation: top?.operation
      };
    }
    return this.parent?.getSecuritySnapshot();
  }

  private snapshotToDescriptor(snapshot?: SecuritySnapshotLike): SecurityDescriptor | undefined {
    if (!snapshot) {
      return undefined;
    }
    return makeSecurityDescriptor({
      labels: snapshot.labels,
      taint: snapshot.taint,
      sources: snapshot.sources,
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

  hasDynamicStateSnapshot(): boolean {
    return this.getRootEnvironment().stateSnapshot !== undefined;
  }

  applyExternalStateUpdate(path: string, value: unknown): void {
    const root = this.getRootEnvironment();
    if (!root.stateSnapshot) {
      throw new Error('No dynamic @state snapshot is available for this execution');
    }

    if (!root.setStateSnapshotValue(path, value)) {
      throw new Error('State update path is required');
    }

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
   * Check if an executable is currently being resolved (circular reference detection)
   */
  isResolving(identifier: string): boolean {
    if (this.resolutionStack.has(identifier)) return true;
    return this.parent?.isResolving(identifier) || false;
  }

  /**
   * Mark an executable as being resolved
   */
  beginResolving(identifier: string): void {
    this.resolutionStack.add(identifier);
  }

  /**
   * Mark an executable as finished resolving
   */
  endResolving(identifier: string): void {
    this.resolutionStack.delete(identifier);
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
    const variable = this.variableManager.getVariable(name);
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
    return this.variableManager.hasVariable(name);
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

  getGuardRegistry(): GuardRegistry {
    return this.guardRegistry;
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
    this.hookManager.registerPre(guardPreHook);
    this.hookManager.registerPost(guardPostHook);
    this.hookManager.registerPost(taintPostHook);
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
  
  async readFile(pathOrUrl: string): Promise<string> {
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
    }

    if (options.includeTraceInheritance) {
      child.traceEnabled = this.traceEnabled;
      child.directiveTrace = this.directiveTrace;
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

    return child;
  }
  
  // --- Scope Management ---
  
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
    return this.importResolver.fetchURL(url, options);
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
    return this.importResolver.fetchURLWithMetadata(url);
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
    try {
      const user = await GitHubAuthService.getInstance().getGitHubUser();
      currentUser = user?.login?.toLowerCase();
    } catch {
      currentUser = undefined;
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
    const lineNumber = location?.line || 'unknown';

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
    root.refreshStateVariable();
  }

  private applyStateWriteToSnapshot(write: StateWrite): void {
    if (!this.stateSnapshot) {
      return;
    }

    if (!this.setStateSnapshotValue(write.path, write.value)) {
      return;
    }

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

  private refreshStateVariable(): void {
    if (!this.stateSnapshot) {
      return;
    }

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
        getStreamingBus: () => this.getStreamingBus()
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
      const mxValue = testCtxVar
        ? (testCtxVar.value as any)
        : this.getContextManager().buildAmbientContext({
            pipelineContext: this.getPipelineContext(),
            securitySnapshot: this.getSecuritySnapshot()
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
    this.commandExecutorFactory = undefined;
    
    // Clear import stack to prevent memory leaks (now handled by ImportResolver)
    // this.importStack.clear(); // Moved to ImportResolver
    
    logger.debug('Cleanup complete');
  }
}
