import { createHash } from 'crypto';
import * as readline from 'readline/promises';
import type { ImportAllowEntry, ImportSecurityConfig } from '@core/config/types';
import { ConfigLoader } from '@core/config/loader';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ILockFile, LockEntry } from '@core/registry';
import { TrustEvaluator, type TrustDecision } from './TrustEvaluator';
import { ModuleScanner, type CommandSummary } from './ModuleScanner';
import { ApprovalUI, type ApprovalDecision } from './ApprovalUI';

export class ImportApproval {
  private config: ImportSecurityConfig;
  private configLoader: ConfigLoader;
  private projectPath: string;
  private trustEvaluator: TrustEvaluator;
  private moduleScanner: ModuleScanner;
  private approvalUI: ApprovalUI;
  
  constructor(projectPath: string, private lockFile?: ILockFile, private globalLockFile?: ILockFile) {
    this.projectPath = projectPath;
    this.configLoader = new ConfigLoader(projectPath);
    const config = this.configLoader.load();
    this.config = config.security?.imports || {
      requireApproval: true,
      pinByDefault: true,
      allowed: []
    };
    
    // Initialize new approval flow components
    this.trustEvaluator = new TrustEvaluator(lockFile, globalLockFile, projectPath);
    this.moduleScanner = new ModuleScanner();
    this.approvalUI = new ApprovalUI();
  }

  /**
   * Check if an import is approved, prompting user if needed
   * Enhanced with context-aware trust evaluation
   */
  async checkApproval(url: string, content: string): Promise<boolean> {
    // If approval not required, allow all
    if (!this.config.requireApproval) {
      return true;
    }
    
    // In CI/test environments, auto-approve
    if (process.env.CI || 
        process.env.NODE_ENV === 'test' || 
        process.env.MLLD_TEST === '1' ||
        process.env.VITEST || 
        process.env.VITEST_WORKER_ID ||
        process.env.VITEST_POOL_ID !== undefined) {
      return true;
    }

    // NEW: Use enhanced trust evaluation
    const trustDecision = await this.trustEvaluator.evaluateTrust(url, content);
    
    // If trusted automatically (e.g., local files), allow
    if (trustDecision.trusted && !trustDecision.requiresApproval) {
      return true;
    }
    
    // Calculate content hash
    const hash = this.calculateHash(content);
    
    // Check lock file first if available
    if (this.lockFile) {
      const lockEntry = await this.lockFile.getImport(url);
      if (lockEntry) {
        return this.evaluateExistingApproval(url, lockEntry, content, hash);
      }
    }
    
    // Fall back to config file check for backward compatibility
    const existingApproval = this.config.allowed?.find(entry => entry.url === url);
    
    if (existingApproval) {
      // If pinned to version, check hash
      if (existingApproval.pinnedVersion) {
        if (existingApproval.hash === hash) {
          return true;
        } else {
          // Content changed, need re-approval
          return this.promptForUpdate(url, content, existingApproval, hash);
        }
      } else {
        // Not pinned, allow any version
        return true;
      }
    }
    
    // NEW: Enhanced approval flow
    return this.promptEnhancedApproval(url, content, hash, trustDecision);
  }

