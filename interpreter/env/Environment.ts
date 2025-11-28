import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { Variable, VariableSource, PipelineInput } from '@core/types/variable';
import { 
  createSimpleTextVariable, 
  createObjectVariable, 
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
import { execSync } from 'child_process';
import * as path from 'path';
// Note: ImportApproval, ImmutableCache, and GistTransformer are now handled by ImportResolver
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldCommandExecutionError, type CommandExecutionDetails } from '@core/errors';
import { SecurityManager } from '@security';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  createCapabilityContext,
  type SecurityDescriptor,
  type CapabilityContext,
  type CapabilityKind,
  type ImportType,
  type DataLabel,
  type TaintLevel
} from '@core/types/security';
import { TaintTracker } from '@core/security';
import { RegistryManager, ModuleCache, LockFile, ProjectConfig } from '@core/registry';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { astLocationToSourceLocation } from '@core/types';
import { ResolverManager, RegistryResolver, LocalResolver, GitHubResolver, HTTPResolver, ProjectPathResolver } from '@core/resolvers';
import { logger } from '@core/utils/logger';
import * as shellQuote from 'shell-quote';
import { getTimeValue, getProjectPathValue } from '../utils/reserved-variables';
import { builtinTransformers, createTransformerVariable } from '../builtin/transformers';
import { NodeShadowEnvironment } from './NodeShadowEnvironment';
import { CacheManager } from './CacheManager';
import { CommandUtils } from './CommandUtils';
import { DebugUtils } from './DebugUtils';
import { ErrorUtils, type CollectedError, type CommandExecutionContext } from './ErrorUtils';
import { CommandExecutorFactory, type ExecutorDependencies, type CommandExecutionOptions } from './executors';
import { VariableManager, type IVariableManager, type VariableManagerDependencies, type VariableManagerContext } from './VariableManager';
import { ImportResolver, type IImportResolver, type ImportResolverDependencies, type ImportResolverContext, type FetchURLOptions } from './ImportResolver';
import type { PathContext } from '@core/services/PathContextService';
import { PathContextBuilder } from '@core/services/PathContextService';
import { ShadowEnvironmentCapture, ShadowEnvironmentProvider } from './types/ShadowEnvironmentCapture';
import { EffectHandler, DefaultEffectHandler } from './EffectHandler';
import { defaultStreamingOptions, type StreamingOptions } from '../eval/pipeline/streaming-options';
import { getStreamBus, type StreamEvent } from '../eval/pipeline/stream-bus';
import { ExportManifest } from '../eval/import/ExportManifest';
import {
  ContextManager,
  type PipelineContextSnapshot,
  type GuardContextSnapshot,
  type OperationContext,
  type DeniedContextSnapshot,
  type GuardHistoryEntry
} from './ContextManager';
import { HookManager } from '../hooks/HookManager';
import { guardPreHook } from '../hooks/guard-pre-hook';
import { guardPostHook } from '../hooks/guard-post-hook';
import { taintPostHook } from '../hooks/taint-post-hook';
import { createKeepExecutable, createKeepStructuredExecutable } from './builtins';
import { GuardRegistry, type SerializedGuardDefinition } from '../guards';
import type { ExecutionEmitter } from '@sdk/execution-emitter';
import type { SDKEffectEvent, SDKEvent, SDKStreamEvent, SDKCommandEvent } from '@sdk/types';

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

