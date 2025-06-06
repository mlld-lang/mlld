import { execSync } from 'child_process';
import { MlldDependencyError } from '@core/errors';

export interface DependencyCheckResult {
  satisfied: boolean;
  missing: string[];
  mismatched: string[];
}

export interface DependencyChecker {
  checkNodePackages(packages: Record<string, string>): Promise<DependencyCheckResult>;
  checkPythonPackages(packages: Record<string, string>): Promise<DependencyCheckResult>;
}

/**
 * Default implementation of dependency checker
 */
export class DefaultDependencyChecker implements DependencyChecker {
  private cache = new Map<string, DependencyCheckResult>();
  
  async checkNodePackages(packages: Record<string, string>): Promise<DependencyCheckResult> {
    const missing: string[] = [];
    const mismatched: string[] = [];
    
    // In test mode, assume all dependencies are satisfied
    if (process.env.MLLD_TEST_MODE === 'true') {
      return {
        satisfied: true,
        missing: [],
        mismatched: []
      };
    }
    
    for (const [pkg, constraint] of Object.entries(packages)) {
      const cacheKey = `node:${pkg}:${constraint}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (!cached.satisfied) {
          missing.push(...cached.missing);
          mismatched.push(...cached.mismatched);
        }
        continue;
      }
      
      try {
        // Check if package exists locally or globally
        let version: string | null = null;
        
        // Try local first
        try {
          const localResult = execSync(`npm list ${pkg} --json --depth=0`, { 
            encoding: 'utf8',
            stdio: 'pipe'
          });
          
          const data = JSON.parse(localResult);
          version = data.dependencies?.[pkg]?.version;
        } catch {
          // Try global if local fails
          try {
            const globalResult = execSync(`npm list -g ${pkg} --json --depth=0`, { 
              encoding: 'utf8',
              stdio: 'pipe'
            });
            
            const data = JSON.parse(globalResult);
            version = data.dependencies?.[pkg]?.version;
          } catch {
            // Package not found
          }
        }
        
        if (!version) {
          missing.push(`${pkg}@${constraint}`);
        } else if (!satisfiesConstraint(version, constraint)) {
          mismatched.push(`${pkg}@${version} (needs ${constraint})`);
        }
        
      } catch (error) {
        // Error checking package
        missing.push(`${pkg}@${constraint}`);
      }
      
      // Cache the result for this package
      const packageResult = {
        satisfied: !missing.includes(`${pkg}@${constraint}`) && 
                  !mismatched.some(m => m.startsWith(`${pkg}@`)),
        missing: missing.filter(m => m.startsWith(`${pkg}@`)),
        mismatched: mismatched.filter(m => m.startsWith(`${pkg}@`))
      };
      this.cache.set(cacheKey, packageResult);
    }
    
    return {
      satisfied: missing.length === 0 && mismatched.length === 0,
      missing,
      mismatched
    };
  }
  
  async checkPythonPackages(packages: Record<string, string>): Promise<DependencyCheckResult> {
    const missing: string[] = [];
    const mismatched: string[] = [];
    
    // In test mode, assume all dependencies are satisfied
    if (process.env.MLLD_TEST_MODE === 'true') {
      return {
        satisfied: true,
        missing: [],
        mismatched: []
      };
    }
    
    for (const [pkg, constraint] of Object.entries(packages)) {
      const cacheKey = `python:${pkg}:${constraint}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (!cached.satisfied) {
          missing.push(...cached.missing);
          mismatched.push(...cached.mismatched);
        }
        continue;
      }
      
      try {
        // Check if package exists using pip
        const result = execSync(`pip show ${pkg}`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        // Extract version from output
        const versionMatch = result.match(/Version:\s*(.+)/);
        const version = versionMatch ? versionMatch[1].trim() : null;
        
        if (!version) {
          missing.push(`${pkg}${constraint}`);
        } else if (!satisfiesConstraint(version, constraint)) {
          mismatched.push(`${pkg}==${version} (needs ${constraint})`);
        }
        
      } catch {
        // Package not found
        missing.push(`${pkg}${constraint}`);
      }
      
      // Cache the result
      const packageResult = {
        satisfied: !missing.includes(`${pkg}${constraint}`) && 
                  !mismatched.some(m => m.startsWith(`${pkg}==`)),
        missing: missing.filter(m => m === `${pkg}${constraint}`),
        mismatched: mismatched.filter(m => m.startsWith(`${pkg}==`))
      };
      this.cache.set(cacheKey, packageResult);
    }
    
    return {
      satisfied: missing.length === 0 && mismatched.length === 0,
      missing,
      mismatched
    };
  }
}

