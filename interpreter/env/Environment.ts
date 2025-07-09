import type { MlldNode, SourceLocation, DirectiveNode } from '@core/types';
import type { Variable, VariableSource, PipelineInput, VariableMetadata } from '@core/types/variable';
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
import { RegistryManager, ModuleCache, LockFile } from '@core/registry';
import { URLCache } from '../cache/URLCache';
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
import { ImportResolver, type IImportResolver, type ImportResolverDependencies, type ImportResolverContext } from './ImportResolver';


/**
 * Environment holds all state and provides capabilities for evaluation.
 * This replaces StateService, ResolutionService, and capability injection.
 */
export class Environment implements VariableManagerContext, ImportResolverContext {
  private nodes: MlldNode[] = [];
  private parent?: Environment;
  // Note: importStack is now handled by ImportResolver
  private urlConfig?: ResolvedURLConfig;
  // Note: importApproval and immutableCache are now handled by ImportResolver
  private currentFilePath?: string; // Track current file being processed
  private securityManager?: SecurityManager; // Central security coordinator
  private registryManager?: RegistryManager; // Registry for mlld:// URLs
  private stdinContent?: string; // Cached stdin content
  private resolverManager?: ResolverManager; // New resolver system
  private urlCacheManager?: URLCache; // URL cache manager
  private reservedNames: Set<string> = new Set(); // Now dynamic based on registered resolvers
  private initialNodeCount: number = 0; // Track initial nodes to prevent duplicate merging
  
  // Utility managers
  private cacheManager: CacheManager;
  private errorUtils: ErrorUtils;
  private commandExecutorFactory: CommandExecutorFactory;
  private variableManager: IVariableManager;
  private importResolver: IImportResolver;
  
  // Shadow environments for language-specific function injection
  private shadowEnvs: Map<string, Map<string, any>> = new Map();
  private nodeShadowEnv?: NodeShadowEnvironment; // VM-based Node.js shadow environment
  
  // Pipeline execution context
  private pipelineContext?: {
    stage: number;
    totalStages: number;
    currentCommand: string;
    input: any;
    previousOutputs: string[];
    format?: string;
  };
  
  // Output management properties
  private outputOptions: CommandExecutionOptions = {
    showProgress: false,  // Default to false to avoid debug output in results
    maxOutputLines: 50,
    errorBehavior: 'continue',
    timeout: 30000,
    collectErrors: false
  };
  
  // Import approval bypass flag
  private approveAllImports: boolean = false;
  
  // Track child environments for cleanup
  private childEnvironments: Set<Environment> = new Set();
  
  // Blank line normalization flag
  private normalizeBlankLines: boolean = true;
  
  // Development mode flag
  private devMode: boolean = false;
  
  // Directive trace for debugging
  private directiveTrace: DirectiveTrace[] = [];
  private traceEnabled: boolean = true; // Default to enabled
  
  // Fuzzy matching for local files
  private localFileFuzzyMatch: FuzzyMatchConfig | boolean = true; // Default enabled
  // Note: pathMatcher is now handled by ImportResolver
  
