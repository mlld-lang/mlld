import { MlldError } from './MlldError';
import type { SourceLocation } from '@core/types';

/**
 * Error thrown when required dependencies are not satisfied
 */
export class MlldDependencyError extends MlldError {
  constructor(
    message: string,
    public readonly missing: string[],
    public readonly mismatched: string[],
    location?: SourceLocation
  ) {
    super(message, location);
    this.name = 'MlldDependencyError';
  }
  
  /**
   * Get a formatted error message with installation instructions
   */
  getFormattedMessage(): string {
    const lines: string[] = [this.message];
    
    if (this.missing.length > 0) {
      lines.push('');
      lines.push('To install missing packages:');
      
      // Group by package manager
      const nodePackages = this.missing.filter(p => p.includes('@'));
      const pythonPackages = this.missing.filter(p => !p.includes('@'));
      
      if (nodePackages.length > 0) {
        lines.push(`  npm install ${nodePackages.join(' ')}`);
      }
      
      if (pythonPackages.length > 0) {
        lines.push(`  pip install ${pythonPackages.join(' ')}`);
      }
    }
    
    if (this.mismatched.length > 0) {
      lines.push('');
      lines.push('Version mismatches detected. Update packages to satisfy constraints.');
    }
    
    return lines.join('\n');
  }
}