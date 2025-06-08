# Workstream: Lock File Automation

## Overview
Automate lock file creation and updates. Currently lock files must be manually managed. Need automatic creation on first import and updates after approvals.

## Current State
- LockFile class exists with full API ✅
- CLI uses lock files for install ✅
- But no automatic creation ❌
- Approval decisions not saved ❌
- No global lock file support ❌

## Implementation Plan

### Phase 1: Auto-Create Lock Files (Day 1)

```typescript
// In Environment.ts
class Environment {
  private lockFile?: LockFile;
  private globalLockFile?: LockFile;
  
  async initialize(): Promise<void> {
    // Auto-create project lock file if needed
    await this.ensureProjectLockFile();
    
    // Load global lock file if exists
    await this.loadGlobalLockFile();
  }
  
  private async ensureProjectLockFile(): Promise<void> {
    const lockPath = path.join(this.workingDirectory, 'mlld.lock.json');
    
    if (!await this.fileSystem.exists(lockPath)) {
      // Create initial lock file
      const initialData: LockFileData = {
        version: '1.0.0',
        imports: {},
        metadata: {
          mlldVersion: MLLD_VERSION,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      
      await this.fileSystem.writeFile(
        lockPath,
        JSON.stringify(initialData, null, 2)
      );
    }
    
    this.lockFile = new LockFile(lockPath);
  }
  
  private async loadGlobalLockFile(): Promise<void> {
    const globalPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
    
    if (await this.fileSystem.exists(globalPath)) {
      this.globalLockFile = new LockFile(globalPath);
    }
  }
}
```

### Phase 2: Save Import Approvals (Day 2)

```typescript
// Update ImportApproval to save decisions
class ImportApproval {
  async checkApproval(url: string, content: string): Promise<boolean> {
    // Check existing approval in lock files
    const existingApproval = await this.findExistingApproval(url);
    if (existingApproval) {
      return this.evaluateExistingApproval(existingApproval);
    }
    
    // Show content preview and prompt
    const decision = await this.promptUser(url, content);
    
    // Save decision to lock file
    await this.saveApprovalDecision(url, content, decision);
    
    return decision.approved;
  }
  
  private async saveApprovalDecision(
    url: string,
    content: string,
    decision: ApprovalDecision
  ): Promise<void> {
    const lockFile = this.env.getLockFile();
    if (!lockFile) return;
    
    const entry: LockEntry = {
      resolved: url,
      integrity: await this.calculateIntegrity(content),
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown',
      trust: decision.trust // 'always', 'once', 'never'
    };
    
    // Add expiry for time-based approvals
    if (decision.expiresAt) {
      entry.expiresAt = decision.expiresAt;
    }
    
    await lockFile.addImport(url, entry);
  }
}
```

### Phase 3: Trust Decision UI (Day 3)

```typescript
// Enhanced approval prompt
interface ApprovalDecision {
  approved: boolean;
  trust: 'always' | 'once' | 'never';
  expiresAt?: string;
}

class ImportApproval {
  private async promptUser(url: string, content: string): Promise<ApprovalDecision> {
    console.log(chalk.yellow(`\n🔒 Security: Import requires approval`));
    console.log(chalk.gray(`URL: ${url}`));
    console.log(chalk.gray(`Size: ${content.length} bytes`));
    console.log(chalk.gray(`Hash: ${this.calculateShortHash(content)}`));
    
    // Show content preview
    const preview = this.getContentPreview(content);
    console.log(chalk.gray('\nPreview:'));
    console.log(preview);
    
    // Enhanced prompt with options
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Trust this import?',
      choices: [
        { title: 'Once (this session)', value: 'once' },
        { title: 'Always', value: 'always' },
        { title: 'For duration...', value: 'duration' },
        { title: 'Never', value: 'never' },
        { title: 'Cancel', value: 'cancel' }
      ]
    });
    
    if (action === 'cancel') {
      return { approved: false, trust: 'never' };
    }
    
    if (action === 'duration') {
      const { duration } = await prompts({
        type: 'text',
        name: 'duration',
        message: 'Trust for how long? (e.g., 1h, 7d, 30d)',
        validate: value => this.validateDuration(value)
      });
      
      const expiresAt = this.calculateExpiry(duration);
      return { approved: true, trust: 'always', expiresAt };
    }
    
    return {
      approved: action !== 'never',
      trust: action as 'always' | 'once' | 'never'
    };
  }
}
```

### Phase 4: Command Approval Persistence (Day 4)

```typescript
// Extend lock file for command approvals
interface LockFileData {
  version: string;
  imports: Record<string, LockEntry>;
  security?: {
    approvedCommands?: Record<string, CommandApproval>;
    blockedCommands?: string[];
    commandPatterns?: CommandPattern[];
  };
}

interface CommandApproval {
  command: string;
  approvedAt: string;
  approvedBy: string;
  trust: 'always' | 'once' | 'never';
  expiresAt?: string;
}

// Save command approvals
class SecurityManager {
  async checkCommand(command: string, context?: SecurityContext): Promise<SecurityDecision> {
    // Check existing approvals
    const approval = await this.findCommandApproval(command);
    if (approval) {
      return this.evaluateCommandApproval(approval);
    }
    
    // Normal security check...
    const decision = await this.evaluateCommand(command, context);
    
    if (decision.requiresApproval) {
      const userDecision = await this.promptCommandApproval(command);
      
      // Save to lock file
      await this.saveCommandApproval(command, userDecision);
      
      return userDecision;
    }
    
    return decision;
  }
}
```

### Phase 5: Lock File Precedence (Day 5)

```typescript
// Implement precedence between global and project
class LockFileResolver {
  constructor(
    private globalLock?: LockFile,
    private projectLock?: LockFile
  ) {}
  
  async findImportApproval(url: string): Promise<LockEntry | null> {
    // Check project first (can override global)
    if (this.projectLock) {
      const projectEntry = this.projectLock.getImport(url);
      if (projectEntry) {
        // Project can be MORE restrictive
        if (projectEntry.trust === 'never') {
          return projectEntry; // Block wins
        }
      }
    }
    
    // Check global
    if (this.globalLock) {
      const globalEntry = this.globalLock.getImport(url);
      if (globalEntry) {
        // Global 'never' cannot be overridden
        if (globalEntry.trust === 'never') {
          return globalEntry;
        }
        
        // Use project entry if exists, else global
        return this.projectLock?.getImport(url) || globalEntry;
      }
    }
    
    // Return project entry if no global
    return this.projectLock?.getImport(url) || null;
  }
  
  getSecurityPolicy(): SecurityPolicy {
    const global = this.globalLock?.getSecurityPolicy() || {};
    const project = this.projectLock?.getSecurityPolicy() || {};
    
    // Merge with security precedence (restrictive wins)
    return this.mergeSecurityPolicies(global, project);
  }
}
```

## Testing

1. Lock file auto-creation on first import
2. Approval persistence across sessions
3. Time-based approval expiry
4. Global vs project precedence
5. Command approval flow

## Success Criteria

- [ ] Lock files created automatically
- [ ] Import approvals saved and reused
- [ ] Command approvals persisted
- [ ] Global lock file provides defaults
- [ ] Trust decisions expire correctly