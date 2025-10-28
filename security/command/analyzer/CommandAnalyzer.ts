import { parse as parseShell } from 'shell-quote';
import type { TaintLevel } from '@core/types/security';
import { IMMUTABLE_SECURITY_PATTERNS } from '@security/policy/patterns';

export interface CommandAnalysis {
  command: string;
  baseCommand: string;
  args: string[];
  risks: CommandRisk[];
  suspicious: boolean;
  blocked: boolean;
  requiresApproval: boolean;
}

export interface CommandRisk {
  type: 'INJECTION' | 'DANGEROUS_COMMAND' | 'EXFILTRATION' | 'POLICY_VIOLATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'BLOCKED';
  pattern?: string;
  description: string;
}

export class CommandAnalyzer {
  /**
   * Analyze a command for security risks
   */
  async analyze(command: string, taint?: TaintLevel): Promise<CommandAnalysis> {
    const risks: CommandRisk[] = [];
    
    // 1. Parse command safely with shell-quote
    let parsed: any[];
    try {
      parsed = parseShell(command);
    } catch (error) {
      risks.push({
        type: 'INJECTION',
        severity: 'BLOCKED',
        description: 'Failed to parse command - possible malformed input'
      });
      return this.createAnalysis(command, '', [], risks);
    }
    
    const baseCommand = String(parsed[0] || '');
    const args = parsed.slice(1).map(String);
    
    // 2. Check against OWASP injection patterns
    const injectionRisks = this.checkInjectionPatterns(command);
    risks.push(...injectionRisks);
    
    // 3. Check for dangerous commands
    const commandRisks = this.checkDangerousCommands(baseCommand, args);
    risks.push(...commandRisks);
    
    // 4. Check for exfiltration attempts
    const exfiltrationRisks = this.checkExfiltration(command);
    risks.push(...exfiltrationRisks);
    
    // 5. Extra analysis for tainted data
    if (taint === 'llmOutput' || taint === 'networkLive' || taint === 'networkCached') {
      risks.push({
        type: 'INJECTION',
        severity: 'CRITICAL',
        description: `Attempting to execute ${taint} as command - requires explicit approval`
      });
      
      // Use js-x-ray for deeper analysis
      try {
        const astAnalysis = await runASTAnalysis(command);
        if (astAnalysis.warnings?.length > 0) {
          risks.push({
            type: 'INJECTION',
            severity: 'HIGH',
            description: 'Suspicious patterns detected in command'
          });
        }
      } catch (error) {
        // AST analysis failed, command might be obfuscated
        risks.push({
          type: 'INJECTION',
          severity: 'HIGH',
          description: 'Command appears obfuscated or malformed'
        });
      }
    }
    
    return this.createAnalysis(command, baseCommand, args, risks);
  }
  
  private checkInjectionPatterns(command: string): CommandRisk[] {
    const risks: CommandRisk[] = [];
    
    // OWASP command injection patterns
    const patterns = [
      { regex: /;/, desc: 'Command separator (;)' },
      { regex: /&&/, desc: 'Command chaining (&&)' },
      { regex: /\|\|/, desc: 'Conditional execution (||)' },
      { regex: /\|/, desc: 'Pipe operator (|)' },
      { regex: /\$\(/, desc: 'Command substitution $()' },
      { regex: /`/, desc: 'Backtick substitution' },
      { regex: />/, desc: 'Output redirection (>)' },
      { regex: />>/, desc: 'Append redirection (>>)' },
      { regex: /</, desc: 'Input redirection (<)' },
      { regex: /\n|\r/, desc: 'Newline injection' }
    ];
    
    for (const { regex, desc } of patterns) {
      if (regex.test(command)) {
        risks.push({
          type: 'INJECTION',
          severity: 'HIGH',
          pattern: regex.source,
          description: `Shell injection pattern detected: ${desc}`
        });
      }
    }
    
    return risks;
  }
  
  private checkDangerousCommands(baseCommand: string, args: string[]): CommandRisk[] {
    const risks: CommandRisk[] = [];
    
    // Check absolute blocked commands
    if (IMMUTABLE_SECURITY_PATTERNS.blockedCommands.includes(baseCommand)) {
      risks.push({
        type: 'DANGEROUS_COMMAND',
        severity: 'BLOCKED',
        description: `Command is absolutely forbidden: ${baseCommand}`
      });
      return risks;
    }
    
    // Check dangerous command categories
    const dangerousCommands = {
      critical: ['rm', 'dd', 'format', 'fdisk', 'mkfs'],
      high: ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp'],
      medium: ['chmod', 'chown', 'kill', 'sudo', 'su']
    };
    
    for (const [severity, commands] of Object.entries(dangerousCommands)) {
      if (commands.includes(baseCommand)) {
        // Special check for rm -rf
        if (baseCommand === 'rm' && args.includes('-rf')) {
          const target = args[args.indexOf('-rf') + 1] || args[args.indexOf('-rf') - 1];
          if (target === '/' || target === '/*') {
            risks.push({
              type: 'DANGEROUS_COMMAND',
              severity: 'BLOCKED',
              description: 'Attempting to delete root filesystem!'
            });
            continue;
          }
        }
        
        risks.push({
          type: 'DANGEROUS_COMMAND',
          severity: severity.toUpperCase() as any,
          description: `${baseCommand} is a potentially dangerous command`
        });
      }
    }
    
    return risks;
  }
  
  private checkExfiltration(command: string): CommandRisk[] {
    const risks: CommandRisk[] = [];
    
    // Patterns that might indicate data exfiltration
    const sensitivePatterns = [
      { pattern: /\.ssh/, desc: 'SSH keys' },
      { pattern: /\.aws/, desc: 'AWS credentials' },
      { pattern: /\.env/, desc: 'Environment files' },
      { pattern: /private[_-]?key/i, desc: 'Private keys' },
      { pattern: /password|passwd|pwd/i, desc: 'Password files' },
      { pattern: /secret|token/i, desc: 'Secrets or tokens' },
      { pattern: /\.pem|\.key|\.crt/i, desc: 'Certificate files' },
      { pattern: /\/etc\/shadow/, desc: 'System password file' }
    ];
    
    for (const { pattern, desc } of sensitivePatterns) {
      if (pattern.test(command)) {
        // Check if it's being exfiltrated (curl, nc, etc)
        if (/curl|wget|nc|netcat|ssh|scp/.test(command)) {
          risks.push({
            type: 'EXFILTRATION',
            severity: 'CRITICAL',
            description: `Possible exfiltration of ${desc}`
          });
        } else {
          risks.push({
            type: 'EXFILTRATION',
            severity: 'HIGH',
            description: `Accessing sensitive data: ${desc}`
          });
        }
      }
    }
    
    return risks;
  }
  
  private createAnalysis(
    command: string,
    baseCommand: string,
    args: string[],
    risks: CommandRisk[]
  ): CommandAnalysis {
    const blocked = risks.some(r => r.severity === 'BLOCKED');
    const critical = risks.some(r => r.severity === 'CRITICAL');
    const high = risks.some(r => r.severity === 'HIGH');
    
    return {
      command,
      baseCommand,
      args,
      risks,
      suspicious: risks.length > 0,
      blocked,
      requiresApproval: !blocked && (critical || high)
    };
  }
}
