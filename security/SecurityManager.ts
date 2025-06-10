import { CommandAnalyzer } from './command';
import { URLValidator } from './url';
import { RegistryResolver } from './registry';
import { AdvisoryChecker } from './registry';
import { TaintTracker, TaintLevel } from './taint';
import { ImportApproval } from './import';
import { ImmutableCache } from './cache';
import { PathValidator } from './path';
import { PolicyManager, PolicyManagerImpl } from './policy';
import { AuditLogger, AuditEventType } from './audit/AuditLogger';
import { ILockFileWithCommands } from '@core/registry/ILockFile';
import * as path from 'path';
import * as os from 'os';

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
  private policyManager: PolicyManager;
  private auditLogger: AuditLogger;
  private hooks: Map<string, SecurityHook[]> = new Map();
  private lockFile?: ILockFileWithCommands;
  private globalLockFile?: ILockFileWithCommands;
  
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
   * Set lock files for command approval persistence
   */
  setLockFiles(projectLock?: ILockFileWithCommands, globalLock?: ILockFileWithCommands): void {
    this.lockFile = projectLock;
    this.globalLockFile = globalLock;
  }

  /**
   * Pre-execution security check for commands
   */
  async checkCommand(command: string, context?: SecurityContext, skipApproval: boolean = false): Promise<SecurityDecision> {
    // 1. Check for existing command approval in lock files
    const existingApproval = await this.findCommandApproval(command);
    if (existingApproval) {
      const decision = this.evaluateCommandApproval(existingApproval, command);
      if (decision) {
        // Audit the approved command
        await this.auditLogger.log({
          type: AuditEventType.COMMAND_EXECUTION,
          details: {
            command,
            approval: existingApproval,
            context
          }
        });
        return decision;
      }
    }
    
    // 2. Check taint level
    const taint = this.taintTracker.getTaint(command);
    
    // 3. Analyze command for dangerous patterns
    const analysis = await this.commandAnalyzer.analyze(command, taint);
    
    // 4. Get effective policy (merged global + project + inline)
    // Map mlld trust level to security trust level if provided
    let securityMetadata = context?.metadata;
    if (context?.mlldTrust && !securityMetadata?.trust) {
      securityMetadata = {
        ...securityMetadata,
        trust: this.mapMlldTrustToSecurityTrust(context.mlldTrust)
      };
    }
    
    const policy = await this.policyManager.getEffectivePolicy(securityMetadata);
    
    // 5. Evaluate command against policy
    const decision = this.policyManager.evaluateCommand(command, analysis, policy);
    
    // 6. Apply taint-based restrictions
    if (taint && taint !== TaintLevel.TRUSTED && decision.allowed) {
      // Tainted commands always require approval unless explicitly trusted
      decision.requiresApproval = true;
    }
    
    // 7. Handle approval requirement
    if (decision.requiresApproval && !decision.blocked && !skipApproval) {
      const userDecision = await this.promptCommandApproval(command, analysis, context);
      if (userDecision.approved) {
        // Save approval to lock file
        await this.saveCommandApproval(command, userDecision);
        return {
          allowed: true,
          requiresApproval: false,
          reason: 'Approved by user'
        };
      } else {
        return {
          allowed: false,
          blocked: true,
          reason: 'Denied by user'
        };
      }
    }
    
    // 8. Audit the check
    await this.auditLogger.log({
      type: decision.allowed ? AuditEventType.COMMAND_EXECUTION : AuditEventType.COMMAND_BLOCKED,
      details: {
        command,
        taint,
        analysis,
        decision,
        context
      }
    });
    
    // 9. Run pre-execution hooks
    await this.runHooks('pre-command', { command, decision, context });
    
    return decision;
  }
  
  /**
   * Check path access permissions
   */
  async checkPath(path: string, operation: 'read' | 'write', context?: SecurityContext): Promise<boolean> {
    try {
      // 1. Check for existing path approval in lock files
      const existingApproval = await this.findPathApproval(path, operation);
      if (existingApproval) {
        const decision = this.evaluatePathApproval(existingApproval, path, operation);
        if (decision) {
          // Audit the approved path access
          await this.auditLogger.log({
            type: 'PATH_ACCESS',
            path,
            operation,
            approval: existingApproval,
            context
          });
          return decision.allowed;
        }
      }

      // 2. Basic path validation
      const basicCheck = operation === 'read' 
        ? this.pathValidator.canRead(path)
        : this.pathValidator.canWrite(path);
      
      if (!basicCheck) {
        return false;
      }
      
      // 3. Policy-based check
      const policy = await this.policyManager.getEffectivePolicy(context?.metadata);
      const decision = this.policyManager.evaluatePath(path, operation, policy);
      
      // 4. Audit the check
      await this.auditLogger.log({
        type: 'PATH_CHECK',
        path,
        operation,
        decision,
        context
      });
      
      // 5. Handle approval requirement
      if (decision.requiresApproval) {
        const userDecision = await this.promptPathApproval(path, operation, context);
        if (userDecision.approved) {
          // Save approval to lock file
          await this.savePathApproval(path, operation, userDecision);
          return true;
        } else {
          return false;
        }
      }
      
      return decision.allowed;
    } catch (error) {
      // Log security violation
      console.error(`Security: Path access denied - ${operation} ${path}`);
      throw error;
    }
  }
  
  /**
   * Track data from untrusted sources
   */
  trackTaint(value: any, source: string): void {
    // Convert legacy TaintSource enum to TaintLevel if needed
    let taintLevel: TaintLevel;
    if (source === 'trusted') {
      taintLevel = TaintLevel.TRUSTED;
    } else if (source === 'user_input') {
      taintLevel = TaintLevel.USER_INPUT;
    } else if (source === 'file_system') {
      taintLevel = TaintLevel.FILE_SYSTEM;
    } else if (source === 'network') {
      taintLevel = TaintLevel.NETWORK;
    } else if (source === 'llm_output') {
      taintLevel = TaintLevel.LLM_OUTPUT;
    } else if (source === 'command_output') {
      taintLevel = TaintLevel.COMMAND_OUTPUT;
    } else {
      taintLevel = TaintLevel.MIXED;
    }
    
    // Use the value as the ID for tracking
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    this.taintTracker.mark(id, value, taintLevel, source);
  }

  /**
   * Get taint information for a value
   */
  getTaint(value: any): any {
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    return this.taintTracker.getTaint(id);
  }
  
  /**
   * Check if a resolver is allowed
   */
  async checkResolver(resolverName: string, context?: SecurityContext): Promise<boolean> {
    // 1. Get effective policy
    const policy = await this.policyManager.getEffectivePolicy(context?.metadata);
    const decision = this.policyManager.evaluateResolver(resolverName, policy);
    
    // 2. Audit the check
    await this.auditLogger.log({
      type: 'RESOLVER_CHECK',
      resolver: resolverName,
      decision,
      context
    });
    
    // 3. Handle decision
    if (!decision.allowed) {
      console.error(`Resolver blocked by policy: ${resolverName} - ${decision.reason}`);
    }
    
    return decision.allowed;
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
    this.policyManager = new PolicyManagerImpl();
    
    // Initialize audit logger with system-wide audit log
    const auditPath = path.join(os.homedir(), '.mlld', 'audit.log');
    this.auditLogger = new AuditLogger(auditPath);
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
   * Map mlld trust levels to security policy trust levels
   */
  private mapMlldTrustToSecurityTrust(mlldTrust: import('@core/types/primitives').TrustLevel): import('./policy/types').TrustLevel {
    switch (mlldTrust) {
      case 'always':
        return 'high';      // Always trusted = high trust (no approval needed)
      case 'verify':
        return 'verify';    // Verify = verify (requires approval)
      case 'never':
        return 'block';     // Never = block (not allowed)
      default:
        return 'verify';    // Default to verify for safety
    }
  }

  /**
   * Check and approve an import
   */
  async approveImport(
    importURL: string,
    content: string,
    advisories: any[],
    context?: SecurityContext
  ): Promise<boolean> {
    // 1. Check for existing import approval in lock files
    const existingApproval = await this.findImportApproval(importURL);
    if (existingApproval) {
      const decision = this.evaluateImportApproval(existingApproval, importURL, content);
      if (decision) {
        // Audit the approved import
        await this.auditLogger.log({
          type: 'IMPORT_APPROVED',
          importURL,
          approval: existingApproval,
          context
        });
        return decision.allowed;
      }
    }

    // 2. Check import policy
    const policy = await this.policyManager.getEffectivePolicy(context?.metadata);
    const decision = this.policyManager.evaluateImport(importURL, policy);
    
    // 3. Audit the check
    await this.auditLogger.log({
      type: 'IMPORT_CHECK',
      importURL,
      decision,
      advisories,
      context
    });
    
    // 4. If blocked by policy, deny immediately
    if (!decision.allowed) {
      console.error(`Import blocked by policy: ${importURL} - ${decision.reason}`);
      return false;
    }
    
    // 5. Show advisories if any
    if (advisories.length > 0) {
      const approved = await this.advisoryChecker.promptUserAboutAdvisories(
        advisories,
        importURL
      );
      if (!approved) {
        return false;
      }
    }
    
    // 6. Check if approval is required
    if (decision.requiresApproval) {
      const userDecision = await this.promptImportApproval(importURL, content, advisories, context);
      if (userDecision.approved) {
        // Save approval to lock file
        await this.saveImportApproval(importURL, content, userDecision);
        return true;
      } else {
        return false;
      }
    }
    
    // 7. Auto-approve if policy allows
    return true;
  }
  
  /**
   * Find command approval in lock files
   */
  private async findCommandApproval(command: string): Promise<any> {
    // Check project lock file first
    if (this.lockFile) {
      const approval = await this.lockFile.getCommandApproval(command);
      if (approval) {
        return { source: 'project', approval };
      }
    }
    
    // Check global lock file
    if (this.globalLockFile) {
      const approval = await this.globalLockFile.getCommandApproval(command);
      if (approval) {
        return { source: 'global', approval };
      }
    }
    
    return null;
  }
  
  /**
   * Evaluate existing command approval
   */
  private evaluateCommandApproval(existing: any, command: string): SecurityDecision | null {
    const { source, approval } = existing;
    
    // Check if approval is expired
    if (approval.expiresAt) {
      const expiryDate = new Date(approval.expiresAt);
      if (expiryDate < new Date()) {
        return null; // Expired, need new approval
      }
    }
    
    // Check trust level
    if (approval.trust === 'never') {
      return {
        allowed: false,
        blocked: true,
        reason: `Command blocked by ${source} lock file`
      };
    }
    
    if (approval.trust === 'always' || approval.trust === 'pattern') {
      return {
        allowed: true,
        requiresApproval: false,
        reason: `Approved by ${source} lock file`
      };
    }
    
    // 'once' approvals are consumed on use
    if (approval.trust === 'once') {
      // Remove the approval after use
      this.removeCommandApproval(command, source);
      return {
        allowed: true,
        requiresApproval: false,
        reason: `One-time approval from ${source} lock file`
      };
    }
    
    return null;
  }
  
  /**
   * Prompt user for command approval
   */
  private async promptCommandApproval(
    command: string, 
    analysis: any,
    context?: SecurityContext
  ): Promise<{ approved: boolean; trust: string; ttl?: string }> {
    // In test mode, approve by default for simple commands
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return { approved: true, trust: 'verify' };
    }
    
    // In CI mode, deny by default
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return { approved: false, trust: 'never' };
    }
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log(`\n🔒 Security: Command requires approval`);
    console.log(`   Command: ${command}`);
    if (analysis.risks && analysis.risks.length > 0) {
      console.log(`   Risks detected:`);
      analysis.risks.forEach((risk: any) => {
        console.log(`   - ${risk.type}: ${risk.description}`);
      });
    }
    
    console.log(`\n   Allow this command?`);
    console.log(`   [y] Yes, this time only`);
    console.log(`   [a] Always allow this exact command`);
    console.log(`   [p] Allow pattern (base command)`);
    console.log(`   [t] Allow for time duration...`);
    console.log(`   [n] Never (block)\n`);
    
    const choice = await new Promise<string>((resolve) => {
      rl.question('   Choice: ', resolve);
    });
    
    let result: { approved: boolean; trust: string; ttl?: string };
    
    switch (choice.toLowerCase()) {
      case 'y':
        result = { approved: true, trust: 'once' };
        break;
      case 'a':
        result = { approved: true, trust: 'always' };
        break;
      case 'p':
        result = { approved: true, trust: 'pattern' };
        break;
      case 't':
        console.log('\n   Trust for how long?');
        console.log('   Examples: 1h, 12h, 1d, 7d, 30d');
        const duration = await new Promise<string>((resolve) => {
          rl.question('   Duration: ', resolve);
        });
        result = { approved: true, trust: 'always', ttl: duration };
        break;
      case 'n':
      default:
        result = { approved: false, trust: 'never' };
        break;
    }
    
    rl.close();
    return result;
  }
  
  /**
   * Save command approval to lock file
   */
  private async saveCommandApproval(
    command: string,
    decision: { approved: boolean; trust: string; ttl?: string }
  ): Promise<void> {
    if (!this.lockFile || !decision.approved) return;
    
    // Skip lock file operations in test mode
    if (process.env.NODE_ENV === 'test' || process.env.MLLD_TEST_MODE === 'true') {
      return;
    }
    
    await this.lockFile.addCommandApproval(command, {
      trust: decision.trust as any,
      ttl: decision.ttl
    });
  }
  
  /**
   * Remove command approval after one-time use
   */
  private async removeCommandApproval(command: string, source: string): Promise<void> {
    if (source === 'project' && this.lockFile) {
      await this.lockFile.removeCommandApproval(command);
    } else if (source === 'global' && this.globalLockFile) {
      await this.globalLockFile.removeCommandApproval(command);
    }
  }

  /**
   * Find import approval in lock files
   */
  private async findImportApproval(url: string): Promise<any> {
    // Check project lock file first
    if (this.lockFile) {
      const approval = this.lockFile.findMatchingImportApproval(url);
      if (approval) {
        return { source: 'project', approval };
      }
    }
    
    // Check global lock file
    if (this.globalLockFile) {
      const approval = this.globalLockFile.findMatchingImportApproval(url);
      if (approval) {
        return { source: 'global', approval };
      }
    }
    
    return null;
  }

  /**
   * Evaluate existing import approval
   */
  private evaluateImportApproval(existing: any, url: string, content: string): SecurityDecision | null {
    const { source, approval } = existing;
    
    // Check if approval is expired
    if (approval.expiresAt) {
      const expiryDate = new Date(approval.expiresAt);
      if (expiryDate < new Date()) {
        return null; // Expired, need new approval
      }
    }
    
    // Check content hash if present
    if (approval.contentHash) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(content);
      const currentHash = `sha256:${hash.digest('hex')}`;
      
      if (currentHash !== approval.contentHash) {
        return null; // Content changed, need new approval
      }
    }
    
    // Check trust level
    if (approval.trust === 'never') {
      return {
        allowed: false,
        blocked: true,
        reason: `Import blocked by ${source} lock file`
      };
    }
    
    if (approval.trust === 'always' || approval.trust === 'verify') {
      return {
        allowed: true,
        requiresApproval: false,
        reason: `Approved by ${source} lock file`
      };
    }
    
    return null;
  }

  /**
   * Prompt user for import approval
   */
  private async promptImportApproval(
    url: string,
    content: string,
    advisories: any[],
    context?: SecurityContext
  ): Promise<{ approved: boolean; trust: string; ttl?: string }> {
    // In test mode, approve by default
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return { approved: true, trust: 'verify' };
    }
    
    // In CI mode, deny by default
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return { approved: false, trust: 'never' };
    }
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log(`\n🔒 Security: Import requires approval`);
    console.log(`   URL: ${url}`);
    if (advisories && advisories.length > 0) {
      console.log(`   Advisories:`);
      advisories.forEach((advisory: any) => {
        console.log(`   - ${advisory.severity}: ${advisory.title}`);
      });
    }
    
    console.log(`\n   Allow this import?`);
    console.log(`   [y] Yes, this time only`);
    console.log(`   [a] Always allow this URL`);
    console.log(`   [t] Allow for time duration...`);
    console.log(`   [n] Never (block)\n`);
    
    const choice = await new Promise<string>((resolve) => {
      rl.question('   Choice: ', resolve);
    });
    
    let result: { approved: boolean; trust: string; ttl?: string };
    
    switch (choice.toLowerCase()) {
      case 'y':
        result = { approved: true, trust: 'verify' };
        break;
      case 'a':
        result = { approved: true, trust: 'always' };
        break;
      case 't':
        console.log('\n   Trust for how long?');
        console.log('   Examples: 1h, 12h, 1d, 7d, 30d');
        const duration = await new Promise<string>((resolve) => {
          rl.question('   Duration: ', resolve);
        });
        result = { approved: true, trust: 'always', ttl: duration };
        break;
      case 'n':
      default:
        result = { approved: false, trust: 'never' };
        break;
    }
    
    rl.close();
    return result;
  }

  /**
   * Save import approval to lock file
   */
  private async saveImportApproval(
    url: string,
    content: string,
    decision: { approved: boolean; trust: string; ttl?: string }
  ): Promise<void> {
    if (!this.lockFile || !decision.approved) return;
    
    // Calculate content hash
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    const contentHash = `sha256:${hash.digest('hex')}`;
    
    // Calculate expiry if TTL provided
    let expiresAt: string | undefined;
    if (decision.ttl) {
      const now = new Date();
      const ttlMs = this.parseTTL(decision.ttl);
      expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    }
    
    await this.lockFile.addImportApproval(url, {
      url,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown',
      trust: decision.trust as any,
      contentHash,
      expiresAt
    });
  }

  /**
   * Find path approval in lock files
   */
  private async findPathApproval(path: string, operation: 'read' | 'write'): Promise<any> {
    // Check project lock file first
    if (this.lockFile) {
      const approval = this.lockFile.findMatchingPathApproval(path, operation);
      if (approval) {
        return { source: 'project', approval };
      }
    }
    
    // Check global lock file
    if (this.globalLockFile) {
      const approval = this.globalLockFile.findMatchingPathApproval(path, operation);
      if (approval) {
        return { source: 'global', approval };
      }
    }
    
    return null;
  }

  /**
   * Evaluate existing path approval
   */
  private evaluatePathApproval(existing: any, path: string, operation: 'read' | 'write'): SecurityDecision | null {
    const { source, approval } = existing;
    
    // Check if approval is expired
    if (approval.expiresAt) {
      const expiryDate = new Date(approval.expiresAt);
      if (expiryDate < new Date()) {
        return null; // Expired, need new approval
      }
    }
    
    // Check trust level
    if (approval.trust === 'never') {
      return {
        allowed: false,
        blocked: true,
        reason: `Path ${operation} blocked by ${source} lock file`
      };
    }
    
    if (approval.trust === 'always' || approval.trust === 'session') {
      return {
        allowed: true,
        requiresApproval: false,
        reason: `Path ${operation} approved by ${source} lock file`
      };
    }
    
    return null;
  }

  /**
   * Prompt user for path approval
   */
  private async promptPathApproval(
    path: string,
    operation: 'read' | 'write',
    context?: SecurityContext
  ): Promise<{ approved: boolean; trust: string; ttl?: string }> {
    // In test mode, approve by default
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return { approved: true, trust: 'session' };
    }
    
    // In CI mode, deny by default
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return { approved: false, trust: 'never' };
    }
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log(`\n🔒 Security: Path access requires approval`);
    console.log(`   Path: ${path}`);
    console.log(`   Operation: ${operation}`);
    
    console.log(`\n   Allow this path access?`);
    console.log(`   [y] Yes, this session only`);
    console.log(`   [a] Always allow this path`);
    console.log(`   [t] Allow for time duration...`);
    console.log(`   [n] Never (block)\n`);
    
    const choice = await new Promise<string>((resolve) => {
      rl.question('   Choice: ', resolve);
    });
    
    let result: { approved: boolean; trust: string; ttl?: string };
    
    switch (choice.toLowerCase()) {
      case 'y':
        result = { approved: true, trust: 'session' };
        break;
      case 'a':
        result = { approved: true, trust: 'always' };
        break;
      case 't':
        console.log('\n   Trust for how long?');
        console.log('   Examples: 1h, 12h, 1d, 7d, 30d');
        const duration = await new Promise<string>((resolve) => {
          rl.question('   Duration: ', resolve);
        });
        result = { approved: true, trust: 'always', ttl: duration };
        break;
      case 'n':
      default:
        result = { approved: false, trust: 'never' };
        break;
    }
    
    rl.close();
    return result;
  }

  /**
   * Save path approval to lock file
   */
  private async savePathApproval(
    path: string,
    operation: 'read' | 'write',
    decision: { approved: boolean; trust: string; ttl?: string }
  ): Promise<void> {
    if (!this.lockFile || !decision.approved) return;
    
    // Calculate expiry if TTL provided
    let expiresAt: string | undefined;
    if (decision.ttl) {
      const now = new Date();
      const ttlMs = this.parseTTL(decision.ttl);
      expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    }
    
    await this.lockFile.addPathApproval(path, operation, {
      path,
      operation,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown',
      trust: decision.trust as any,
      expiresAt
    });
  }

  /**
   * Parse TTL string to milliseconds
   */
  private parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)([hdw])$/);
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'h':
        return value * 60 * 60 * 1000; // hours to ms
      case 'd':
        return value * 24 * 60 * 60 * 1000; // days to ms
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000; // weeks to ms
      default:
        throw new Error(`Unsupported TTL unit: ${unit}`);
    }
  }
}

export interface SecurityContext {
  file?: string;
  line?: number;
  directive?: string;
  user?: string;
  metadata?: {
    ttl?: number;
    trust?: 'high' | 'medium' | 'low' | 'verify' | 'block';
    requireHash?: boolean;
  };
  // Raw mlld trust level (before mapping)
  mlldTrust?: import('@core/types/primitives').TrustLevel;
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