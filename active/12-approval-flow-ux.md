# Workstream: Approval Flow UX

## Overview
Implement the security approval flow as described in SECURITY-VISION.md, with different rules for local files, private resolvers, public registry, and URLs. Focus on making security visible without being annoying.

## Current State
- Basic ImportApproval exists ✅
- Shows content preview ✅
- But no trust persistence ❌
- No context-aware rules ❌
- No batch approvals ❌

## Implementation Plan

### Phase 1: Context-Aware Trust Rules (Day 1)

```typescript
// Determine trust context for different sources
export enum TrustContext {
  LOCAL_FILE = 'local_file',        // User's own files
  PRIVATE_RESOLVER = 'private_resolver', // Custom resolver
  PUBLIC_REGISTRY = 'public_registry',   // @user/module
  URL_IMPORT = 'url_import',            // Direct URL
  URL_CONTENT = 'url_content'           // URL in variable
}

class TrustEvaluator {
  async evaluateTrust(source: string, content: string): Promise<TrustDecision> {
    const context = this.determineContext(source);
    
    switch (context) {
      case TrustContext.LOCAL_FILE:
        // Always trust, but check for advisories
        return {
          trusted: true,
          requiresApproval: false,
          checkAdvisories: true
        };
        
      case TrustContext.PRIVATE_RESOLVER:
        // Check if resolver is approved
        const resolver = this.getResolverForSource(source);
        if (await this.isResolverApproved(resolver)) {
          return { trusted: true, requiresApproval: false };
        }
        return {
          trusted: false,
          requiresApproval: true,
          prompt: `Do you trust resolver '${resolver}'?`
        };
        
      case TrustContext.PUBLIC_REGISTRY:
        // Always require approval for new versions
        return {
          trusted: false,
          requiresApproval: true,
          showCommands: true, // Show what commands it will run
          prompt: 'Review module permissions'
        };
        
      case TrustContext.URL_IMPORT:
        // Check cache/approvals
        return {
          trusted: false,
          requiresApproval: true,
          allowTimeBasedApproval: true
        };
        
      case TrustContext.URL_CONTENT:
        // Safe until executed
        return {
          trusted: true,
          requiresApproval: false,
          trackTaint: true
        };
    }
  }
}
```

### Phase 2: Module Command Scanner (Day 2)

```typescript
// Scan modules for commands they'll execute
class ModuleScanner {
  async scanForCommands(content: string): Promise<CommandSummary> {
    const ast = parse(content);
    const commands = new Set<string>();
    const risks = new Map<string, RiskLevel>();
    
    // Walk AST for @run and @exec directives
    walkAST(ast, {
      visitRun: (node) => {
        const command = this.extractCommand(node);
        const baseCmd = command.split(' ')[0];
        commands.add(baseCmd);
        risks.set(baseCmd, this.assessRisk(command));
      },
      visitExec: (node) => {
        const command = this.extractExecCommand(node);
        const baseCmd = command.split(' ')[0];
        commands.add(baseCmd);
        risks.set(baseCmd, this.assessRisk(command));
      }
    });
    
    return {
      commands: Array.from(commands),
      risks,
      summary: this.generateSummary(commands, risks)
    };
  }
  
  private assessRisk(command: string): RiskLevel {
    // High risk patterns
    if (/rm\s+-rf|sudo|chmod\s+777|curl.*\|.*sh/.test(command)) {
      return 'high';
    }
    
    // Medium risk - network or file operations
    if (/curl|wget|cp|mv|cat\s+>/.test(command)) {
      return 'medium';
    }
    
    // Low risk - read operations
    return 'low';
  }
  
  private generateSummary(commands: Set<string>, risks: Map<string, RiskLevel>): string {
    const highRisk = Array.from(risks.entries()).filter(([_, level]) => level === 'high');
    const mediumRisk = Array.from(risks.entries()).filter(([_, level]) => level === 'medium');
    
    let summary = `This module will execute ${commands.size} command(s):\n`;
    
    if (highRisk.length > 0) {
      summary += chalk.red(`\n⚠️  High Risk Commands:\n`);
      highRisk.forEach(([cmd]) => summary += `  - ${cmd}\n`);
    }
    
    if (mediumRisk.length > 0) {
      summary += chalk.yellow(`\n⚡ Medium Risk Commands:\n`);
      mediumRisk.forEach(([cmd]) => summary += `  - ${cmd}\n`);
    }
    
    const lowRisk = commands.size - highRisk.length - mediumRisk.length;
    if (lowRisk > 0) {
      summary += chalk.gray(`\n✓ ${lowRisk} low risk command(s)\n`);
    }
    
    return summary;
  }
}
```

### Phase 3: Enhanced Approval UI (Day 3)

