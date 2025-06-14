# Development Lock File Environment Plan

## Overview

Implement a secure-by-default environment system where mlld automatically adapts its security posture based on whether it's running in a development environment (global lock file exists) or production/secure environment (no global lock file). This provides ergonomic defaults while maintaining strong security boundaries.

## Security Philosophy

```
No locks found → environment: "secure" (production default)
Global lock exists → environment: "dev" (unless overridden) 
Project lock → can override to "secure" (team decision)
```

The presence of a global lock file serves as a reliable indicator of a development machine, enabling appropriate security defaults for each context.

## Implementation Plan

### Phase 1: Environment Detection

```typescript
// Core environment detection logic
class EnvironmentDetector {
  private globalLockPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
  
  async detectEnvironment(): Promise<'dev' | 'secure'> {
    // Check if global lock file exists
    if (await fs.access(this.globalLockPath).then(() => true).catch(() => false)) {
      // Global lock exists - load and check environment setting
      const globalLock = new LockFile(this.globalLockPath);
      const globalData = await globalLock.load();
      
      // Respect explicit environment setting in global lock
      return globalData.environment || 'dev';
    }
    
    // No global lock - default to secure
    return 'secure';
  }
}
```

### Phase 2: Lock File Schema Updates

```typescript
interface LockFileData {
  version: string;
  environment?: 'dev' | 'secure';  // NEW: Environment mode
  allowedEnv?: string[];           // NEW: Allowed environment variables
  imports: Record<string, LockEntry>;
  security?: {
    approvedCommands?: Record<string, CommandApproval>;
    approvedUrls?: Record<string, ImportApproval>;
    approvedPaths?: Record<string, PathApproval>;
    policies?: SecurityPolicy;
  };
  metadata?: {
    mlldVersion: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

### Phase 3: CLI Command Implementation

```bash
# Global development setup
mlld setup --global
# Creates ~/.config/mlld/mlld.lock.json with environment: "dev"

# Check current environment
mlld env status
# Shows: "Environment: dev (global lock file detected)"

