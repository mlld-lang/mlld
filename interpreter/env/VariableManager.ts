import type { Variable, VariableSource, VariableMetadata } from '@core/types/variable';
import { 
  createSimpleTextVariable, 
  createObjectVariable, 
  createPathVariable,
  isPipelineInput,
  isTextLike,
} from '@core/types/variable';
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { getTimeValue, getProjectPathValue } from '../utils/reserved-variables';
import type { CacheManager } from './CacheManager';
import type { ResolverManager } from '@core/resolvers';
import type { SourceLocation } from '@core/types';

export interface IVariableManager {
  // Core variable operations
  setVariable(name: string, variable: Variable): void;
  setParameterVariable(name: string, variable: Variable): void;
  getVariable(name: string): Variable | undefined;
  getVariableValue(name: string): any;
  hasVariable(name: string): boolean;
  getAllVariables(): Map<string, Variable>;
  getCurrentVariables(): Map<string, Variable>;
  
  // Initialization
  initializeReservedVariables(): void;
  
  // Context access
  getVariables(): Map<string, Variable>;
}

export interface VariableManagerDependencies {
  cacheManager: CacheManager;
  getCurrentFilePath(): string | undefined;
  getReservedNames(): Set<string>;
  getParent(): VariableManagerContext | undefined;
  getResolverManager(): ResolverManager | undefined;
  createDebugObject(format: number): string;
  getEnvironmentVariables(): Record<string, string>;
  getStdinContent(): string | undefined;
  getFsService(): any; // Will be typed more specifically when needed
  getPathService(): any; // Will be typed more specifically when needed
  getSecurityManager(): any; // Will be typed more specifically when needed
  getBasePath(): string;
}

export interface VariableManagerContext {
  hasVariable(name: string): boolean;
  getVariable(name: string): Variable | undefined;
  getAllVariables(): Map<string, Variable>;
}

export class VariableManager implements IVariableManager {
  private variables = new Map<string, Variable>();
  
  constructor(private deps: VariableManagerDependencies) {}
  
  getVariables(): Map<string, Variable> {
    return this.variables;
  }
  
