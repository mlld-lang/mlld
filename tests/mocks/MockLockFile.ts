import type { LockFileConfig } from '../utils/EnvironmentFactory';

export interface LockEntry {
  resolved: string;
  integrity: string;
  approvedAt: string;
  approvedBy: string;
  trust: 'always' | 'once' | 'never' | 'pattern';
  expiresAt?: string;
  ttl?: any;
}

export interface CommandApproval {
  trust: 'always' | 'once' | 'never' | 'pattern';
  ttl?: string;
  approvedAt?: string;
  approvedBy?: string;
  expiresAt?: string;
}

export interface SecurityPolicy {
  commands?: {
    default?: 'allow' | 'verify' | 'block';
    allowed?: string[];
    blocked?: string[];
    trustedPatterns?: string[];
  };
  paths?: {
    default?: 'allow' | 'verify' | 'block';
    allowed?: string[];
    blocked?: string[];
  };
  imports?: {
    default?: 'allow' | 'verify' | 'block';
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  resolvers?: {
    default?: 'allow' | 'verify' | 'block';
    allowed?: string[];
    blocked?: string[];
  };
}

export interface LockFileData {
  version: string;
  imports: Record<string, LockEntry>;
  metadata: {
    mlldVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  security?: {
    commands?: SecurityPolicy['commands'];
    paths?: SecurityPolicy['paths'];
    imports?: SecurityPolicy['imports'];
    resolvers?: SecurityPolicy['resolvers'];
    approvedCommands?: Record<string, CommandApproval>;
    blockedCommands?: string[];
  };
  registries?: Record<string, any>;
}

export interface LockFileOperation {
  operation: 'read' | 'write' | 'addImport' | 'addCommandApproval' | 'removeCommandApproval' | 'save' | 'load';
  data?: any;
  key?: string;
  timestamp: number;
}

/**
 * Mock Lock File for testing with comprehensive operation tracking
 */
export class MockLockFile {
  private config: LockFileConfig;
  private data: LockFileData;
  private operations: LockFileOperation[] = [];
  private readCount = 0;
  private writeCount = 0;

  constructor(config: LockFileConfig) {
    this.config = config;
    this.data = config.initialData || this.createInitialData();
  }

  /**
   * Get all imports from lock file
   */
  getAllImports(): Record<string, LockEntry> {
    this.recordOperation('read', { operation: 'getAllImports' });
    return { ...this.data.imports };
  }

  /**
   * Get specific import entry
   */
  getImport(key: string): LockEntry | undefined {
    this.recordOperation('read', { operation: 'getImport', key });
    return this.data.imports[key];
  }

  /**
   * Add import entry
   */
  async addImport(key: string, entry: LockEntry): Promise<void> {
    this.data.imports[key] = entry;
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('addImport', { key, entry });
    
    if (this.config.autoCreate) {
      await this.save();
    }
  }

  /**
   * Remove import entry
   */
  async removeImport(key: string): Promise<void> {
    delete this.data.imports[key];
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('write', { operation: 'removeImport', key });
    
    if (this.config.autoCreate) {
      await this.save();
    }
  }

  /**
   * Get security policy
   */
  getSecurityPolicy(): SecurityPolicy {
    this.recordOperation('read', { operation: 'getSecurityPolicy' });
    return this.data.security || this.getDefaultSecurityPolicy();
  }

  /**
   * Set security policy
   */
  async setSecurityPolicy(policy: SecurityPolicy): Promise<void> {
    this.data.security = { ...this.data.security, ...policy };
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('write', { operation: 'setSecurityPolicy', policy });
    
    if (this.config.autoCreate) {
      await this.save();
    }
  }

  /**
   * Get command approval
   */
  async getCommandApproval(command: string): Promise<CommandApproval | undefined> {
    this.recordOperation('read', { operation: 'getCommandApproval', key: command });
    return this.data.security?.approvedCommands?.[command];
  }

  /**
   * Add command approval
   */
  async addCommandApproval(command: string, approval: CommandApproval): Promise<void> {
    if (!this.data.security) {
      this.data.security = {};
    }
    if (!this.data.security.approvedCommands) {
      this.data.security.approvedCommands = {};
    }
    
    this.data.security.approvedCommands[command] = {
      ...approval,
      approvedAt: approval.approvedAt || new Date().toISOString(),
      approvedBy: approval.approvedBy || 'test-user'
    };
    
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('addCommandApproval', { command, approval });
    
    if (this.config.autoCreate) {
      await this.save();
    }
  }

  /**
   * Remove command approval
   */
  async removeCommandApproval(command: string): Promise<void> {
    if (this.data.security?.approvedCommands) {
      delete this.data.security.approvedCommands[command];
      this.data.metadata.updatedAt = new Date().toISOString();
      this.recordOperation('write', { operation: 'removeCommandApproval', key: command });
      
      if (this.config.autoCreate) {
        await this.save();
      }
    }
  }

  /**
   * Get registries configuration
   */
  getRegistries(): Record<string, any> {
    this.recordOperation('read', { operation: 'getRegistries' });
    return this.data.registries || {};
  }

