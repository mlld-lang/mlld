import type { MlldNode, MlldVariable, SourceLocation, DirectiveNode } from '@core/types';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { ResolvedURLConfig } from '@core/config/types';
import { execSync } from 'child_process';
import * as path from 'path';
import { ImportApproval } from '@core/security/ImportApproval';
import { ImmutableCache } from '@core/security/ImmutableCache';
import { GistTransformer } from '@core/security/GistTransformer';
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldCommandExecutionError, type CommandExecutionDetails } from '@core/errors';
import { SecurityManager } from '@security';
import { RegistryManager } from '@core/registry';

interface CommandExecutionOptions {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  timeout?: number;
  collectErrors?: boolean;
}

interface CommandExecutionContext {
  sourceLocation?: SourceLocation;
  directiveNode?: DirectiveNode;
  filePath?: string;
  directiveType?: string;
}

interface CollectedError {
  error: MlldCommandExecutionError;
  command: string;
  timestamp: Date;
  duration: number;
  sourceLocation?: SourceLocation;
  context?: CommandExecutionContext;
}

/**
 * Environment holds all state and provides capabilities for evaluation.
 * This replaces StateService, ResolutionService, and capability injection.
 */
export class Environment {
  private variables = new Map<string, MlldVariable>();
  private nodes: MlldNode[] = [];
  private parent?: Environment;
  private urlCache: Map<string, { content: string; timestamp: number; ttl?: number }> = new Map();
  private importStack: Set<string> = new Set(); // Track imports to prevent circular dependencies
  private urlConfig?: ResolvedURLConfig;
  private importApproval?: ImportApproval;
  private immutableCache?: ImmutableCache;
  private currentFilePath?: string; // Track current file being processed
  private securityManager?: SecurityManager; // Central security coordinator
  private stdinContent?: string; // Cached stdin content
  private registryManager?: RegistryManager; // Registry for mlld:// URLs
  
  // Output management properties
  private outputOptions: CommandExecutionOptions = {
    showProgress: true,
    maxOutputLines: 50,
    errorBehavior: 'continue',
    timeout: 30000,
    collectErrors: false
  };
  private collectedErrors: CollectedError[] = [];
  
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
      
