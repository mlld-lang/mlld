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
import { formatVersionSpecifier } from '@core/registry/utils/ModuleNeeds';
import type { ModuleNeedsNormalized, ModuleManifest, ModuleType } from '@core/registry/types';
import type { CommandNeeds } from '@core/policy/needs';

export interface ModuleFile {
  relativePath: string;
  content: string;
}

export interface DirectoryModuleData {
  manifest: ModuleManifest;
  files: ModuleFile[];
  entryContent: string;
}

export class ModuleReader {
  private authService: GitHubAuthService;

  constructor(authService: GitHubAuthService) {
    this.authService = authService;
  }

  /**
   * Detect and read a module manifest (module.yml, module.yaml, or module.json)
   */
  async detectManifest(dirPath: string): Promise<ModuleManifest | null> {
    const manifestNames = ['module.yml', 'module.yaml', 'module.json'];

    for (const name of manifestNames) {
      const manifestPath = path.join(dirPath, name);
      try {
        const content = await fs.readFile(manifestPath, 'utf8');
        const parsed = name.endsWith('.json')
          ? JSON.parse(content)
          : yaml.load(content) as Record<string, unknown>;

        return this.validateManifest(parsed);
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Validate and normalize a manifest object
   */
  private validateManifest(parsed: Record<string, unknown>): ModuleManifest {
    const validTypes: ModuleType[] = ['library', 'app', 'command', 'skill'];
    const type = (parsed.type as string) || 'library';

    if (!validTypes.includes(type as ModuleType)) {
      throw new MlldError(`Invalid module type: ${type}. Must be one of: ${validTypes.join(', ')}`, {
        code: 'INVALID_MODULE_TYPE',
        severity: ErrorSeverity.Fatal
      });
    }

    if (!parsed.name || typeof parsed.name !== 'string') {
      throw new MlldError('Module manifest must have a "name" field', {
        code: 'MISSING_MODULE_NAME',
        severity: ErrorSeverity.Fatal
      });
    }

    if (!parsed.author || typeof parsed.author !== 'string') {
      throw new MlldError('Module manifest must have an "author" field', {
        code: 'MISSING_MODULE_AUTHOR',
        severity: ErrorSeverity.Fatal
      });
    }

    if (!parsed.about || typeof parsed.about !== 'string') {
      throw new MlldError('Module manifest must have an "about" field', {
        code: 'MISSING_MODULE_ABOUT',
        severity: ErrorSeverity.Fatal
      });
    }

    return {
      name: parsed.name as string,
      author: parsed.author as string,
      type: type as ModuleType,
      about: parsed.about as string,
      version: (parsed.version as string) || '1.0.0',
      entry: (parsed.entry as string) || undefined,
      needs: Array.isArray(parsed.needs) ? parsed.needs as string[] : undefined,
      license: (parsed.license as string) || 'CC0',
      mlldVersion: (parsed.mlldVersion as string) || undefined,
      dependencies: parsed.dependencies as Record<string, string> | undefined,
      devDependencies: parsed.devDependencies as Record<string, string> | undefined,
    };
  }

  /**
   * Read all files from a directory module
   */
  async readDirectoryModule(dirPath: string, manifest: ModuleManifest): Promise<DirectoryModuleData> {
    const files: ModuleFile[] = [];
    const rawEntryPoint = manifest.entry || 'index.mld';
    // Normalize entry point: strip leading ./, normalize separators to /
    const entryPoint = rawEntryPoint
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');

    const readDir = async (currentPath: string, relativePath: string = ''): Promise<void> => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            await readDir(fullPath, relPath);
          }
        } else {
          const content = await fs.readFile(fullPath, 'utf8');
          // Normalize path separators to / for consistent comparison
          files.push({ relativePath: relPath.replace(/\\/g, '/'), content });
        }
      }
    };

    await readDir(dirPath);