  /**
   * Set registries configuration
   */
  async setRegistries(registries: Record<string, any>): Promise<void> {
    this.data.registries = registries;
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('write', { operation: 'setRegistries', registries });
    
    if (this.config.autoCreate) {
      await this.save();
    }
  }

  /**
   * Save lock file (mock implementation)
   */
  async save(): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Cannot save to read-only lock file');
    }
    
    this.data.metadata.updatedAt = new Date().toISOString();
    this.recordOperation('save', { data: this.getDataSnapshot() });
    this.writeCount++;
  }

  /**
   * Load lock file (mock implementation)
   */
  async load(): Promise<void> {
    this.recordOperation('load');
    this.readCount++;
    // In mock, data is already available, so this is a no-op
  }

  /**
   * Check if lock file exists (mock implementation)
   */
  exists(): boolean {
    return !this.config.readonly; // Simple mock logic
  }

  // === Mock Configuration Methods ===

  /**
   * Pre-populate lock file with test data
   */
  mockImportEntry(key: string, entry: Partial<LockEntry>): void {
    const fullEntry: LockEntry = {
      resolved: entry.resolved || key,
      integrity: entry.integrity || 'mock-hash-' + Date.now(),
      approvedAt: entry.approvedAt || new Date().toISOString(),
      approvedBy: entry.approvedBy || 'test-user',
      trust: entry.trust || 'always',
      ...entry
    };
    
    this.data.imports[key] = fullEntry;
  }

  /**
   * Pre-populate command approvals
   */
  mockCommandApproval(command: string, approval: Partial<CommandApproval>): void {
    if (!this.data.security) {
      this.data.security = {};
    }
    if (!this.data.security.approvedCommands) {
      this.data.security.approvedCommands = {};
    }
    
    this.data.security.approvedCommands[command] = {
      trust: 'always',
      approvedAt: new Date().toISOString(),
      approvedBy: 'test-user',
      ...approval
    };
  }

  /**
   * Mock security policy
   */
  mockSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.data.security = {
      ...this.data.security,
      ...policy
    };
  }

  /**
   * Set read-only mode for testing error conditions
   */
  setReadOnly(readonly: boolean): void {
    this.config.readonly = readonly;
  }

  // === Verification Methods ===

  /**
   * Get verification data for test assertions
   */
  getVerificationData(): {
    reads: number;
    writes: number;
    operations: LockFileOperation[];
  } {
    return {
      reads: this.readCount,
      writes: this.writeCount,
      operations: [...this.operations]
    };
  }

  /**
   * Check if specific operation was performed
   */
  wasOperationPerformed(operation: string, key?: string): boolean {
    return this.operations.some(op => 
      op.operation === operation && (key ? op.key === key : true)
    );
  }

  /**
   * Get operation count
   */
  getOperationCount(operation?: string): number {
    if (operation) {
      return this.operations.filter(op => op.operation === operation).length;
    }
    return this.operations.length;
  }

  /**
   * Check if import was added
   */
  wasImportAdded(key: string): boolean {
    return this.operations.some(op => 
      op.operation === 'addImport' && 
      (op.key === key || op.data?.key === key)
    );
  }

  /**
   * Check if command approval was added
   */
  wasCommandApprovalAdded(command: string): boolean {
    return this.operations.some(op => 
      op.operation === 'addCommandApproval' && 
      (op.key === command || op.data?.command === command)
    );
  }

  /**
   * Get current data snapshot
   */
  getDataSnapshot(): LockFileData {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Reset all tracking data for test isolation
   */
  reset(): void {
    this.operations = [];
    this.readCount = 0;
    this.writeCount = 0;
    this.data = this.createInitialData();
  }

  // === Private Helper Methods ===

  private recordOperation(operation: LockFileOperation['operation'], data?: any, key?: string): void {
    this.operations.push({
      operation,
      data,
      key,
      timestamp: Date.now()
    });
    
    if (['read', 'load', 'getImport', 'getAllImports', 'getSecurityPolicy', 'getCommandApproval', 'getRegistries'].includes(operation)) {
      this.readCount++;
    }
  }

  private createInitialData(): LockFileData {
    return {
      version: '1.0.0',
      imports: {},
      metadata: {
        mlldVersion: '1.0.0-test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      security: this.getDefaultSecurityPolicy(),
      registries: {}
    };
  }

  private getDefaultSecurityPolicy(): SecurityPolicy {
    return {
      commands: {
        default: 'verify',
        allowed: ['echo', 'ls', 'pwd', 'cat'],
        blocked: ['rm -rf', 'sudo'],
        trustedPatterns: ['npm run *']
      },
      paths: {
        default: 'allow',
        blocked: ['/etc/*', '/root/*']
      },
      imports: {
        default: 'verify',
        allowedDomains: ['github.com', 'raw.githubusercontent.com'],
        blockedDomains: ['malicious.com']
      },
      resolvers: {
        default: 'allow',
        allowed: ['registry', 'github', 'local'],
        blocked: ['untrusted']
      }
    };
  }
}