  // Default URL validation options (used if no config provided)
  private defaultUrlOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [] as string[],
    blockedDomains: [] as string[],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };
  
  constructor(
    private fileSystem: IFileSystemService,
    private pathService: IPathService,
    private basePath: string,
    parent?: Environment
  ) {
    this.parent = parent;
    
    // Inherit reserved names from parent environment
    if (parent) {
      this.reservedNames = new Set(parent.reservedNames);
      // Inherit fuzzy match configuration from parent
      this.localFileFuzzyMatch = parent.localFileFuzzyMatch;
    }
    
    // Initialize security components for root environment only
    if (!parent) {
      try {
        this.securityManager = SecurityManager.getInstance(basePath);
      } catch (error) {
        // If security manager fails to initialize, continue with legacy components
        console.warn('SecurityManager not available, using legacy security components');
      }
      
      // Initialize registry manager
      try {
        this.registryManager = new RegistryManager(basePath);
      } catch (error) {
        console.warn('RegistryManager not available:', error);
      }
      
      // Initialize module cache and lock file
      let moduleCache: ModuleCache | undefined;
      let lockFile: LockFile | undefined;
      
      try {
        moduleCache = new ModuleCache();
        // Create lock file instance - it will load lazily when accessed
        const lockFilePath = path.join(basePath, 'mlld.lock.json');
        lockFile = new LockFile(lockFilePath);
        
        // Initialize URL cache manager with a simple cache adapter and lock file
        if (moduleCache && lockFile) {
          // Create a cache adapter that URLCache can use
          const cacheAdapter = {
            async set(content: string, metadata: { source: string }): Promise<string> {
              const entry = await moduleCache!.store(content, metadata.source as string);
              return entry.hash;
            },
            async get(hash: string): Promise<string | null> {
              const result = await moduleCache!.get(hash);
              return result ? result.content : null;
            }
          };
          this.urlCacheManager = new URLCache(cacheAdapter as any, lockFile);
        }
      } catch (error) {
        console.warn('Failed to initialize cache/lock file:', error);
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
        // ProjectPathResolver should be first to handle @PROJECTPATH references
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
            prefix: '@PROJECTPATH',
            resolver: 'PROJECTPATH',
            type: 'io',
            config: {
              basePath: this.basePath,
              readonly: false
            }
          },
          {
            prefix: '@.',
            resolver: 'PROJECTPATH', 
            type: 'io',
            config: {
              basePath: this.basePath,
              readonly: false
            }
          }
        ], this.basePath);
        
        // Load resolver configs from lock file if available
        if (lockFile) {
          // Try new config location first
          const resolverPrefixes = lockFile.getResolverPrefixes();
          if (resolverPrefixes.length > 0) {
            logger.debug(`Configuring ${resolverPrefixes.length} resolver prefixes from lock file`);
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
      
      // Initialize reserved variables (these are different from resolvers)
      // Resolvers handle imports/paths, but these are actual variables
      // Note: This will be called after VariableManager is initialized
      
      // Reserve module prefixes from resolver configuration
      this.reserveModulePrefixes();
    }
    
    // Initialize utility managers
    this.cacheManager = new CacheManager(this.urlCacheManager, this.immutableCache, this.urlConfig);
    this.errorUtils = new ErrorUtils();
    
    // Initialize variable manager with dependencies
    const variableManagerDependencies: VariableManagerDependencies = {
      cacheManager: this.cacheManager,
      getCurrentFilePath: () => this.getCurrentFilePath(),
      getReservedNames: () => this.reservedNames,
      getParent: () => this.parent,
      getResolverManager: () => this.getResolverManager(),
      createDebugObject: (format: number) => this.createDebugObject(format),
      getEnvironmentVariables: () => this.getEnvironmentVariables(),
      getStdinContent: () => this.stdinContent,
      getFsService: () => this.fileSystem,
      getPathService: () => this.pathService,
      getSecurityManager: () => this.securityManager,
      getBasePath: () => this.basePath
    };
    this.variableManager = new VariableManager(variableManagerDependencies);
    
    // Initialize reserved variables if this is the root environment
    if (!parent) {
      this.variableManager.initializeReservedVariables();
      
      // Initialize built-in transformers
      this.initializeBuiltinTransformers();
    }
    
    // Initialize import resolver with dependencies
    const importResolverDependencies: ImportResolverDependencies = {
      fileSystem: this.fileSystem,
      pathService: this.pathService,
      basePath: this.basePath,
      cacheManager: this.cacheManager,
      getSecurityManager: () => this.getSecurityManager(),
      getRegistryManager: () => this.getRegistryManager(),
      getResolverManager: () => this.getResolverManager(),
      getParent: () => this.parent,
      getCurrentFilePath: () => this.getCurrentFilePath(),
      getApproveAllImports: () => this.approveAllImports,
      getLocalFileFuzzyMatch: () => this.localFileFuzzyMatch,
      getURLConfig: () => this.urlConfig,
      getDefaultUrlOptions: () => this.defaultUrlOptions
    };
    this.importResolver = new ImportResolver(importResolverDependencies);
    
    // Initialize command executor factory with dependencies
    const executorDependencies: ExecutorDependencies = {
      errorUtils: this.errorUtils,
      workingDirectory: this.basePath,
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
    // Function resolvers are those that provide computed values like NOW, DEBUG, etc.
    const functionResolvers = ['NOW', 'DEBUG', 'INPUT', 'PROJECTPATH'];
    for (const name of functionResolvers) {
      this.reservedNames.add(name);
      this.reservedNames.add(name.toLowerCase());
    }
    
    logger.debug(`Reserved resolver names: ${Array.from(this.reservedNames).join(', ')}`);
  }

  /**
   * Reserve module prefixes from resolver configuration
   * This prevents variables from using names that conflict with module prefixes
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
  
  getBasePath(): string {
    return this.basePath;
  }
  
  getCurrentFilePath(): string | undefined {
    return this.currentFilePath || this.parent?.getCurrentFilePath();
  }
  
  setCurrentFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
  }
  
  getSecurityManager(): SecurityManager | undefined {
    // Get from this environment or parent
    if (this.securityManager) return this.securityManager;
    return this.parent?.getSecurityManager();
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
  
  getVariable(name: string): Variable | undefined {
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
  setPipelineContext(context: {
    stage: number;
    totalStages: number;
    currentCommand: string;
    input: any;
    previousOutputs: string[];
    format?: string;
  }): void {
    this.pipelineContext = context;
  }
  
  /**
   * Clear pipeline execution context
   */
  clearPipelineContext(): void {
    this.pipelineContext = undefined;
  }
  
  /**
   * Get current pipeline context
   */
  getPipelineContext(): typeof this.pipelineContext {
    // Check this environment first
    if (this.pipelineContext) {
      return this.pipelineContext;
    }
    
    // Check parent environments
    let current = this.parent;
    while (current) {
      if (current.pipelineContext) {
        return current.pipelineContext;
      }
      current = current.parent;
    }
    
    return undefined;
  }
  
  /**
   * Get a resolver variable with proper async resolution
   * This handles context-dependent behavior for resolvers like @TIME
   */
  async getResolverVariable(name: string): Promise<Variable | undefined> {
    const upperName = name.toUpperCase();
    
    // Check if it's a reserved resolver name
    if (!this.reservedNames.has(upperName)) {
      return undefined;
    }
    
    // Special handling for DEBUG variable - compute dynamically
    if (upperName === 'DEBUG') {
      const debugValue = this.createDebugObject(3); // Use markdown format
      
      
      const debugSource: VariableSource = {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      };
      const debugVar = createObjectVariable(
        'DEBUG',
        debugValue,
        false, // Not complex, it's just a string
        debugSource,
        {
          isReserved: true,
          definedAt: { line: 0, column: 0, filePath: '<reserved>' }
        }
      );
      return debugVar;
    }
    
    // Check cache first
    const cached = this.cacheManager.getResolverVariable(upperName);
    if (cached && cached.metadata && 'needsResolution' in cached.metadata && !cached.metadata.needsResolution) {
      return cached;
    }
    
    // Get the resolver manager
    const resolverManager = this.getResolverManager();
    if (!resolverManager) {
      // Fallback to creating a basic resolver variable
      return this.createResolverVariable(upperName);
    }
    
    try {
      // Resolve with 'variable' context to get the appropriate content
      const resolverContent = await resolverManager.resolve(`@${upperName}`, { context: 'variable' });
      
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
      const resolvedVar = varType === 'data' ?
        createObjectVariable(upperName, varValue, true, resolverSource, {
          isReserved: true,
          isResolver: true,
          resolverName: upperName,
          definedAt: { line: 0, column: 0, filePath: '<resolver>' }
        }) :
        createSimpleTextVariable(upperName, varValue, resolverSource, {
          isReserved: true,
          isResolver: true,
          resolverName: upperName,
          definedAt: { line: 0, column: 0, filePath: '<resolver>' }
        });
      
      // Cache the resolved variable
      this.cacheManager.setResolverVariable(upperName, resolvedVar);
      
      return resolvedVar;
    } catch (error) {
      // If resolution fails, return undefined
      console.warn(`Failed to resolve variable @${upperName}: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  hasVariable(name: string): boolean {
    return this.variableManager.hasVariable(name);
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
        isSystem: true, 
        immutable: true,
        source: 'frontmatter',
        definedAt: { line: 0, column: 0, filePath: '<frontmatter>' }
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
  
  // --- Shadow Environment Management ---
  
  /**
   * Set shadow environment functions for a specific language
   * @param language The language identifier (js, node, python, etc.)
   * @param functions Map of function names to their implementations
   */
  setShadowEnv(language: string, functions: Map<string, any>): void {
    if (language === 'node' || language === 'nodejs') {
      // Create or get Node shadow environment
      if (!this.nodeShadowEnv) {
        this.nodeShadowEnv = new NodeShadowEnvironment(
          this.basePath,
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
   * @param language The language identifier
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
      this.basePath,
      this.currentFilePath
    );
    
    return this.nodeShadowEnv;
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
    // Get lock file from root environment
    let lockFile: LockFile | undefined;
    let currentEnv: Environment | undefined = this;
    
    // Walk up to root environment to find lock file
    while (currentEnv) {
      if (!currentEnv.parent && currentEnv.resolverManager) {
        // Try to get lock file from resolver manager (root environment)
        const resolver = currentEnv.resolverManager as any;
        if (resolver.lockFile) {
          lockFile = resolver.lockFile as LockFile;
          break;
        }
      }
      currentEnv = currentEnv.parent;
    }
    
    // If no lock file or no allowed vars configured, return empty
    if (!lockFile || !lockFile.hasAllowedEnvVarsConfigured()) {
      return {};
    }
    
    // Get allowed environment variable names
    const allowedVars = lockFile.getAllowedEnvVars();
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
        const inputResolver = this.resolverManager.getResolver('INPUT');
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
    context?: CommandExecutionContext
  ): Promise<string> {
    // Delegate to command executor factory
    return this.commandExecutorFactory.executeCode(code, language, params, this.outputOptions, context);
  }

  
  
  async resolvePath(inputPath: string): Promise<string> {
    return this.importResolver.resolvePath(inputPath);
  }
  
  // --- Scope Management ---
  
  createChild(newBasePath?: string): Environment {
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      newBasePath || this.basePath,
      this
    );
    // Track the current node count so we know which nodes are new in the child
    child.initialNodeCount = this.nodes.length;
    
    // Create child import resolver
    child.importResolver = this.importResolver.createChildResolver(newBasePath);
    
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
  
  async fetchURL(url: string, forImport: boolean = false): Promise<string> {
    return this.importResolver.fetchURL(url, forImport);
  }
  
  // Note: getURLCacheTTL is now handled by ImportResolver via CacheManager
  
  setURLOptions(options: Partial<typeof this.defaultUrlOptions>): void {
    Object.assign(this.defaultUrlOptions, options);
  }

  /**
   * Get URLCache manager
   */
  getURLCache(): URLCache | undefined {
    return this.importResolver.getURLCache();
  }

  /**
   * Fetch URL with security options from @path directive
   */
  async fetchURLWithSecurity(
    url: string, 
    security?: import('@core/types/primitives').SecurityOptions,
    configuredBy?: string
  ): Promise<string> {
    return this.importResolver.fetchURLWithSecurity(url, security, configuredBy);
  }
  
  setURLConfig(config: ResolvedURLConfig): void {
    this.urlConfig = config;
    this.cacheManager.setURLConfig(config);
  }
  
  // --- Output Management Methods ---
  
  setOutputOptions(options: Partial<CommandExecutionOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
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
   * Get blank line normalization flag
   */
  getNormalizeBlankLines(): boolean {
    return this.normalizeBlankLines;
  }
  
  /**
   * Set development mode flag
   */
  async setDevMode(devMode: boolean): Promise<void> {
    this.devMode = devMode;
    // Pass to resolver manager if it exists
    if (this.resolverManager) {
      this.resolverManager.setDevMode(devMode);
      
      // Initialize dev mode prefixes if enabling
      if (devMode) {
        // Check for local modules directory
        const localModulePath = this.pathService.join(this.basePath, 'llm', 'modules');
        if (await this.fileSystem.exists(localModulePath)) {
          await this.resolverManager.initializeDevMode(localModulePath);
        }
      }
    }
  }
  
  /**
   * Get development mode flag
   */
  getDevMode(): boolean {
    return this.devMode;
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
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      this.basePath,
      this
    );
    // Share import stack with parent via ImportResolver
    child.importResolver = this.importResolver.createChildResolver();
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