import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { MlldMode } from '@core/types/mode';
import type { Variable, PipelineInput } from '@core/types/variable';
import { 
  createPathVariable,
  isPipelineInput,
  isTextLike,
} from '@core/types/variable';
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
import { SecurityManager } from '@security';
import {
  makeSecurityDescriptor,
  createCapabilityContext,
  type SecurityDescriptor,
  type CapabilityContext,
  type CapabilityKind,
  type ImportType
} from '@core/types/security';
import type { StateWrite } from '@core/types/state';
import { mergeNeedsDeclarations, type NeedsDeclaration, type PolicyCapabilities, type ProfilesDeclaration } from '@core/policy/needs';
import type { PolicyConfig } from '@core/policy/union';
import { RegistryManager, ProjectConfig } from '@core/registry';
import { astLocationToSourceLocation } from '@core/types';
import { ResolverManager, DynamicModuleResolver } from '@core/resolvers';
import { logger } from '@core/utils/logger';
import * as shellQuote from 'shell-quote';
import { getTimeValue, getProjectPathValue } from '../utils/reserved-variables';
import { getExpressionProvenance } from '../utils/expression-provenance';
import { builtinTransformers, createTransformerVariable } from '../builtin/transformers';
import type { NodeShadowEnvironment } from './NodeShadowEnvironment';
import type { PythonShadowEnvironment } from './PythonShadowEnvironment';
import { CacheManager } from './CacheManager';
import { CommandUtils } from './CommandUtils';
import { DebugUtils } from './DebugUtils';
import { ErrorUtils, type CollectedError, type CommandExecutionContext } from './ErrorUtils';
import { type CommandExecutionOptions } from './executors';
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
import { ResolverVariableFacade } from './runtime/ResolverVariableFacade';
import { ContextFacade } from './runtime/ContextFacade';
import {
  OutputCoordinator,
  type OutputCoordinatorContext,
  type EffectType,
  type EffectOptions
} from './runtime/OutputCoordinator';
import { SecurityPolicyRuntime, type SecuritySnapshotLike } from './runtime/SecurityPolicyRuntime';
import { SdkEventBridge } from './runtime/SdkEventBridge';
import { StateWriteRuntime } from './runtime/StateWriteRuntime';
import { VariableFacade, type ImportBindingInfo } from './runtime/VariableFacade';
import { ShadowEnvironmentRuntime } from './runtime/ShadowEnvironmentRuntime';
import {
  ExecutionOrchestrator,
  type CommandExecutorFactoryPort
} from './runtime/ExecutionOrchestrator';
import { ChildEnvironmentLifecycle } from './runtime/ChildEnvironmentLifecycle';
import { DiagnosticsRuntime } from './runtime/DiagnosticsRuntime';
import { RuntimeConfigurationRuntime } from './runtime/RuntimeConfigurationRuntime';
import { ShadowEnvironmentCapture, ShadowEnvironmentProvider } from './types/ShadowEnvironmentCapture';
import { EffectHandler, DefaultEffectHandler } from './EffectHandler';
import { McpImportManager } from '../mcp/McpImportManager';
import { OutputRenderer } from '@interpreter/output/renderer';
import type { OutputIntent } from '@interpreter/output/intent';
import { contentIntent, breakIntent, progressIntent, errorIntent } from '@interpreter/output/intent';
import { defaultStreamingOptions, type StreamingOptions } from '../eval/pipeline/streaming-options';
import { StreamBus } from '../eval/pipeline/stream-bus';
import { ExportManifest } from '../eval/import/ExportManifest';
import {
  ContextManager,
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
  private securityPolicyRuntime: SecurityPolicyRuntime;
  private allowedTools?: Set<string>;
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
  private variableFacade: VariableFacade;
  private resolverVariableFacade: ResolverVariableFacade;
  private importResolver: IImportResolver;
  private contextManager: ContextManager;
  private contextFacade: ContextFacade;
  private hookManager: HookManager;
  private guardRegistry: GuardRegistry;
  private childLifecycle: ChildEnvironmentLifecycle;
  private diagnosticsRuntime: DiagnosticsRuntime;
  private runtimeConfiguration: RuntimeConfigurationRuntime;
  private pipelineGuardHistoryStore: { entries?: GuardHistoryEntry[] };
  private mcpImportManager?: McpImportManager;
  
  // Shadow environments for language-specific function injection
  private shadowEnvironmentRuntime: ShadowEnvironmentRuntime;
  private executionOrchestrator: ExecutionOrchestrator;
  
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
  private stateWriteRuntime: StateWriteRuntime;
  
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
  private outputCoordinator: OutputCoordinator;
  private sdkEventBridge: SdkEventBridge;
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
    this.securityPolicyRuntime = new SecurityPolicyRuntime(parent?.securityPolicyRuntime);
    this.sdkEventBridge = parent ? parent.sdkEventBridge : new SdkEventBridge();
    if (parent) {
      this.streamingOptions = { ...parent.streamingOptions };
    } else {
      this.sdkEventBridge.setStreamingOptions(this.streamingOptions);
    }
    
    // Initialize effect handler: use provided, inherit from parent, or create default
    this.effectHandler = effectHandler || parent?.effectHandler || new DefaultEffectHandler();

    // Initialize output renderer: inherit from parent to share break collapsing state
    // OutputRenderer accepts a callback entrypoint; this keeps intent->effect routing local.
    this.outputRenderer = parent?.outputRenderer || new OutputRenderer((intent) => {
      this.outputCoordinator.intentToEffect(intent, this.getOutputCoordinatorContext());
    });
    this.outputCoordinator = new OutputCoordinator(this.effectHandler, this.outputRenderer);

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
    this.contextFacade = new ContextFacade(
      this.contextManager,
      this.guardRegistry,
      this.pipelineGuardHistoryStore
    );
    this.childLifecycle = parent ? parent.childLifecycle : new ChildEnvironmentLifecycle();
    this.diagnosticsRuntime = parent
      ? parent.diagnosticsRuntime
      : new DiagnosticsRuntime();
    this.runtimeConfiguration = parent
      ? parent.runtimeConfiguration
      : new RuntimeConfigurationRuntime();
    
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
      this.cacheManager = new CacheManager(this.immutableCache, this.urlConfig);
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
    this.variableFacade = new VariableFacade(this.variableManager, this.importBindings);
    this.resolverVariableFacade = new ResolverVariableFacade(this.cacheManager, this.reservedNames);
    this.stateWriteRuntime = parent
      ? parent.stateWriteRuntime
      : new StateWriteRuntime(this.variableManager);
    this.shadowEnvironmentRuntime = new ShadowEnvironmentRuntime(this, parent?.shadowEnvironmentRuntime);
    this.executionOrchestrator = new ExecutionOrchestrator(
      this,
      this.errorUtils,
      this.variableManager,
      this.shadowEnvironmentRuntime
    );
    
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
      this.executionOrchestrator.initialize();
      this.commandExecutorFactory = this.executionOrchestrator.getFactory();
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

    const resolver = new DynamicModuleResolver(modules, { source, literalStrings: options?.literalStrings });
    this.resolverManager.registerResolver(resolver);
    logger.debug(`Registered dynamic modules: ${Object.keys(modules).length}${source ? ` (source: ${source})` : ''}`);

    // Track @state snapshot for live reads/updates
    if (Object.prototype.hasOwnProperty.call(modules, '@state')) {
      const stateValue = modules['@state'];
      if (stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
        this.stateWriteRuntime.registerDynamicStateSnapshot(
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
      
      // Only reserve names for core transformers (isReserved: true)
      // Convenience transformers (upper, lower, trim, etc.) can be overridden
      if (transformer.isReserved === true) {
        this.reservedNames.add(transformer.uppercase);
        this.reservedNames.add(transformer.name);
      }

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
  
  
  // --- Property Accessors ---
  
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
   * Legacy method - returns project root for backward compatibility
   * @deprecated Use getProjectRoot() or getFileDirectory() instead
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
    return this.variableFacade.getImportBinding(name);
  }

  setImportBinding(name: string, info: ImportBindingInfo): void {
    this.variableFacade.setImportBinding(name, info);
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
    return this.securityPolicyRuntime.getPolicyCapabilities();
  }

  setPolicyCapabilities(policy: PolicyCapabilities): void {
    this.securityPolicyRuntime.setPolicyCapabilities(policy);
  }

  getPolicySummary(): PolicyConfig | undefined {
    return this.securityPolicyRuntime.getPolicySummary();
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
    return this.securityPolicyRuntime.getAllowedTools();
  }

  setAllowedTools(tools?: Iterable<string> | null): void {
    this.securityPolicyRuntime.setAllowedTools(tools);
    if (!this.securityPolicyRuntime.hasLocalAllowedTools()) {
      this.allowedTools = undefined;
      return;
    }
    const localTools = this.securityPolicyRuntime.getAllowedTools();
    this.allowedTools = localTools ? new Set(localTools) : new Set<string>();
  }

  isToolAllowed(toolName: string, mcpName?: string): boolean {
    return this.securityPolicyRuntime.isToolAllowed(toolName, mcpName);
  }

  setPolicyContext(policy?: Record<string, unknown> | null): void {
    this.securityPolicyRuntime.setPolicyContext(policy);
  }

  setPolicyEnvironment(environment?: string | null): void {
    this.securityPolicyRuntime.setPolicyEnvironment(environment);
  }

  getPolicyContext(): Record<string, unknown> | undefined {
    return this.securityPolicyRuntime.getPolicyContext();
  }

  getProjectConfig(): ProjectConfig | undefined {
    if (this.projectConfig) {
      return this.projectConfig;
    }
    return this.parent?.getProjectConfig();
  }

  recordPolicyConfig(alias: string, config: any): void {
    this.securityPolicyRuntime.recordPolicyConfig(alias, config);
  }

  getSecuritySnapshot(): SecuritySnapshotLike | undefined {
    return this.securityPolicyRuntime.getSecuritySnapshot();
  }

  private snapshotToDescriptor(snapshot?: SecuritySnapshotLike): SecurityDescriptor | undefined {
    return this.securityPolicyRuntime.snapshotToDescriptor(snapshot);
  }

  pushSecurityContext(input: {
    descriptor: SecurityDescriptor;
    kind: CapabilityKind;
    importType?: ImportType;
    metadata?: Record<string, unknown>;
    operation?: Record<string, unknown>;
    policy?: Record<string, unknown>;
  }): void {
    this.securityPolicyRuntime.pushSecurityContext(input);
  }

  popSecurityContext(): CapabilityContext | undefined {
    return this.securityPolicyRuntime.popSecurityContext();
  }

  mergeSecurityDescriptors(
    ...descriptors: Array<SecurityDescriptor | undefined>
  ): SecurityDescriptor {
    return this.securityPolicyRuntime.mergeSecurityDescriptors(...descriptors);
  }

  recordSecurityDescriptor(descriptor: SecurityDescriptor | undefined): void {
    this.securityPolicyRuntime.recordSecurityDescriptor(descriptor);
  }

  recordStateWrite(write: Omit<StateWrite, 'index' | 'timestamp'> & { index?: number; timestamp?: string }): void {
    this.stateWriteRuntime.recordStateWrite(write);
  }

  getStateWrites(): StateWrite[] {
    return this.stateWriteRuntime.getStateWrites();
  }
  
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
    this.variableFacade.setVariable(name, variable);
    if (this.sdkEventBridge.hasEmitter()) {
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
    this.variableFacade.setParameterVariable(name, variable);
  }

  /**
   * Update an existing variable's value in place.
   * Used for augmented assignment (+=) on local let bindings.
   */
  updateVariable(name: string, variable: Variable): void {
    this.variableFacade.updateVariable(name, variable);
  }

  getVariable(name: string): Variable | undefined {
    const variable = this.variableFacade.getVariable(name);
    if (this.sdkEventBridge.hasEmitter()) {
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
    return this.variableFacade.getVariableValue(name);
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
  
  /**
   * Get a resolver variable with proper async resolution
   * This handles context-dependent behavior for resolvers
   */
  async getResolverVariable(name: string): Promise<Variable | undefined> {
    return this.resolverVariableFacade.resolve(name, {
      resolverManager: this.getResolverManager(),
      debugValue: name === 'debug' ? this.createDebugObject(3) : ''
    });
  }
  
  hasVariable(name: string): boolean {
    return this.variableFacade.hasVariable(name);
  }
  
  /**
   * Get a transform function by name
   * First checks built-in transforms, then variables
   */
  getTransform(name: string): Function | undefined {
    return this.variableFacade.getTransform(name, builtinTransformers as Record<string, Function>);
  }
  
  // --- Frontmatter Support ---
  
  /**
   * Set frontmatter data for this environment
   * Creates both @fm and @frontmatter as aliases to the same data
   */
  setFrontmatter(data: Record<string, unknown>): void {
    this.variableFacade.setFrontmatter(data);
  }
  
  // --- Node Management ---
  
  addNode(node: MlldNode): void {
    this.nodes.push(node);
  }
  
  getNodes(): MlldNode[] {
    return this.nodes;
  }
  
  // --- Effect Management ---
  
  /**
   * Emit an effect immediately rather than storing as a node.
   * This enables immediate output during for loops and pipelines.
   */
  emitEffect(
    type: EffectType,
    content: string,
    options?: EffectOptions
  ): void {
    this.outputCoordinator.emitEffect(type, content, options, this.getOutputCoordinatorContext());
  }

  /**
   * Convert an OutputIntent to an Effect and emit it
   *
   * Internal method used by OutputRenderer callback to route
   * intents through the effect system.
   */
  private intentToEffect(intent: OutputIntent): void {
    this.outputCoordinator.intentToEffect(intent, this.getOutputCoordinatorContext());
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
    this.outputCoordinator.emitIntent(intent);
  }

  /**
   * Render final output (flushes pending breaks)
   *
   * Call this at the end of document execution to ensure
   * all pending intents are flushed.
   */
  renderOutput(): void {
    this.outputCoordinator.renderOutput();
  }

  /**
   * Get the current effect handler (mainly for testing).
   */
  getEffectHandler(): EffectHandler {
    return this.outputCoordinator.getEffectHandler();
  }
  
  /**
   * Set a custom effect handler (mainly for testing).
   */
  setEffectHandler(handler: EffectHandler): void {
    this.effectHandler = handler;
    this.outputCoordinator.setEffectHandler(handler);
  }

  private getOutputCoordinatorContext(): OutputCoordinatorContext {
    return {
      getSecuritySnapshot: () => this.getSecuritySnapshot(),
      recordSecurityDescriptor: descriptor => this.recordSecurityDescriptor(descriptor),
      isImportingContent: () => this.isImportingContent,
      isProvenanceEnabled: () => this.isProvenanceEnabled(),
      hasSDKEmitter: () => this.sdkEventBridge.hasEmitter(),
      emitSDKEvent: event => this.emitSDKEvent(event)
    };
  }
  
  getContextManager(): ContextManager {
    return this.contextFacade.getContextManager();
  }

  getHookManager(): HookManager {
    return this.hookManager;
  }

  getGuardRegistry(): GuardRegistry {
    return this.contextFacade.getGuardRegistry();
  }

  getPipelineGuardHistory(): GuardHistoryEntry[] {
    return this.contextFacade.getPipelineGuardHistory();
  }

  recordPipelineGuardHistory(entry: GuardHistoryEntry): void {
    this.contextFacade.recordPipelineGuardHistory(entry);
  }

  resetPipelineGuardHistory(): void {
    this.contextFacade.resetPipelineGuardHistory();
  }

  serializeLocalGuards(): SerializedGuardDefinition[] {
    return this.contextFacade.serializeLocalGuards();
  }

  serializeGuardsByNames(names: readonly string[]): SerializedGuardDefinition[] {
    return this.contextFacade.serializeGuardsByNames(names);
  }

  registerSerializedGuards(definitions: SerializedGuardDefinition[] | undefined | null): void {
    this.contextFacade.registerSerializedGuards(definitions);
  }

  async withOpContext<T>(context: OperationContext, fn: () => Promise<T> | T): Promise<T> {
    return this.contextFacade.withOpContext(context, fn);
  }

  updateOpContext(update: Partial<OperationContext>): void {
    this.contextFacade.updateOpContext(update);
  }

  getEnclosingExeLabels(): readonly string[] {
    return this.contextFacade.getEnclosingExeLabels();
  }

  setToolsAvailability(allowed: readonly string[], denied: readonly string[]): void {
    this.contextFacade.setToolsAvailability(allowed, denied);
  }

  recordToolCall(call: ToolCallRecord): void {
    this.contextFacade.recordToolCall(call);
  }

  resetToolCalls(): void {
    this.contextFacade.resetToolCalls();
  }

  async withPipeContext<T>(
    context: PipelineContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextFacade.withPipeContext(context, fn);
  }

  async withGuardContext<T>(
    context: GuardContextSnapshot,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextFacade.withGuardContext(context, fn);
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
    return this.contextFacade.withDeniedContext(context, fn);
  }

  pushExecutionContext(type: string, context: unknown): void {
    this.contextFacade.pushExecutionContext(type, context);
  }

  popExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextFacade.popExecutionContext<T>(type);
  }

  getExecutionContext<T = unknown>(type: string): T | undefined {
    return this.contextFacade.getExecutionContext<T>(type);
  }

  async withExecutionContext<T>(
    type: string,
    context: unknown,
    fn: () => Promise<T> | T
  ): Promise<T> {
    return this.contextFacade.withExecutionContext(type, context, fn);
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
      this.reservedNames.add('keep');
      this.reservedNames.add('keepStructured');
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
    root.sdkEventBridge.setStreamingOptions(this.getStreamingOptions());
    root.sdkEventBridge.enable(emitter, this.getStreamingBus());
  }

  emitSDKEvent(event: SDKEvent): void {
    const root = this.getRootEnvironment();
    root.sdkEventBridge.emit(event);
  }
  
  /**
   * Get the parent environment (if this is a child environment).
   */
  getParent(): Environment | undefined {
    return this.parent;
  }
  
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
    this.shadowEnvironmentRuntime.setShadowEnv(language, functions);
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
    return this.shadowEnvironmentRuntime.getShadowEnv(language);
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
    return this.shadowEnvironmentRuntime.getNodeShadowEnv();
  }
  
  /**
   * Get or create Node shadow environment instance
   * @returns NodeShadowEnvironment instance (always creates one if needed)
   */
  getOrCreateNodeShadowEnv(): NodeShadowEnvironment {
    return this.shadowEnvironmentRuntime.getOrCreateNodeShadowEnv();
  }

  /**
   * Get Python shadow environment instance with parent environment fallback
   * @returns PythonShadowEnvironment instance or undefined if not available
   */
  getPythonShadowEnv(): PythonShadowEnvironment | undefined {
    return this.shadowEnvironmentRuntime.getPythonShadowEnv();
  }

  /**
   * Get or create Python shadow environment instance
   * @returns PythonShadowEnvironment instance (always creates one if needed)
   */
  getOrCreatePythonShadowEnv(): PythonShadowEnvironment {
    return this.shadowEnvironmentRuntime.getOrCreatePythonShadowEnv();
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
    return this.shadowEnvironmentRuntime.captureAllShadowEnvs();
  }

  /**
   * Check if this environment has any shadow environments defined
   * Used to avoid unnecessary capture operations
   */
  hasShadowEnvs(): boolean {
    return this.shadowEnvironmentRuntime.hasShadowEnvs();
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
    this.commandExecutorFactory = this.executionOrchestrator.getFactory();
    return this.executionOrchestrator.executeCommand({
      command,
      options,
      context,
      defaultOptions: this.outputOptions
    });
  }
  
  async executeCode(
    code: string, 
    language: string, 
    params?: Record<string, any>,
    metadata?: Record<string, any> | CommandExecutionContext,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    this.commandExecutorFactory = this.executionOrchestrator.getFactory();
    return this.executionOrchestrator.executeCode({
      code,
      language,
      params,
      metadata,
      options,
      context,
      defaultOptions: this.outputOptions
    });
  }

  
  
  async resolvePath(inputPath: string): Promise<string> {
    return this.importResolver.resolvePath(inputPath);
  }

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

    this.childLifecycle.applyChildInheritance(child, this, {
      includeInitialNodeCount: options.includeInitialNodeCount,
      includeModuleIsolation: options.includeModuleIsolation,
      includeTraceInheritance: options.includeTraceInheritance
    });

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
    const childContext = this.childLifecycle.resolveChildContext(
      this.pathContext,
      this.basePath,
      newBasePath
    );
    return this.createLifecycleChild(childContext, {
      importResolverBasePath: newBasePath,
      includeInitialNodeCount: true,
      includeModuleIsolation: true,
      inheritPolicy: true,
      trackForCleanup: true
    });
  }
  
  mergeChild(child: Environment): void {
    this.childLifecycle.mergeChildVariables(
      this.variableManager,
      child.variableManager.getVariables()
    );
    this.childLifecycle.mergeChildNodes(this.nodes, child.nodes);
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
    this.defaultUrlOptions = this.runtimeConfiguration.mergeUrlOptions(this.defaultUrlOptions, options);
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
    this.urlConfig = this.runtimeConfiguration.applyUrlConfig(this.cacheManager, config);
  }

  /**
   * Configure allowance of absolute paths outside project root
   */
  setAllowAbsolutePaths(allow: boolean): void {
    this.allowAbsolutePaths = this.runtimeConfiguration.setAllowAbsolutePaths(allow);
  }

  getAllowAbsolutePaths(): boolean {
    return this.runtimeConfiguration.getAllowAbsolutePaths(this.allowAbsolutePaths);
  }

  // --- Output Management Methods ---
  
  setOutputOptions(options: Partial<CommandExecutionOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
  }

  setStreamingOptions(options: Partial<StreamingOptions> | undefined): void {
    const sink = this.parent ? undefined : this.sdkEventBridge;
    this.streamingOptions = this.runtimeConfiguration.setStreamingOptions(
      this.streamingOptions,
      options,
      sink
    );
  }

  getStreamingOptions(): StreamingOptions {
    return this.runtimeConfiguration.getStreamingOptions(this.streamingOptions);
  }

  setStreamingManager(manager: StreamingManager): void {
    const root = this.getRootEnvironment();
    root.streamingManager = this.runtimeConfiguration.setStreamingManager(manager);
  }

  getStreamingManager(): StreamingManager {
    const root = this.getRootEnvironment();
    root.streamingManager = this.runtimeConfiguration.ensureStreamingManager(root.streamingManager);
    return root.streamingManager;
  }

  getStreamingBus(): StreamBus {
    return this.getStreamingManager().getBus();
  }

  setStreamingResult(result: StreamingResult | undefined): void {
    const root = this.getRootEnvironment();
    root.streamingResult = this.runtimeConfiguration.setStreamingResult(result);
  }

  getStreamingResult(): StreamingResult | undefined {
    return this.runtimeConfiguration.getStreamingResult(this.getRootEnvironment().streamingResult);
  }

  setProvenanceEnabled(enabled: boolean): void {
    const root = this.getRootEnvironment();
    root.provenanceEnabled = this.runtimeConfiguration.setProvenanceEnabled(enabled);
  }

  isProvenanceEnabled(): boolean {
    return this.runtimeConfiguration.isProvenanceEnabled(this.getRootEnvironment().provenanceEnabled);
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
    this.dynamicModuleMode = this.runtimeConfiguration.setDynamicModuleMode(mode);
  }

  /**
   * Get dynamic module parsing mode (defaults to 'strict')
   */
  getDynamicModuleMode(): MlldMode {
    return this.runtimeConfiguration.getDynamicModuleMode(this.dynamicModuleMode);
  }

  /**
   * Set blank line normalization flag
   */
  setNormalizeBlankLines(normalize: boolean): void {
    this.normalizeBlankLines = this.runtimeConfiguration.setNormalizeBlankLines(normalize);
  }
  
  /**
   * Set fuzzy matching configuration for local file imports
   */
  setLocalFileFuzzyMatch(config: FuzzyMatchConfig | boolean): void {
    this.localFileFuzzyMatch = this.runtimeConfiguration.setLocalFileFuzzyMatch(config);
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

    const flags = this.runtimeConfiguration.enableEphemeralMode();
    this.isEphemeralMode = flags.isEphemeralMode;
    this.approveAllImports = flags.approveAllImports;

    const reconfigured = await this.runtimeConfiguration.reconfigureForEphemeral({
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

    this.importResolver = this.runtimeConfiguration.createImportResolver({
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
    });
  }
  
  /**
   * Get blank line normalization flag
   */
  getNormalizeBlankLines(): boolean {
    return this.runtimeConfiguration.getNormalizeBlankLines(this.normalizeBlankLines);
  }
  
  /**
   * Configure local module support once resolvers are ready
   */
  async configureLocalModules(): Promise<void> {
    await this.runtimeConfiguration.configureLocalModules({
      resolverManager: this.resolverManager,
      localModulePath: this.localModulePath,
      fileSystem: this.fileSystem,
      projectConfig: this.projectConfig
    });
  }
  
  getCollectedErrors(): CollectedError[] {
    return this.diagnosticsRuntime.getCollectedErrors(this.errorUtils);
  }
  
  clearCollectedErrors(): void {
    this.diagnosticsRuntime.clearCollectedErrors(this.errorUtils);
  }
  
  async displayCollectedErrors(): Promise<void> {
    await this.diagnosticsRuntime.displayCollectedErrors(
      this.errorUtils,
      this.fileSystem,
      this.basePath
    );
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
    const childContext = this.childLifecycle.resolveChildContext(this.pathContext, this.basePath);
    return this.createLifecycleChild(childContext, {
      includeTraceInheritance: true
    });
  }

  private getDirectiveTraceState(): {
    directiveTrace: DirectiveTrace[];
    directiveTimings: number[];
    traceEnabled: boolean;
    currentFilePath?: string;
  } {
    return {
      directiveTrace: this.directiveTrace,
      directiveTimings: this.directiveTimings,
      traceEnabled: this.traceEnabled,
      currentFilePath: this.currentFilePath
    };
  }

  private getDirectiveTraceEventOptions(): {
    bridge?: { emitSDKEvent(event: SDKEvent): void };
    provenance?: SecurityDescriptor;
  } {
    return {
      bridge: this.sdkEventBridge.hasEmitter() ? this : undefined,
      provenance: this.isProvenanceEnabled()
        ? this.snapshotToDescriptor(this.getSecuritySnapshot())
        : undefined
    };
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
    this.diagnosticsRuntime.pushDirective(
      this.getDirectiveTraceState(),
      directive,
      varName,
      location,
      this.getDirectiveTraceEventOptions()
    );
  }
  
  /**
   * Pop a directive from the trace stack
   */
  popDirective(): void {
    this.diagnosticsRuntime.popDirective(
      this.getDirectiveTraceState(),
      this.getDirectiveTraceEventOptions()
    );
  }
  
  /**
   * Get a copy of the current directive trace
   */
  getDirectiveTrace(): DirectiveTrace[] {
    return this.diagnosticsRuntime.getDirectiveTrace(this.getDirectiveTraceState());
  }
  
  /**
   * Mark the last directive in the trace as failed
   */
  markLastDirectiveFailed(errorMessage: string): void {
    this.diagnosticsRuntime.markLastDirectiveFailed(this.getDirectiveTraceState(), errorMessage);
  }
  
  /**
   * Set whether tracing is enabled
   */
  setTraceEnabled(enabled: boolean): void {
    const state = this.getDirectiveTraceState();
    this.diagnosticsRuntime.setTraceEnabled(state, enabled);
    this.traceEnabled = state.traceEnabled;
    this.directiveTrace = state.directiveTrace;
  }
  
  /**
   * Check if tracing is enabled
   */
  isTraceEnabled(): boolean {
    return this.diagnosticsRuntime.isTraceEnabled(this.getDirectiveTraceState());
  }
  
  // --- Source Cache Methods ---
  
  /**
   * Cache source content for error reporting
   * @param filePath The file path to cache
   * @param content The source content
   */
  cacheSource(filePath: string, content: string): void {
    this.diagnosticsRuntime.cacheSource(
      this.sourceCache,
      this.parent,
      filePath,
      content
    );
  }
  
  /**
   * Retrieve cached source content for error reporting
   * @param filePath The file path to retrieve
   * @returns The cached source content or undefined
   */
  getSource(filePath: string): string | undefined {
    return this.diagnosticsRuntime.getSource(
      this.sourceCache,
      this.parent,
      filePath
    );
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
        this.sdkEventBridge.cleanup();
      } catch (error) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[Environment] Failed to detach stream bridge', error);
        }
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
    this.shadowEnvironmentRuntime.cleanup();
    
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
