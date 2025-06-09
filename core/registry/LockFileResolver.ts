import { ILockFile, ILockFileWithCommands, LockEntry, CommandApproval } from './ILockFile';

/**
 * Resolves lock file entries with proper precedence between global and project lock files
 * 
 * Precedence rules:
 * 1. Project lock files can override global settings (more specific wins)
 * 2. 'never' trust level cannot be overridden (security wins)
 * 3. Expired entries are ignored
 * 4. Project lock file is checked first, then global
 */
export class LockFileResolver {
  constructor(
    private projectLock?: ILockFile,
    private globalLock?: ILockFile
  ) {}
  
  /**
   * Find import approval with proper precedence
   */
  async findImportApproval(url: string): Promise<LockEntry | null> {
    // Check project lock file first
    if (this.projectLock) {
      const projectEntry = await this.projectLock.getImport(url);
      if (projectEntry) {
        // Project 'never' blocks immediately
        if (projectEntry.trust === 'never') {
          return projectEntry;
        }
        
        // Check if expired
        if (this.isExpired(projectEntry)) {
          // Continue to check global
        } else {
          // Valid project entry - check if global has 'never'
          if (this.globalLock) {
            const globalEntry = await this.globalLock.getImport(url);
            if (globalEntry && globalEntry.trust === 'never') {
              return globalEntry; // Global 'never' overrides
            }
          }
          return projectEntry; // Use project entry
        }
      }
    }
    
    // Check global lock file
    if (this.globalLock) {
      const globalEntry = await this.globalLock.getImport(url);
      if (globalEntry && !this.isExpired(globalEntry)) {
        return globalEntry;
      }
    }
    
    return null;
  }
  
  /**
   * Find command approval with proper precedence
   */
  async findCommandApproval(command: string): Promise<CommandApproval | null> {
    const projectLock = this.projectLock as ILockFileWithCommands;
    const globalLock = this.globalLock as ILockFileWithCommands;
    
    // Check project lock file first
    if (projectLock?.getCommandApproval) {
      const projectApproval = await projectLock.getCommandApproval(command);
      if (projectApproval) {
        // Project 'never' blocks immediately
        if (projectApproval.trust === 'never') {
          return projectApproval;
        }
        
        // Check if expired
        if (this.isExpired(projectApproval)) {
          // Continue to check global
        } else {
          // Valid project approval - check if global has 'never'
          if (globalLock?.getCommandApproval) {
            const globalApproval = await globalLock.getCommandApproval(command);
            if (globalApproval && globalApproval.trust === 'never') {
              return globalApproval; // Global 'never' overrides
            }
          }
          return projectApproval; // Use project approval
        }
      }
    }
    
    // Check global lock file
    if (globalLock?.getCommandApproval) {
      const globalApproval = await globalLock.getCommandApproval(command);
      if (globalApproval && !this.isExpired(globalApproval)) {
        return globalApproval;
      }
    }
    
    return null;
  }
  
  /**
   * Merge security policies with restrictive precedence
   */
  mergeSecurityPolicies(global: any, project: any): any {
    // Deep merge with security-first precedence
    const merged = { ...global };
    
    // For each project policy
    for (const [key, value] of Object.entries(project || {})) {
      if (key === 'blockedCommands' || key === 'blockedPaths') {
        // Blocked lists are additive (union)
        merged[key] = [...(merged[key] || []), ...(value as any[] || [])];
      } else if (key === 'allowedCommands' || key === 'allowedPaths') {
        // Allowed lists are restrictive (intersection)
        if (merged[key]) {
          merged[key] = (merged[key] as any[]).filter(item => 
            (value as any[]).includes(item)
          );
        } else {
          merged[key] = value;
        }
      } else if (key === 'trust') {
        // Lower trust level wins
        const trustLevels = ['never', 'low', 'medium', 'high', 'always'];
        const globalIndex = trustLevels.indexOf(merged[key] || 'medium');
        const projectIndex = trustLevels.indexOf(value as string);
        merged[key] = trustLevels[Math.min(globalIndex, projectIndex)];
      } else {
        // For other properties, project overrides global
        merged[key] = value;
      }
    }
    
    return merged;
  }
  
  /**
   * Check if an entry is expired
   */
  private isExpired(entry: LockEntry | CommandApproval): boolean {
    if (!entry.expiresAt) {
      return false;
    }
    
    const expiryDate = new Date(entry.expiresAt);
    return expiryDate < new Date();
  }
  
  /**
   * Get effective security policy
   */
  async getSecurityPolicy(): Promise<any> {
    const globalPolicy = await this.globalLock?.getSecurityPolicy?.() || {};
    const projectPolicy = await this.projectLock?.getSecurityPolicy?.() || {};
    
    return this.mergeSecurityPolicies(globalPolicy, projectPolicy);
  }
}