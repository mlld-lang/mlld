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
import { ImportApproval } from '@core/security/ImportApproval';
import { ImmutableCache } from '@core/security/ImmutableCache';
import { GistTransformer } from '@core/security/GistTransformer';
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldCommandExecutionError, type CommandExecutionDetails } from '@core/errors';
import { SecurityManager } from '@security';
import { RegistryManager, ModuleCache, LockFile } from '@core/registry';
import { URLCache } from '../cache/URLCache';
import { astLocationToSourceLocation } from '@core/types';
import { 
  ResolverManager, 
  RegistryResolver,
  LocalResolver, 
  GitHubResolver, 
  HTTPResolver,
  ProjectPathResolver
} from '@core/resolvers';
import { PathMatcher } from '@core/resolvers/utils/PathMatcher';
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


/**
 * Environment holds all state and provides capabilities for evaluation.
 * This replaces StateService, ResolutionService, and capability injection.
 */
export class Environment {
  private variables = new Map<string, Variable>();
  private nodes: MlldNode[] = [];
  private parent?: Environment;
  private importStack: Set<string> = new Set(); // Track imports to prevent circular dependencies
  private urlConfig?: ResolvedURLConfig;
  private importApproval?: ImportApproval;
  private immutableCache?: ImmutableCache;
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
  
  // Shadow environments for language-specific function injection
  private shadowEnvs: Map<string, Map<string, any>> = new Map();
  
  // Node.js shadow environment (uses VM for better isolation)
  private nodeShadowEnv?: NodeShadowEnvironment;
  
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
    showProgress: true,
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
  private pathMatcher?: PathMatcher;
  
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
    
    // Initialize PathMatcher for fuzzy file matching
    this.pathMatcher = new PathMatcher(fileSystem);
    
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
      
      // Keep legacy components for backward compatibility
      this.importApproval = new ImportApproval(basePath);
      this.immutableCache = new ImmutableCache(basePath);
      
      // Initialize reserved variables (these are different from resolvers)
      // Resolvers handle imports/paths, but these are actual variables
      this.initializeReservedVariables();
      
      // Initialize built-in transformers
      this.initializeBuiltinTransformers();
      
