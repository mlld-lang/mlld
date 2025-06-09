import { version as currentVersion } from '@core/version';
import { MlldError } from '@core/errors';

/**
 * Parses a semantic version string into components
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Parse a semantic version string
 */
export function parseSemVer(versionString: string): SemVer {
  // Handle version strings like "1.0.0-rc-11+build"
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/);
  
  if (!match) {
    throw new MlldError(
      `Invalid version string: ${versionString}`,
      { code: 'INVALID_VERSION', severity: 'error' }
    );
  }
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || undefined,
    build: match[5] || undefined
  };
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  // Compare major.minor.patch
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  
  // If one has prerelease and other doesn't, non-prerelease is greater
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  
  // Compare prereleases lexically
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }
  
  return 0;
}

/**
 * Check if a version satisfies a requirement
 */
export function satisfiesVersion(version: string, requirement: string): boolean {
  // Handle simple cases first
  if (requirement === '*' || requirement === '') return true;
  
  const ver = parseSemVer(version);
  
  // Handle >= operator
  if (requirement.startsWith('>=')) {
    const reqVer = parseSemVer(requirement.substring(2).trim());
    return compareSemVer(ver, reqVer) >= 0;
  }
  
  // Handle > operator
  if (requirement.startsWith('>')) {
    const reqVer = parseSemVer(requirement.substring(1).trim());
    return compareSemVer(ver, reqVer) > 0;
  }
  
  // Handle <= operator
  if (requirement.startsWith('<=')) {
    const reqVer = parseSemVer(requirement.substring(2).trim());
    return compareSemVer(ver, reqVer) <= 0;
  }
  
  // Handle < operator
  if (requirement.startsWith('<')) {
    const reqVer = parseSemVer(requirement.substring(1).trim());
    return compareSemVer(ver, reqVer) < 0;
  }
  
  // Handle ^ operator (compatible with)
  if (requirement.startsWith('^')) {
    const reqVer = parseSemVer(requirement.substring(1).trim());
    // Must be >= requirement and < next major version
    if (compareSemVer(ver, reqVer) < 0) return false;
    
    // For 0.x.x, treat minor as breaking
    if (reqVer.major === 0) {
      return ver.major === 0 && ver.minor === reqVer.minor;
    }
    
    // For >= 1.0.0, major must match
    return ver.major === reqVer.major;
  }
  
  // Handle ~ operator (approximately)
  if (requirement.startsWith('~')) {
    const reqVer = parseSemVer(requirement.substring(1).trim());
    // Must be >= requirement and < next minor version
    if (compareSemVer(ver, reqVer) < 0) return false;
    
    return ver.major === reqVer.major && ver.minor === reqVer.minor;
  }
  
  // Handle exact match
  const reqVer = parseSemVer(requirement);
  return compareSemVer(ver, reqVer) === 0;
}

/**
 * Check if the current mlld version satisfies a module's requirement
 */
export function checkMlldVersion(requiredVersion: string | undefined): {
  compatible: boolean;
  message?: string;
} {
  // If no version specified, assume compatible (backward compatibility)
  if (!requiredVersion) {
    return { compatible: true };
  }
  
  try {
    const compatible = satisfiesVersion(currentVersion, requiredVersion);
    
    if (!compatible) {
      return {
        compatible: false,
        message: `Module requires mlld ${requiredVersion}, but you have ${currentVersion}`
      };
    }
    
    return { compatible: true };
  } catch (error) {
    return {
      compatible: false,
      message: `Invalid version requirement: ${requiredVersion}`
    };
  }
}

/**
 * Format version compatibility error message with helpful suggestions
 */
export function formatVersionError(
  moduleName: string,
  requiredVersion: string,
  currentVersion: string
): string {
  const message = [`Module '${moduleName}' requires mlld ${requiredVersion}`];
  message.push(`You are running mlld ${currentVersion}`);
  
  const required = parseSemVer(requiredVersion.replace(/^[><=^~]+/, ''));
  const current = parseSemVer(currentVersion);
  
  if (compareSemVer(current, required) < 0) {
    message.push('');
    message.push('To use this module, you need to upgrade mlld:');
    message.push('  npm install -g mlld@latest');
  } else {
    message.push('');
    message.push('This module may be using outdated syntax.');
    message.push('Check if there\'s an updated version available.');
  }
  
  return message.join('\n');
}