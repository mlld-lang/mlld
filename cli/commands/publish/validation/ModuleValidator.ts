/**
 * Module validation orchestrator
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type {
  ModuleMetadata,
  ModuleData,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ExportBinding,
  ImportRecord,
  ValidationContext
} from '../types/PublishingTypes';
import { SyntaxValidator } from './SyntaxValidator';
import { ExportValidator } from './ExportValidator';
import { MetadataEnhancer } from './MetadataEnhancer';
import { ImportValidator } from './ImportValidator';
import { DependencyValidator } from './DependencyValidator';


export class ModuleValidator {
  private readonly steps: ValidationStep[];
  private readonly enhancer: MetadataEnhancer;

  constructor() {
    this.steps = [
      new SyntaxValidator(),
      new ExportValidator(),
      new ImportValidator(),
      new DependencyValidator()
    ];
    this.enhancer = new MetadataEnhancer();
  }

  async validate(module: ModuleData, context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const exportBindings: ExportBinding[] = [];
    const importRecords: ImportRecord[] = [];

    let metadataUpdates: Partial<ModuleMetadata> = {};
    let needsMetadataRewrite = false;

    // Base metadata validation covers required fields and defaults
    const metadataResult = await this.enhancer.validate(module, context);
    this.mergeValidationResult(metadataResult, errors, warnings, exportBindings, importRecords);

    if (metadataResult.updatedMetadata) {
      metadataUpdates = { ...metadataUpdates, ...metadataResult.updatedMetadata };
      needsMetadataRewrite = true;
    }

    // Ensure the publisher has permission to publish for the declared author
    if (module.metadata.author && context.user) {
      const authorResult = await this.enhancer.validateAuthorPermissions(
        module.metadata,
        context.user,
        context.octokit
      );
      if (!authorResult.valid) {
        errors.push(...authorResult.errors);
      }
    } else if (!module.metadata.author && context.user) {
      metadataUpdates.author = context.user.login;
      needsMetadataRewrite = true;
    }

    // Enrich metadata when not in dry-run mode
    if (!context.dryRun) {
      const enhancedModule = await this.enhancer.enhance(module, context);
      if (enhancedModule !== module) {
        const differences = this.getDifferences(module.metadata, enhancedModule.metadata);
        if (Object.keys(differences).length > 0) {
          metadataUpdates = { ...metadataUpdates, ...differences };
          needsMetadataRewrite = true;
        }
      }
    }

    // Execute remaining validation steps
    for (const step of this.steps) {
      const result = await step.validate(module, context);
      this.mergeValidationResult(result, errors, warnings, exportBindings, importRecords);
    }

    // Generate updated content when metadata changed
    let updatedContent: string | undefined;
    if (needsMetadataRewrite) {
      const mergedMetadata = { ...module.metadata, ...metadataUpdates };
      updatedContent = this.updateFrontmatter(module.content, mergedMetadata);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      updatedMetadata: needsMetadataRewrite ? metadataUpdates : undefined,
      updatedContent,
      exports: exportBindings.length > 0 ? exportBindings : undefined,
      imports: importRecords.length > 0 ? importRecords : undefined
    };
  }

  private mergeValidationResult(
    result: ValidationResult,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    exports: ExportBinding[],
    imports: ImportRecord[]
  ): void {
    if (!result) return;
    if (result.errors?.length) {
      errors.push(...result.errors);
    }
    if (result.warnings?.length) {
      warnings.push(...result.warnings);
    }
    if (result.exports?.length) {
      exports.push(...result.exports);
    }
    if (result.imports?.length) {
      imports.push(...result.imports);
    }
  }

  private getDifferences(original: ModuleMetadata, enhanced: ModuleMetadata): Partial<ModuleMetadata> {
    const differences: Partial<ModuleMetadata> = {};
    const fieldsToCheck: (keyof ModuleMetadata)[] = [
      'name',
      'author',
      'version',
      'about',
      'license',
      'repo',
      'bugs',
      'homepage',
      'mlldVersion',
      'dependencies',
      'devDependencies'
    ];

    for (const field of fieldsToCheck) {
      if (original[field] !== enhanced[field]) {
        (differences as Record<string, unknown>)[field as string] = enhanced[field];
      }
    }

    return differences;
  }

  private updateFrontmatter(content: string, metadata: ModuleMetadata): string {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return this.formatFrontmatter(metadata) + '\n\n' + content;
    }

    const afterFrontmatter = content.substring(frontmatterMatch[0].length);
    return this.formatFrontmatter(metadata) + afterFrontmatter;
  }

  private formatFrontmatter(metadata: ModuleMetadata): string {
    const lines = ['---'];

    lines.push(`name: ${metadata.name}`);
    lines.push(`author: ${metadata.author}`);
    if (metadata.version) lines.push(`version: ${metadata.version}`);
    lines.push(`about: ${metadata.about}`);

    if (metadata.dependencies && Object.keys(metadata.dependencies).length > 0) {
      lines.push('dependencies:');
      for (const [depName, version] of Object.entries(metadata.dependencies)) {
        lines.push(`  "${depName}": "${version}"`);
      }
    }

    if (metadata.devDependencies && Object.keys(metadata.devDependencies).length > 0) {
      lines.push('devDependencies:');
      for (const [depName, version] of Object.entries(metadata.devDependencies)) {
        lines.push(`  "${depName}": "${version}"`);
      }
    }

    if (metadata.bugs) lines.push(`bugs: ${metadata.bugs}`);
    if (metadata.repo) lines.push(`repo: ${metadata.repo}`);
    if (metadata.keywords?.length) {
      lines.push(`keywords: [${metadata.keywords.map(k => `"${k}"`).join(', ')}]`);
    }
    if (metadata.homepage) lines.push(`homepage: ${metadata.homepage}`);
    lines.push(`license: ${metadata.license}`);
    if (metadata.mlldVersion) lines.push(`mlld-version: "${metadata.mlldVersion}"`);

    lines.push('---');
    return lines.join('\n');
  }
}
