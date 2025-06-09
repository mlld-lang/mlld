import { parse } from '@grammar/parser';
import type { MlldNode } from '@core/types';
import { logger } from '@core/utils/logger';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface CommandSummary {
  commands: string[];
  risks: Map<string, RiskLevel>;
  summary: string;
  totalCommands: number;
  riskCounts: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface SecurityPattern {
  pattern: RegExp;
  risk: RiskLevel;
  description: string;
}

/**
 * Scans mlld modules for commands they will execute and assesses security risks
 */
export class ModuleScanner {
  private securityPatterns: SecurityPattern[] = [
    // High risk patterns - destructive operations
    {
      pattern: /rm\s+-rf|sudo|chmod\s+777/i,
      risk: 'high',
      description: 'Destructive file operations or privilege escalation'
    },
    {
      pattern: /curl.*\|.*sh|wget.*\|.*sh/i,
      risk: 'high',
      description: 'Downloads and executes remote scripts'
    },
    {
      pattern: /eval\s*\(|exec\s*\(/i,
      risk: 'high',
      description: 'Dynamic code execution'
    },
    {
      pattern: /\$\(.*\)|`.*`/,
      risk: 'high',
      description: 'Command substitution'
    },
    
    // Medium risk patterns - network/file operations
    {
      pattern: /curl|wget|nc|netcat/i,
      risk: 'medium',
      description: 'Network operations'
    },
    {
      pattern: /cp|mv|mkdir|rmdir/i,
      risk: 'medium',
      description: 'File system modifications'
    },
    {
      pattern: /cat\s+>|echo\s+>|>\s*[^>]/,
      risk: 'medium',
      description: 'File writing operations'
    },
    {
      pattern: /npm\s+install|pip\s+install|gem\s+install/i,
      risk: 'medium',
      description: 'Package installation'
    },
    {
      pattern: /git\s+clone|git\s+pull/i,
      risk: 'medium',
      description: 'Repository operations'
    },
    
    // Low risk patterns are anything else (read operations, etc.)
  ];

  /**
   * Scan module content for commands and assess risks
   */
  async scanForCommands(content: string): Promise<CommandSummary> {
    try {
      // First try AST parsing
      const parseResult = await parse(content);
      
      const commands = new Set<string>();
      const risks = new Map<string, RiskLevel>();
      
      if (parseResult.success && parseResult.ast) {
        // Walk the AST to find commands
        this.walkAST(parseResult.ast, commands, risks);
      }
      
      // If AST parsing didn't find commands, fall back to regex
      if (commands.size === 0) {
        this.scanWithRegex(content, commands, risks);
      }
      
      // Generate summary
      const summary = this.generateSummary(commands, risks);
      const riskCounts = this.calculateRiskCounts(risks);
      
      return {
        commands: Array.from(commands),
        risks,
        summary,
        totalCommands: commands.size,
        riskCounts
      };
    } catch (error) {
      logger.error('ModuleScanner: Error scanning content:', error);
      return this.createEmptySummary();
    }
  }

  /**
   * Fallback regex-based command detection
   */
  private scanWithRegex(
    content: string, 
    commands: Set<string>, 
    risks: Map<string, RiskLevel>
  ): void {
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
        const baseCommand = this.extractBaseCommand(command.trim());
        if (baseCommand && !commands.has(baseCommand)) {
          commands.add(baseCommand);
          risks.set(baseCommand, this.assessRisk(command));
        }
      }
    }
  }

  /**
   * Walk AST to find @run and @exec directives
   */
  private walkAST(
    nodes: MlldNode | MlldNode[], 
    commands: Set<string>, 
    risks: Map<string, RiskLevel>
  ): void {
    const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
    
    for (const node of nodeArray) {
      if (!node) continue;
      
      try {
        // Handle different directive types
        if (node.type === 'directive') {
          // Check directive name
          const directiveName = this.extractDirectiveName(node);
          if (directiveName === 'run') {
            const command = this.extractRunCommand(node);
            if (command) {
              const baseCmd = this.extractBaseCommand(command);
              commands.add(baseCmd);
              risks.set(baseCmd, this.assessRisk(command));
            }
          } else if (directiveName === 'exec') {
            const command = this.extractExecCommand(node);
            if (command) {
              const baseCmd = this.extractBaseCommand(command);
              commands.add(baseCmd);
              risks.set(baseCmd, this.assessRisk(command));
            }
          }
        }
        
        // Also handle direct type matching for backward compatibility
        if (node.type === 'run') {
          const command = this.extractRunCommand(node);
          if (command) {
            const baseCmd = this.extractBaseCommand(command);
            commands.add(baseCmd);
            risks.set(baseCmd, this.assessRisk(command));
          }
        }
        
        if (node.type === 'exec') {
          const command = this.extractExecCommand(node);
          if (command) {
            const baseCmd = this.extractBaseCommand(command);
            commands.add(baseCmd);
            risks.set(baseCmd, this.assessRisk(command));
          }
        }
        
        // Recursively process nested nodes
        if (node.children && Array.isArray(node.children)) {
          this.walkAST(node.children, commands, risks);
        }
        
        // Process values array if present
        if (node.values && Array.isArray(node.values)) {
          this.walkAST(node.values, commands, risks);
        }
        
        // Also check for any nested arrays/objects
        if (typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) {
            if (Array.isArray(value)) {
              this.walkAST(value, commands, risks);
            } else if (value && typeof value === 'object' && value.type) {
              this.walkAST(value as MlldNode, commands, risks);
            }
          }
        }
      } catch (error) {
        logger.debug('ModuleScanner: Error processing node:', error);
        // Continue processing other nodes
      }
    }
  }

  /**
   * Extract directive name from a directive node
   */
  private extractDirectiveName(node: any): string | null {
    if (node.name) {
      return typeof node.name === 'string' ? node.name : this.extractStringFromNode(node.name);
    }
    if (node.values?.name) {
      return this.extractStringFromNode(node.values.name);
    }
    return null;
  }

  /**
   * Extract command from @run directive
   */
  private extractRunCommand(node: any): string | null {
    try {
      // Look for command in various possible locations
      if (node.values?.command) {
        return this.extractStringFromNode(node.values.command);
      }
      
      if (node.command) {
        return this.extractStringFromNode(node.command);
      }
      
      // Check for bracket content
      if (node.values?.content) {
        return this.extractStringFromNode(node.values.content);
      }
      
      // Check for rhs (right-hand side)
      if (node.values?.rhs) {
        return this.extractStringFromNode(node.values.rhs);
      }
      
      if (node.rhs) {
        return this.extractStringFromNode(node.rhs);
      }
      
      return null;
    } catch (error) {
      logger.debug('ModuleScanner: Error extracting run command:', error);
      return null;
    }
  }

  /**
   * Extract command from @exec directive
   */
  private extractExecCommand(node: any): string | null {
    try {
      // @exec defines reusable commands, look for the command definition
      if (node.values?.definition) {
        return this.extractRunCommand(node.values.definition);
      }
      
      if (node.definition) {
        return this.extractRunCommand(node.definition);
      }
      
      return null;
    } catch (error) {
      logger.debug('ModuleScanner: Error extracting exec command:', error);
      return null;
    }
  }

  /**
   * Extract string content from AST node
   */
  private extractStringFromNode(node: any): string | null {
    if (!node) return null;
    
    if (typeof node === 'string') {
      return node;
    }
    
    if (node.raw) {
      return node.raw;
    }
    
    if (node.content) {
      return node.content;
    }
    
    if (Array.isArray(node)) {
      // Try to join array elements
      return node.map(item => this.extractStringFromNode(item)).filter(Boolean).join(' ');
    }
    
    return null;
  }

  /**
   * Extract base command (first word) from full command
   */
  private extractBaseCommand(command: string): string {
    // Remove common prefixes and get the actual command
    const cleaned = command.trim()
      .replace(/^sudo\s+/, '')  // Remove sudo prefix
      .replace(/^env\s+\w+=\w+\s+/, '') // Remove env var assignments
      .replace(/^\w+=\w+\s+/, ''); // Remove simple var assignments
    
    // Get first word (the actual command)
    const firstWord = cleaned.split(/\s+/)[0];
    
    // Handle command substitution and pipes
    if (firstWord.includes('|')) {
      return firstWord.split('|')[0].trim();
    }
    
    return firstWord;
  }

  /**
   * Assess risk level of a command
   */
  private assessRisk(command: string): RiskLevel {
    // Check against security patterns
    for (const pattern of this.securityPatterns) {
      if (pattern.pattern.test(command)) {
        return pattern.risk;
      }
    }
    
    // Default to low risk for unmatched commands
    return 'low';
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(commands: Set<string>, risks: Map<string, RiskLevel>): string {
    const riskCounts = this.calculateRiskCounts(risks);
    
    let summary = `This module will execute ${commands.size} command(s):\n`;
    
    if (riskCounts.high > 0) {
      summary += `\n⚠️  High Risk Commands (${riskCounts.high}):\n`;
      for (const [cmd, level] of risks.entries()) {
        if (level === 'high') {
          summary += `  - ${cmd}\n`;
        }
      }
    }
    
    if (riskCounts.medium > 0) {
      summary += `\n⚡ Medium Risk Commands (${riskCounts.medium}):\n`;
      for (const [cmd, level] of risks.entries()) {
        if (level === 'medium') {
          summary += `  - ${cmd}\n`;
        }
      }
    }
    
    if (riskCounts.low > 0) {
      summary += `\n✓ ${riskCounts.low} low risk command(s)\n`;
    }
    
    if (commands.size === 0) {
      summary = 'This module does not contain any executable commands.';
    }
    
    return summary;
  }

  /**
   * Calculate risk counts
   */
  private calculateRiskCounts(risks: Map<string, RiskLevel>): {
    high: number;
    medium: number;
    low: number;
  } {
    const counts = { high: 0, medium: 0, low: 0 };
    
    for (const risk of risks.values()) {
      counts[risk]++;
    }
    
    return counts;
  }

  /**
   * Create empty summary for error cases
   */
  private createEmptySummary(): CommandSummary {
    return {
      commands: [],
      risks: new Map(),
      summary: 'Unable to scan module content for commands.',
      totalCommands: 0,
      riskCounts: { high: 0, medium: 0, low: 0 }
    };
  }

  /**
   * Get detailed risk explanation for a command
   */
  getRiskExplanation(command: string): string {
    for (const pattern of this.securityPatterns) {
      if (pattern.pattern.test(command)) {
        return pattern.description;
      }
    }
    return 'Standard command execution';
  }

  /**
   * Check if content contains any high-risk commands
   */
  async hasHighRiskCommands(content: string): Promise<boolean> {
    const summary = await this.scanForCommands(content);
    return summary.riskCounts.high > 0;
  }

  /**
   * Get security score (0-100, higher is safer)
   */
  async getSecurityScore(content: string): Promise<number> {
    const summary = await this.scanForCommands(content);
    
    if (summary.totalCommands === 0) {
      return 100; // No commands = perfectly safe
    }
    
    // Weight risks: high=-30, medium=-10, low=-2
    const penalty = (summary.riskCounts.high * 30) + 
                   (summary.riskCounts.medium * 10) + 
                   (summary.riskCounts.low * 2);
    
    const score = Math.max(0, 100 - penalty);
    return Math.round(score);
  }
}