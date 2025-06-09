import type { LockEntry, LockFileData, RegistryEntry } from './LockFile';

/**
 * Interface for lock file operations
 * Enables dependency injection and testing
 */
export interface ILockFile {
  // Core import operations
  getImport(importPath: string): LockEntry | undefined;
  addImport(importPath: string, entry: LockEntry): Promise<void>;
  updateImport(importPath: string, entry: Partial<LockEntry>): Promise<void>;
  removeImport(importPath: string): Promise<void>;
  getAllImports(): Record<string, LockEntry>;
  
  // Integrity verification
  verifyIntegrity(importPath: string, content: string): Promise<boolean>;
  calculateIntegrity(content: string): Promise<string>;
  
  // Registry/Resolver configuration
  getRegistries(): Record<string, RegistryEntry>;
  getRegistryConfig(name: string): RegistryEntry | undefined;
  setRegistry(name: string, config: RegistryEntry): Promise<void>;
  removeRegistry(name: string): Promise<void>;
  getResolverConfigs(): Array<{ name: string; config: RegistryEntry }>;
  
  // Security policy methods  
  getSecurityPolicy(): any;
  setSecurityPolicy(policy: any): Promise<void>;
  getTrustedDomains(): string[];
  getBlockedPatterns(): string[];
  
  // Utility methods
  checkOutdated(
    checkFn: (importPath: string, entry: LockEntry) => Promise<boolean>
  ): Promise<Array<{ importPath: string; entry: LockEntry }>>;
}

/**
 * Command approval entry for persisting command decisions
 */
export interface CommandApproval {
  pattern: string;        // Command pattern (e.g., "npm install")
  approvedAt: string;     // ISO timestamp
  approvedBy: string;     // User who approved
  trust: 'always' | 'session' | 'never';
  expiresAt?: string;     // ISO timestamp for expiry
  context?: {
    file?: string;
    line?: number;
  };
}

/**
 * Import approval entry for persisting import decisions
 */
export interface ImportApproval {
  url: string;            // Import URL/path
  approvedAt: string;     // ISO timestamp
  approvedBy: string;     // User who approved
  trust: 'always' | 'verify' | 'never';
  expiresAt?: string;     // ISO timestamp for expiry
  contentHash?: string;   // Hash of approved content
  context?: {
    file?: string;
    line?: number;
  };
}

/**
 * Path access approval entry
 */
export interface PathApproval {
  path: string;           // File path pattern
  operation: 'read' | 'write'; // Operation type
  approvedAt: string;     // ISO timestamp
  approvedBy: string;     // User who approved
  trust: 'always' | 'session' | 'never';
  expiresAt?: string;     // ISO timestamp for expiry
  context?: {
    file?: string;
    line?: number;
  };
}

/**
 * Extended lock file interface with full security decision support
 */
export interface ILockFileWithCommands extends ILockFile {
  // Command approval methods
  addCommandApproval(pattern: string, approval: CommandApproval): Promise<void>;
  getCommandApproval(pattern: string): CommandApproval | undefined;
  findMatchingCommandApproval(command: string): CommandApproval | undefined;
  getAllCommandApprovals(): Record<string, CommandApproval>;
  removeCommandApproval(pattern: string): Promise<void>;

  // Import approval methods
  addImportApproval(url: string, approval: ImportApproval): Promise<void>;
  getImportApproval(url: string): ImportApproval | undefined;
  findMatchingImportApproval(url: string): ImportApproval | undefined;
  getAllImportApprovals(): Record<string, ImportApproval>;
  removeImportApproval(url: string): Promise<void>;

  // Path approval methods
  addPathApproval(path: string, operation: 'read' | 'write', approval: PathApproval): Promise<void>;
  getPathApproval(path: string, operation: 'read' | 'write'): PathApproval | undefined;
  findMatchingPathApproval(path: string, operation: 'read' | 'write'): PathApproval | undefined;
  getAllPathApprovals(): Record<string, PathApproval>;
  removePathApproval(path: string, operation: 'read' | 'write'): Promise<void>;
}