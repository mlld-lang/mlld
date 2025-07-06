/**
 * Module validation orchestrator
 */

import { ValidationStep } from '../types/PublishingStrategy';
import { ModuleMetadata, ValidationResult } from '../types/PublishingTypes';
import { SyntaxValidator } from './SyntaxValidator';
import { MetadataEnhancer } from './MetadataEnhancer';
import { ImportValidator } from './ImportValidator';
import { DependencyValidator } from './DependencyValidator';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

interface ModuleData {
  metadata: ModuleMetadata;
  content: string;
  filePath: string;
  gitInfo?: any;
}

interface ValidationContext {
  user: any;
  octokit: Octokit;
  dryRun?: boolean;
}

export class ModuleValidator {
  private steps: ValidationStep[];
  private enhancer: MetadataEnhancer;

  constructor() {
    this.steps = [
      new SyntaxValidator(),
      new ImportValidator(),
      new DependencyValidator()
    ];
    this.enhancer = new MetadataEnhancer();
  }

  async validate(
    module: ModuleData,
    context: ValidationContext
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings?: string[];
    updatedMetadata?: Partial<ModuleMetadata>;
    updatedContent?: string;
  }> {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let updatedMetadata: Partial<ModuleMetadata> = {};
    let needsUpdate = false;

    // Run metadata validation first (includes required fields)
    const metadataResult = await this.enhancer.validate(module);
    if (!metadataResult.valid) {
      allErrors.push(...metadataResult.errors.map(e => e.message));
    }
    allWarnings.push(...metadataResult.warnings.map(w => w.message));
    
    if (metadataResult.updatedMetadata) {
      updatedMetadata = { ...updatedMetadata, ...metadataResult.updatedMetadata };
      needsUpdate = true;
    }

    // Run author permission validation
    if (module.metadata.author && context.user) {
      const authorResult = await this.enhancer.validateAuthorPermissions(
        module.metadata,
        context.user,
        context.octokit
      );
      if (!authorResult.valid) {
        allErrors.push(...authorResult.errors.map(e => e.message));
      }
    } else if (!module.metadata.author && context.user) {
      // Auto-set author if missing
      updatedMetadata.author = context.user.login;
      needsUpdate = true;
    }

    // Run enhancement (auto-populate fields) if not in dry run
    if (!context.dryRun) {
      const enhancedModule = await this.enhancer.enhance(module);
      if (enhancedModule !== module) {
        // Module was enhanced, merge the changes
        const changes = this.getDifferences(module.metadata, enhancedModule.metadata);
        updatedMetadata = { ...updatedMetadata, ...changes };
        needsUpdate = true;
      }
    }

    // Run all validation steps
    for (const step of this.steps) {
      const result = await step.validate(module);
      
      if (!result.valid) {
        allErrors.push(...result.errors.map(e => e.message));
      }
      allWarnings.push(...result.warnings.map(w => w.message));
    }

    // Display warnings if any
    if (allWarnings.length > 0) {
      console.log(chalk.yellow('\nWarning:  Validation warnings:'));
      allWarnings.forEach(w => console.log(chalk.yellow(`   ${w}`)));
    }

    // Generate updated content if metadata changed
    let updatedContent: string | undefined;
    if (needsUpdate) {
      const mergedMetadata = { ...module.metadata, ...updatedMetadata };
      updatedContent = this.updateFrontmatter(module.content, mergedMetadata);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      updatedMetadata: needsUpdate ? updatedMetadata : undefined,
      updatedContent
    };
  }

  private getDifferences(original: ModuleMetadata, enhanced: ModuleMetadata): Partial<ModuleMetadata> {
    const differences: Partial<ModuleMetadata> = {};
    
    // Check each field for differences
    const fieldsToCheck: (keyof ModuleMetadata)[] = [
      'name', 'author', 'version', 'about', 'license', 'repo', 'bugs', 'homepage', 'mlldVersion'
    ];
    
    for (const field of fieldsToCheck) {
      if (original[field] !== enhanced[field]) {
        (differences as any)[field] = enhanced[field];
      }
    }
    
    return differences;
  }

  private updateFrontmatter(content: string, metadata: ModuleMetadata): string {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      // No frontmatter, add it
      return this.formatFrontmatter(metadata) + '\n\n' + content;
    }
    
    // Replace existing frontmatter
    const afterFrontmatter = content.substring(frontmatterMatch[0].length);
    return this.formatFrontmatter(metadata) + afterFrontmatter;
  }

  private formatFrontmatter(metadata: ModuleMetadata): string {
    const lines = ['---'];
    
    // Canonical field ordering
    lines.push(`name: ${metadata.name}`);
    lines.push(`author: ${metadata.author}`);
    if (metadata.version) lines.push(`version: ${metadata.version}`);
    lines.push(`about: ${metadata.about}`);
    
    // Always include needs (it's required)
    if (metadata.needs) {
      lines.push(`needs: [${metadata.needs.map(n => `"${n}"`).join(', ')}]`);
    }
    
    // Include detailed dependencies only for languages in needs
    if (metadata.needs && metadata.needs.includes('js') && metadata.needsJs) {
      lines.push('needs-js:');
      if (metadata.needsJs.node) lines.push(`  node: "${metadata.needsJs.node}"`);
      if (metadata.needsJs.packages) lines.push(`  packages: [${metadata.needsJs.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs && metadata.needs.includes('node') && metadata.needsNode) {
      lines.push('needs-node:');
      if (metadata.needsNode.node) lines.push(`  node: "${metadata.needsNode.node}"`);
      if (metadata.needsNode.packages) lines.push(`  packages: [${metadata.needsNode.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs && metadata.needs.includes('py') && metadata.needsPy) {
      lines.push('needs-py:');
      if (metadata.needsPy.python) lines.push(`  python: "${metadata.needsPy.python}"`);
      if (metadata.needsPy.packages) lines.push(`  packages: [${metadata.needsPy.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs && metadata.needs.includes('sh') && metadata.needsSh) {
      lines.push('needs-sh:');
      if (metadata.needsSh.shell) lines.push(`  shell: "${metadata.needsSh.shell}"`);
      if (metadata.needsSh.commands) lines.push(`  commands: [${metadata.needsSh.commands.map(c => `"${c}"`).join(', ')}]`);
    }
    
    if (metadata.bugs) lines.push(`bugs: ${metadata.bugs}`);
    if (metadata.repo) lines.push(`repo: ${metadata.repo}`);
    if (metadata.keywords && metadata.keywords.length > 0) {
      lines.push(`keywords: [${metadata.keywords.map(k => `"${k}"`).join(', ')}]`);
    }
    if (metadata.homepage) lines.push(`homepage: ${metadata.homepage}`);
    lines.push(`license: ${metadata.license}`);  // Always CC0
    if (metadata.mlldVersion) lines.push(`mlld-version: "${metadata.mlldVersion}"`);
    
    lines.push('---');
    return lines.join('\n');
  }
}