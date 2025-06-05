import { CommandAnalyzer } from './command';
import { URLValidator } from './url';
import { RegistryResolver } from './registry';
import { AdvisoryChecker } from './registry';
import { TaintTracker, TaintLevel } from './taint';
import { ImportApproval } from './import';
import { ImmutableCache } from './cache';
import { PathValidator } from './path';
// import type { PolicyManager } from './policy';
// import type { AuditLogger } from './audit';
// import type { SecurityHook } from './hooks';

interface SecurityHook {
  execute(data: any): Promise<void>;
}

/**
 * Central security manager that coordinates all security subsystems
 */
export class SecurityManager {
  private static instance: SecurityManager;
  
  private commandAnalyzer: CommandAnalyzer;
  private urlValidator: URLValidator;
  private registryResolver: RegistryResolver;
  private advisoryChecker: AdvisoryChecker;
  private taintTracker: TaintTracker;
  private importApproval: ImportApproval;
  private cache: ImmutableCache;
  private pathValidator: PathValidator;
  // private policyManager: PolicyManager;
  // private auditLogger: AuditLogger;
  private hooks: Map<string, SecurityHook[]> = new Map();
  
  private constructor(private projectPath: string) {
    // Initialize all security subsystems
    this.initialize();
  }
  
  static getInstance(projectPath?: string): SecurityManager {
    if (!SecurityManager.instance) {
      if (!projectPath) {
        throw new Error('Project path required for first initialization');
      }
      SecurityManager.instance = new SecurityManager(projectPath);
    }
    return SecurityManager.instance;
  }
  
  /**
   * Pre-execution security check for commands
   */
  async checkCommand(command: string, context?: SecurityContext): Promise<SecurityDecision> {
    // 1. Check taint level
    const taint = this.taintTracker.getTaint(command);
    
    // 2. Analyze command for dangerous patterns
    const analysis = await this.commandAnalyzer.analyze(command, taint);
    
    // 3. Apply security policy
    const policy = this.policyManager.getPolicy();
    const decision = policy.evaluateCommand(analysis);
    
    // 4. Audit the check
    await this.auditLogger.log({
      type: 'COMMAND_CHECK',
      command,
      taint,
      analysis,
      decision,
      context
    });
    
    // 5. Run pre-execution hooks
    await this.runHooks('pre-command', { command, decision, context });
    
    return decision;
  }
  
  /**
   * Check path access permissions
   */
  async checkPath(path: string, operation: 'read' | 'write'): Promise<boolean> {
    try {
      if (operation === 'read') {
        return this.pathValidator.canRead(path);
      } else {
        return this.pathValidator.canWrite(path);
      }
    } catch (error) {
      // Log security violation
      console.error(`Security: Path access denied - ${operation} ${path}`);
      throw error;
    }
  }
  
  /**
   * Track data from untrusted sources
   */
  trackTaint(value: any, source: TaintSource): void {
    this.taintTracker.mark(value, source);
  }
  
  /**
   * Register a security hook
   */
  registerHook(event: string, hook: SecurityHook): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(hook);
  }
  
  private async runHooks(event: string, data: any): Promise<void> {
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      await hook.execute(data);
    }
  }
  
  private initialize(): void {
    // Initialize security subsystems
    this.cache = new ImmutableCache(this.projectPath);
    this.commandAnalyzer = new CommandAnalyzer();
    this.urlValidator = new URLValidator();
    this.registryResolver = new RegistryResolver(this.cache);
    this.advisoryChecker = new AdvisoryChecker(this.cache);
    this.taintTracker = new TaintTracker();
    this.importApproval = new ImportApproval(this.projectPath);
    this.pathValidator = new PathValidator();
  }
  
  /**
   * Resolve an import URL (registry, gist, or regular)
   */
  async resolveImport(importURL: string): Promise<{
    resolvedURL: string;
    taint: TaintLevel;
    advisories: any[];
  }> {
    let resolvedURL = importURL;
    let advisories: any[] = [];
    
    // Handle registry URLs
    if (this.registryResolver.isRegistryURL(importURL)) {
      // Get module info for advisory checking
      const moduleName = importURL.replace('mlld://registry/', '');
      const moduleInfo = await this.registryResolver.getModuleInfo(moduleName);
      
      // Resolve to gist URL
      resolvedURL = await this.registryResolver.resolveRegistryURL(importURL);
      
      // Check advisories for both module name and gist
      if (moduleInfo) {
        advisories = await this.advisoryChecker.checkForAdvisories(
          moduleName,
          moduleInfo.gist
        );
      }
    }
    // Handle direct gist URLs
    else if (this.registryResolver.isGistURL(importURL)) {
      const { gistId } = this.registryResolver.parseGistURL(importURL);
      advisories = await this.advisoryChecker.checkForAdvisories(null, gistId);
    }
    
    // Determine taint level
    const taint = this.taintTracker.markImport(
      importURL,
      resolvedURL,
      importURL,
      advisories
    );
    
    return { resolvedURL, taint, advisories };
  }
  
  /**
   * Check and approve an import
   */
  async approveImport(
    importURL: string,
    content: string,
    advisories: any[]
  ): Promise<boolean> {
    // Show advisories if any
    if (advisories.length > 0) {
      const approved = await this.advisoryChecker.promptUserAboutAdvisories(
        advisories,
        importURL
      );
      if (!approved) {
        return false;
      }
    }
    
    // Regular import approval
    return this.importApproval.checkApproval(importURL, content);
  }
}

export interface SecurityContext {
  file?: string;
  line?: number;
  directive?: string;
  user?: string;
}

export interface SecurityDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
  risks?: Risk[];
}

export interface Risk {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  description: string;
}

export enum TaintSource {
  TRUSTED = 'trusted',
  USER_INPUT = 'user_input',
  FILE_SYSTEM = 'file_system',
  NETWORK = 'network',
  LLM_OUTPUT = 'llm_output',
  COMMAND_OUTPUT = 'command_output'
}