interface SecuritySnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  taintLevel: TaintLevel;
  policy?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
}


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
  private commandExecutorFactory: CommandExecutorFactory;
  private variableManager: IVariableManager;
  private importResolver: IImportResolver;
  private contextManager: ContextManager;
  private hookManager: HookManager;
  private guardRegistry: GuardRegistry;
  private pipelineGuardHistory?: GuardHistoryEntry[];
  
  // Shadow environments for language-specific function injection
  private shadowEnvs: Map<string, Map<string, any>> = new Map();
  private nodeShadowEnv?: NodeShadowEnvironment; // VM-based Node.js shadow environment
  
  // Output management properties
  private outputOptions: CommandExecutionOptions = {
    showProgress: false,  // Default to false to avoid debug output in results
    maxOutputLines: 50,
    errorBehavior: 'continue',
    timeout: 30000,
    collectErrors: false
  };
  private streamingOptions: StreamingOptions = defaultStreamingOptions;
  
  // Import approval bypass flag
  private approveAllImports: boolean = false;
  
  // Ephemeral mode flag for error context
  private isEphemeralMode: boolean = false;
  
  // Track child environments for cleanup
  private childEnvironments: Set<Environment> = new Set();
  
  // Blank line normalization flag
  private normalizeBlankLines: boolean = true;
  
  // Development mode flag
  private localModulePath?: string;
  private configuredLocalModules: boolean = false;
  
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
  private sdkEmitter?: ExecutionEmitter;
  private streamBridgeUnsub?: () => void;

  // Import evaluation guard - prevents directive execution during import
  private isImportingContent: boolean = false;

  // Captured module environment used during imported executable invocation
  private capturedModuleEnv?: Map<string, Variable>;

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
    // Handle both legacy basePath and new PathContext
    if (typeof basePathOrContext === 'string') {
      // Legacy mode - basePath provided
      this.basePath = basePathOrContext;
      logger.debug('Environment created with legacy basePath', { basePath: this.basePath });
    } else {
      // New mode - PathContext provided
      this.pathContext = basePathOrContext;
      this.basePath = basePathOrContext.projectRoot; // Use project root as basePath for compatibility
      logger.debug('Environment created with PathContext', { 
        projectRoot: this.pathContext.projectRoot,
        fileDirectory: this.pathContext.fileDirectory 
      });
    }
    this.parent = parent;
    
    // Initialize effect handler: use provided, inherit from parent, or create default
    this.effectHandler = effectHandler || parent?.effectHandler || new DefaultEffectHandler();

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
    
    // Inherit reserved names from parent environment
    if (parent) {
      this.reservedNames = new Set(parent.reservedNames);
      // Inherit fuzzy match configuration from parent
      this.localFileFuzzyMatch = parent.localFileFuzzyMatch;
    }
    
    // Initialize security components for root environment only
    if (!parent) {
      try {
        this.securityManager = SecurityManager.getInstance(this.getProjectRoot());
      } catch (error) {
        // If security manager fails to initialize, continue with legacy components
        console.warn('SecurityManager not available, using legacy security components');
      }
      
      // Initialize registry manager
      try {
        this.registryManager = new RegistryManager(
        this.pathContext || this.getProjectRoot()
      );
      } catch (error) {
        console.warn('RegistryManager not available:', error);
      }
      
      // Initialize module cache and project config
      let moduleCache: ModuleCache | undefined;
      let projectConfig: ProjectConfig | undefined;
      let lockFile: LockFile | undefined;

      try {
        moduleCache = new ModuleCache();
        // Create project config instance
        projectConfig = new ProjectConfig(this.getProjectRoot());
        this.projectConfig = projectConfig;
        const localModulesRelative = projectConfig.getLocalModulesPath?.() ?? path.join('llm', 'modules');
        this.localModulePath = path.isAbsolute(localModulesRelative)
          ? localModulesRelative
          : path.join(this.getProjectRoot(), localModulesRelative);
        // We need the actual LockFile for resolver management and immutable caching
        const lockFilePath = path.join(this.getProjectRoot(), 'mlld-lock.json');
        lockFile = new LockFile(lockFilePath);
        this.allowAbsolutePaths = projectConfig.getAllowAbsolutePaths();
        
      } catch (error) {
        console.warn('Failed to initialize cache/lock file:', error);
      }
      if (!this.localModulePath) {
        this.localModulePath = path.join(this.getProjectRoot(), 'llm', 'modules');
      }
      
      // Initialize resolver manager
      try {
        this.resolverManager = new ResolverManager(
          undefined, // Use default security policy
          moduleCache,
          lockFile
        );
        
        // NOTE: Built-in function resolvers will be registered separately via registerBuiltinResolvers()
        // This allows the constructor to remain synchronous
        
        // Register path resolvers (priority 1)
        // ProjectPathResolver should be first to handle @base references
        this.resolverManager.registerResolver(new ProjectPathResolver(this.fileSystem));
        
        // Register module resolvers (priority 10)
        // RegistryResolver should be next to be the primary resolver for @user/module patterns
        this.resolverManager.registerResolver(new RegistryResolver());
        
        // Register file resolvers (priority 20)
        this.resolverManager.registerResolver(new LocalResolver(this.fileSystem));
        this.resolverManager.registerResolver(new GitHubResolver());
        this.resolverManager.registerResolver(new HTTPResolver());
        
        // Configure built-in prefixes
        this.resolverManager.configurePrefixes([
          {
            prefix: '@base',
            resolver: 'base',
            type: 'io',
            config: {
              basePath: this.getProjectRoot(),
              readonly: false
            }
          }
        ], this.basePath);
        
        // Load resolver configs from project config if available
        if (projectConfig) {
          const resolverPrefixes = projectConfig.getResolverPrefixes();
          if (resolverPrefixes.length > 0) {
            logger.debug(`Configuring ${resolverPrefixes.length} resolver prefixes from config`);
            this.resolverManager.configurePrefixes(resolverPrefixes, this.basePath);
            logger.debug(`Total prefixes after configuration: ${this.resolverManager.getPrefixConfigs().length}`);
          }
        }
      } catch (error) {
        console.warn('ResolverManager initialization failed:', error);
        if (error instanceof Error) {
          console.warn('Error stack:', error.stack);
        }
        // Still assign a basic resolver manager so we don't crash later
        this.resolverManager = undefined;
      }
      
      // Note: ImportApproval and ImmutableCache are now handled by ImportResolver
    }
    
    // Initialize utility managers
    this.cacheManager = new CacheManager(this.immutableCache, this.urlConfig);
    this.errorUtils = new ErrorUtils();
    
    // Initialize variable manager with dependencies
    const variableManagerDependencies: VariableManagerDependencies = {
      cacheManager: this.cacheManager,
      getCurrentFilePath: () => this.getCurrentFilePath(),
      getReservedNames: () => this.reservedNames,
      getParent: () => this.parent,
      getCapturedModuleEnv: () => this.capturedModuleEnv,
      getResolverManager: () => this.getResolverManager(),
      createDebugObject: (format: number) => this.createDebugObject(format),
      getEnvironmentVariables: () => this.getEnvironmentVariables(),
      getStdinContent: () => this.stdinContent,
      getFsService: () => this.fileSystem,
      getPathService: () => this.pathService,
      getSecurityManager: () => this.securityManager,
      getBasePath: () => this.getProjectRoot(),
      getFileDirectory: () => this.getFileDirectory(),
      getExecutionDirectory: () => this.getExecutionDirectory(),
      getPipelineContext: () => this.getPipelineContext(),
      getSecuritySnapshot: () => this.getSecuritySnapshot(),
      recordSecurityDescriptor: descriptor => this.recordSecurityDescriptor(descriptor),
      getContextManager: () => this.contextManager
    };
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
    
    // Initialize import resolver with dependencies
    const importResolverDependencies: ImportResolverDependencies = {
      fileSystem: this.fileSystem,
      pathService: this.pathService,
      pathContext: this.pathContext || {
        projectRoot: this.basePath,
        fileDirectory: this.basePath,
        executionDirectory: this.basePath,
        invocationDirectory: process.cwd()
      },
      cacheManager: this.cacheManager,
      getSecurityManager: () => this.getSecurityManager(),
      getRegistryManager: () => this.getRegistryManager(),
      getResolverManager: () => this.getResolverManager(),
      getParent: () => this.parent,
      getCurrentFilePath: () => this.getCurrentFilePath(),
      getApproveAllImports: () => this.approveAllImports,
      getLocalFileFuzzyMatch: () => this.localFileFuzzyMatch,
      getURLConfig: () => this.urlConfig,
      getDefaultUrlOptions: () => this.defaultUrlOptions,
      getAllowAbsolutePaths: () => this.allowAbsolutePaths
    };
    this.importResolver = new ImportResolver(importResolverDependencies);

    // Ensure keep/keepStructured helpers are available even from child environments
    this.getRootEnvironment().registerKeepBuiltins();
    
    // Initialize command executor factory with dependencies
    const executorDependencies: ExecutorDependencies = {
      errorUtils: this.errorUtils,
      workingDirectory: this.getExecutionDirectory(),
      shadowEnvironment: {
        getShadowEnv: (language: string) => this.getShadowEnv(language)
      },
      nodeShadowProvider: {
        getNodeShadowEnv: () => this.getNodeShadowEnv(),
        getOrCreateNodeShadowEnv: () => this.getOrCreateNodeShadowEnv(),
        getCurrentFilePath: () => this.getCurrentFilePath()
      },
      variableProvider: {
        getVariables: () => this.variableManager.getVariables()
      }
    };
    this.commandExecutorFactory = new CommandExecutorFactory(executorDependencies);
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
    const { NowResolver, DebugResolver, InputResolver } = await import('@core/resolvers/builtin');
    
    // Create InputResolver with current stdin content
    const inputResolver = new InputResolver(this.stdinContent);
    
    // Register the resolvers
    this.resolverManager.registerResolver(new NowResolver());
    this.resolverManager.registerResolver(new DebugResolver());
    this.resolverManager.registerResolver(inputResolver);
    
    // Only reserve names for built-in function resolvers (not file/module resolvers)
    // Function resolvers are those that provide computed values like now, debug, etc.
    const functionResolvers = ['now', 'debug', 'input', 'base'];
    for (const name of functionResolvers) {
      this.reservedNames.add(name);
    }
    
    logger.debug(`Reserved resolver names: ${Array.from(this.reservedNames).join(', ')}`);
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
              ctx: {
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
      
      // Reserve both names
      this.reservedNames.add(transformer.uppercase);
      this.reservedNames.add(transformer.name);

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
    // Bindings are per environment, so this only reports collisions for the
    // current file rather than traversing the parent chain.
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

  getSecuritySnapshot(): SecuritySnapshot | undefined {
    if (this.securityRuntime) {
      const top = this.securityRuntime.stack[this.securityRuntime.stack.length - 1];
      return {
        labels: this.securityRuntime.descriptor.labels,
        sources: this.securityRuntime.descriptor.sources,
        taintLevel: this.securityRuntime.descriptor.taintLevel,
        policy: this.securityRuntime.policy,
        operation: top?.operation
      };
    }
    return this.parent?.getSecuritySnapshot();
  }

  protected ensureSecurityRuntime(): SecurityRuntimeState {
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

  pushSecurityContext(input: {
    descriptor: SecurityDescriptor;
    kind: CapabilityKind;
    importType?: ImportType;
    metadata?: Record<string, unknown>;
    operation?: Record<string, unknown>;
    policy?: Record<string, unknown>;
  }): void {
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
  
  getRegistryManager(): RegistryManager | undefined {
    // Get from this environment or parent
    if (this.registryManager) return this.registryManager;
    return this.parent?.getRegistryManager();
  }
  
  getResolverManager(): ResolverManager | undefined {
    // Get from this environment or parent
    if (this.resolverManager) return this.resolverManager;
    return this.parent?.getResolverManager();
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
    // Delegate entirely to VariableManager which handles local, captured, and parent lookups
    return this.variableManager.getVariable(name);
  }

  /**
   * Get the value of a variable, handling special cases
   * This is a convenience method for consumers
   */
  getVariableValue(name: string): any {
    return this.variableManager.getVariableValue(name);
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
    // Check if it's a reserved resolver name
    if (!this.reservedNames.has(name)) {
      return undefined;
    }
    
    // Special handling for debug variable - compute dynamically
    if (name === 'debug') {
      const debugValue = this.createDebugObject(3); // Use markdown format
      
      
      const debugSource: VariableSource = {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      };
      const debugVar = createObjectVariable(
        'debug',
        debugValue,
        false, // Not complex, it's just a string
        debugSource,
        {
          ctx: {
            definedAt: { line: 0, column: 0, filePath: '<reserved>' }
          },
          internal: {
            isReserved: true
          }
        }
      );
      return debugVar;
    }
    
    // Check cache first
    const cached = this.cacheManager.getResolverVariable(name);
    if (cached) {
      const needsResolution = cached.internal?.needsResolution;
      if (needsResolution === false) {
        return cached;
      }
    }
    
    // Get the resolver manager
    const resolverManager = this.getResolverManager();
    if (!resolverManager) {
      // Fallback to creating a basic resolver variable
      return this.createResolverVariable(name);
    }
    
    try {
      // Resolve with 'variable' context to get the appropriate content
      const resolverContent = await resolverManager.resolve(`@${name}`, { context: 'variable' });
      
      // Convert content based on contentType
      let varType: 'text' | 'data' = 'text';
      let varValue: any = resolverContent.content.content;
      
      if (resolverContent.content.contentType === 'data') {
        varType = 'data';
        // Parse JSON data if it's a string
        if (typeof varValue === 'string') {
          try {
            varValue = JSON.parse(varValue);
          } catch {
            // Keep as string if not valid JSON
          }
        }
      }
      
      // Create the resolved variable
      const resolverSource: VariableSource = {
        directive: 'var',
        syntax: varType === 'data' ? 'object' : 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      };
      const resolvedVar = varType === 'data'
        ? createObjectVariable(name, varValue, true, resolverSource, {
            ctx: {
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
            ctx: {
              definedAt: { line: 0, column: 0, filePath: '<resolver>' }
            },
            internal: {
              isReserved: true,
              isResolver: true,
              resolverName: name,
              needsResolution: false
            }
          });
      
      // Cache the resolved variable
      this.cacheManager.setResolverVariable(name, resolvedVar);
      
      return resolvedVar;
    } catch (error) {
      // If resolution fails, return undefined
      console.warn(`Failed to resolve variable @${name}: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  hasVariable(name: string): boolean {
    return this.variableManager.hasVariable(name);
  }
  
  /**
   * Get a transform function by name
   * First checks built-in transforms, then variables
   */
  getTransform(name: string): Function | undefined {
    // Check built-in transforms first
    const builtins = builtinTransformers;
    if (builtins[name]) {
      return builtins[name];
    }
    
    // Check variables that might be functions
    const variable = this.getVariable(name);
    if (variable && typeof variable === 'object' && '__executable' in variable) {
      return variable;
    }
    
    return undefined;
  }
  
  // --- Frontmatter Support ---
  
  /**
   * Set frontmatter data for this environment
   * Creates both @fm and @frontmatter as aliases to the same data
   */
  setFrontmatter(data: Record<string, unknown>): void {
    const frontmatterSource: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };
    const frontmatterVariable = createObjectVariable(
      'frontmatter',
      data,
      true, // Frontmatter can be complex
      frontmatterSource,
      {
        ctx: {
          source: 'frontmatter',
          definedAt: { line: 0, column: 0, filePath: '<frontmatter>' }
        },
        internal: {
          isSystem: true,
          immutable: true
        }
      }
    );
    
    // Create both @fm and @frontmatter as aliases
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
  
  // --- Effect Management ---
  
  /**
   * Emit an effect immediately rather than storing as a node.
   * This enables immediate output during for loops and pipelines.
   */
  emitEffect(
    type: 'doc' | 'stdout' | 'stderr' | 'both' | 'file',
    content: string,
    options?: {
      path?: string;
      source?: SourceLocation;
      mode?: 'append' | 'write';
      metadata?: any;
    }
  ): void {
    if (!this.effectHandler) {
      console.error('[WARNING] No effect handler available!');
      return;
    }

    // Suppress doc effects when importing to prevent module content from appearing in stdout
    if (type === 'doc' && this.isImportingContent) {
      return;
    }
    const snapshot = this.getSecuritySnapshot();
    let capability: CapabilityContext | undefined;
    if (snapshot) {
      const descriptor = makeSecurityDescriptor({
        labels: snapshot.labels,
        taintLevel: snapshot.taintLevel,
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

    // Always emit effects (handler decides whether to actually output)
    this.effectHandler.handleEffect(effect);

    if (this.sdkEmitter) {
      const event: SDKEffectEvent = {
        type: 'effect',
        effect: {
          ...effect,
          security: capability?.security ?? makeSecurityDescriptor(),
          provenance: capability?.security ?? makeSecurityDescriptor()
        },
        timestamp: Date.now()
      };
      this.emitSDKEvent(event);
    }
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
  
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getHookManager(): HookManager {
    return this.hookManager;
  }

  getGuardRegistry(): GuardRegistry {
    return this.guardRegistry;
  }

  getPipelineGuardHistory(): GuardHistoryEntry[] {
    const root = this.getRootEnvironment();
    if (!root.pipelineGuardHistory) {
      root.pipelineGuardHistory = [];
    }
    return root.pipelineGuardHistory;
  }

  recordPipelineGuardHistory(entry: GuardHistoryEntry): void {
    const history = this.getPipelineGuardHistory();
    history.push(entry);
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
    root.sdkEmitter = emitter;

    if (root.streamBridgeUnsub) {
      root.streamBridgeUnsub();
      root.streamBridgeUnsub = undefined;
    }

    const bus = getStreamBus();
    const unsubscribe = bus.subscribe(event => {
      const sdkEvent = this.mapStreamEvent(event);
      const commandEvent = this.mapCommandEvent(event);
      if (sdkEvent) root.sdkEmitter?.emit(sdkEvent);
      if (commandEvent) root.sdkEmitter?.emit(commandEvent);
    });
    root.streamBridgeUnsub = unsubscribe;
  }

  emitSDKEvent(event: SDKEvent): void {
    const root = this.getRootEnvironment();
    root.sdkEmitter?.emit(event);
  }

  private mapStreamEvent(event: StreamEvent): SDKStreamEvent | null {
    if (event.type === 'CHUNK') {
      return { type: 'stream:chunk', event };
    }
    return { type: 'stream:progress', event };
  }

  private mapCommandEvent(event: StreamEvent): SDKCommandEvent | null {
    switch (event.type) {
      case 'STAGE_START':
        return {
          type: 'command:start',
          command: (event.command as any)?.rawIdentifier,
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          timestamp: event.timestamp
        };
      case 'STAGE_SUCCESS':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          durationMs: event.durationMs,
          timestamp: event.timestamp
        };
      case 'STAGE_FAILURE':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          error: event.error,
          timestamp: event.timestamp
        };
      default:
        return null;
    }
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
    if (language === 'node' || language === 'nodejs') {
      // Create or get Node shadow environment
      if (!this.nodeShadowEnv) {
        this.nodeShadowEnv = new NodeShadowEnvironment(
          this.getFileDirectory(),
          this.currentFilePath
        );
      }
      
      // Add functions to Node shadow environment
      for (const [name, func] of functions) {
        this.nodeShadowEnv.addFunction(name, func);
      }
    } else {
      // Use existing implementation for other languages
      this.shadowEnvs.set(language, functions);
    }
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
      // Return Node shadow env functions as a Map
      const nodeShadowEnv = this.getNodeShadowEnv();
      if (nodeShadowEnv) {
        const functions = nodeShadowEnv.getFunctionNames();
        const map = new Map<string, any>();
        const context = nodeShadowEnv.getContext();
        for (const name of functions) {
          if (context[name]) {
            map.set(name, context[name]);
          }
        }
        return map;
      }
      return undefined;
    }
    return this.shadowEnvs.get(language) || this.parent?.getShadowEnv(language);
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
    return this.nodeShadowEnv || this.parent?.getNodeShadowEnv();
  }
  
  /**
   * Get or create Node shadow environment instance
   * @returns NodeShadowEnvironment instance (always creates one if needed)
   */
  getOrCreateNodeShadowEnv(): NodeShadowEnvironment {
    // Check if we already have one
    if (this.nodeShadowEnv) {
      return this.nodeShadowEnv;
    }
    
    // Check parent environments
    const parentShadowEnv = this.parent?.getNodeShadowEnv();
    if (parentShadowEnv) {
      return parentShadowEnv;
    }
    
    // Create a new one for this environment
    this.nodeShadowEnv = new NodeShadowEnvironment(
      this.getFileDirectory(),
      this.currentFilePath
    );
    
    return this.nodeShadowEnv;
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
    
    // Capture JavaScript environments
    const jsEnv = this.shadowEnvs.get('js');
    if (jsEnv && jsEnv.size > 0) {
      capture.js = new Map(jsEnv);
    }
    
    const javascriptEnv = this.shadowEnvs.get('javascript');
    if (javascriptEnv && javascriptEnv.size > 0) {
      capture.javascript = new Map(javascriptEnv);
    }
    
    // Capture Node.js shadow functions if available
    if (this.nodeShadowEnv) {
      const nodeMap = new Map<string, any>();
      const context = this.nodeShadowEnv.getContext();
      for (const name of this.nodeShadowEnv.getFunctionNames()) {
        if (context[name]) {
          nodeMap.set(name, context[name]);
        }
      }
      if (nodeMap.size > 0) {
        capture.node = nodeMap;
        capture.nodejs = nodeMap; // Both aliases point to same map
      }
    }
    
    return capture;
  }
  
  /**
   * Check if this environment has any shadow environments defined
   * Used to avoid unnecessary capture operations
   */
  hasShadowEnvs(): boolean {
    // Check regular shadow environments
    if (this.shadowEnvs.size > 0) {
      for (const [_, env] of this.shadowEnvs) {
        if (env.size > 0) return true;
      }
    }
    // Check Node.js shadow environment
    return this.nodeShadowEnv !== undefined;
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
  async resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ content: string; contentType: 'module' | 'data' | 'text'; metadata?: any }> {
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
    // Merge with instance defaults and delegate to command executor factory
    const finalOptions = { ...this.outputOptions, ...options };
    return this.commandExecutorFactory.executeCommand(command, finalOptions, context);
  }
  
  async executeCode(
    code: string, 
    language: string, 
    params?: Record<string, any>,
    metadata?: Record<string, any> | CommandExecutionContext,
    context?: CommandExecutionContext
  ): Promise<string> {
    // Handle overloaded signatures for backward compatibility
    if (metadata && !context && 'sourceLocation' in metadata) {
      // Old signature: executeCode(code, language, params, context)
      context = metadata as CommandExecutionContext;
      metadata = undefined;
    }
    
    // Optionally inject ambient ctx for JS/Node execution only
    let finalParams = params || {};
    const lang = (language || '').toLowerCase();
    const shouldInjectCtx = (lang === 'js' || lang === 'javascript' || lang === 'node' || lang === 'nodejs');
    if (shouldInjectCtx) {
      try {
        // Prefer explicit @test_ctx override for deterministic tests
        const testCtxVar = this.getVariable('test_ctx');
        const ctxValue = testCtxVar
          ? (testCtxVar.value as any)
          : this.contextManager.buildAmbientContext({
              pipelineContext: this.getPipelineContext(),
              securitySnapshot: this.getSecuritySnapshot()
            });
        if (!('ctx' in finalParams)) {
          finalParams = { ...finalParams, ctx: Object.freeze(ctxValue) };
        }
      } catch {
        // Best-effort; ignore ctx injection errors
      }
    }

    // Delegate to command executor factory
    return this.commandExecutorFactory.executeCode(code, language, finalParams, metadata as Record<string, any> | undefined, this.outputOptions, context);
  }

  
  
  async resolvePath(inputPath: string): Promise<string> {
    return this.importResolver.resolvePath(inputPath);
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
    let childContext: PathContext | string;
    
    if (this.pathContext) {
      // If we have a PathContext, create child context
      if (newBasePath) {
        // Create new context with updated file directory
        childContext = {
          ...this.pathContext,
          fileDirectory: newBasePath,
          executionDirectory: newBasePath
        };
      } else {
        // Use parent context as-is
        childContext = this.pathContext;
      }
    } else {
      // Legacy mode
      childContext = newBasePath || this.basePath;
    }
    
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      childContext,
      this,
      this.effectHandler  // Share the same effect handler
    );
    child.sdkEmitter = this.sdkEmitter;
    child.streamBridgeUnsub = this.streamBridgeUnsub;
    child.allowAbsolutePaths = this.allowAbsolutePaths;
    // Track the current node count so we know which nodes are new in the child
    child.initialNodeCount = this.nodes.length;
    child.streamingOptions = { ...this.streamingOptions };

    // Create child import resolver
    child.importResolver = this.importResolver.createChildResolver(newBasePath, () => child.allowAbsolutePaths);
    
    // Track child environment for cleanup
    this.childEnvironments.add(child);
    
    return child;
  }
  
  mergeChild(child: Environment): void {
    // Merge child variables into this environment without immutability checks
    // This is used for internal operations like nested data assignments
    for (const [name, variable] of child.variableManager.getVariables()) {
      // Use direct assignment to bypass immutability checks
      this.variableManager.setVariable(name, variable);
    }
    
    // Merge all nodes from the child environment
    // Child environments don't inherit parent nodes, they start with empty arrays
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
    Object.assign(this.defaultUrlOptions, options);
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
    this.urlConfig = config;
    this.cacheManager.setURLConfig(config);
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

  // --- Output Management Methods ---
  
  setOutputOptions(options: Partial<CommandExecutionOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
  }

  setStreamingOptions(options: Partial<StreamingOptions> | undefined): void {
    if (!options) {
      this.streamingOptions = { ...defaultStreamingOptions };
      return;
    }
    this.streamingOptions = { ...this.streamingOptions, ...options };
  }

  getStreamingOptions(): StreamingOptions {
    return { ...this.streamingOptions };
  }
  
  /**
   * Set import approval bypass flag
   */
  setApproveAllImports(approve: boolean): void {
    this.approveAllImports = approve;
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
    
    // Mark environment as ephemeral for error context
    this.isEphemeralMode = ephemeral;
    
    // Auto-approve all imports in ephemeral mode
    this.approveAllImports = true;
    
    // Pre-import all required modules to avoid timing issues
    const [
      { InMemoryModuleCache },
      { NoOpLockFile },
      { ImmutableCache },
      { ProjectPathResolver },
      { RegistryResolver },
      { LocalResolver },
      { GitHubResolver },
      { HTTPResolver }
    ] = await Promise.all([
      import('@core/registry/InMemoryModuleCache'),
      import('@core/registry/NoOpLockFile'),
      import('@core/security/ImmutableCache'),
      import('@core/resolvers/ProjectPathResolver'),
      import('@core/resolvers/RegistryResolver'),
      import('@core/resolvers/LocalResolver'),
      import('@core/resolvers/GitHubResolver'),
      import('@core/resolvers/HTTPResolver')
    ]);
    
    // Create ephemeral cache implementations
    const moduleCache = new InMemoryModuleCache();
    const lockFile = new NoOpLockFile(path.join(this.getProjectRoot(), 'mlld.lock.json'));
    
    // Create ephemeral URL cache
    const cacheAdapter = {
      async set(content: string, metadata: { source: string }): Promise<string> {
        return moduleCache.store(content, metadata.source).then(entry => entry.hash);
      },
      async get(hash: string): Promise<string | null> {
        return moduleCache.retrieve(hash);
      },
      async has(hash: string): Promise<boolean> {
        return moduleCache.exists(hash);
      }
    };
    
    
    // Re-initialize registry manager with ephemeral components
    if (this.registryManager) {
      // The registry manager will use the ephemeral cache and lock file
      this.registryManager = new RegistryManager(
        this.pathContext || this.getProjectRoot()
      );
    }
    
    // Re-initialize resolver manager with ephemeral components
    if (this.resolverManager) {
      this.resolverManager = new ResolverManager(
        undefined, // Use default security policy
        moduleCache,
        lockFile
      );
      
      // Re-register all resolvers (same as in constructor)
      // Register path resolvers (priority 1)
      this.resolverManager.registerResolver(new ProjectPathResolver(this.fileSystem));
      
      // Register module resolvers (priority 10)
      this.resolverManager.registerResolver(new RegistryResolver());
      
      // Register file resolvers (priority 20)
      this.resolverManager.registerResolver(new LocalResolver(this.fileSystem));
      this.resolverManager.registerResolver(new GitHubResolver());
      this.resolverManager.registerResolver(new HTTPResolver());
      
      // Configure built-in prefixes
      this.resolverManager.configurePrefixes([
        {
          prefix: '@base',
          resolver: 'base',
          type: 'io',
          config: {
            basePath: this.getProjectRoot(),
            readonly: false
          }
        }
      ]);
      
      // Re-register built-in function resolvers
      await this.registerBuiltinResolvers();
    }
    
    // Update ImportResolver dependencies to use ephemeral components
    const immutableCache = new ImmutableCache(this.getProjectRoot(), { inMemory: true });
    
    // We need to recreate the ImportResolver with ephemeral components
    const importResolverDependencies: ImportResolverDependencies = {
      fileSystem: this.fileSystem,
      pathService: this.pathService,
      pathContext: this.pathContext || {
        projectRoot: this.basePath,
        fileDirectory: this.basePath,
        executionDirectory: this.basePath,
        invocationDirectory: process.cwd()
      },
      cacheManager: this.cacheManager,
      getSecurityManager: () => this.securityManager,
      getRegistryManager: () => this.registryManager,
      getResolverManager: () => this.resolverManager,
      getParent: () => this.parent,
      getCurrentFilePath: () => this.currentFilePath,
      getApproveAllImports: () => this.approveAllImports,
      getLocalFileFuzzyMatch: () => this.localFileFuzzyMatch,
      getURLConfig: () => this.urlConfig,
      getDefaultUrlOptions: () => this.defaultUrlOptions,
      getAllowAbsolutePaths: () => this.allowAbsolutePaths
    };
    
    // Create new ImportResolver with ephemeral configuration
    this.importResolver = new ImportResolver(importResolverDependencies);
    
    // Note: SecurityManager uses its own ImmutableCache instance
    // We can't replace it after initialization, but that's OK since
    // the ImportResolver will use its own ephemeral cache
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
    if (!this.resolverManager) return;

    const localPath = this.localModulePath;
    if (!localPath) return;

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
  
  private collectError(
    error: MlldCommandExecutionError, 
    command: string, 
    duration: number,
    context?: CommandExecutionContext
  ): void {
    this.errorUtils.collectError(error, command, duration, context);
  }
  
  getCollectedErrors(): CollectedError[] {
    return this.errorUtils.getCollectedErrors();
  }
  
  clearCollectedErrors(): void {
    this.errorUtils.clearCollectedErrors();
  }
  
  private processOutput(output: string, maxLines?: number): { 
    processed: string; 
    truncated: boolean; 
    originalLineCount: number 
  } {
    const result = ErrorUtils.processOutput(output, maxLines);
    return {
      processed: result.output.trimEnd(),
      truncated: result.truncated,
      originalLineCount: result.originalLength
    };
  }
  
  async displayCollectedErrors(): Promise<void> {
    const errors = this.getCollectedErrors();
    if (errors.length === 0) return;
    
    console.log(`\n❌ ${errors.length} error${errors.length > 1 ? 's' : ''} occurred:\n`);
    
    // Use ErrorFormatSelector for consistent rich formatting
    const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
    const formatter = new ErrorFormatSelector(this.fileSystem);
    
    for (let i = 0; i < errors.length; i++) {
      const item = errors[i];
      console.log(`${i + 1}. Command execution failed:`);
      
      try {
        // Format using the same rich system as other mlld errors
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
        // Fallback to basic display if rich formatting fails
        console.log(`   ├─ Command: ${item.command}`);
        console.log(`   ├─ Duration: ${item.duration}ms`);
        if (formatError instanceof Error) {
          console.log(`   ├─ ${item.error.message}`);
        }
        if (item.error.details?.exitCode !== undefined) {
          console.log(`   ├─ Exit code: ${item.error.details.exitCode}`);
        }
        console.log(`   └─ Use --verbose to see full output\n`);
      }
    }
    
    console.log(`💡 Use --verbose to see full command output`);
    console.log(`💡 Use --help error-handling for error handling options\n`);
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
    const childContext = this.pathContext || this.basePath;
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      childContext,
      this,
      this.effectHandler  // Share the same effect handler
    );
    child.allowAbsolutePaths = this.allowAbsolutePaths;
    child.streamingOptions = { ...this.streamingOptions };
    // Share import stack with parent via ImportResolver
    child.importResolver = this.importResolver.createChildResolver(undefined, () => child.allowAbsolutePaths);
    // Inherit trace settings
    child.traceEnabled = this.traceEnabled;
    child.directiveTrace = this.directiveTrace; // Share trace with parent
    return child;
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
    if (!this.traceEnabled) return;
    
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
    if (!this.traceEnabled) return;
    this.directiveTrace.pop();
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
    if (this.directiveTrace.length > 0) {
      const lastEntry = this.directiveTrace[this.directiveTrace.length - 1];
      lastEntry.failed = true;
      lastEntry.errorMessage = errorMessage;
    }
  }
  
  /**
   * Set whether tracing is enabled
   */
  setTraceEnabled(enabled: boolean): void {
    this.traceEnabled = enabled;
    // Clear trace when disabling
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
    // Only cache in root environment to avoid duplication
    if (this.parent) {
      this.parent.cacheSource(filePath, content);
    } else {
      this.sourceCache.set(filePath, content);
    }
  }
  
  /**
   * Retrieve cached source content for error reporting
   * @param filePath The file path to retrieve
   * @returns The cached source content or undefined
   */
  getSource(filePath: string): string | undefined {
    // Check this environment first, then parent
    const source = this.sourceCache.get(filePath);
    if (source !== undefined) {
      return source;
    }
    return this.parent?.getSource(filePath);
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
    
    if (!this.parent && this.streamBridgeUnsub) {
      try {
        this.streamBridgeUnsub();
      } catch (error) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[Environment] Failed to detach stream bridge', error);
        }
      }
      this.streamBridgeUnsub = undefined;
    }

    // Clean up NodeShadowEnvironment if it exists
    if (this.nodeShadowEnv) {
      logger.debug('Cleaning up NodeShadowEnvironment');
      this.nodeShadowEnv.cleanup();
      this.nodeShadowEnv = undefined;
    }
    
    // Clean up child environments recursively
    logger.debug(`Cleaning up ${this.childEnvironments.size} child environments`);
    for (const child of this.childEnvironments) {
      child.cleanup();
    }
    this.childEnvironments.clear();
    
    // Clear any other resources that might keep event loop alive
    logger.debug('Clearing caches and shadow envs');
    this.cacheManager.clearAllCaches();
    this.shadowEnvs.clear();
    
    // Clear import stack to prevent memory leaks (now handled by ImportResolver)
    // this.importStack.clear(); // Moved to ImportResolver
    
    logger.debug('Cleanup complete');
  }
}