/**
 * Check if a version satisfies a constraint
 * This is a simplified version - in production, use a proper semver library
 */
function satisfiesConstraint(version: string, constraint: string): boolean {
  // Handle wildcard - any version is acceptable
  if (constraint === '*') {
    return true;
  }
  
  // Handle exact match
  if (constraint === version) {
    return true;
  }
  
  // Handle common npm constraint patterns
  if (constraint.startsWith('^')) {
    // Caret range - allow minor/patch updates
    const constraintBase = constraint.substring(1);
    return isCompatibleVersion(version, constraintBase, 'minor');
  }
  
  if (constraint.startsWith('~')) {
    // Tilde range - allow patch updates only
    const constraintBase = constraint.substring(1);
    return isCompatibleVersion(version, constraintBase, 'patch');
  }
  
  if (constraint.startsWith('>=')) {
    // Greater than or equal
    const constraintBase = constraint.substring(2);
    return compareVersions(version, constraintBase) >= 0;
  }
  
  if (constraint.includes('||')) {
    // OR constraint
    const parts = constraint.split('||').map(s => s.trim());
    return parts.some(part => satisfiesConstraint(version, part));
  }
  
  // For Python constraints
  if (constraint.startsWith('==')) {
    return version === constraint.substring(2);
  }
  
  if (constraint.startsWith('>=')) {
    const constraintBase = constraint.substring(2);
    return compareVersions(version, constraintBase) >= 0;
  }
  
  // Default to exact match
  return version === constraint;
}

/**
 * Check if version is compatible based on update type
 */
function isCompatibleVersion(version: string, base: string, updateType: 'major' | 'minor' | 'patch'): boolean {
  const vParts = version.split('.').map(Number);
  const bParts = base.split('.').map(Number);
  
  if (updateType === 'patch') {
    // Major and minor must match
    return vParts[0] === bParts[0] && vParts[1] === bParts[1] && vParts[2] >= bParts[2];
  }
  
  if (updateType === 'minor') {
    // Major must match
    return vParts[0] === bParts[0] && 
           (vParts[1] > bParts[1] || (vParts[1] === bParts[1] && vParts[2] >= bParts[2]));
  }
  
  return false;
}

/**
 * Compare two version strings
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

/**
 * Check dependencies and throw error if not satisfied
 */
export async function checkDependencies(
  needs: Record<string, Record<string, string>>,
  checker: DependencyChecker,
  location?: any
): Promise<void> {
  const allMissing: string[] = [];
  const allMismatched: string[] = [];
  
  // Check Node.js packages
  if (needs.node) {
    const result = await checker.checkNodePackages(needs.node);
    allMissing.push(...result.missing);
    allMismatched.push(...result.mismatched);
  }
  
  // Check Python packages
  if (needs.python) {
    const result = await checker.checkPythonPackages(needs.python);
    allMissing.push(...result.missing);
    allMismatched.push(...result.mismatched);
  }
  
  // Throw error if dependencies not satisfied
  if (allMissing.length > 0 || allMismatched.length > 0) {
    const messages: string[] = [];
    
    if (allMissing.length > 0) {
      messages.push(`Missing packages: ${allMissing.join(', ')}`);
    }
    
    if (allMismatched.length > 0) {
      messages.push(`Version mismatches: ${allMismatched.join(', ')}`);
    }
    
    throw new MlldDependencyError(
      messages.join('\n'),
      allMissing,
      allMismatched,
      location
    );
  }
}