      // Reserve module prefixes from resolver configuration
      this.reserveModulePrefixes();
    }
    
    // Initialize utility managers
    this.cacheManager = new CacheManager(this.urlCacheManager, this.immutableCache, this.urlConfig);
    this.errorUtils = new ErrorUtils();
    
    // Initialize command executor factory with dependencies
    const executorDependencies: ExecutorDependencies = {
      errorUtils: this.errorUtils,
      workingDirectory: this.basePath,
      shadowEnvironment: {
        getShadowEnv: (language: string) => this.getShadowEnv(language)
      },
      nodeShadowProvider: {
        getNodeShadowEnv: () => this.getNodeShadowEnv(),
        getCurrentFilePath: () => this.getCurrentFilePath()
      },
      variableProvider: {
        getVariables: () => this.variables
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
    const { TimeResolver, DebugResolver, InputResolver } = await import('@core/resolvers/builtin');
    
    // Create InputResolver with current stdin content
    const inputResolver = new InputResolver(this.stdinContent);
    
    // Register the resolvers
    this.resolverManager.registerResolver(new TimeResolver());
    this.resolverManager.registerResolver(new DebugResolver());
    this.resolverManager.registerResolver(inputResolver);
    
    // Only reserve names for built-in function resolvers (not file/module resolvers)
    // Function resolvers are those that provide computed values like TIME, DEBUG, etc.
    const functionResolvers = ['TIME', 'DEBUG', 'INPUT', 'PROJECTPATH'];
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
   * Initialize reserved variables (INPUT, TIME, etc.)
   * Only called for root environment (non-child)
   */
  private initializeReservedVariables(): void {
    // Initialize @INPUT from merged stdin content and environment variables
    const inputVar = this.createInputValue();
    if (inputVar !== null) {
      // Direct assignment for reserved variables during initialization
      this.variables.set('INPUT', inputVar);
      // Note: lowercase 'input' is handled in getVariable() to avoid conflicts
    }
    
    // Initialize @TIME with current timestamp
    const timeSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    const timeVar = createSimpleTextVariable(
      'TIME',
      getTimeValue(),
      timeSource,
      {
        isReserved: true,
        definedAt: { line: 0, column: 0, filePath: '<reserved>' }
      }
    );
    // Direct assignment for reserved variables during initialization
    this.variables.set('TIME', timeVar);
    // Note: lowercase 'time' is handled in getVariable() to avoid conflicts
    
    // Initialize @DEBUG with environment information
    // This is a lazy variable that generates its value when accessed
    const debugSource: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };
    const debugVar = createObjectVariable(
      'DEBUG',
      null as any, // Null for lazy evaluation
      false, // Not complex
      debugSource,
      {
        isReserved: true,
        isLazy: true, // Indicates value should be computed on access
        definedAt: { line: 0, column: 0, filePath: '<reserved>' }
      }
    );
    // Direct assignment for reserved variables during initialization
    this.variables.set('DEBUG', debugVar);
    // Note: lowercase 'debug' is handled in getVariable() to avoid conflicts
    
    // Initialize @PROJECTPATH with project root path
    // For now, use basePath as the value (tests override this in fixture setup)
    const projectPathSource: VariableSource = {
      directive: 'var',
      syntax: 'path',
      hasInterpolation: false,
      isMultiLine: false
    };
    const projectPath = getProjectPathValue(this.basePath);
    const projectPathVar = createPathVariable(
      'PROJECTPATH',
      projectPath,
      projectPath,
      false, // Not a URL
      true, // Is absolute
      projectPathSource,
      undefined, // No security metadata
      {
        isReserved: true,
        definedAt: { line: 0, column: 0, filePath: '<reserved>' }
      }
    );
    // Direct assignment for reserved variables during initialization
    this.variables.set('PROJECTPATH', projectPathVar);
    // Note: lowercase 'projectpath' is handled in getVariable() to avoid conflicts
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
      this.variables.set(transformer.uppercase, upperVar);
      
      // Create lowercase alias for ergonomics
      const lowerVar = createTransformerVariable(
        transformer.name,
        transformer.implementation,
        transformer.description,
        false
      );
      this.variables.set(transformer.name, lowerVar);
      
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
    // Check if the name is reserved (but allow system variables to be set)
    if (this.reservedNames.has(name) && !variable.metadata?.isReserved && !variable.metadata?.isSystem) {
      throw new Error(`Cannot create variable '${name}': this name is reserved for system use`);
    }
    
    // Check if variable already exists in this scope
    if (this.variables.has(name)) {
      const existing = this.variables.get(name)!;
      
      // Check if this is an import conflict (one imported, one local)
      const existingIsImported = Boolean(existing.metadata?.isImported);
      const newIsImported = Boolean(variable.metadata?.isImported);
      
      if (existingIsImported !== newIsImported) {
        // Import vs local conflict
        const importPath = existingIsImported ? existing.metadata?.importPath : variable.metadata?.importPath;
        throw VariableRedefinitionError.forImportConflict(
          name,
          existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
          variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
          importPath,
          existingIsImported
        );
      } else {
        // Same-file redefinition
        throw VariableRedefinitionError.forSameFile(
          name,
          existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
          variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() }
        );
      }
    }
    
    // Check if variable exists in parent scope (true parent-child import conflict)
    if (this.parent?.hasVariable(name)) {
      const existing = this.parent.getVariable(name)!;
      const isExistingImported = existing.metadata?.isImported || false;
      const importPath = existing.metadata?.importPath;
      
      throw VariableRedefinitionError.forImportConflict(
        name,
        existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
        variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
        importPath,
        isExistingImported
      );
    }
    
    this.variables.set(name, variable);
  }

  /**
   * Set a parameter variable without checking for import conflicts.
   * Used for temporary parameter variables in exec functions.
   */
  setParameterVariable(name: string, variable: Variable): void {
    // Only check if variable already exists in this scope
    if (this.variables.has(name)) {
      const existing = this.variables.get(name)!;
      throw VariableRedefinitionError.forSameFile(
        name,
        existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() },
        variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.getCurrentFilePath() }
      );
    }
    
    // Allow shadowing parent scope variables for parameters
    this.variables.set(name, variable);
  }
  
  getVariable(name: string): Variable | undefined {
    // FAST PATH: Check local variables first (most common case)
    let variable = this.variables.get(name);
    
    // Handle lowercase reserved variable aliases
    if (!variable && !this.parent) {
      const upperName = name.toUpperCase();
      if (upperName === 'TIME' || upperName === 'DEBUG' || upperName === 'INPUT' || upperName === 'PROJECTPATH') {
        variable = this.variables.get(upperName);
      }
    }
    
    if (variable) {
      // Special handling for lazy variables like @DEBUG
      if (variable.metadata && 'isLazy' in variable.metadata && variable.metadata.isLazy && variable.value === null) {
        // For lazy variables, we need to compute the value
        if (name.toUpperCase() === 'DEBUG') {
          const debugValue = this.createDebugObject(3); // Use markdown format
          return {
            ...variable,
            type: 'simple-text', // Markdown is simple text type
            value: debugValue
          };
        }
      }
      return variable;
    }
    
    // Check parent scope for regular variables
    const parentVar = this.parent?.getVariable(name);
    if (parentVar) {
      return parentVar;
    }
    
    // SLOW PATH: Only check resolvers if variable not found
    // and only in root environment (no parent)
    // Since we enforce name protection at setVariable time,
    // we know there are no conflicts between variables and resolvers
    if (!this.parent && this.reservedNames.has(name.toUpperCase())) {
      const upperName = name.toUpperCase();
      
      // Check cache first
      const cached = this.cacheManager.getResolverVariable(upperName);
      if (cached) {
        return cached;
      }
      
      // Create and cache the resolver variable
      const resolverVar = this.createResolverVariable(upperName);
      if (resolverVar) {
        this.cacheManager.setResolverVariable(upperName, resolverVar);
        return resolverVar;
      }
    }
    
    // Check if this might be a prefix being used as a variable
    // This helps catch common mistakes like using "@local/test" (quoted) instead of @local/test
    const resolverManager = this.getResolverManager();
    if (resolverManager) {
      const prefixConfigs = resolverManager.getPrefixConfigs();
      const matchingPrefix = prefixConfigs.find(config => {
        // Remove trailing slash from prefix for comparison
        const prefixName = config.prefix.replace(/^@/, '').replace(/\/$/, '');
        return prefixName === name;
      });
      
      if (matchingPrefix) {
        throw new Error(
          `Variable @${name} not found: if you want to use the @${name} prefix, remove the quotes.`
        );
      }
    }
    
    return undefined;
  }

  /**
   * Create a synthetic variable for a resolver reference
   * This allows resolvers to be used in variable contexts
   */
  private createResolverVariable(resolverName: string): Variable | undefined {
    // For resolver variables, we check if there's already a reserved variable
    // This handles TIME, DEBUG, INPUT, PROJECTPATH which are pre-initialized
    const existingVar = this.variables.get(resolverName);
    if (existingVar) {
      return existingVar;
    }

    // For dynamic resolver variables, we need to resolve them with 'variable' context
    // to get the correct content type and value
    // This is now handled asynchronously during evaluation
    const placeholderSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    return createSimpleTextVariable(
      resolverName,
      `@${resolverName}`, // Placeholder value
      placeholderSource,
      {
        isReserved: true,
        isResolver: true,
        resolverName: resolverName,
        needsResolution: true, // Flag indicating this needs async resolution
        definedAt: { line: 0, column: 0, filePath: '<resolver>' }
      }
    );
  }
  
  /**
   * Get the value of a variable, handling special cases
   * This is a convenience method for consumers
   */
  getVariableValue(name: string): any {
    const variable = this.getVariable(name);
    if (!variable) return null;
    
    // Handle special cases
    if (isPipelineInput(variable)) {
      return variable.value.text; // Default to text representation
    }
    
    return variable.value;
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
    // FAST PATH: Check local and parent variables first
    if (this.variables.has(name) || (this.parent && this.parent.hasVariable(name))) {
      return true;
    }
    
    // SLOW PATH: Only check resolvers if variable not found in normal scopes
    // and only in root environment
    if (!this.parent && this.reservedNames.has(name.toUpperCase())) {
      return true;
    }
    
    return false;
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
    this.variables.set('fm', frontmatterVariable);
    this.variables.set('frontmatter', frontmatterVariable);
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
   * Get Node shadow environment instance
   */
  getNodeShadowEnv(): NodeShadowEnvironment | undefined {
    return this.nodeShadowEnv || this.parent?.getNodeShadowEnv();
  }
  
  // --- Capabilities ---
  
  async readFile(pathOrUrl: string): Promise<string> {
    if (this.isURL(pathOrUrl)) {
      return this.fetchURL(pathOrUrl);
    }
    const resolvedPath = await this.resolvePath(pathOrUrl);
    return this.fileSystem.readFile(resolvedPath);
  }
  
  /**
   * Resolve a module reference using the ResolverManager
   * This handles @prefix/ patterns and registry lookups for @user/module
   */
  async resolveModule(reference: string, context?: 'import' | 'path' | 'variable'): Promise<{ content: string; contentType: 'module' | 'data' | 'text'; metadata?: any }> {
    const resolverManager = this.getResolverManager();
    if (!resolverManager) {
      throw new Error('ResolverManager not available');
    }
    
    const result = await resolverManager.resolve(reference, { context });
    
    // Check if result.content exists
    if (!result || !result.content) {
      throw new Error(`Resolver returned invalid result for '${reference}': missing content`);
    }
    
    // Check the structure of result.content
    if (!result.content.content || !result.content.contentType) {
      console.error('Resolver result structure:', JSON.stringify(result, null, 2));
      throw new Error(`Resolver returned invalid content structure for '${reference}': missing content or contentType`);
    }
    
    // The result.content is already the resolver's result object
    return {
      content: result.content.content,
      contentType: result.content.contentType,
      metadata: result.content.metadata
    };
  }
  
  /**
   * Create the @INPUT value by merging stdin content with environment variables
   */
  private createInputValue(): Variable | null {
    // Get environment variables if enabled
    const envVars = this.getEnvironmentVariables();
    
    // Parse stdin content if available
    let stdinData: any = null;
    if (this.stdinContent) {
      try {
        // Try to parse as JSON first
        stdinData = JSON.parse(this.stdinContent);
      } catch {
        // If not JSON, treat as plain text
        stdinData = this.stdinContent;
      }
    }
    
    // Create variable source metadata
    const inputSource: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    const metadata: Partial<VariableMetadata> = {
      isReserved: true,
      definedAt: { line: 0, column: 0, filePath: '<reserved>' }
    };
    
    // Determine the final @INPUT value
    if (Object.keys(envVars).length > 0 && stdinData !== null) {
      // Both env vars and stdin: merge them
      if (typeof stdinData === 'object' && !Array.isArray(stdinData)) {
        // Merge env vars into JSON object (env vars take precedence)
        return createObjectVariable('INPUT', { ...stdinData, ...envVars }, true, inputSource, metadata);
      } else {
        // Stdin is not an object, add it as 'content' alongside env vars
        return createObjectVariable('INPUT', {
          content: stdinData,
          ...envVars
        }, true, inputSource, metadata);
      }
    } else if (Object.keys(envVars).length > 0) {
      // Only env vars: return as data object
      return createObjectVariable('INPUT', envVars, true, inputSource, metadata);
    } else if (stdinData !== null) {
      // Only stdin: preserve original stdin behavior for @INPUT when no env vars
      if (typeof stdinData === 'object') {
        return createObjectVariable('INPUT', stdinData, true, inputSource, metadata);
      } else {
        // Plain text input
        const textSource: VariableSource = {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        };
        return createSimpleTextVariable('INPUT', stdinData, textSource, metadata);
      }
    }
    
    // No input available
    return null;
  }

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
      
      // Update the @INPUT variable with the new content
      const inputVar = this.createInputValue();
      if (inputVar !== null) {
        // Update the existing INPUT variable
        this.variables.set('INPUT', inputVar);
      }
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
    // Handle special path variables
    if (inputPath.startsWith('@PROJECTPATH')) {
      inputPath = inputPath.replace('@PROJECTPATH', await this.getProjectPath());
    }
    
    // Use the path module that's already imported
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    
    // Check if fuzzy matching is enabled for local files
    const fuzzyEnabled = typeof this.localFileFuzzyMatch === 'boolean' 
      ? this.localFileFuzzyMatch 
      : this.localFileFuzzyMatch.enabled !== false;
    
    // Debug log
    if (process.env.DEBUG_FUZZY) {
      console.log(`resolvePath called with: ${inputPath}, fuzzyEnabled: ${fuzzyEnabled}`);
    }
    
    if (fuzzyEnabled && this.pathMatcher) {
      // Try fuzzy matching for local files
      const matchResult = await this.pathMatcher.findMatch(
        inputPath,
        this.basePath,
        typeof this.localFileFuzzyMatch === 'object' ? this.localFileFuzzyMatch : undefined
      );
      
      if (matchResult.path) {
        if (process.env.DEBUG_FUZZY) {
          console.log(`Fuzzy match found: ${matchResult.path}`);
        }
        return matchResult.path;
      }
      
      // If no match found with fuzzy matching, check with extensions
      if (!path.extname(inputPath)) {
        const extensions = ['.mlld.md', '.mld', '.md'];
        const allSuggestions: string[] = [];
        
        for (const ext of extensions) {
          const pathWithExt = inputPath + ext;
          const extMatchResult = await this.pathMatcher.findMatch(
            pathWithExt,
            this.basePath,
            typeof this.localFileFuzzyMatch === 'object' ? this.localFileFuzzyMatch : undefined
          );
          
          if (extMatchResult.path) {
            return extMatchResult.path;
          }
          
          // Collect suggestions from each extension attempt
          if (extMatchResult.suggestions) {
            allSuggestions.push(...extMatchResult.suggestions);
          }
        }
        
        // If we collected any suggestions, throw error with them
        if (allSuggestions.length > 0) {
          // Remove duplicates and take top 3
          const uniqueSuggestions = [...new Set(allSuggestions)].slice(0, 3);
          const suggestions = uniqueSuggestions
            .map(s => `  - ${s}`)
            .join('\n');
          throw new Error(`File not found: ${inputPath}\n\nDid you mean:\n${suggestions}`);
        }
      }
      
      // If still no match and we have suggestions, throw error here
      // This ensures fuzzy matching suggestions are included
      if (matchResult.suggestions && matchResult.suggestions.length > 0) {
        const suggestions = matchResult.suggestions
          .slice(0, 3)
          .map(s => `  - ${s}`)
          .join('\n');
        throw new Error(`File not found: ${inputPath}\n\nDid you mean:\n${suggestions}`);
      }
      
      // If we have candidates (ambiguous matches), throw error
      if (matchResult.candidates && matchResult.candidates.length > 1) {
        const candidates = matchResult.candidates
          .map(c => `  - ${c.path} (${c.matchType} match, confidence: ${c.confidence})`)
          .join('\n');
        throw new Error(`Ambiguous file match for: ${inputPath}\n\nMultiple files match:\n${candidates}`);
      }
    }
    
    // Fall back to standard path resolution, but check if the file exists
    const resolvedPath = path.resolve(this.basePath, inputPath);
    
    // If fuzzy matching is enabled but didn't find anything, check if the file exists
    // If not, throw an error with better messaging
    if (fuzzyEnabled && !await this.fileSystem.exists(resolvedPath)) {
      throw new Error(`File not found: ${inputPath}`);
    }
    
    return resolvedPath;
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
    
    // Track child environment for cleanup
    this.childEnvironments.add(child);
    
    return child;
  }
  
  mergeChild(child: Environment): void {
    // Merge child variables into this environment without immutability checks
    // This is used for internal operations like nested data assignments
    for (const [name, variable] of child.variables) {
      // Use direct assignment to bypass immutability checks
      this.variables.set(name, variable);
    }
    
    // Merge all nodes from the child environment
    // Child environments don't inherit parent nodes, they start with empty arrays
    this.nodes.push(...child.nodes);
  }
  
  // --- Special Variables ---
  
  async getProjectPath(): Promise<string> {
    // Walk up from basePath to find project root
    let current = this.basePath;
    
    while (current !== path.dirname(current)) {
      try {
        // Check for common project indicators in order of preference
        const indicators = [
          'mlld.config.json',
          'package.json',
          '.git',
          'pyproject.toml',
          'Cargo.toml',
          'pom.xml',
          'build.gradle',
          'Makefile'
        ];
        
        for (const indicator of indicators) {
          if (await this.fileSystem.exists(path.join(current, indicator))) {
            return current;
          }
        }
      } catch {
        // Continue searching
      }
      current = path.dirname(current);
    }
    
    // Fallback to current base path
    return this.basePath;
  }
  
  // --- Utility Methods ---
  
  getAllVariables(): Map<string, Variable> {
    const allVars = new Map<string, Variable>();
    
    // Add parent variables first (so child can override)
    if (this.parent) {
      const parentVars = this.parent.getAllVariables();
      for (const [name, variable] of parentVars) {
        allVars.set(name, variable);
      }
    }
    
    // Add this scope's variables
    for (const [name, variable] of this.variables) {
      allVars.set(name, variable);
    }
    
    return allVars;
  }

  getCurrentVariables(): Map<string, Variable> {
    // Return only this environment's variables (not parent variables)
    return new Map(this.variables);
  }
  
  // --- URL Support Methods ---
  
  isURL(path: string): boolean {
    try {
      const url = new URL(path);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
  
  areURLsEnabled(): boolean {
    return this.urlConfig?.enabled || false;
  }
  
  async validateURL(url: string): Promise<void> {
    const parsed = new URL(url);
    const config = this.urlConfig || this.defaultUrlOptions;
    
    // Check if URLs are enabled
    if (this.urlConfig && !this.urlConfig.enabled) {
      throw new Error('URL support is not enabled in configuration');
    }
    
    // Check protocol
    const allowedProtocols = this.urlConfig?.allowedProtocols || config.allowedProtocols;
    if (!allowedProtocols.includes(parsed.protocol.slice(0, -1))) {
      throw new Error(`Protocol not allowed: ${parsed.protocol}`);
    }
    
    // Warn on insecure protocol if configured
    if (this.urlConfig?.warnOnInsecureProtocol && parsed.protocol === 'http:') {
      console.warn(`Warning: Using insecure HTTP protocol for ${url}`);
    }
    
    // Check domain allowlist if configured
    const allowedDomains = this.urlConfig?.allowedDomains || config.allowedDomains;
    if (allowedDomains.length > 0) {
      const allowed = allowedDomains.some(
        domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      if (!allowed) {
        throw new Error(`Domain not allowed: ${parsed.hostname}`);
      }
    }
    
    // Check domain blocklist
    const blockedDomains = this.urlConfig?.blockedDomains || config.blockedDomains;
    const blocked = blockedDomains.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (blocked) {
      throw new Error(`Domain blocked: ${parsed.hostname}`);
    }
  }
  
  async fetchURL(url: string, forImport: boolean = false): Promise<string> {
    // Transform Gist URLs to raw URLs
    if (GistTransformer.isGistUrl(url)) {
      url = await GistTransformer.transformToRaw(url);
    }
    // For imports, check immutable cache first
    if (forImport && this.getImmutableCache()) {
      const cached = await this.getImmutableCache()!.get(url);
      if (cached) {
        return cached;
      }
    }
    
    // Check if caching is enabled
    const cacheEnabled = this.urlConfig?.cache.enabled ?? true;
    
    if (cacheEnabled && !forImport) {
      // Check runtime cache for non-imports
      const cached = this.cacheManager.getURLCacheEntry(url);
      if (cached && this.cacheManager.isURLCacheEntryValid(url)) {
        return cached.content;
      }
    }
    
    // Validate URL
    await this.validateURL(url);
    
    // Get timeout and max size from config
    const timeout = this.urlConfig?.timeout || this.defaultUrlOptions.timeout;
    const maxSize = this.urlConfig?.maxSize || this.defaultUrlOptions.maxResponseSize;
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Check content size
      const content = await response.text();
      if (content.length > maxSize) {
        throw new Error(`Response too large: ${content.length} bytes`);
      }
      
      // For imports, check approval and cache in immutable cache
      if (forImport && this.getImportApproval() && !this.approveAllImports) {
        const approved = await this.getImportApproval()!.checkApproval(url, content);
        if (!approved) {
          throw new Error('Import not approved by user');
        }
        
        // Store in immutable cache
        if (this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      } else if (forImport && this.approveAllImports) {
        // Auto-approved, just store in immutable cache
        if (this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      }
      
      // Cache the response with URL-specific TTL for non-imports
      if (cacheEnabled && !forImport) {
        const ttl = this.getURLCacheTTL(url);
        this.cacheManager.setURLCacheEntry(url, content, ttl);
      }
      
      return content;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
      throw error;
    }
  }
  
  private getURLCacheTTL(url: string): number {
    return this.cacheManager.getURLCacheTTL(url);
  }
  
  setURLOptions(options: Partial<typeof this.defaultUrlOptions>): void {
    Object.assign(this.defaultUrlOptions, options);
  }

  /**
   * Get URLCache manager
   */
  getURLCache(): URLCache | undefined {
    if (this.parent) {
      return this.parent.getURLCache();
    }
    return this.cacheManager.getURLCacheManager();
  }

  /**
   * Fetch URL with security options from @path directive
   */
  async fetchURLWithSecurity(
    url: string, 
    security?: import('@core/types/primitives').SecurityOptions,
    configuredBy?: string
  ): Promise<string> {
    const urlCache = this.getURLCache();
    
    if (urlCache && security) {
      // Use the new URL cache with security options
      return urlCache.fetchURL(url, security, configuredBy);
    }
    
    // Fall back to existing fetchURL method
    return this.fetchURL(url);
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
  setDevMode(devMode: boolean): void {
    this.devMode = devMode;
    // Pass to resolver manager if it exists
    if (this.resolverManager) {
      this.resolverManager.setDevMode(devMode);
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
    return this.importStack.has(path) || (this.parent?.isImporting(path) ?? false);
  }
  
  beginImport(path: string): void {
    this.importStack.add(path);
  }
  
  endImport(path: string): void {
    this.importStack.delete(path);
  }
  
  createChildEnvironment(): Environment {
    const child = new Environment(
      this.fileSystem,
      this.pathService,
      this.basePath,
      this
    );
    // Share import stack with parent to detect circular imports across scopes
    child.importStack = this.importStack;
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
  
  private getImportApproval(): ImportApproval | undefined {
    // Walk up to root environment to find import approval
    if (this.importApproval) return this.importApproval;
    if (this.parent) return this.parent.getImportApproval();
    return undefined;
  }
  
  private getImmutableCache(): ImmutableCache | undefined {
    // Walk up to root environment to find immutable cache
    if (this.immutableCache) return this.immutableCache;
    if (this.parent) return this.parent.getImmutableCache();
    return undefined;
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
    
    // Clear import stack to prevent memory leaks
    this.importStack.clear();
    
    logger.debug('Cleanup complete');
  }
}