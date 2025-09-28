/**
 * Metadata enhancement and validation
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type { ModuleMetadata, ValidationResult, ModuleData, ValidationError, ValidationWarning, ValidationContext } from '../types/PublishingTypes';
import type { GitInfo } from '../types/PublishingTypes';
import { version as currentMlldVersion } from '@core/version';
import { Octokit } from '@octokit/rest';

export class MetadataEnhancer implements ValidationStep {
  name = 'metadata';

  async validate(module: ModuleData, _context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const updatedMetadata: Partial<ModuleMetadata> = {};
    let needsUpdate = false;

    // Validate required fields
    if (!module.metadata.name) {
      errors.push({
        field: 'name',
        message: 'Missing required field: name'
      });
    } else if (!module.metadata.name.match(/^[a-z0-9-]+$/)) {
      errors.push({
        field: 'name',
        message: `Invalid module name '${module.metadata.name}'. Must be lowercase alphanumeric with hyphens.`
      });
    }

    if (!module.metadata.about) {
      errors.push({
        field: 'about',
        message: 'Missing required field: about'
      });
    }

    if (!module.metadata.needs || !Array.isArray(module.metadata.needs)) {
      errors.push({
        field: 'needs',
        message: 'Missing required field: needs\n' +
                'Add to your frontmatter: needs: [] for pure mlld modules\n' +
                'Or specify runtime dependencies: needs: ["js", "node", "py", "sh"]'
      });
    } else {
      // Validate needs values
      const validNeeds = ['js', 'node', 'py', 'sh'];
      const invalidNeeds = module.metadata.needs.filter(n => !validNeeds.includes(n));
      if (invalidNeeds.length > 0) {
        errors.push({
          field: 'needs',
          message: `Invalid needs values: ${invalidNeeds.join(', ')}. Valid values are: js, node, py, sh`,
          severity: 'error' as const
        });
      }
    }

    // Validate license
    if (module.metadata.license && module.metadata.license !== 'CC0') {
      errors.push({
        field: 'license',
        message: `Invalid license '${module.metadata.license}'. All modules must be CC0 licensed.\n` +
                `Please update your frontmatter to: license: CC0`
      });
    } else if (!module.metadata.license) {
      // Auto-add CC0 if missing
      updatedMetadata.license = 'CC0';
      needsUpdate = true;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      updatedMetadata: needsUpdate ? updatedMetadata : undefined
    };
  }

  async enhance(module: ModuleData, _context: ValidationContext): Promise<ModuleData> {
    const updatedMetadata: Partial<ModuleMetadata> = {};
    let needsUpdate = false;

    // Add mlld version if missing
    if (!module.metadata.mlldVersion) {
      updatedMetadata.mlldVersion = currentMlldVersion;
      needsUpdate = true;
    }

    // Auto-populate missing fields from git info
    if (module.gitInfo?.isGitRepo && module.gitInfo.owner && module.gitInfo.repo) {
      if (!module.metadata.repo) {
        updatedMetadata.repo = `https://github.com/${module.gitInfo.owner}/${module.gitInfo.repo}`;
        needsUpdate = true;
      }
      if (!module.metadata.bugs) {
        updatedMetadata.bugs = `https://github.com/${module.gitInfo.owner}/${module.gitInfo.repo}/issues`;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      return {
        ...module,
        metadata: { ...module.metadata, ...updatedMetadata }
      };
    }

    return module;
  }

  async validateAuthorPermissions(
    metadata: ModuleMetadata,
    user: any,
    octokit: Octokit
  ): Promise<{ valid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    if (metadata.author && metadata.author !== user.login) {
      // Check if the author is an organization the user belongs to
      const hasPermission = await this.checkOrgPermission(octokit, metadata.author, user.login);
      if (!hasPermission) {
        errors.push({
          field: 'author',
          message: `Author '${metadata.author}' is not valid. You can only publish as:\n` +
                  `    - Your GitHub username: ${user.login}\n` +
                  `    - Organizations you belong to`,
          severity: 'error' as const
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async checkOrgPermission(octokit: Octokit, org: string, username: string): Promise<boolean> {
    // Special case: 'mlld' organization for core modules
    // Allow specific maintainers to publish as 'mlld' since we don't control that GitHub org
    if (org === 'mlld') {
      const allowedMaintainers = ['adamavenir', 'mlld-dev'];
      return allowedMaintainers.includes(username);
    }
    
    try {
      // Check if user is a member of the organization
      const { data: membership } = await octokit.orgs.getMembershipForUser({
        org,
        username
      });
      
      // User must be at least a member (admin is even better)
      return membership.state === 'active' && (membership.role === 'admin' || membership.role === 'member');
    } catch (error: any) {
      // 404 means not a member, other errors mean we can't verify
      return false;
    }
  }
}