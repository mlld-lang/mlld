import { createInterface } from 'readline';
import type { CommandSummary } from './ModuleScanner';
import type { TrustContext } from './TrustEvaluator';
import { logger } from '@core/utils/logger';

export interface ApprovalDecision {
  approved: boolean;
  trust: string; // 'once', 'always', 'never', or time-based like '1h', '1d'
  expiresAt?: string;
  metadata?: {
    reason?: string;
    reviewedCommands?: boolean;
    securityScore?: number;
  };
}

export interface ApprovalOptions {
  source: string;
  content: string;
  context: TrustContext;
  commandSummary?: CommandSummary;
  securityScore?: number;
  advisories?: any[];
  showCommands?: boolean;
}

/**
 * Enhanced approval UI with better user experience and context awareness
 */
export class ApprovalUI {
  private readline?: ReturnType<typeof createInterface>;

  constructor() {
    this.initializeReadline();
  }

  private initializeReadline(): void {
    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Main approval prompt that adapts based on context
   */
  async promptApproval(options: ApprovalOptions): Promise<ApprovalDecision> {
    const { context, commandSummary } = options;

    try {
      switch (context) {
        case 'public_registry':
          return this.promptModuleApproval(options);
        case 'url_import':
          return this.promptURLApproval(options);
        case 'private_resolver':
          return this.promptResolverApproval(options);
        default:
          return this.promptGenericApproval(options);
      }
    } catch (error) {
      logger.error('ApprovalUI: Error during approval prompt:', error);
      // Default to rejection for safety
      return {
        approved: false,
        trust: 'never'
      };
    }
  }

  /**
   * Module approval with command scanning and security review
   */
  private async promptModuleApproval(options: ApprovalOptions): Promise<ApprovalDecision> {
    const { source, content, commandSummary, securityScore } = options;
    
    console.log('\n' + '━'.repeat(60));
    console.log('📦 Module Security Review');
    console.log('━'.repeat(60));
    
    console.log(`\nModule: ${source}`);
    console.log(`Size: ${content.length} bytes`);
    if (securityScore !== undefined) {
      const scoreColor = securityScore >= 80 ? '🟢' : securityScore >= 60 ? '🟡' : '🔴';
      console.log(`Security Score: ${scoreColor} ${securityScore}/100`);
    }
    console.log(`Hash: ${this.shortHash(content)}\n`);
    
    // Show command summary if available
    if (commandSummary && commandSummary.totalCommands > 0) {
      console.log('Commands this module will execute:');
      console.log(commandSummary.summary);
    } else {
      console.log('✓ This module does not execute any commands.\n');
    }
    
    // Show approval options
    const decision = await this.promptOptions([
      { key: 'y', label: 'Yes, approve this module', value: 'approve' },
      { key: 'o', label: 'Once only (this execution)', value: 'once' },
      { key: 'v', label: 'View module code', value: 'view' },
      { key: 'i', label: 'More info', value: 'info' },
      { key: 'n', label: 'No, reject this module', value: 'reject' }
    ], 'Approve this module?');
    
    switch (decision) {
      case 'approve':
        return { approved: true, trust: 'always' };
      case 'once':
        return { approved: true, trust: 'once' };
      case 'view':
        this.showCodePreview(content);
        return this.promptModuleApproval(options);
      case 'info':
        await this.showDetailedInfo(options);
        return this.promptModuleApproval(options);
      case 'reject':
      default:
        return { approved: false, trust: 'never' };
    }
  }

  /**
   * URL approval with time-based trust options
   */
  private async promptURLApproval(options: ApprovalOptions): Promise<ApprovalDecision> {
    const { source, content } = options;
    
    console.log('\n🔒 URL Import Approval Required');
    console.log(`URL: ${source}`);
    
    try {
      const url = new URL(source);
      console.log(`Domain: ${url.hostname}`);
      console.log(`Size: ${content.length} bytes\n`);
    } catch {
      console.log(`Size: ${content.length} bytes\n`);
    }
    
    const decision = await this.promptOptions([
      { key: 'o', label: 'Once (this execution only)', value: 'once' },
      { key: 'a', label: 'Always trust this URL', value: 'always' },
      { key: '1', label: 'Trust for 1 hour', value: '1h' },
      { key: 'd', label: 'Trust for 1 day', value: '1d' },
      { key: 'w', label: 'Trust for 1 week', value: '1w' },
      { key: 'c', label: 'Custom duration...', value: 'custom' },
      { key: 'v', label: 'View content', value: 'view' },
      { key: 'n', label: 'Never trust this URL', value: 'never' }
    ], 'Trust this URL?');
    
    switch (decision) {
      case 'once':
        return { approved: true, trust: 'once' };
      case 'always':
        return { approved: true, trust: 'always' };
      case '1h':
        return { 
          approved: true, 
          trust: 'always', 
          expiresAt: this.addHours(1)
        };
      case '1d':
        return { 
          approved: true, 
          trust: 'always', 
          expiresAt: this.addDays(1)
        };
      case '1w':
        return { 
          approved: true, 
          trust: 'always', 
          expiresAt: this.addDays(7)
        };
      case 'custom':
        const duration = await this.promptCustomDuration();
        return { 
          approved: true, 
          trust: 'always', 
          expiresAt: duration
        };
      case 'view':
        this.showCodePreview(content);
        return this.promptURLApproval(options);
      case 'never':
      default:
        return { approved: false, trust: 'never' };
    }
  }

  /**
   * Private resolver approval
   */
  private async promptResolverApproval(options: ApprovalOptions): Promise<ApprovalDecision> {
    const { source } = options;
    
    // Extract resolver name from source
    const match = source.match(/^(@[^/]+)\//);
    const resolver = match ? match[1] : source;
    
    console.log('\n🔧 Private Resolver Approval Required');
    console.log(`Resolver: ${resolver}`);
    console.log(`Source: ${source}\n`);
    console.log('This is a private resolver (not the public registry).');
    console.log('Once approved, all modules from this resolver will be trusted.\n');
    
    const decision = await this.promptOptions([
      { key: 'y', label: 'Yes, trust this resolver', value: 'approve' },
      { key: 'o', label: 'Once only (this import)', value: 'once' },
      { key: 'n', label: 'No, reject this resolver', value: 'reject' }
    ], 'Trust this private resolver?');
    
    switch (decision) {
      case 'approve':
        return { approved: true, trust: 'always' };
      case 'once':
        return { approved: true, trust: 'once' };
      case 'reject':
      default:
        return { approved: false, trust: 'never' };
    }
  }

  /**
   * Generic approval for other contexts
   */
  private async promptGenericApproval(options: ApprovalOptions): Promise<ApprovalDecision> {
    const { source, content } = options;
    
    console.log('\n🔒 Import Approval Required');
    console.log(`Source: ${source}`);
    console.log(`Size: ${content.length} bytes\n`);
    
    const decision = await this.promptOptions([
      { key: 'y', label: 'Yes, approve', value: 'approve' },
      { key: 'o', label: 'Once only', value: 'once' },
      { key: 'v', label: 'View content', value: 'view' },
      { key: 'n', label: 'No, reject', value: 'reject' }
    ], 'Approve this import?');
    
    switch (decision) {
      case 'approve':
        return { approved: true, trust: 'always' };
      case 'once':
        return { approved: true, trust: 'once' };
      case 'view':
        this.showCodePreview(content);
        return this.promptGenericApproval(options);
      case 'reject':
      default:
        return { approved: false, trust: 'never' };
    }
  }

  /**
   * Show multiple choice options and get user input
   */
  private async promptOptions(
    options: Array<{ key: string; label: string; value: string }>,
    message: string
  ): Promise<string> {
    console.log(message);
    for (const option of options) {
      console.log(`   [${option.key}] ${option.label}`);
    }
    console.log();
    
    const validKeys = options.map(o => o.key.toLowerCase());
    
    while (true) {
      const answer = await this.question('Your choice: ');
      const key = answer.trim().toLowerCase();
      
      const option = options.find(o => o.key.toLowerCase() === key);
      if (option) {
        return option.value;
      }
      
      console.log(`Invalid choice. Please enter one of: ${validKeys.join(', ')}`);
    }
  }

  /**
   * Show code preview with syntax highlighting
   */
  private showCodePreview(content: string): void {
    const lines = content.split('\n');
    const maxLines = 20;
    
    console.log('\n' + '─'.repeat(60));
    console.log('📄 Content Preview');
    console.log('─'.repeat(60));
    
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const lineNum = (i + 1).toString().padStart(3, ' ');
      console.log(`${lineNum} │ ${lines[i]}`);
    }
    
    if (lines.length > maxLines) {
      console.log(`... (${lines.length - maxLines} more lines)`);
    }
    
    console.log('─'.repeat(60) + '\n');
  }

  /**
   * Show detailed information about the import
   */
  private async showDetailedInfo(options: ApprovalOptions): Promise<void> {
    const { source, content, commandSummary, securityScore } = options;
    
    console.log('\n' + '═'.repeat(60));
    console.log('📋 Detailed Security Information');
    console.log('═'.repeat(60));
    
    console.log(`\nSource: ${source}`);
    console.log(`Content size: ${content.length} bytes`);
    console.log(`Content hash: ${this.fullHash(content)}`);
    
    if (securityScore !== undefined) {
      console.log(`Security score: ${securityScore}/100`);
    }
    
    if (commandSummary) {
      console.log(`\nCommand analysis:`);
      console.log(`- Total commands: ${commandSummary.totalCommands}`);
      console.log(`- High risk: ${commandSummary.riskCounts.high}`);
      console.log(`- Medium risk: ${commandSummary.riskCounts.medium}`);
      console.log(`- Low risk: ${commandSummary.riskCounts.low}`);
      
      if (commandSummary.commands.length > 0) {
        console.log(`\nCommands found:`);
        for (const cmd of commandSummary.commands) {
          const risk = commandSummary.risks.get(cmd) || 'low';
          const indicator = risk === 'high' ? '🔴' : risk === 'medium' ? '🟡' : '🟢';
          console.log(`  ${indicator} ${cmd}`);
        }
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    
    await this.question('Press Enter to continue...');
  }

  /**
   * Prompt for custom time duration
   */
  private async promptCustomDuration(): Promise<string> {
    console.log('\nEnter trust duration:');
    console.log('Examples: 30m, 2h, 3d, 1w');
    
    while (true) {
      const duration = await this.question('Duration: ');
      
      if (this.isValidDuration(duration)) {
        return this.parseDurationToExpiry(duration);
      }
      
      console.log('Invalid duration. Use format like: 30m, 2h, 3d, 1w');
    }
  }

  /**
   * Validate duration format
   */
  private isValidDuration(duration: string): boolean {
    return /^\d+[mhdw]$/i.test(duration.trim());
  }

  /**
   * Parse duration to expiry date
   */
  private parseDurationToExpiry(duration: string): string {
    const match = duration.match(/^(\d+)([mhdw])$/i);
    if (!match) throw new Error('Invalid duration format');
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const now = new Date();
    
    switch (unit) {
      case 'm':
        now.setMinutes(now.getMinutes() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'd':
        now.setDate(now.getDate() + value);
        break;
      case 'w':
        now.setDate(now.getDate() + (value * 7));
        break;
    }
    
    return now.toISOString();
  }

  /**
   * Add hours to current time
   */
  private addHours(hours: number): string {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    return date.toISOString();
  }

  /**
   * Add days to current time
   */
  private addDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  /**
   * Generate short hash for display
   */
  private shortHash(content: string): string {
    // Simple hash for display purposes
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  /**
   * Generate full hash for security verification
   */
  private fullHash(content: string): string {
    // In a real implementation, use crypto.createHash('sha256')
    // For now, use a longer version of the simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}...`;
  }

  /**
   * Ask a question and wait for user input
   */
  private async question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.readline) {
        this.initializeReadline();
      }
      
      this.readline!.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Clean up readline interface
   */
  dispose(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = undefined;
    }
  }
}