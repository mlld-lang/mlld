/**
 * Import validation for mlld modules
 */

import { ValidationStep } from '../types/PublishingStrategy';
import { ModuleMetadata, ValidationResult } from '../types/PublishingTypes';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

interface ModuleData {
  metadata: ModuleMetadata;
  content: string;
  filePath: string;
}

export class ImportValidator implements ValidationStep {
  name = 'imports';

  async validate(module: ModuleData): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Extract publishing author from metadata
    const publishingAuthor = module.metadata.author;
    if (!publishingAuthor) {
      // If no author, skip import validation (will be caught by metadata validation)
      return {
        valid: true,
        errors: [],
        warnings: []
      };
    }

    // Find all @import directives that reference modules (start with @) in the entire file
    const importRegex = /@import\s+\{[^}]+\}\s+from\s+(@[a-z0-9-]+\/[a-z0-9-]+)(?:@[a-f0-9]+)?/g;
    const matches = module.content.matchAll(importRegex);
    
    for (const match of matches) {
      const moduleRef = match[1]; // e.g. @author/module
      const parsedRef = moduleRef.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/);
      
      if (!parsedRef) {
        errors.push({
          field: 'imports',
          message: `Invalid module reference format: ${moduleRef}`,
          severity: 'error' as const
        });
        continue;
      }
      
      const [, author, moduleName] = parsedRef;
      const fullModuleName = `@${author}/${moduleName}`;
      
      // Skip validation if this is a self-reference (module importing itself in examples)
      const currentModuleName = `@${publishingAuthor}/${module.metadata.name}`;
      if (fullModuleName === currentModuleName) {
        continue; // Skip self-reference validation
      }
      
      try {
        const isValid = await this.validateModuleExists(fullModuleName);
        if (!isValid) {
          errors.push({
            field: 'imports',
            message: `Module ${moduleRef} not found in public registry. Only published modules can be imported.`,
            severity: 'error' as const
          });
        }
      } catch (error: any) {
        errors.push({
          field: 'imports',
          message: `Failed to validate module ${moduleRef}: ${error.message}`,
          severity: 'error' as const
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async validateModuleExists(fullModuleName: string): Promise<boolean> {
    try {
      // Check if the module exists in the registry
      const registryUrl = `https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json`;
      const response = await fetch(registryUrl);
      
      if (!response.ok) {
        // If registry doesn't exist yet (404), that's okay for first module
        if (response.status === 404) {
          console.log(chalk.gray('Registry not found (this is normal for first module)'));
          return true; // Allow the import
        }
        throw new Error(`Could not access registry (status: ${response.status})`);
      }
      
      const registry = await response.json() as Record<string, any>;
      return fullModuleName in registry;
      
    } catch (error: any) {
      throw new Error(`Registry access failed: ${error.message}`);
    }
  }
}