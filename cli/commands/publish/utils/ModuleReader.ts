/**
 * Module reading and parsing utilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline/promises';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors';
import { parseSync } from '@grammar/parser';
import type { MlldNode } from '@core/types';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { ModuleMetadata, ModuleData, GitInfo } from '../types/PublishingTypes';
import { parseModuleMetadata } from '@core/registry/utils/ModuleMetadata';

export class ModuleReader {
  private authService: GitHubAuthService;

  constructor(authService: GitHubAuthService) {
    this.authService = authService;
  }

  /**
   * Read and parse a module from file system
   */
  async readModule(modulePath: string, options?: { verbose?: boolean }): Promise<{ 
    content: string; 
    metadata: ModuleMetadata; 
    filename: string; 
    filePath: string;
    ast: MlldNode[];
  }> {
    // Check if path is a directory or file
    const stat = await fs.stat(modulePath);
    let filePath: string;
    let filename: string;
    
    if (stat.isDirectory()) {
      // Look for .mld files in directory
      const files = await fs.readdir(modulePath);
      const mldFiles = files.filter(f => f.endsWith('.mld') || f.endsWith('.mld.md') || f.endsWith('.mlld.md'));
      
      if (mldFiles.length === 0) {
        throw new MlldError('No .mld, .mld.md, or .mlld.md files found in the specified directory', {
          code: 'NO_MLD_FILES',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Prefer main.mlld.md, main.mld.md, main.mld, index.mlld.md, index.mld.md, or index.mld
      if (mldFiles.includes('main.mlld.md')) {
        filename = 'main.mlld.md';
      } else if (mldFiles.includes('main.mld.md')) {
        filename = 'main.mld.md';
      } else if (mldFiles.includes('main.mld')) {
        filename = 'main.mld';
      } else if (mldFiles.includes('index.mlld.md')) {
        filename = 'index.mlld.md';
      } else if (mldFiles.includes('index.mld.md')) {
        filename = 'index.mld.md';
      } else if (mldFiles.includes('index.mld')) {
        filename = 'index.mld';
      } else {
        // Prefer .mlld.md over .mld.md over .mld
        const mlldMdFile = mldFiles.find(f => f.endsWith('.mlld.md'));
        const mldMdFile = mldFiles.find(f => f.endsWith('.mld.md'));
        filename = mlldMdFile || mldMdFile || mldFiles[0];
      }
      
      filePath = path.join(modulePath, filename);
    } else {
      // Direct file path
      filePath = modulePath;
      filename = path.basename(filePath);
      
      if (!filename.endsWith('.mld') && !filename.endsWith('.mld.md') && !filename.endsWith('.mlld.md')) {
        throw new MlldError('Module file must have .mld, .mld.md, or .mlld.md extension', {
          code: 'INVALID_FILE_EXTENSION',
          severity: ErrorSeverity.Fatal
        });
      }
    }
    
    // Read file content
    let content = await fs.readFile(filePath, 'utf8');
    
    // Parse metadata from content
    let metadata = this.parseMetadata(content, filename);
    
    // Interactive frontmatter setup if missing
    if (!this.hasFrontmatter(content)) {
      const user = await this.authService.getGitHubUser();
      metadata = await this.interactiveFrontmatterSetup(metadata, user!.login);
      content = this.addFrontmatter(content, metadata);
      
      // Write back to file
      console.log(chalk.blue('\nAdding frontmatter to your file...'));
      await fs.writeFile(filePath, content, 'utf8');
      console.log(chalk.green('✔ Frontmatter added to ' + filename));
    }
    
    // Parse and validate basic syntax early
    let ast: MlldNode[];
    try {
      ast = parseSync(content);
    } catch (parseError: any) {
      console.log(chalk.red('✘ Invalid mlld syntax'));
      
      // Extract useful error information
      const errorMessage = parseError.message || 'Unknown parse error';
      const location = parseError.location ? 
        ` at line ${parseError.location.start.line}, column ${parseError.location.start.column}` : '';
      
      throw new MlldError(
        `Module contains invalid mlld syntax${location}:\n${errorMessage}\n\n` +
        'Please fix syntax errors before publishing.',
        { 
          code: 'INVALID_SYNTAX', 
          severity: ErrorSeverity.Fatal,
          sourceLocation: parseError.location
        }
      );
    }
    
    return { content, metadata, filename, filePath, ast };
  }

  /**
   * Parse module metadata from content
   */
  private parseMetadata(content: string, filename: string): ModuleMetadata {
    const metadata: Partial<ModuleMetadata> = {
      name: '',
      author: '',
      about: '',
      license: 'CC0', // Default to CC0
      wants: [],
      needs: [],
      moduleNeeds: undefined,
      moduleWants: undefined,
    };
    
    // Module name comes from frontmatter 'name' field, NOT from filename
    // The filename is only used as a fallback if no frontmatter name exists
    const baseName = path.basename(filename, '.mld');
    
    // Parse frontmatter if exists
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const parsed = yaml.load(frontmatterMatch[1]) as any;
        
        // Frontmatter 'name' field takes precedence
        metadata.name = parsed.name || parsed.module || '';
        metadata.author = parsed.author || metadata.author;
        metadata.version = parsed.version;
        // Support both 'about' and legacy 'description'
        metadata.about = parsed.about || parsed.description || metadata.about;
        metadata.keywords = parsed.keywords;
        metadata.homepage = parsed.homepage;
        metadata.license = parsed.license || 'CC0';
        metadata.bugs = parsed.bugs;
        metadata.repo = parsed.repo || parsed.repository;
        metadata.mlldVersion = parsed.mlldVersion || parsed['mlld-version'] || parsed.mlld_version;

        const dependencies = parsed.dependencies ?? parsed['dependencies'];
        if (dependencies && typeof dependencies === 'object') {
          metadata.dependencies = dependencies;
        }

        const devDependencies = parsed.devDependencies ?? parsed['devDependencies'];
        if (devDependencies && typeof devDependencies === 'object') {
          metadata.devDependencies = devDependencies;
        }
      } catch (e) {
        // Invalid YAML, continue with defaults
      }
    }
    
    // Only use filename as fallback if no frontmatter name
    if (!metadata.name && baseName !== 'main' && baseName !== 'index') {
      metadata.name = baseName;
    }
    
    // Extract about from first heading if not in frontmatter
    if (!metadata.about) {
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        metadata.about = headingMatch[1].trim();
      }
    }
    
    const parsedNeeds = parseModuleMetadata(content);
    metadata.moduleNeeds = parsedNeeds.needs;
    metadata.moduleWants = parsedNeeds.wants;
    metadata.wants = parsedNeeds.wants.map(tier => tier.tier);
    metadata.needs = [];
    metadata.dependencies = parsedNeeds.dependencies;
    metadata.devDependencies = parsedNeeds.devDependencies;
    metadata.name = metadata.name || parsedNeeds.name || '';
    metadata.author = metadata.author || parsedNeeds.author || '';
    metadata.version = metadata.version || parsedNeeds.version;

    return metadata as ModuleMetadata;
  }

  /**
   * Check if content has frontmatter
   */
  private hasFrontmatter(content: string): boolean {
    return content.startsWith('---\n');
  }

  /**
   * Interactive frontmatter setup
   */
  private async interactiveFrontmatterSetup(
    metadata: ModuleMetadata,
    githubUser: string
  ): Promise<ModuleMetadata> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow('\nNo frontmatter found. Let\'s add it!\n'));

    try {
      // Module name
      if (!metadata.name) {
        metadata.name = await rl.question('Module name (lowercase, hyphens allowed): ');
        if (!metadata.name.match(/^[a-z0-9-]+$/)) {
          throw new MlldError('Invalid module name. Must be lowercase alphanumeric with hyphens.', {
            code: 'INVALID_MODULE_NAME',
            severity: ErrorSeverity.Fatal
          });
        }
      }

      // About
      if (!metadata.about) {
        metadata.about = await rl.question('About (brief description): ');
      }

      // Author (confirm GitHub user)
      console.log('\nAuthor (must be your GitHub username or an organization you belong to):');
      const authorPrompt = `Author [${githubUser}]: `;
      const authorInput = await rl.question(authorPrompt);
      metadata.author = authorInput || githubUser;
      
      // Note: Author validation will happen during the validation phase
      if (authorInput && authorInput !== githubUser) {
        console.log(chalk.gray(`Note: Publishing as '${authorInput}' - this will be validated during publishing`));
      }

      // Optional fields
      const addOptional = await rl.question('\nAdd optional fields? (y/n): ');
      if (addOptional.toLowerCase() === 'y') {
        metadata.version = await rl.question('Version [1.0.0]: ') || '1.0.0';
        
        const keywordsInput = await rl.question('Keywords (comma-separated): ');
        if (keywordsInput) {
          metadata.keywords = keywordsInput.split(',').map(k => k.trim());
        }
        
        const homepageInput = await rl.question('Homepage URL (optional): ');
        if (homepageInput) {
          metadata.homepage = homepageInput;
        }
      }
      
      // License is always CC0
      metadata.license = 'CC0';
      console.log(chalk.blue('\nFile: License: CC0 (public domain dedication)'));
      console.log(chalk.gray('   All modules in the mlld registry are CC0 licensed.'));

      console.log(chalk.blue('\nI\'ll add this frontmatter to your file:\n'));
      console.log(chalk.gray(this.formatFrontmatter(metadata)));
      
      const confirm = await rl.question('\nAdd to file? (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        throw new MlldError('Frontmatter setup cancelled', {
          code: 'USER_CANCELLED',
          severity: ErrorSeverity.Info
        });
      }

      return metadata;
    } finally {
      rl.close();
    }
  }

  /**
   * Add frontmatter to content
   */
  private addFrontmatter(content: string, metadata: ModuleMetadata): string {
    return this.formatFrontmatter(metadata) + '\n\n' + content;
  }

  /**
   * Format frontmatter for display with canonical field ordering
   */
  private formatFrontmatter(metadata: ModuleMetadata): string {
    const lines = ['---'];
    
    // Canonical field ordering
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