  setVariable(name: string, variable: Variable): void {
    // Check if the name is reserved (but allow system variables to be set)
    const reservedNames = this.deps.getReservedNames();
    if (reservedNames.has(name) && !variable.metadata?.isReserved && !variable.metadata?.isSystem) {
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
          existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
          variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
          importPath,
          existingIsImported
        );
      } else {
        // Same-file redefinition
        throw VariableRedefinitionError.forSameFile(
          name,
          existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
          variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() }
        );
      }
    }
    
    // Check if variable exists in parent scope (true parent-child import conflict)
    const parent = this.deps.getParent();
    if (parent?.hasVariable(name)) {
      const existing = parent.getVariable(name)!;
      const isExistingImported = existing.metadata?.isImported || false;
      const importPath = existing.metadata?.importPath;
      
      throw VariableRedefinitionError.forImportConflict(
        name,
        existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
        variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
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
        existing.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() },
        variable.metadata?.definedAt || { line: 0, column: 0, filePath: this.deps.getCurrentFilePath() }
      );
    }
    
    // Allow shadowing parent scope variables for parameters
    this.variables.set(name, variable);
  }
  
  getVariable(name: string): Variable | undefined {
    // FAST PATH: Check local variables first (most common case)
    let variable = this.variables.get(name);
    
    // Handle lowercase reserved variable aliases
    const parent = this.deps.getParent();
    if (!variable && !parent) {
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
          const debugValue = this.deps.createDebugObject(3); // Use markdown format
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
    const parentVar = parent?.getVariable(name);
    if (parentVar) {
      return parentVar;
    }
    
    // SLOW PATH: Only check resolvers if variable not found
    // and only in root environment (no parent)
    // Since we enforce name protection at setVariable time,
    // we know there are no conflicts between variables and resolvers
    const reservedNames = this.deps.getReservedNames();
    if (!parent && reservedNames.has(name.toUpperCase())) {
      const upperName = name.toUpperCase();
      
      // Check cache first
      const cached = this.deps.cacheManager.getResolverVariable(upperName);
      if (cached) {
        return cached;
      }
      
      // Create and cache the resolver variable
      const resolverVar = this.createResolverVariable(upperName);
      if (resolverVar) {
        this.deps.cacheManager.setResolverVariable(upperName, resolverVar);
        return resolverVar;
      }
    }
    
    // Check if this might be a prefix being used as a variable
    // This helps catch common mistakes like using "@local/test" (quoted) instead of @local/test
    const resolverManager = this.deps.getResolverManager();
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
    switch (variable.type) {
      case 'simple-text':
        return variable.value;
      case 'object':
        return variable.value;
      case 'path':
        return variable.value;
      case 'pipeline-input':
        return isPipelineInput(variable) ? variable.value : null;
      default:
        return variable.value;
    }
  }

  hasVariable(name: string): boolean {
    const parent = this.deps.getParent();
    if (this.variables.has(name) || (parent && parent.hasVariable(name))) {
      return true;
    }
    
    // Check lowercase reserved variable aliases only in root environment
    if (!parent) {
      const upperName = name.toUpperCase();
      if ((upperName === 'NOW' || upperName === 'DEBUG' || upperName === 'INPUT' || upperName === 'PROJECTPATH') && this.variables.has(upperName)) {
        return true;
      }
    }
    
    return false;
  }

  getAllVariables(): Map<string, Variable> {
    const allVars = new Map<string, Variable>();
    
    // Start with parent variables (they get overridden by local ones)
    const parent = this.deps.getParent();
    if (parent) {
      const parentVars = parent.getAllVariables();
      for (const [name, variable] of parentVars) {
        allVars.set(name, variable);
      }
    }
    
    // Add local variables (these override parent variables)
    for (const [name, variable] of this.variables) {
      allVars.set(name, variable);
    }
    
    return allVars;
  }

  getCurrentVariables(): Map<string, Variable> {
    return new Map(this.variables);
  }

  /**
   * Initialize reserved variables that are available in all environments
   */
  initializeReservedVariables(): void {
    // Initialize @INPUT from merged stdin content and environment variables
    const inputVar = this.createInputValue();
    if (inputVar !== null) {
      // Direct assignment for reserved variables during initialization
      this.variables.set('INPUT', inputVar);
      // Note: lowercase 'input' is handled in getVariable() to avoid conflicts
    }
    
    // Initialize @NOW with current timestamp
    const nowSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    const nowVar = createSimpleTextVariable(
      'NOW',
      getTimeValue(),
      nowSource,
      {
        isReserved: true,
        definedAt: { line: 0, column: 0, filePath: '<reserved>' }
      }
    );
    // Direct assignment for reserved variables during initialization
    this.variables.set('NOW', nowVar);
    // Note: lowercase 'now' is handled in getVariable() to avoid conflicts
    
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
    
    // Initialize @PROJECTPATH with project path
    const projectPathSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    const projectPath = getProjectPathValue(this.deps.getBasePath());
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
    
    // Built-in transformers are initialized separately in Environment.initializeBuiltinTransformers()
  }

  private createInputValue(): Variable | null {
    const envVars = this.deps.getEnvironmentVariables();
    const stdinContent = this.deps.getStdinContent();
    
    // Parse stdin content if available
    let stdinData: any = null;
    if (stdinContent) {
      const trimmed = stdinContent.trim();
      if (trimmed) {
        try {
          // Try to parse as JSON first
          stdinData = JSON.parse(trimmed);
        } catch {
          // If JSON parse fails, treat as plain text
          stdinData = stdinContent;
        }
      }
    }
    
    const inputSource: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    const textSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    const metadata: VariableMetadata = {
      isReserved: true,
      definedAt: { line: 0, column: 0, filePath: '<reserved>' }
    };
    
    // If we have both stdin and env vars, merge them
    if (stdinData !== null && Object.keys(envVars).length > 0) {
      if (typeof stdinData === 'object' && stdinData !== null && !Array.isArray(stdinData)) {
        // Merge objects (env vars take precedence)
        return createObjectVariable('INPUT', { ...stdinData, ...envVars }, true, inputSource, metadata);
      } else {
        // Stdin is not an object, create object with separate fields
        return createObjectVariable('INPUT', {
          stdin: stdinData,
          ...envVars
        }, true, inputSource, metadata);
      }
    }
    
    // If we only have env vars
    if (Object.keys(envVars).length > 0) {
      return createObjectVariable('INPUT', envVars, true, inputSource, metadata);
    }
    
    // If we only have stdin
    if (stdinData !== null) {
      if (typeof stdinData === 'object' && stdinData !== null) {
        return createObjectVariable('INPUT', stdinData, true, inputSource, metadata);
      } else {
        // Simple text
        return createSimpleTextVariable('INPUT', stdinData, textSource, metadata);
      }
    }
    
    // No input available
    return null;
  }
}