    const entryFile = files.find(f => f.relativePath === entryPoint);
    if (!entryFile) {
      throw new MlldError(`Entry point "${entryPoint}" not found in module directory`, {
        code: 'MISSING_ENTRY_POINT',
        severity: ErrorSeverity.Fatal
      });
    }

    return {
      manifest,
      files,
      entryContent: entryFile.content,
    };
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
    isDirectory?: boolean;
    directoryData?: DirectoryModuleData;
  }> {
    // Check if path is a directory or file
    const stat = await fs.stat(modulePath);
    let filePath: string;
    let filename: string;

    if (stat.isDirectory()) {
      // Check for manifest first (directory module with module.yml/yaml/json)
      const manifest = await this.detectManifest(modulePath);
      if (manifest) {
        const directoryData = await this.readDirectoryModule(modulePath, manifest);
        const entryPoint = manifest.entry || 'index.mld';
        filePath = path.join(modulePath, entryPoint);
        filename = entryPoint;

        // Parse entry point for AST
        // Use strict mode for .mld files, markdown mode for .mld.md files
        const parserMode = filename.endsWith('.mld.md') ? 'markdown' : 'strict';
        let ast: MlldNode[];
        try {
          ast = parseSync(directoryData.entryContent, { mode: parserMode });
        } catch (parseError: any) {
          const errorMessage = parseError.message || 'Unknown parse error';
          const location = parseError.location
            ? ` at line ${parseError.location.start.line}, column ${parseError.location.start.column}`
            : '';
          throw new MlldError(
            `Module contains invalid mlld syntax${location}:\n${errorMessage}\n\nPlease fix syntax errors before publishing.`,
            { code: 'INVALID_SYNTAX', severity: ErrorSeverity.Fatal, sourceLocation: parseError.location }
          );
        }

        // Build metadata from manifest
        const metadata: ModuleMetadata = {
          name: manifest.name,
          author: manifest.author,
          about: manifest.about,
          version: manifest.version,
          license: manifest.license || 'CC0',
          needs: manifest.needs || [],
          dependencies: manifest.dependencies,
          devDependencies: manifest.devDependencies,
          mlldVersion: manifest.mlldVersion,
        };

        return {
          content: directoryData.entryContent,
          metadata,
          filename,
          filePath,
          ast,
          isDirectory: true,
          directoryData,
        };
      }

      // Fallback: Look for .mld files in directory (single-file module)
      const files = await fs.readdir(modulePath);
      const mldFiles = files.filter(f =>
        f.endsWith('.mld.md') || f.endsWith('.mld') || f.endsWith('.mlld.md')
      );

      if (mldFiles.length === 0) {
        throw new MlldError('No .mld or .mld.md files found in the specified directory (legacy .mlld.md is also supported). For directory modules, add a module.yml manifest.', {
          code: 'NO_MLD_FILES',
          severity: ErrorSeverity.Fatal
        });
      }

      // Prefer main.mld.md, main.mld, index.mld.md, or index.mld
      if (mldFiles.includes('main.mld.md')) {
        filename = 'main.mld.md';
      } else if (mldFiles.includes('main.mld')) {
        filename = 'main.mld';
      } else if (mldFiles.includes('index.mld.md')) {
        filename = 'index.mld.md';
      } else if (mldFiles.includes('index.mld')) {
        filename = 'index.mld';
      } else {
        // Prefer .mld.md over .mld, fall back to legacy .mlld.md
        const mldMdFile = mldFiles.find(f => f.endsWith('.mld.md'));
        const mlldMdFile = mldFiles.find(f => f.endsWith('.mlld.md'));
        const mldFile = mldFiles.find(f => f.endsWith('.mld'));
        filename = mldMdFile || mldFile || mlldMdFile || mldFiles[0];
      }

      filePath = path.join(modulePath, filename);
    } else {
      // Direct file path
      filePath = modulePath;
      filename = path.basename(filePath);
      
      if (!filename.endsWith('.mld') && !filename.endsWith('.mld.md') && !filename.endsWith('.mlld.md')) {
        throw new MlldError('Module file must have .mld or .mld.md extension (legacy .mlld.md is still accepted)', {
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
    // Use strict mode for .mld files, markdown mode for .mld.md files
    const parserMode = filename.endsWith('.mld.md') || filename.endsWith('.mlld.md') ? 'markdown' : 'strict';
    let ast: MlldNode[];
    try {
      ast = parseSync(content, { mode: parserMode });
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
    this.applyModuleNeeds(metadata, parsedNeeds.needs);
    metadata.dependencies = parsedNeeds.dependencies;
    metadata.devDependencies = parsedNeeds.devDependencies;
    metadata.name = metadata.name || parsedNeeds.name || '';
    metadata.author = metadata.author || parsedNeeds.author || '';
    metadata.version = metadata.version || parsedNeeds.version;

    return metadata as ModuleMetadata;
  }

  private applyModuleNeeds(metadata: Partial<ModuleMetadata>, needs: ModuleNeedsNormalized): void {
    const runtimes = new Set<string>();
    let needsJs: ModuleMetadata['needsJs'];
    let needsNode: ModuleMetadata['needsNode'];
    let needsPy: ModuleMetadata['needsPy'];
    let needsSh: ModuleMetadata['needsSh'];

    const addRuntime = (name: string, specifier?: string): void => {
      switch (name) {
        case 'js':
          runtimes.add('js');
          needsJs = needsJs || {};
          if (specifier) needsJs.node = specifier;
          break;
        case 'node':
          runtimes.add('node');
          needsNode = needsNode || {};
          if (specifier) needsNode.node = specifier;
          break;
        case 'python':
        case 'py':
          runtimes.add('py');
          needsPy = needsPy || {};
          if (specifier) needsPy.python = specifier;
          break;
        case 'sh':
          runtimes.add('sh');
          needsSh = needsSh || {};
          if (specifier) needsSh.shell = specifier;
          break;
        default:
          break;
      }
    };

    for (const runtime of needs.runtimes || []) {
      addRuntime(runtime.name, runtime.specifier);
    }

    for (const [ecosystem, packages] of Object.entries(needs.packages || {})) {
      const formattedPackages = packages
        .map(pkg => pkg.raw || formatVersionSpecifier(pkg.name, pkg.specifier))
        .filter(Boolean);

      if (ecosystem === 'js') {
        addRuntime('js');
        needsJs = needsJs || {};
        if (formattedPackages.length > 0) {
          needsJs.packages = formattedPackages;
        }
      } else if (ecosystem === 'node') {
        addRuntime('node');
        needsNode = needsNode || {};
        if (formattedPackages.length > 0) {
          needsNode.packages = formattedPackages;
        }
      } else if (ecosystem === 'python' || ecosystem === 'py') {
        addRuntime('py');
        needsPy = needsPy || {};
        if (formattedPackages.length > 0) {
          needsPy.packages = formattedPackages;
        }
      }
    }

    if (needs.capabilities?.sh) {
      addRuntime('sh');
      needsSh = needsSh || {};
    }

    const commandList = this.flattenCommandNeeds(needs.capabilities?.cmd);
    if (commandList && commandList.length > 0) {
      addRuntime('sh');
      needsSh = needsSh || {};
      needsSh.commands = commandList;
    }

    metadata.needs = Array.from(runtimes);
    if (needsJs) metadata.needsJs = needsJs;
    if (needsNode) metadata.needsNode = needsNode;
    if (needsPy) metadata.needsPy = needsPy;
    if (needsSh) metadata.needsSh = needsSh;
  }

  private flattenCommandNeeds(cmd?: CommandNeeds): string[] | undefined {
    if (!cmd) return undefined;
    if (cmd.type === 'all') return ['*'];
    if (cmd.type === 'list') return [...cmd.commands];
    if (cmd.type === 'map') return Object.keys(cmd.entries);
    return undefined;
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