```typescript
// Better approval prompts with context
class ApprovalUI {
  async promptModuleApproval(
    modulePath: string,
    content: string,
    commandSummary: CommandSummary
  ): Promise<ApprovalDecision> {
    console.clear();
    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.blue.bold('Module Security Review'));
    console.log(chalk.blue('━'.repeat(60)));
    
    console.log(`\n📦 Module: ${chalk.cyan(modulePath)}`);
    console.log(`📏 Size: ${content.length} bytes`);
    console.log(`🔑 Hash: ${this.shortHash(content)}\n`);
    
    // Show command summary
    console.log(commandSummary.summary);
    
    // Show code preview if requested
    const { showCode } = await prompts({
      type: 'confirm',
      name: 'showCode',
      message: 'View module code?',
      initial: false
    });
    
    if (showCode) {
      this.showCodePreview(content);
    }
    
    // Approval prompt
    const { decision } = await prompts({
      type: 'select',
      name: 'decision',
      message: 'Approve this module?',
      choices: [
        { title: '✅ Approve', value: 'approve' },
        { title: '❌ Reject', value: 'reject' },
        { title: '🔍 More info', value: 'info' }
      ]
    });
    
    if (decision === 'info') {
      await this.showDetailedInfo(modulePath, content, commandSummary);
      return this.promptModuleApproval(modulePath, content, commandSummary);
    }
    
    return {
      approved: decision === 'approve',
      trust: decision === 'approve' ? 'always' : 'never'
    };
  }
  
  async promptURLApproval(url: string, content: string): Promise<ApprovalDecision> {
    console.log(chalk.yellow(`\n🔒 URL Import Approval Required`));
    console.log(chalk.gray(`URL: ${url}`));
    console.log(chalk.gray(`Domain: ${new URL(url).hostname}`));
    
    // Quick trust options
    const { quick } = await prompts({
      type: 'autocomplete',
      name: 'quick',
      message: 'Trust this URL?',
      choices: [
        { title: 'Once', value: 'o' },
        { title: 'Always', value: 'a' },
        { title: 'Never', value: 'n' },
        { title: 'For 1 hour', value: '1h' },
        { title: 'For 1 day', value: '1d' },
        { title: 'For 1 week', value: '1w' },
        { title: 'Custom duration...', value: 'custom' }
      ]
    });
    
    // Handle quick options
    switch (quick) {
      case 'o': return { approved: true, trust: 'once' };
      case 'a': return { approved: true, trust: 'always' };
      case 'n': return { approved: false, trust: 'never' };
      case '1h': return { approved: true, trust: 'always', expiresAt: this.addHours(1) };
      case '1d': return { approved: true, trust: 'always', expiresAt: this.addDays(1) };
      case '1w': return { approved: true, trust: 'always', expiresAt: this.addDays(7) };
      case 'custom':
        const duration = await this.promptCustomDuration();
        return { approved: true, trust: 'always', expiresAt: duration };
    }
  }
}
```

### Phase 4: Batch Approval System (Day 4)

```typescript
// Future: Group related approvals
interface BatchApproval {
  primary: string;           // Main module
  dependencies: string[];    // Its dependencies
  totalCommands: number;
  riskSummary: RiskSummary;
}

class BatchApprovalUI {
  async promptBatchApproval(batch: BatchApproval): Promise<BatchDecision> {
    console.clear();
    console.log(chalk.blue.bold('🔗 Module Dependency Tree'));
    console.log();
    
    // Show tree structure
    console.log(chalk.cyan(batch.primary));
    batch.dependencies.forEach(dep => {
      console.log(chalk.gray(`  └─ ${dep}`));
    });
    
    console.log(`\n📊 Total modules: ${batch.dependencies.length + 1}`);
    console.log(`⚡ Total commands: ${batch.totalCommands}`);
    
    // Risk summary
    if (batch.riskSummary.high > 0) {
      console.log(chalk.red(`⚠️  High risk: ${batch.riskSummary.high} commands`));
    }
    if (batch.riskSummary.medium > 0) {
      console.log(chalk.yellow(`⚡ Medium risk: ${batch.riskSummary.medium} commands`));
    }
    console.log(chalk.green(`✓ Low risk: ${batch.riskSummary.low} commands`));
    
    const { decision } = await prompts({
      type: 'select',
      name: 'decision',
      message: 'Approve all modules?',
      choices: [
        { title: '✅ Approve all', value: 'all' },
        { title: '🔍 Review individually', value: 'individual' },
        { title: '❌ Reject all', value: 'none' }
      ]
    });
    
    return {
      approveAll: decision === 'all',
      reviewIndividually: decision === 'individual',
      rejectAll: decision === 'none'
    };
  }
}
```

### Phase 5: Advisory Integration (Day 5)

```typescript
// Show advisories even for trusted content
class AdvisoryChecker {
  async checkAndDisplay(source: string, content: string): Promise<void> {
    const advisories = await this.checkAdvisories(source, content);
    
    if (advisories.length === 0) return;
    
    console.log(chalk.yellow('\n⚠️  Security Advisories Found:'));
    
    for (const advisory of advisories) {
      const icon = this.getSeverityIcon(advisory.severity);
      console.log(`\n${icon} ${advisory.id}: ${advisory.title}`);
      console.log(chalk.gray(`   Severity: ${advisory.severity}`));
      console.log(chalk.gray(`   ${advisory.description}`));
      
      if (advisory.recommendation) {
        console.log(chalk.cyan(`   Recommendation: ${advisory.recommendation}`));
      }
    }
    
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Continue despite advisories?',
      initial: false
    });
    
    if (!proceed) {
      throw new MlldSecurityError('Execution cancelled due to security advisories');
    }
  }
  
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return chalk.red('🚨');
      case 'high': return chalk.red('⚠️');
      case 'medium': return chalk.yellow('⚡');
      case 'low': return chalk.blue('ℹ️');
      default: return '📌';
    }
  }
}
```

## Testing

1. Different trust contexts behave correctly
2. Module command scanning accuracy
3. Approval UI flow and usability
4. Time-based approval expiry
5. Advisory display and handling

## Success Criteria

- [ ] Local files trusted automatically
- [ ] Private resolver approval persisted
- [ ] Module commands clearly displayed
- [ ] URL approvals support time-based trust
- [ ] Security is visible but not annoying