  private calculateHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }
  
  private async evaluateExistingApproval(
    url: string,
    entry: LockEntry,
    content: string,
    currentHash: string
  ): Promise<boolean> {
    // Check trust level
    if (entry.trust === 'never') {
      return false;
    }
    
    // Check integrity - format is "sha256:hash"
    const expectedHash = entry.integrity.startsWith('sha256:') 
      ? entry.integrity.substring(7) 
      : entry.integrity;
    
    if (expectedHash !== currentHash) {
      // Content changed
      if (entry.trust === 'updates') {
        // Allow updates without prompting
        await this.updateLockEntry(url, content, currentHash);
        return true;
      } else {
        // Need re-approval for changed content
        return this.promptForLockUpdate(url, content, entry, currentHash);
      }
    }
    
    // Check expiry for time-based approvals
    if (entry.ttl) {
      const approvedDate = new Date(entry.approvedAt);
      const ttlMs = this.parseTTL(entry.ttl);
      const expiryDate = new Date(approvedDate.getTime() + ttlMs);
      
      if (expiryDate < new Date()) {
        // Expired, need re-approval
        return this.promptForRenewal(url, content, currentHash);
      }
    }
    
    return true; // Valid approval
  }
  
  private parseTTL(ttl: string): number {
    // Parse TTL strings like "24h", "7d", "1w"
    const match = ttl.match(/^(\d+)([hdw])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default 24 hours
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  private async promptForApproval(url: string, content: string, hash: string): Promise<boolean> {
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
    console.log(`\n⚠️  Import requires approval:`);
    console.log(`   ${url}\n`);
    
    // Show preview
    const preview = this.getContentPreview(content);
    console.log('   [Preview of first 20 lines]');
    console.log(preview);
    
    // Detect commands
    const commands = this.detectCommands(content);
    if (commands.length > 0) {
      console.log(`\n   This import contains ${commands.length} run command(s):`);
      commands.slice(0, 5).forEach(cmd => console.log(`   - ${cmd}`));
      if (commands.length > 5) {
        console.log(`   ... and ${commands.length - 5} more`);
      }
    }
    
    // Prompt user
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Allow this import?');
      console.log('   [y] This version only (recommended)');
      console.log('   [f] This + future updates');
      console.log('   [t] For time duration...');
      console.log('   [n] Never (cancel)');
      console.log('   [v] View full content\n');
      
      let choice = await rl.question('   Choice: ');
      
      // Handle view full content
      if (choice.toLowerCase() === 'v') {
        console.log('\n=== Full Content ===');
        console.log(content);
        console.log('=== End Content ===\n');
        choice = await rl.question('   Choice: ');
      }
      
      // Enhanced approval options
      interface ApprovalDecision {
        approved: boolean;
        trust: 'always' | 'once' | 'never' | 'updates';
        ttl?: string;
        expiresAt?: string;
      }
      
      const decision: ApprovalDecision = {
        approved: false,
        trust: 'never'
      };
      
      switch (choice.toLowerCase()) {
        case 'y':
          decision.approved = true;
          decision.trust = 'always';
          break;
          
        case 'f':
          decision.approved = true;
          decision.trust = 'updates';
          break;
          
        case 't':
          // Prompt for duration
          console.log('\n   Trust for how long?');
          console.log('   Examples: 1h, 12h, 1d, 7d, 30d');
          const duration = await rl.question('   Duration: ');
          
          const ttl = this.parseDuration(duration);
          if (ttl) {
            decision.approved = true;
            decision.trust = 'always';
            decision.ttl = duration;
            decision.expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
          } else {
            console.log('   ❌ Invalid duration format\n');
            decision.approved = false;
            decision.trust = 'never';
          }
          break;
          
        case 'n':
        default:
          decision.approved = false;
          decision.trust = 'never';
          break;
      }
      
      // Save to lock file if available
      if (this.lockFile && decision.approved) {
        await this.saveToLockFile(url, hash, decision, commands);
      }
      
      // Also save to config for backward compatibility
      if (decision.approved) {
        await this.saveApproval(url, hash, decision.trust === 'always', commands);
      }
      
      console.log(decision.approved ? 
        '   ✅ Import approved and cached\n' : 
        '   ❌ Import cancelled\n'
      );
      
      return decision.approved;
    } finally {
      rl.close();
    }
  }

  private async promptForUpdate(
    url: string, 
    content: string, 
    existing: ImportAllowEntry, 
    newHash: string
  ): Promise<boolean> {
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
    console.log(`\n⚠️  Cached import has changed:`);
    console.log(`   ${url}\n`);
    console.log(`   Previously approved: ${new Date(existing.allowedAt).toLocaleDateString()}`);
    console.log(`   Content has been modified since approval.\n`);
    
    // Show preview of new content
    const preview = this.getContentPreview(content);
    console.log('   [Preview of new content]');
    console.log(preview);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Accept updated content?');
      console.log('   [y] Yes, update to new version');
      console.log('   [n] No, cancel import\n');
      
      const choice = await rl.question('   Choice: ');
      
      if (choice.toLowerCase() === 'y') {
        await this.updateApproval(url, newHash, existing.pinnedVersion);
        console.log('   ✅ Import updated and cached\n');
        return true;
      } else {
        console.log('   ❌ Import cancelled\n');
        return false;
      }
    } finally {
      rl.close();
    }
  }

  private getContentPreview(content: string, lines: number = 20): string {
    const contentLines = content.split('\n');
    const preview = contentLines.slice(0, lines).join('\n');
    
    if (contentLines.length > lines) {
      return preview + '\n   ...';
    }
    
    return preview;
  }

  private detectCommands(content: string): string[] {
    const commands: string[] = [];
    
    // Regex to find @run and @exec directives in all formats:
    // - Plain: @run npm install
    // - Bracketed: @run [npm install]
    // - Backtick: @run `npm install`
    const runRegex = /@(?:run|exec)\s+(?:\[([^\]]+)\]|`([^`]+)`|([^\n\[`]+))/g;
    
    let match;
    while ((match = runRegex.exec(content)) !== null) {
      const command = match[1] || match[2] || match[3];
      if (command) {
        // Extract just the base command (first word)
        const baseCommand = command.trim().split(/\s+/)[0];
        if (baseCommand && !commands.includes(baseCommand)) {
          commands.push(baseCommand);
        }
      }
    }
    
    return commands;
  }

  private async saveApproval(
    url: string, 
    hash: string, 
    pinnedVersion: boolean,
    detectedCommands: string[]
  ): Promise<void> {
    const entry: ImportAllowEntry = {
      url,
      hash,
      pinnedVersion,
      allowedAt: new Date().toISOString(),
      detectedCommands
    };
    
    // Load current config
    const config = this.configLoader.load();
    
    // Ensure structure exists
    if (!config.security) config.security = {};
    if (!config.security.imports) config.security.imports = {};
    if (!config.security.imports.allowed) config.security.imports.allowed = [];
    
    // Add or update entry
    const existingIndex = config.security.imports.allowed.findIndex(e => e.url === url);
    if (existingIndex >= 0) {
      config.security.imports.allowed[existingIndex] = entry;
    } else {
      config.security.imports.allowed.push(entry);
    }
    
    // Save config
    const configPath = path.join(this.projectPath, 'mlld.config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    // Reload config
    this.config = config.security.imports;
  }

  private async updateApproval(
    url: string,
    newHash: string,
    pinnedVersion: boolean
  ): Promise<void> {
    const config = this.configLoader.load();
    
    if (config.security?.imports?.allowed) {
      const entry = config.security.imports.allowed.find(e => e.url === url);
      if (entry) {
        entry.hash = newHash;
        entry.allowedAt = new Date().toISOString();
        
        // Save config
        const configPath = path.join(this.projectPath, 'mlld.config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      }
    }
  }

  /**
   * Enhanced approval flow with context-aware UI and command scanning
   */
  private async promptEnhancedApproval(
    url: string, 
    content: string, 
    hash: string, 
    trustDecision: TrustDecision
  ): Promise<boolean> {
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
    try {
      // Scan for commands if needed
      let commandSummary: CommandSummary | undefined;
      let securityScore: number | undefined;
      
      if (trustDecision.showCommands) {
        commandSummary = await this.moduleScanner.scanForCommands(content);
        securityScore = await this.moduleScanner.getSecurityScore(content);
      }
      
      // Use the enhanced approval UI
      const decision = await this.approvalUI.promptApproval({
        source: url,
        content,
        context: trustDecision.context,
        commandSummary,
        securityScore,
        showCommands: trustDecision.showCommands
      });
      
      // Save decision if approved
      if (decision.approved && this.lockFile) {
        const lockEntry: LockEntry = {
          resolved: url,
          integrity: `sha256:${hash}`,
          approvedAt: new Date().toISOString(),
          approvedBy: process.env.USER || 'unknown',
          trust: decision.trust as any
        };
        
        if (decision.expiresAt) {
          lockEntry.expiresAt = decision.expiresAt;
        }
        
        // Extract TTL from trust value if it's time-based
        if (decision.trust.match(/^\d+[hdw]$/)) {
          lockEntry.ttl = decision.trust;
        }
        
        await this.lockFile.addImport(url, lockEntry);
      }
      
      // Also save to config for backward compatibility if approved
      if (decision.approved) {
        const detectedCommands = commandSummary?.commands || this.detectCommands(content);
        await this.saveApproval(url, hash, decision.trust === 'always', detectedCommands);
      }
      
      return decision.approved;
      
    } catch (error) {
      console.error('Error during enhanced approval flow:', error);
      // Fall back to legacy approval
      return this.promptForApproval(url, content, hash);
    } finally {
      // Clean up UI resources
      this.approvalUI.dispose();
    }
  }

  /**
   * Check if running in CI/non-interactive mode
   */
  isInteractive(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY;
  }
  
  /**
   * Save approval decision to lock file
   */
  private async saveToLockFile(
    url: string,
    hash: string,
    decision: {
      approved: boolean;
      trust: 'always' | 'once' | 'never' | 'updates';
      ttl?: string;
      expiresAt?: string;
    },
    detectedCommands: string[]
  ): Promise<void> {
    if (!this.lockFile) return;
    
    const entry: LockEntry = {
      resolved: url,
      integrity: `sha256:${hash}`,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown',
      trust: decision.trust
    };
    
    if (decision.ttl) {
      entry.ttl = decision.ttl;
    }
    
    if (decision.expiresAt) {
      entry.expiresAt = decision.expiresAt;
    }
    
    await this.lockFile.addImport(url, entry);
  }
  
  /**
   * Update lock entry for changed content
   */
  private async updateLockEntry(
    url: string,
    content: string,
    hash: string
  ): Promise<void> {
    if (!this.lockFile) return;
    
    await this.lockFile.updateImport(url, {
      integrity: `sha256:${hash}`,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    });
  }
  
  /**
   * Prompt for update when content has changed
   */
  private async promptForLockUpdate(
    url: string,
    content: string,
    existing: LockEntry,
    newHash: string
  ): Promise<boolean> {
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
    console.log(`\n⚠️  Cached import has changed:`);
    console.log(`   ${url}\n`);
    console.log(`   Previously approved: ${new Date(existing.approvedAt).toLocaleDateString()}`);
    console.log(`   Content has been modified since approval.\n`);
    
    // Show preview of new content
    const preview = this.getContentPreview(content);
    console.log('   [Preview of new content]');
    console.log(preview);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Accept updated content?');
      console.log('   [y] Yes, update to new version');
      console.log('   [a] Yes, and allow future updates');
      console.log('   [n] No, cancel import\n');
      
      const choice = await rl.question('   Choice: ');
      
      if (choice.toLowerCase() === 'y') {
        await this.updateLockEntry(url, content, newHash);
        console.log('   ✅ Import updated and cached\n');
        return true;
      } else if (choice.toLowerCase() === 'a') {
        await this.lockFile!.updateImport(url, {
          integrity: `sha256:${newHash}`,
          approvedAt: new Date().toISOString(),
          trust: 'updates'
        });
        console.log('   ✅ Import updated and future updates allowed\n');
        return true;
      } else {
        console.log('   ❌ Import cancelled\n');
        return false;
      }
    } finally {
      rl.close();
    }
  }
  
  /**
   * Prompt for renewal when TTL has expired
   */
  private async promptForRenewal(
    url: string,
    content: string,
    hash: string
  ): Promise<boolean> {
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
    console.log(`\n⚠️  Import approval has expired:`);
    console.log(`   ${url}\n`);
    
    // Show content preview
    const preview = this.getContentPreview(content);
    console.log('   [Content preview]');
    console.log(preview);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Renew approval?');
      console.log('   [1h] For 1 hour');
      console.log('   [1d] For 1 day');
      console.log('   [1w] For 1 week');
      console.log('   [a] Always');
      console.log('   [n] Never\n');
      
      const choice = await rl.question('   Choice: ');
      
      const decision: any = {
        approved: false,
        trust: 'never'
      };
      
      switch (choice.toLowerCase()) {
        case '1h':
          decision.approved = true;
          decision.trust = 'always';
          decision.ttl = '1h';
          break;
        case '1d':
          decision.approved = true;
          decision.trust = 'always';
          decision.ttl = '24h';
          break;
        case '1w':
          decision.approved = true;
          decision.trust = 'always';
          decision.ttl = '168h';
          break;
        case 'a':
          decision.approved = true;
          decision.trust = 'always';
          break;
        case 'n':
        default:
          decision.approved = false;
          decision.trust = 'never';
      }
      
      if (this.lockFile && decision.approved) {
        await this.saveToLockFile(url, hash, decision, []);
      }
      
      console.log(decision.approved ? 
        '   ✅ Import renewed\n' : 
        '   ❌ Import blocked\n'
      );
      
      return decision.approved;
    } finally {
      rl.close();
    }
  }
}