# Force secure mode on dev machine (IT override)
mlld setup --global --secure
# Updates global lock to environment: "secure"
```

```typescript
// CLI implementation
export async function setupCommand(options: { global?: boolean; secure?: boolean }) {
  if (options.global) {
    const globalDir = path.join(os.homedir(), '.config', 'mlld');
    const globalLockPath = path.join(globalDir, 'mlld.lock.json');
    
    // Ensure directory exists
    await fs.mkdir(globalDir, { recursive: true });
    
    const environment = options.secure ? 'secure' : 'dev';
    
    const globalLockData: LockFileData = {
      version: '1.0.0',
      environment,
      allowedEnv: [], // Empty by default, explicitly managed
      imports: {},
      security: {
        approvedCommands: {},
        approvedUrls: {},
        approvedPaths: {}
      },
      metadata: {
        mlldVersion: getCurrentVersion(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    
    await fs.writeFile(globalLockPath, JSON.stringify(globalLockData, null, 2));
    
    console.log(`✅ Global mlld environment set to: ${environment}`);
    console.log(`📁 Lock file created: ${globalLockPath}`);
    
    if (environment === 'dev') {
      console.log(`🔧 Development features enabled:`);
      console.log(`   - @DEBUG variable available`);
      console.log(`   - More permissive security defaults`);
    } else {
      console.log(`🔒 Secure mode enabled:`);
      console.log(`   - @DEBUG variable disabled`);
      console.log(`   - Strict security defaults`);
    }
  }
}
```

### Phase 4: Built-in Variable Control

```typescript
// Environment class updates
class Environment {
  private environmentMode: 'dev' | 'secure';
  
  async initialize(): Promise<void> {
    const detector = new EnvironmentDetector();
    this.environmentMode = await detector.detectEnvironment();
    
    // Load lock files based on environment
    await this.loadLockFiles();
    
    // Set up built-in variables
    this.setupBuiltinVariables();
  }
  
  private setupBuiltinVariables(): void {
    // @DEBUG only available in dev environment
    if (this.environmentMode === 'dev') {
      this.setBuiltinVariable('DEBUG', this.createDebugVariable());
    }
    
    // @INPUT always available (but controlled by allowedEnv)
    this.setBuiltinVariable('INPUT', this.createInputVariable());
    
    // Other built-ins...
    this.setBuiltinVariable('TIME', new Date().toISOString());
    this.setBuiltinVariable('PROJECTPATH', this.workingDirectory);
  }
  
  private createInputVariable(): any {
    const allowedEnv = this.getAllowedEnvVars();
    
    // Only include allowed environment variables
    const envData: Record<string, string> = {};
    for (const varName of allowedEnv) {
      if (process.env[varName]) {
        envData[varName] = process.env[varName];
      }
    }
    
    // Merge with stdin data if available
    return { ...this.stdinData, ...envData };
  }
}
```

### Phase 5: Lock File Precedence Implementation

```typescript
class LockFileManager {
  private globalLock?: LockFile;
  private projectLock?: LockFile;
  private environmentMode: 'dev' | 'secure';
  
  async loadLockFiles(): Promise<void> {
    // Always try to load global lock
    const globalPath = path.join(os.homedir(), '.config', 'mlld', 'mlld.lock.json');
    if (await fs.access(globalPath).then(() => true).catch(() => false)) {
      this.globalLock = new LockFile(globalPath);
    }
    
    // Load project lock if exists
    const projectPath = path.join(this.workingDirectory, 'mlld.lock.json');
    if (await fs.access(projectPath).then(() => true).catch(() => false)) {
      this.projectLock = new LockFile(projectPath);
    }
    
    // Determine effective environment
    this.environmentMode = this.determineEnvironment();
  }
  
  private determineEnvironment(): 'dev' | 'secure' {
    // Project can override to secure
    const projectData = this.projectLock?.getData();
    if (projectData?.environment === 'secure') {
      return 'secure';
    }
    
    // Global determines default
    const globalData = this.globalLock?.getData();
    if (globalData?.environment) {
      return globalData.environment;
    }
    
    // Global lock exists but no environment set = dev
    if (this.globalLock) {
      return 'dev';
    }
    
    // No global lock = secure
    return 'secure';
  }
  
  getAllowedEnvVars(): string[] {
    // Merge allowed env vars from global and project
    const global = this.globalLock?.getData()?.allowedEnv || [];
    const project = this.projectLock?.getData()?.allowedEnv || [];
    
    // Project can be more restrictive (intersection)
    if (project.length > 0) {
      return project.filter(env => global.includes(env) || global.length === 0);
    }
    
    return global;
  }
}
```

## Security Benefits

### Development Machines
- **Ergonomic defaults**: `@DEBUG` available, helpful error messages
- **Explicit setup**: `mlld setup --global` makes intent clear
- **IT control**: Organizations can override with `--secure` flag

### Production/Deployment
- **Secure by default**: No global lock = strict security
- **No surprises**: Deployment environments automatically secure
- **Clear behavior**: Missing debug output signals production mode

### Team Collaboration
- **Project override**: Teams can enforce secure mode in project lock
- **Version controlled**: Security posture documented in git
- **Gradual adoption**: Can transition project from dev → secure

## Implementation Timeline

### Day 1: Core Environment Detection
- Implement `EnvironmentDetector` class
- Add environment detection to `Environment.initialize()`
- Update lock file schema with `environment` field

### Day 2: CLI Commands
- Implement `mlld setup --global` command
- Add `mlld env status` for environment checking
- Add `mlld env secure` for IT override scenarios

### Day 3: Built-in Variable Control
- Update `@DEBUG` availability based on environment
- Implement `@INPUT` filtering with `allowedEnv`
- Add environment mode logging and user feedback

### Day 4: Lock File Precedence
- Implement global + project lock file merging
- Add `allowedEnv` precedence rules (project restricts global)
- Test environment override scenarios

### Day 5: Integration & Testing
- End-to-end testing of all scenarios
- Documentation updates
- Error message improvements

## Real-World Scenarios

### Individual Developer
```bash
# First time setup
mlld setup --global
# Creates dev environment, @DEBUG available

mlld my-script.mld
# Works with debug output and permissive defaults
```

### Corporate Developer
```bash
# IT has locked down the machine
cat ~/.config/mlld/mlld.lock.json
# { "environment": "secure", ... }

mlld my-script.mld
# Works in secure mode even for development
```

### CI/CD Pipeline
```bash
# No global lock file in container
mlld deploy-script.mld
# Automatically runs in secure mode, no debug output
```

### Team Project
```json
// Project ./mlld.lock.json
{
  "environment": "secure",
  "allowedEnv": ["NODE_ENV"],
  // ...
}
```
```bash
# Even on dev machines, this project runs securely
mlld team-script.mld
# Secure mode, only NODE_ENV accessible
```

## Success Criteria

1. **✅ Automatic environment detection** - Works without configuration
2. **✅ Ergonomic development** - `mlld setup --global` enables dev features
3. **✅ Secure production** - Deployments default to secure mode
4. **✅ IT compliance** - Organizations can enforce security globally
5. **✅ Team flexibility** - Projects can override environment settings
6. **✅ Clear behavior** - Users understand what mode they're in

## Integration with allowedEnv

The environment system works seamlessly with the `allowedEnv` feature:

```json
// Global dev lock file
{
  "environment": "dev",
  "allowedEnv": ["NODE_ENV", "DEBUG", "GITHUB_TOKEN", "ANTHROPIC_API_KEY"]
}
```

```json
// Project production-testing lock file
{
  "environment": "secure", 
  "allowedEnv": ["NODE_ENV"]  // More restrictive than global
}
```

This enables developers to have broad environment access globally while specific projects maintain tight security boundaries.

## Migration Strategy

### Existing Users
- No breaking changes - continues working without global lock
- Optional: Run `mlld setup --global` to enable dev features
- Automatic detection means no forced migration

### New Users
- Documentation recommends `mlld setup --global` for development
- First-run experience can suggest setup
- Clear error messages when environment variables aren't accessible

This plan provides the foundation for a security-conscious development experience that scales from individual developers to enterprise deployments while maintaining mlld's philosophy of explicit, auditable behavior.