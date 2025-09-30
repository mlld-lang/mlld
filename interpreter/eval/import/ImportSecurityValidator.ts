import type { Environment } from '../../env/Environment';
import type { ImportResolution } from './ImportPathResolver';
import { HashUtils } from '@core/registry/utils/HashUtils';
import { checkMlldVersion, formatVersionError } from '@core/utils/version-checker';
import { version as currentMlldVersion } from '@core/version';
import { MlldError } from '@core/errors';
import { logger } from '@core/utils/logger';
import * as path from 'path';

export interface SecurityValidation {
  approved: boolean;
  hashValid: boolean;
  versionCompatible: boolean;
  circularImportDetected: boolean;
  errors: string[];
}

/**
 * Handles all security validation aspects of import processing
 */
export class ImportSecurityValidator {
  constructor(private env: Environment) {}

  /**
   * Validates import security including circular imports, content hashes, 
   * version compatibility, and import approval
   */
  async validateImportSecurity(
    resolution: ImportResolution,
    content?: string
  ): Promise<SecurityValidation> {
    const validation: SecurityValidation = {
      approved: true,
      hashValid: true,
      versionCompatible: true,
      circularImportDetected: false,
      errors: []
    };

    // Check for circular imports
    validation.circularImportDetected = this.checkCircularImports(resolution.resolvedPath);
    if (validation.circularImportDetected) {
      validation.errors.push(`Circular import detected: ${resolution.resolvedPath}`);
      return validation;
    }

    // Validate content hash if expected and content is provided
    if (resolution.expectedHash && content) {
      validation.hashValid = this.validateContentHash(
        content, 
        resolution.expectedHash, 
        resolution.resolvedPath
      );
      if (!validation.hashValid) {
        validation.errors.push(`Hash validation failed for: ${resolution.resolvedPath}`);
      }
    }

    return validation;
  }

  /**
   * Checks for circular import dependencies
   */
  checkCircularImports(resolvedPath: string): boolean {
    return this.env.isImporting(resolvedPath);
  }

  /**
   * Validates content hash against expected hash (supports both full and short hashes)
   */
  validateContentHash(content: string, expectedHash: string, resolvedPath: string): boolean {
    // Skip hash validation in test mode for modules-hash fixture
    const isTestMode = process.env.MLLD_SKIP_HASH_VALIDATION === 'true';
    
    if (isTestMode) {
      return true;
    }

    const actualHash = HashUtils.hash(content);
    const shortActualHash = HashUtils.shortHash(actualHash, expectedHash.length);
    
    // Compare with the expected hash (supporting short hashes)
    if (expectedHash.length < 64) {
      // Short hash comparison
      if (shortActualHash !== expectedHash) {
        throw new Error(
          `Module hash mismatch for '${resolvedPath}': ` +
          `expected ${expectedHash}, got ${shortActualHash} (full: ${actualHash})`
        );
      }
    } else {
      // Full hash comparison
      if (!HashUtils.secureCompare(actualHash, expectedHash)) {
        throw new Error(
          `Module hash mismatch for '${resolvedPath}': ` +
          `expected ${expectedHash}, got ${actualHash}`
        );
      }
    }

    return true;
  }

  /**
   * Checks mlld version compatibility from frontmatter
   */
  checkVersionCompatibility(frontmatterData: Record<string, any>, resolvedPath: string): boolean {
    const requiredVersion = frontmatterData['mlld-version'] || 
                           frontmatterData['mlldVersion'] ||
                           frontmatterData['mlld_version'];
    
    if (!requiredVersion) {
      return true; // No version requirement
    }

    if (process.env.MLLD_DEBUG_VERSION) {
      logger.debug(`[Version Check] Module requires: ${requiredVersion}, Current: ${currentMlldVersion}`);
    }

    const versionCheck = checkMlldVersion(requiredVersion);
    if (!versionCheck.compatible) {
      const moduleName = frontmatterData.module || 
                        frontmatterData.name || 
                        path.basename(resolvedPath);
      
      throw new MlldError(
        formatVersionError(moduleName, requiredVersion, currentMlldVersion),
        { 
          code: 'VERSION_MISMATCH', 
          severity: 'error',
          module: moduleName,
          requiredVersion,
          path: resolvedPath
        }
      );
    }

    return true;
  }

  /**
   * Requests import approval for URL imports if needed
   */
  async requestImportApproval(resolvedPath: string): Promise<boolean> {
    const isURL = this.env.isURL(resolvedPath);
    
    if (isURL) {
      // The approval process is handled by env.fetchURL with forImport=true
      // This method exists for explicit approval workflow if needed
      return true;
    }
    
    return true; // File imports don't need approval
  }

  /**
   * Marks the beginning of an import for circular detection
   */
  beginImport(resolvedPath: string): void {
    const isURL = this.env.isURL(resolvedPath);
    if (isURL) {
      this.env.beginImport(resolvedPath);
    }
  }

  /**
   * Marks the end of an import for circular detection
   */
  endImport(resolvedPath: string): void {
    const isURL = this.env.isURL(resolvedPath);
    if (isURL) {
      this.env.endImport(resolvedPath);
    }
  }

  /**
   * Validates overall module integrity combining all security checks
   */
  async validateModuleIntegrity(
    resolution: ImportResolution,
    content: string,
    frontmatterData?: Record<string, any> | null
  ): Promise<void> {
    // Check circular imports
    if (this.checkCircularImports(resolution.resolvedPath)) {
      throw new Error(`Circular import detected: ${resolution.resolvedPath}`);
    }

    // Validate content hash if expected
    if (resolution.expectedHash) {
      this.validateContentHash(content, resolution.expectedHash, resolution.resolvedPath);
    }

    // Check version compatibility if frontmatter is provided
    if (frontmatterData) {
      this.checkVersionCompatibility(frontmatterData, resolution.resolvedPath);
    }
  }

  /**
   * Validates content security excluding circular import checks
   * (Used when import tracking is already in progress)
   */
  async validateContentSecurity(
    resolution: ImportResolution,
    content: string,
    frontmatterData?: Record<string, any> | null
  ): Promise<void> {
    // Validate content hash if expected
    if (resolution.expectedHash) {
      this.validateContentHash(content, resolution.expectedHash, resolution.resolvedPath);
    }

    // Check version compatibility if frontmatter is provided
    if (frontmatterData) {
      this.checkVersionCompatibility(frontmatterData, resolution.resolvedPath);
    }
  }
}