      // Keep legacy components for backward compatibility
      this.importApproval = new ImportApproval(basePath);
      this.immutableCache = new ImmutableCache(basePath);
    }
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
  
  // --- Variable Management ---
  
  setVariable(name: string, variable: MlldVariable): void {
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
  setParameterVariable(name: string, variable: MlldVariable): void {
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
  
  getVariable(name: string): MlldVariable | undefined {
    // Check this scope first
    const variable = this.variables.get(name);
    if (variable) return variable;
    
    // Check parent scope
    return this.parent?.getVariable(name);
  }
  
  hasVariable(name: string): boolean {
    return this.variables.has(name) || (this.parent?.hasVariable(name) ?? false);
  }
  
  // --- Node Management ---
  
  addNode(node: MlldNode): void {
    this.nodes.push(node);
  }
  
  getNodes(): MlldNode[] {
    return this.nodes;
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
   * Set stdin content for this environment (typically only on root)
   */
  setStdinContent(content: string): void {
    if (!this.parent) {
      // Only store on root environment
      this.stdinContent = content;
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
    // Merge with instance defaults
    const finalOptions = { ...this.outputOptions, ...options };
    const { showProgress, maxOutputLines, errorBehavior, timeout } = finalOptions;
    
    const startTime = Date.now();
    
    if (showProgress) {
      console.log(`⚡ Running: ${command}`);
    }
    
    try {
      const workingDirectory = await this.getProjectPath();
      const result = execSync(command, {
        encoding: 'utf8',
        cwd: workingDirectory,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB limit
        timeout: timeout || 30000
      });
      
      const duration = Date.now() - startTime;
      const { processed } = this.processOutput(result, maxOutputLines);
      
      if (showProgress) {
        console.log(`✅ Completed in ${duration}ms`);
      }
      
      return processed;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (showProgress) {
        console.log(`❌ Failed in ${duration}ms`);
      }
      
      // Create rich MlldCommandExecutionError with source context
      const commandError = MlldCommandExecutionError.create(
        command,
        error.status || error.code || 1,
        duration,
        context?.sourceLocation,
        {
          stdout: error.stdout,
          stderr: error.stderr,
          workingDirectory: await this.getProjectPath(),
          directiveType: context?.directiveType || 'run'
        }
      );
      
      // Collect error if in continue mode or if collectErrors is enabled
      if (errorBehavior === 'continue' || finalOptions.collectErrors) {
        this.collectError(commandError, command, duration, context);
      }
      
      if (errorBehavior === 'halt') {
        throw commandError; // Throw rich error instead of generic error
      }
      
      // Return available output for continue mode
      const output = error.stdout || error.stderr || '';
      const { processed } = this.processOutput(output, maxOutputLines);
      return processed;
    }
  }
  
  async executeCode(
    code: string, 
    language: string, 
    params?: Record<string, any>,
    context?: CommandExecutionContext
  ): Promise<string> {
    const startTime = Date.now();
    if (language === 'javascript' || language === 'js' || language === 'node') {
      try {
        // Create a function that captures console.log output
        let output = '';
        const originalLog = console.log;
        console.log = (...args: any[]) => {
          output += args.map(arg => String(arg)).join(' ') + '\n';
        };
        
        // Create a function with parameters if provided
        const paramNames = params ? Object.keys(params) : [];
        const paramValues = params ? Object.values(params) : [];
        
        // Build the function body
        let functionBody = code;
        
        // Handle return statements properly
        if (!code.includes('return') && !code.includes(';')) {
          // Single expression without semicolon - return it
          functionBody = `return ${code}`;
        }
        
        // Create and execute the function
        const fn = new Function(...paramNames, functionBody);
        const result = fn(...paramValues);
        
        // Restore console.log
        console.log = originalLog;
        
        // If there was console output, use that. Otherwise use the result.
        if (output) {
          return output.replace(/\n+$/, '');
        }
        
        return result !== undefined ? String(result) : '';
      } catch (error) {
        if (context?.sourceLocation) {
          const codeError = new MlldCommandExecutionError(
            `Code execution failed: ${language}`,
            context.sourceLocation,
            {
              command: `${language} code execution`,
              exitCode: 1,
              duration: Date.now() - startTime,
              stderr: error instanceof Error ? error.message : 'Unknown error',
              workingDirectory: await this.getProjectPath(),
              directiveType: context.directiveType || 'run'
            }
          );
          throw codeError;
        }
        throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (language === 'python' || language === 'py') {
      try {
        // Create a temporary Python file with parameter injection
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `mlld_exec_${Date.now()}.py`);
        
        // Build Python code with parameters
        let pythonCode = '';
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            pythonCode += `${key} = ${JSON.stringify(value)}\\n`;
          }
        }
        pythonCode += code;
        
        // Write to temp file
        fs.writeFileSync(tmpFile, pythonCode);
        
        try {
          // Execute Python
          const result = await this.executeCommand(`python3 ${tmpFile}`);
          return result;
        } finally {
          // Clean up temp file
          fs.unlinkSync(tmpFile);
        }
      } catch (error) {
        throw new Error(`Python execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (language === 'bash' || language === 'sh' || language === 'shell') {
      try {
        // Build environment variables from parameters
        const envVars: Record<string, string> = {};
        
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            // Convert value to string for environment variable
            if (typeof value === 'object' && value !== null) {
              envVars[key] = JSON.stringify(value);
            } else {
              envVars[key] = String(value);
            }
          }
        }
        
        // Execute bash code with environment variables
        const child_process = require('child_process');
        
        try {
          // Mock bash execution in test environment if needed
          if (process.env.MOCK_BASH === 'true') {
            // Simple mock that handles echo commands
            const lines = code.trim().split('\n');
            const outputs: string[] = [];
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('echo ')) {
                // Extract the string to echo, handling quotes
                const echoContent = trimmed.substring(5).trim();
                let output = echoContent;
                
                // Handle quoted strings
                if ((echoContent.startsWith('"') && echoContent.endsWith('"')) ||
                    (echoContent.startsWith("'") && echoContent.endsWith("'"))) {
                  output = echoContent.slice(1, -1);
                }
                
                // Replace environment variables
                for (const [key, value] of Object.entries(envVars)) {
                  output = output.replace(new RegExp(`\\$${key}`, 'g'), value);
                }
                
                outputs.push(output);
              }
            }
            
            return outputs.join('\n');
          }
          
          const result = child_process.execSync(`bash -c ${JSON.stringify(code)}`, {
            encoding: 'utf8',
            env: { ...process.env, ...envVars },
            cwd: this.basePath,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          return result.toString().replace(/\n+$/, '');
        } catch (execError: any) {
          // Handle execution error with proper error details
          if (context?.sourceLocation) {
            const bashError = new MlldCommandExecutionError(
              `Code execution failed: ${language}`,
              context.sourceLocation,
              {
                command: `${language} code execution`,
                exitCode: execError.status || 1,
                duration: Date.now() - startTime,
                stderr: execError.stderr?.toString() || execError.message,
                stdout: execError.stdout?.toString() || '',
                workingDirectory: this.basePath,
                directiveType: context.directiveType || 'run'
              }
            );
            throw bashError;
          }
          throw new Error(`Bash execution failed: ${execError.stderr || execError.message || 'Unknown error'}`);
        }
      } catch (error) {
        throw new Error(`Bash execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      throw new Error(`Unsupported code language: ${language}`);
    }
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
    return path.resolve(this.basePath, inputPath);
  }
  
  // --- Scope Management ---
  
  createChild(newBasePath?: string): Environment {
    return new Environment(
      this.fileSystem,
      this.pathService,
      newBasePath || this.basePath,
      this
    );
  }
  
  mergeChild(child: Environment): void {
    // Merge child variables into this environment without immutability checks
    // This is used for internal operations like nested data assignments
    for (const [name, variable] of child.variables) {
      // Use direct assignment to bypass immutability checks
      this.variables.set(name, variable);
    }
    
    // Merge child nodes
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
  
  getAllVariables(): Map<string, MlldVariable> {
    const allVars = new Map<string, MlldVariable>();
    
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

  getCurrentVariables(): Map<string, MlldVariable> {
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
      const cached = this.urlCache.get(url);
      if (cached) {
        const ttl = cached.ttl || this.getURLCacheTTL(url);
        if (Date.now() - cached.timestamp < ttl) {
          return cached.content;
        }
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
      if (forImport && this.getImportApproval()) {
        const approved = await this.getImportApproval()!.checkApproval(url, content);
        if (!approved) {
          throw new Error('Import not approved by user');
        }
        
        // Store in immutable cache
        if (this.getImmutableCache()) {
          await this.getImmutableCache()!.set(url, content);
        }
      }
      
      // Cache the response with URL-specific TTL for non-imports
      if (cacheEnabled && !forImport) {
        const ttl = this.getURLCacheTTL(url);
        this.urlCache.set(url, { content, timestamp: Date.now(), ttl });
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
    if (!this.urlConfig?.cache.rules) {
      return this.urlConfig?.cache.defaultTTL || 5 * 60 * 1000;
    }
    
    // Find matching rule
    for (const rule of this.urlConfig.cache.rules) {
      if (rule.pattern.test(url)) {
        return rule.ttl;
      }
    }
    
    // Fall back to default
    return this.urlConfig.cache.defaultTTL;
  }
  
  setURLOptions(options: Partial<typeof this.defaultUrlOptions>): void {
    Object.assign(this.defaultUrlOptions, options);
  }
  
  setURLConfig(config: ResolvedURLConfig): void {
    this.urlConfig = config;
  }
  
  // --- Output Management Methods ---
  
  setOutputOptions(options: Partial<CommandExecutionOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
  }
  
  private collectError(
    error: MlldCommandExecutionError, 
    command: string, 
    duration: number,
    context?: CommandExecutionContext
  ): void {
    this.collectedErrors.push({
      error,
      command,
      timestamp: new Date(),
      duration,
      sourceLocation: context?.sourceLocation,
      context
    });
  }
  
  getCollectedErrors(): CollectedError[] {
    return this.collectedErrors;
  }
  
  clearCollectedErrors(): void {
    this.collectedErrors = [];
  }
  
  private processOutput(output: string, maxLines?: number): { 
    processed: string; 
    truncated: boolean; 
    originalLineCount: number 
  } {
    if (!maxLines || maxLines <= 0) {
      return { processed: output.trimEnd(), truncated: false, originalLineCount: 0 };
    }
    
    const lines = output.split('\n');
    if (lines.length <= maxLines) {
      return { 
        processed: output.trimEnd(), 
        truncated: false, 
        originalLineCount: lines.length 
      };
    }
    
    const truncated = lines.slice(0, maxLines).join('\n');
    const remaining = lines.length - maxLines;
    return {
      processed: `${truncated}\n... (${remaining} more lines, use --verbose to see all)`,
      truncated: true,
      originalLineCount: lines.length
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
          workingDirectory: process.cwd(),
          contextLines: 2
        });
        
        console.log(formatted);
      } catch (formatError) {
        // Fallback to basic display if rich formatting fails
        console.log(`   ├─ Command: ${item.command}`);
        console.log(`   ├─ Duration: ${item.duration}ms`);
        console.log(`   ├─ ${item.error.message}`);
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
    return child;
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
}