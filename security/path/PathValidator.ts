import * as path from 'path';
import * as os from 'os';
import minimatch from 'minimatch';
const { Minimatch } = minimatch;
import { IMMUTABLE_SECURITY_PATTERNS } from '@security/policy/patterns';
import { MlldFileSystemError } from '@core/errors';

/**
 * Validates path access based on security policies
 */
export class PathValidator {
  private readBlockPatterns: Minimatch[];
  private writeBlockPatterns: Minimatch[];
  
  constructor() {
    // Compile glob patterns for performance
    this.readBlockPatterns = IMMUTABLE_SECURITY_PATTERNS.protectedReadPaths
      .map(pattern => new Minimatch(this.expandPath(pattern)));
      
    this.writeBlockPatterns = IMMUTABLE_SECURITY_PATTERNS.protectedWritePaths
      .map(pattern => new Minimatch(this.expandPath(pattern)));
  }
  
  /**
   * Check if a path can be read
   */
  canRead(inputPath: string): boolean {
    const normalized = this.normalizePath(inputPath);
    
    // Check against blocked patterns
    if (this.isBlocked(normalized, this.readBlockPatterns)) {
      throw new MlldFileSystemError(
        `Security: Access denied to protected path: ${inputPath}\n` +
        `This path contains sensitive data and cannot be read by mlld scripts.`
      );
    }
    
    return true;
  }
  
  /**
   * Check if a path can be written
   */
  canWrite(inputPath: string): boolean {
    const normalized = this.normalizePath(inputPath);
    
    // Check against blocked patterns
    if (this.isBlocked(normalized, this.writeBlockPatterns)) {
      throw new MlldFileSystemError(
        `Security: Write access denied to protected path: ${inputPath}\n` +
        `This path is protected and cannot be modified by mlld scripts.`
      );
    }
    
    return true;
  }
  
  /**
   * Check if a path matches any blocked patterns
   */
  private isBlocked(normalizedPath: string, patterns: Minimatch[]): boolean {
    return patterns.some(pattern => pattern.match(normalizedPath));
  }
  
  /**
   * Normalize a path for consistent checking
   */
  private normalizePath(inputPath: string): string {
    // Expand ~ to home directory
    if (inputPath.startsWith('~')) {
      inputPath = path.join(os.homedir(), inputPath.slice(1));
    }
    
    // Resolve to absolute path to catch traversal attempts
    const resolved = path.resolve(inputPath);
    
    // Also check the original path in case it's already absolute
    return resolved;
  }
  
  /**
   * Expand ~ in glob patterns
   */
  private expandPath(pattern: string): string {
    if (pattern.startsWith('~/')) {
      return path.join(os.homedir(), pattern.slice(2));
    }
    return pattern;
  }
  
  /**
   * Get human-readable reason why a path is blocked
   */
  getBlockReason(inputPath: string, operation: 'read' | 'write'): string | null {
    const normalized = this.normalizePath(inputPath);
    const patterns = operation === 'read' ? this.readBlockPatterns : this.writeBlockPatterns;
    
    // Common sensitive paths
    const sensitivePathMap: Record<string, string> = {
      '.ssh': 'SSH keys and configuration',
      '.aws': 'AWS credentials',
      '.gnupg': 'GPG keys',
      '.docker': 'Docker authentication',
      '.kube': 'Kubernetes configuration',
      '.npmrc': 'NPM authentication tokens',
      '.netrc': 'Network credentials',
      '.env': 'Environment variables',
      'private': 'Private keys',
      'secrets': 'Secret files',
      '/etc/shadow': 'System passwords',
      'System32\\config': 'Windows system registry'
    };
    
    for (const [key, description] of Object.entries(sensitivePathMap)) {
      if (normalized.includes(key)) {
        return `This path contains ${description}`;
      }
    }
    
    return 'This path is protected by security policy';
  }
}