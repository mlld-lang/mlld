/**
 * Module Initialization CLI Command
 * Creates a new mlld module file with interactive setup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline/promises';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { ModuleType, MODULE_TYPE_PATHS } from '@core/registry/types';

const VALID_MODULE_TYPES: ModuleType[] = ['library', 'app', 'command', 'skill', 'environment'];

export interface InitModuleOptions {
  name?: string;
  about?: string;
  author?: string;
  output?: string;
  skipGit?: boolean;
  version?: string;
  keywords?: string;
  homepage?: string;
  force?: boolean;
  type?: ModuleType;
  global?: boolean;
}

export class InitModuleCommand {
  private authService: GitHubAuthService;

  constructor() {
    this.authService = new GitHubAuthService();
  }

  async initModule(options: InitModuleOptions = {}): Promise<void> {
    console.log(chalk.blue('Creating new mlld module...\n'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const fileSystem = new NodeFileSystem();
      let projectRoot = process.cwd();
      try {
        projectRoot = await findProjectRoot(process.cwd(), fileSystem);
      } catch {
        // Fall back to current directory when project root is not found
      }
      const projectConfig = new ProjectConfig(projectRoot);

      // Check if user provided @resolver/module syntax
      let resolverPrefix: string | undefined;
      let resolverPath: string | undefined;
      let suggestedModuleName = '';
      
      if (options.output && options.output.startsWith('@')) {
        // User provided @resolver/module syntax
        const match = options.output.match(/^(@[^/]+\/)(.+)$/);
        if (match) {
          resolverPrefix = match[1];
          suggestedModuleName = match[2];
          
          // Look up the resolver configuration
          const resolverPrefixes = projectConfig.getResolverPrefixes();

          if (resolverPrefixes.length > 0) {
            try {
              const resolver = resolverPrefixes.find(
                (r: any) => r.prefix === resolverPrefix
              );
              
              if (resolver && resolver.resolver === 'LOCAL' && resolver.config?.basePath) {
                resolverPath = resolver.config.basePath;
              } else if (resolver && resolver.resolver === 'GITHUB') {
                // For GitHub resolver, we'll create locally and remind user to commit/push
                const { repository, basePath } = resolver.config;
                console.log(chalk.blue(`\nThis will create a module for GitHub repository: ${repository}`));
                console.log(chalk.gray(`Remote path: ${basePath || 'modules'}/${suggestedModuleName}.mld.md`));
                console.log('');
                
                // Check if we're in a git repo that matches
                try {
                  const { execSync } = await import('child_process');
                  const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
                  const githubMatch = remoteUrl.match(/github\.com[:/](.+)\.git/);
                  
                  if (githubMatch && githubMatch[1] === repository) {
                    // We're in the right repo!
                    const localBasePath = basePath || 'modules';
                    resolverPath = localBasePath;
                    console.log(chalk.green(`✔ Current repository matches ${repository}`));
                    console.log(`Module will be created at: ${localBasePath}/${suggestedModuleName}.mld.md`);
                    console.log('');
                  } else {
                    throw new MlldError(
                      `You're not in the ${repository} repository.\n` +
                      `Please clone it first:\n` +
                      `  git clone https://github.com/${repository}.git\n` +
                      `  cd ${repository.split('/')[1]}\n` +
                      `  mlld init ${options.output}`,
                      { code: 'WRONG_REPOSITORY', severity: ErrorSeverity.Fatal }
                    );
                  }
                } catch (error) {
                  if (error instanceof MlldError) throw error;
                  throw new MlldError(
                    `Not in a git repository. For GitHub modules, you need to:\n` +
                    `  1. Clone the repository: git clone https://github.com/${repository}.git\n` +
                    `  2. Run mlld init from inside the repository`,
                    { code: 'NOT_IN_GIT_REPO', severity: ErrorSeverity.Fatal }
                  );
                }
              } else if (resolver) {
                throw new MlldError(
                  `Cannot create modules with ${resolver.resolver} resolver`,
                  { code: 'INVALID_RESOLVER_TYPE', severity: ErrorSeverity.Fatal }
                );
              } else {
                throw new MlldError(
                  `No resolver configured for prefix: ${resolverPrefix}`,
                  { code: 'RESOLVER_NOT_FOUND', severity: ErrorSeverity.Fatal }
                );
              }
            } catch (error) {
              if (error instanceof MlldError) throw error;
              // Ignore other errors
            }
          } else {
            throw new MlldError(
              `No resolver configuration found. Run 'mlld setup' to configure resolvers first.`,
              { code: 'NO_CONFIG', severity: ErrorSeverity.Fatal }
            );
          }
        }
      } else if (options.output) {
        // Extract module name from regular filename
        const basename = path.basename(options.output);
        // First strip module extensions
        if (basename.endsWith('.mld.md')) {
          suggestedModuleName = basename.slice(0, -7);
        } else if (basename.endsWith('.mld')) {
          suggestedModuleName = basename.slice(0, -4);
        } else if (basename.endsWith('.mlld.md')) {
          // Legacy extension handling for compatibility
          suggestedModuleName = basename.slice(0, -8);
        } else {
          // Strip any other file extension (e.g., .md, .txt, etc.)
          const extIndex = basename.lastIndexOf('.');
          if (extIndex > 0) {
            suggestedModuleName = basename.slice(0, extIndex);
          } else {
            suggestedModuleName = basename;
          }
        }
      }

      // Determine where to create the module
      let outputPath: string;
      let displayPath: string;
      
      // Check for local resolver configuration
      const resolverPrefixes = projectConfig.getResolverPrefixes();
      let localModulesPath = projectConfig.getLocalModulesPath();

      // Look for LOCAL resolver with @local/ prefix
      const localResolver = resolverPrefixes.find(
        (r: any) => r.resolver === 'LOCAL' && r.prefix === '@local/'
      );

      if (localResolver?.config?.basePath) {
        localModulesPath = localResolver.config.basePath;
      }

      const absoluteModulesPath = path.isAbsolute(localModulesPath)
        ? localModulesPath
        : path.resolve(projectRoot, localModulesPath);
      const currentDir = process.cwd();

      // If current directory is within or is the modules path, use current directory.
      // Otherwise, make the suggested path relative to the current directory to avoid nesting.
      if (currentDir === absoluteModulesPath || currentDir.startsWith(absoluteModulesPath + path.sep)) {
        localModulesPath = '.';
      } else if (!path.isAbsolute(localModulesPath)) {
        localModulesPath = path.relative(currentDir, absoluteModulesPath);
      }

      // If we have a resolver path, we know exactly where to create it
      if (resolverPath && resolverPrefix) {
        const moduleFileName = suggestedModuleName + '.mld.md';
        outputPath = path.join(resolverPath, moduleFileName);
        displayPath = path.relative(process.cwd(), outputPath);
        
        console.log(`\nWill create module: ${chalk.cyan(resolverPrefix + suggestedModuleName)}`);
        console.log(`Location: ${displayPath}`);
        console.log('');
        
        const confirm = await rl.question('Continue? [Y/n]: ') || 'y';
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
          console.log(chalk.gray('Module creation cancelled.'));
          return;
        }
        
        // Ensure directory exists
        const absolutePath = path.resolve(path.dirname(outputPath));
        if (!existsSync(absolutePath)) {
          await fs.mkdir(absolutePath, { recursive: true });
        }
      }
      // If user provided a filename, ask where to create it
      else if (options.output) {
        const moduleFileName = suggestedModuleName + '.mld.md';
        const option1Path = path.join(localModulesPath, moduleFileName);
        
        // For option 2, preserve directory structure if provided
        let option2Path: string;
        if (options.output.endsWith('.mld.md')) {
          option2Path = options.output;
        } else if (options.output.endsWith('.mld')) {
          option2Path = options.output.replace(/\.mld$/, '.mld.md');
        } else if (options.output.endsWith('.mlld.md')) {
          // Accept legacy extension but normalize to .mld.md
          option2Path = options.output.replace(/\.mlld\.md$/, '.mld.md');
        } else {
          // For any other case, we need to handle directories and extensions
          const dir = path.dirname(options.output);
          const base = path.basename(options.output);
          
          // Strip any extension from the basename
          let nameWithoutExt = base;
          const extIndex = base.lastIndexOf('.');
          if (extIndex > 0) {
            nameWithoutExt = base.slice(0, extIndex);
          }
          
          // Reconstruct the path with .mld.md extension
          if (dir === '.') {
            option2Path = nameWithoutExt + '.mld.md';
          } else {
            option2Path = path.join(dir, nameWithoutExt + '.mld.md');
          }
        }
        
        console.log('\nCreate new module in:');
        console.log(`  1. ${path.relative(process.cwd(), option1Path)} (Recommended)`);
        console.log(`  2. ${path.relative(process.cwd(), option2Path)}`);
        console.log('');
        
        const choice = await rl.question('Choice [1]: ') || '1';
        
        if (choice === '1') {
          outputPath = option1Path;
          displayPath = path.relative(process.cwd(), outputPath);
          
          // Ensure directory exists
          const absolutePath = path.resolve(path.dirname(outputPath));
          if (!existsSync(absolutePath)) {
            await fs.mkdir(absolutePath, { recursive: true });
          }
        } else {
          outputPath = path.resolve(option2Path);
          displayPath = path.relative(process.cwd(), outputPath);
          
          // Ensure directory exists if path includes directories
          const dir = path.dirname(outputPath);
          if (dir !== '.' && !existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true });
          }
        }
      } else {
        // No output specified, will determine after getting module name
        outputPath = '';
        displayPath = '';
      }
      const metadata: any = {};

      console.log('Modules are lowercase with hyphens allowed\n');
      
      if (options.name) {
        metadata.name = options.name;
      } else if (resolverPrefix && suggestedModuleName) {
        // For @resolver/module syntax, we already have the name
        metadata.name = suggestedModuleName;
        console.log(`Module name: ${metadata.name}`);
      } else {
        const prompt = suggestedModuleName ? `Module name [${suggestedModuleName}]: ` : 'Module name: ';
        const input = await rl.question(prompt);
        metadata.name = input || suggestedModuleName;
      }
      
      if (!metadata.name.match(/^[a-z0-9-]+$/)) {
        throw new MlldError('Invalid module name. Must be lowercase alphanumeric with hyphens.', {
          code: 'INVALID_MODULE_NAME',
          severity: ErrorSeverity.Fatal
        });
      }

      if (options.about) {
        metadata.about = options.about;
      } else {
        metadata.about = await rl.question('About: ');
      }

      if (options.author) {
        metadata.author = options.author;
      } else {
        let defaultAuthor;
        try {
          const user = await this.authService.getGitHubUser();
          if (user) {
            defaultAuthor = user.login;
          }
        } catch {
          // Ignore auth errors
        }

        if (!defaultAuthor && !options.skipGit) {
          try {
            // Try to get GitHub username from git config first
            try {
              defaultAuthor = execSync('git config github.user', { encoding: 'utf8' }).trim();
            } catch {
              // If no github.user, try to extract from remote URL
              try {
                const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
                const githubMatch = remoteUrl.match(/github\.com[:\/]([^\/]+)\/.+/);
                if (githubMatch) {
                  defaultAuthor = githubMatch[1];
                }
              } catch {
                // If all else fails, use git user.name as last resort
                defaultAuthor = execSync('git config user.name', { encoding: 'utf8' }).trim();
              }
            }
          } catch {
            // Ignore git errors
          }
        }

        if (defaultAuthor) {
          const authorInput = await rl.question(`Author [${defaultAuthor}]: `);
          metadata.author = authorInput || defaultAuthor;
        } else {
          metadata.author = await rl.question('Author (GitHub username or organization): ');
        }
      }

      // Version
      if (options.version) {
        metadata.version = options.version;
      } else {
        const versionInput = await rl.question('Version [1.0.0]: ');
        metadata.version = versionInput || '1.0.0';
      }

      // Optional fields (skip if all required fields were provided via flags)
      const allRequiredProvided = options.name && options.about && options.author;
      
      if (!allRequiredProvided) {
        console.log('\nOptional fields:');
      }
      
      // Keywords
      if (options.keywords) {
        metadata.keywords = options.keywords.split(',').map(k => k.trim());
      } else if (!allRequiredProvided) {
        const keywordsInput = await rl.question('Keywords []: ');
        if (keywordsInput) {
          metadata.keywords = keywordsInput.split(',').map(k => k.trim());
        }
      }

      // Homepage
      if (options.homepage) {
        metadata.homepage = options.homepage;
      } else if (!allRequiredProvided) {
        const homepageInput = await rl.question('Homepage []: ');
        if (homepageInput) {
          metadata.homepage = homepageInput;
        }
      }

      if (!options.skipGit) {
        try {
          const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
          const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
          
          const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
          if (githubMatch) {
            const [, owner, repo] = githubMatch;
            metadata.repo = `https://github.com/${owner}/${repo}`;
            metadata.bugs = `https://github.com/${owner}/${repo}/issues`;
            console.log(chalk.gray(`Auto-detected repository: ${metadata.repo}`));
          }
        } catch {
          // Not in git repo or no remote
        }
      }

      let selectedNeeds: string[] = [];
      console.log('\nRuntime dependencies (js, node, py, sh):');
      const needsInput = await rl.question('Needs []: ');
      selectedNeeds = needsInput
        ? needsInput.split(',').map(n => n.trim()).filter(Boolean)
        : [];

      const validNeeds = ['js', 'node', 'py', 'sh'];
      for (const need of selectedNeeds) {
        if (!validNeeds.includes(need)) {
          throw new MlldError(`Invalid runtime dependency: "${need}". Valid options are: ${validNeeds.join(', ')}`, {
            code: 'INVALID_RUNTIME_DEPENDENCY',
            severity: ErrorSeverity.Fatal
          });
        }
      }

      // Always use simple module pattern
      const patternChoice = '1';

      metadata.license = 'CC0';
      metadata.mlldVersion = '*';

      const content = this.generateModuleContent(metadata, patternChoice, selectedNeeds);

      // Determine output path if not already set
      if (!outputPath) {
        // No output was specified, so ask where to create it
        const moduleFileName = metadata.name + '.mld.md';
        const option1Path = path.join(localModulesPath, moduleFileName);
        const option2Path = path.join('.', moduleFileName);
        
        console.log('\nCreate new module in:');
        console.log(`  1. ${path.relative(process.cwd(), option1Path)} (Recommended)`);
        console.log(`  2. ${option2Path}`);
        console.log('');
        
        const choice = await rl.question('Choice [1]: ') || '1';
        
        if (choice === '1') {
          outputPath = option1Path;
          displayPath = path.relative(process.cwd(), outputPath);
          
          // Ensure directory exists
          const absolutePath = path.resolve(path.dirname(outputPath));
          if (!existsSync(absolutePath)) {
            await fs.mkdir(absolutePath, { recursive: true });
          }
        } else {
          outputPath = path.resolve(option2Path);
          displayPath = path.relative(process.cwd(), outputPath);
        }
      }

      try {
        await fs.access(outputPath);
        const overwrite = await rl.question(chalk.yellow(`\nFile ${displayPath} already exists. Overwrite? (y/n): `));
        if (overwrite.toLowerCase() !== 'y') {
          console.log(chalk.gray('Module creation cancelled.'));
          return;
        }
      } catch {
        // File doesn't exist, good to go
      }

      await fs.writeFile(outputPath, content, 'utf8');
      
      console.log(chalk.green(`\n✔ Module created: ${displayPath}`));
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.gray(`  1. Edit ${displayPath} to add your module functionality`));
      console.log(chalk.gray(`  2. Test locally: mlld ${displayPath}`));
      console.log(chalk.gray(`  3. Publish: mlld publish ${displayPath}`));
      
      // Check if this was created for a GitHub resolver
      const isGitHubModule = resolverPrefix && options.output && options.output.startsWith('@') && 
        resolverPath && !resolverPath.startsWith('.');
      
      if (isGitHubModule) {
        console.log(chalk.gray('\nFor GitHub modules:'));
        console.log(chalk.gray('  3. Commit and push to GitHub:'));
        console.log(chalk.gray(`     git add ${displayPath}`));
        console.log(chalk.gray(`     git commit -m "Add ${metadata.name} module"`));
        console.log(chalk.gray(`     git push`));
        console.log(chalk.gray(`  4. Your module will be available at: ${options.output}`));
      }
      
      if (selectedNeeds.length === 0) {
        console.log(chalk.gray('\nNote: Dependencies will be auto-detected when you publish.'));
      }

    } finally {
      rl.close();
    }
  }

  /**
   * Scaffold a directory-based module (app, library, command, skill)
   */
  async scaffoldDirectoryModule(options: InitModuleOptions): Promise<void> {
    const moduleType = options.type!;
    const typePaths = MODULE_TYPE_PATHS[moduleType];

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const fileSystem = new NodeFileSystem();
      let projectRoot = process.cwd();
      try {
        projectRoot = await findProjectRoot(process.cwd(), fileSystem);
      } catch {
        // Fall back to current directory
      }

      // Determine base path
      let basePath: string;
      if (options.global) {
        basePath = path.join(os.homedir(), typePaths.global);
      } else {
        basePath = path.join(projectRoot, typePaths.local);
      }

      // Get module name
      let moduleName = options.name;
      if (!moduleName) {
        moduleName = await rl.question(`${moduleType} name (lowercase, hyphens allowed): `);
      }

      if (!moduleName || !moduleName.match(/^[a-z0-9-]+$/)) {
        throw new MlldError('Invalid module name. Must be lowercase alphanumeric with hyphens.', {
          code: 'INVALID_MODULE_NAME',
          severity: ErrorSeverity.Fatal
        });
      }

      const moduleDir = path.join(basePath, moduleName);

      // Check if directory exists
      if (existsSync(moduleDir) && !options.force) {
        throw new MlldError(`Directory already exists: ${moduleDir}\nUse --force to overwrite.`, {
          code: 'DIRECTORY_EXISTS',
          severity: ErrorSeverity.Fatal
        });
      }

      // Get about description
      let about = options.about;
      if (!about) {
        about = await rl.question('About (brief description): ');
      }

      // Get author
      let author = options.author;
      if (!author) {
        let defaultAuthor: string | undefined;
        try {
          const user = await this.authService.getGitHubUser();
          if (user) defaultAuthor = user.login;
        } catch {
          // Try git config
          try {
            defaultAuthor = execSync('git config github.user', { encoding: 'utf8' }).trim();
          } catch {
            try {
              const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
              const match = remoteUrl.match(/github\.com[:/]([^/]+)\/.+/);
              if (match) defaultAuthor = match[1];
            } catch {
              // Ignore
            }
          }
        }

        if (defaultAuthor) {
          const input = await rl.question(`Author [${defaultAuthor}]: `);
          author = input || defaultAuthor;
        } else {
          author = await rl.question('Author (GitHub username): ');
        }
      }

      // Get version
      const version = options.version || '1.0.0';

      // Create directory structure
      await fs.mkdir(moduleDir, { recursive: true });

      // Create type-specific subdirectories
      if (moduleType === 'app') {
        await fs.mkdir(path.join(moduleDir, 'lib'), { recursive: true });
        await fs.mkdir(path.join(moduleDir, 'prompts'), { recursive: true });
      } else if (moduleType === 'skill') {
        await fs.mkdir(path.join(moduleDir, '.claude-plugin'), { recursive: true });
        await fs.mkdir(path.join(moduleDir, 'skills', moduleName), { recursive: true });
      } else if (moduleType === 'command') {
        await fs.mkdir(path.join(moduleDir, '.claude-plugin'), { recursive: true });
        await fs.mkdir(path.join(moduleDir, 'commands'), { recursive: true });
      }

      // Generate manifest (module.yml)
      const entryField = moduleType === 'skill' ? `\nentry: skills/${moduleName}/SKILL.md`
        : moduleType === 'command' ? `\nentry: commands/${moduleName}.md` : '';
      const manifest = `name: ${moduleName}
author: ${author}
type: ${moduleType}
about: "${about}"
version: ${version}${entryField}
license: CC0
`;

      await fs.writeFile(path.join(moduleDir, 'module.yml'), manifest);

      // Generate entry point based on module type
      if (moduleType === 'skill') {
        const skillContent = this.generateSkillContent(moduleName, about || '');
        await fs.writeFile(path.join(moduleDir, 'skills', moduleName, 'SKILL.md'), skillContent);
      } else if (moduleType === 'command') {
        const commandContent = this.generateCommandContent(moduleName, about || '');
        await fs.writeFile(path.join(moduleDir, 'commands', `${moduleName}.md`), commandContent);
      } else {
        const indexContent = this.generateDirectoryIndexContent(moduleType, moduleName, about || '');
        await fs.writeFile(path.join(moduleDir, 'index.mld'), indexContent);
      }

      // Generate .claude-plugin/plugin.json for marketplace-compatible types
      if (moduleType === 'skill' || moduleType === 'command') {
        const pluginJson = {
          name: `${author}--${moduleName}`,
          description: about || `${moduleName} ${moduleType}`,
          version,
        };
        await fs.writeFile(
          path.join(moduleDir, '.claude-plugin', 'plugin.json'),
          JSON.stringify(pluginJson, null, 2) + '\n'
        );
      }

      // Generate type-specific support files
      if (moduleType === 'app') {
        await fs.writeFile(
          path.join(moduleDir, 'lib', 'context.mld'),
          this.generateAppContextLib()
        );
        await fs.writeFile(
          path.join(moduleDir, 'prompts', 'worker.att'),
          this.generateAppWorkerPrompt(moduleName)
        );
      }

      // Generate README.md
      const readmeContent = this.generateReadmeContent(moduleType, moduleName, author || '', about || '');
      await fs.writeFile(path.join(moduleDir, 'README.md'), readmeContent);

      // Report success
      const relPath = path.relative(process.cwd(), moduleDir);
      console.log(chalk.green(`\n✔ Created ${moduleType}: ${relPath}/`));
      console.log(chalk.gray('\nFiles created:'));
      console.log(chalk.gray(`  ${relPath}/module.yml`));
      if (moduleType === 'skill') {
        console.log(chalk.gray(`  ${relPath}/.claude-plugin/plugin.json`));
        console.log(chalk.gray(`  ${relPath}/skills/${moduleName}/SKILL.md`));
      } else if (moduleType === 'command') {
        console.log(chalk.gray(`  ${relPath}/.claude-plugin/plugin.json`));
        console.log(chalk.gray(`  ${relPath}/commands/${moduleName}.md`));
      } else {
        console.log(chalk.gray(`  ${relPath}/index.mld`));
      }
      if (moduleType === 'app') {
        console.log(chalk.gray(`  ${relPath}/lib/context.mld`));
        console.log(chalk.gray(`  ${relPath}/prompts/worker.att`));
      }
      console.log(chalk.gray(`  ${relPath}/README.md`));

      // Type-specific next steps
      console.log(chalk.gray('\nNext steps:'));
      if (moduleType === 'app') {
        console.log(chalk.gray(`  1. Define your work items in ${relPath}/index.mld`));
        console.log(chalk.gray(`  2. Edit the prompt template in ${relPath}/prompts/worker.att`));
        console.log(chalk.gray(`  3. Run: mlld run ${moduleName}`));
        console.log(chalk.gray(`  4. Publish: mlld publish ${relPath}`));
      } else if (moduleType === 'library') {
        console.log(chalk.gray(`  1. Edit ${relPath}/index.mld`));
        console.log(chalk.gray(`  2. Test: mlld ${relPath}/index.mld`));
        console.log(chalk.gray(`  3. Publish: mlld publish ${relPath}`));
      } else if (moduleType === 'command') {
        console.log(chalk.gray(`  1. Edit ${relPath}/commands/${moduleName}.md`));
        console.log(chalk.gray(`  2. Test in Claude Code with /${moduleName}`));
        console.log(chalk.gray(`  3. Publish: mlld publish ${relPath}`));
      } else if (moduleType === 'skill') {
        console.log(chalk.gray(`  1. Edit ${relPath}/skills/${moduleName}/SKILL.md`));
        console.log(chalk.gray(`  2. Test: mlld skill install --local ${relPath}`));
        console.log(chalk.gray(`     (installs to Claude Code, Codex, Pi, OpenCode)`));
        console.log(chalk.gray(`  3. Publish: mlld publish ${relPath}`));
      } else if (moduleType === 'environment') {
        console.log(chalk.gray(`  1. Edit ${relPath}/index.mld`));
        console.log(chalk.gray(`  2. Use: mlld env spawn ${moduleName} -- "your prompt"`));
        console.log(chalk.gray(`  3. Publish: mlld publish ${relPath}`));
      }

    } finally {
      rl.close();
    }
  }

  private generateDirectoryIndexContent(type: ModuleType, name: string, about: string): string {
    if (type === 'app') {
      return `>> ${about || name}
>> Usage: mlld run ${name} [--parallel <N>] [--filter <pattern>]

import { @logEvent, @mkdirp } from "./lib/context.mld"
import "@payload" as @p

var @parallelism = @p.parallel ?? "4"
var @filter = @p.filter ?? ""

exe @workerPrompt(item) = template "./prompts/worker.att"

var @outDir = "runs/${name}"
run @mkdirp(@outDir)

show \`=== ${name} ===\`
show \`Parallelism: @parallelism\`
show \`---\`

>> Replace with your work items (or load from a manifest file)
var @items = ["item-1", "item-2", "item-3"]

>> Parallel fan-out
var @results = for parallel(@parallelism) @item in @items [
  show \`  Processing: @item\`
  let @prompt = @workerPrompt(@item)
  let @result = { item: @item, status: "done" }
  run @logEvent(@outDir, "complete", @result)
  => @result
]

show \`\`
show \`=== Complete: @results.length items ===\`
show \`Results in: @outDir\`
`;
    } else if (type === 'library') {
      return `>> ${about || name}
>> Entry point for ${name}

exe @greet(name) = \`Hello, @name!\`

export { @greet }
`;
    } else if (type === 'environment') {
      return `>> ${about || name}
>> AI agent environment configuration

exe @spawn(prompt) = \\
  claude -p @prompt

exe @shell = bash

export { @spawn, @shell }
`;
    } else {
      return `>> ${about || name}
>> Claude Code skill

var @response = "Skill ${name} activated"
show @response
`;
    }
  }

  private generateSkillContent(name: string, about: string): string {
    return `---
name: ${name}
description: ${about || `${name} skill`}
---

## When to Use

- Describe when this skill should be activated
- List the kinds of tasks or questions it handles

## Instructions

Provide clear instructions for the AI assistant when this skill is activated.

### Key Concepts

Document the domain knowledge the assistant needs.

### Patterns

Describe patterns, best practices, or approaches to follow.

### Anti-Patterns

Document common mistakes or approaches to avoid.

## Examples

Show concrete examples of how to apply this skill:

\`\`\`
Example input or scenario here
\`\`\`

Expected approach or output.
`;
  }

  private generateCommandContent(name: string, about: string): string {
    return `---
description: ${about || `${name} command`}
---

${about || `Run the ${name} command.`}

## What This Command Does

Describe what happens when the user runs \`/${name}\`.

## Steps

1. First step
2. Second step
3. Third step

## Guidelines

- Be concise and actionable
- Ask for clarification if the request is ambiguous
`;
  }

  private generateAppContextLib(): string {
    return `>> Shared context helpers

exe @fileExists(path) = sh { test -f "$path" && echo "yes" || echo "no" }

exe @logEvent(runDir, eventType, eventData) = [
  let @eventsFile = \`@runDir/events.jsonl\`
  let @event = { ts: @now, event: @eventType, ...@eventData }
  append @event to "@eventsFile"
]

exe @mkdirp(dir) = sh { mkdir -p "$dir" }

exe @writeJson(inputData, path) = [
  output @inputData to "@path"
]

export { @fileExists, @logEvent, @mkdirp, @writeJson }
`;
  }

  private generateAppWorkerPrompt(name: string): string {
    return `You are a worker agent for ${name}.

## Item

<item>
@item
</item>

## Task

Process the given item and return a JSON result.

\`\`\`json
{
  "item": "<identifier>",
  "status": "done",
  "findings": []
}
\`\`\`
`;
  }

  private generateReadmeContent(type: ModuleType, name: string, author: string, about: string): string {
    if (type === 'app') {
      return `# ${name}

${about || `A mlld orchestrator.`}

## Usage

\`\`\`bash
mlld run ${name}
mlld run ${name} --parallel 8
mlld run ${name} --filter "pattern"
\`\`\`

## Structure

\`\`\`
${name}/
  index.mld            Entry point
  lib/context.mld      Helper functions
  prompts/worker.att   Prompt template
  module.yml           Module manifest
\`\`\`

## Customizing

1. Define your work items in \`index.mld\` (or load from a manifest file)
2. Edit \`prompts/worker.att\` to customize the LLM prompt
3. Add more helpers in \`lib/\` as needed

## License

CC0 - Public Domain
`;
    }

    if (type === 'skill') {
      return `# ${name}

${about || `A cross-harness AI skill.`}

## Install

\`\`\`bash
mlld skill install --local .claude/skills/${name}
\`\`\`

Installs to all detected harnesses: Claude Code, Codex, Pi, OpenCode.

## Structure

\`\`\`
${name}/
  .claude-plugin/
    plugin.json      Claude Code plugin manifest
  skills/${name}/
    SKILL.md         Skill content (YAML frontmatter + markdown)
  module.yml         Module manifest for mlld registry
  README.md
\`\`\`

This module is both an mlld registry module and a Claude Code plugin.
When published, it appears in the mlld registry (\`modules.json\`) and
in the Claude Code marketplace (\`marketplace.json\`).

## How Skills Work

Skills are markdown files with YAML frontmatter that AI assistants read when activated.
They work across multiple harnesses via \`mlld skill install\`:

| Harness    | Location                              |
|------------|---------------------------------------|
| Claude Code| Plugin system (\`claude plugin install\`)|
| Codex      | \`~/.codex/skills/\`                    |
| Pi         | \`~/.pi/agent/skills/\`                 |
| OpenCode   | \`~/.config/opencode/skills/\`          |

## License

CC0 - Public Domain
`;
    }

    if (type === 'command') {
      return `# ${name}

${about || `A Claude Code slash command.`}

## Usage

\`\`\`
/${name}
\`\`\`

## Structure

\`\`\`
${name}/
  .claude-plugin/
    plugin.json        Claude Code plugin manifest
  commands/
    ${name}.md         Command definition (YAML frontmatter + markdown)
  module.yml           Module manifest for mlld registry
  README.md
\`\`\`

This module is both an mlld registry module and a Claude Code plugin.
When published, it appears in the mlld registry (\`modules.json\`) and
in the Claude Code marketplace (\`marketplace.json\`).

## License

CC0 - Public Domain
`;
    }

    return `# ${name}

${about || `A mlld ${type}.`}

## tldr

${type === 'library' ? `\`\`\`mlld
import { @greet } from @${author}/${name}
show @greet("World")
\`\`\`` : `Use \`/${name}\` in Claude Code.`}

## docs

Add detailed documentation here.

## License

CC0 - Public Domain
`;
  }

  private generateModuleContent(metadata: any, _patternChoice: string, needs: string[]): string {
    const frontmatter = this.formatFrontmatter(metadata);
    const needsBlock = this.formatNeedsBlock(needs);
    
    const moduleContent = `

${needsBlock}
# @${metadata.author}/${metadata.name}

## tldr

${metadata.about}

\`\`\`mlld
/import { ${metadata.name} } from @${metadata.author}/${metadata.name}
/show @${metadata.name}("example")
\`\`\`

## docs

More detailed usage examples and documentation.

## module

\`\`\`mlld-run
/var @greeting = "Hello from ${metadata.name}!"

>> Add your mlld code here
>> Then \`/export { @greeting, @variable }\`
\`\`\`
`;
    
    return frontmatter + moduleContent.trim() + '\n';
  }

  private formatNeedsBlock(needs: string[]): string {
    if (!needs || needs.length === 0) {
      return '/needs {}\n';
    }

    const lines = needs.map(need => {
      if (need === 'sh') {
        return '  sh';
      }
      return `  ${need}: []`;
    });

    return `/needs {\n${lines.join('\n')}\n}\n`;
  }

  private formatFrontmatter(metadata: any): string {
    const lines = ['---'];
    
    lines.push(`name: ${metadata.name}`);
    lines.push(`author: ${metadata.author}`);
    if (metadata.version) lines.push(`version: ${metadata.version}`);
    lines.push(`about: ${metadata.about}`);
    
    if (metadata.bugs) lines.push(`bugs: ${metadata.bugs}`);
    if (metadata.repo) lines.push(`repo: ${metadata.repo}`);
    if (metadata.keywords && metadata.keywords.length > 0) {
      lines.push(`keywords: [${metadata.keywords.map((k: string) => `"${k}"`).join(', ')}]`);
    }
    if (metadata.homepage) lines.push(`homepage: ${metadata.homepage}`);
    lines.push(`license: ${metadata.license}`);
    if (metadata.mlldVersion) lines.push(`mlldVersion: "${metadata.mlldVersion}"`);
    
    lines.push('---');
    return lines.join('\n') + '\n';
  }
}

export async function initModuleCommand(args: string[], options: InitModuleOptions = {}): Promise<void> {
  const command = new InitModuleCommand();

  // If type is specified, use directory scaffolding
  if (options.type && VALID_MODULE_TYPES.includes(options.type)) {
    await command.scaffoldDirectoryModule(options);
  } else if (!options.output && !options.name && args.length === 0) {
    // No args at all — interactive mode: ask what kind of module
    const type = await promptModuleType();
    if (type === 'single-file') {
      await command.initModule(options);
    } else {
      options.type = type as ModuleType;
      await command.scaffoldDirectoryModule(options);
    }
  } else {
    await command.initModule(options);
  }
}

async function promptModuleType(): Promise<ModuleType | 'single-file'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.blue('What kind of module?\n'));
    console.log('  1. app          Orchestrator / runnable script       → llm/run/');
    console.log('  2. library      Importable module with exports       → llm/lib/');
    console.log('  3. command      Claude Code slash command            → .claude/commands/');
    console.log('  4. skill        Claude Code skill                    → .claude/skills/');
    console.log('  5. environment  AI agent environment                 → .mlld/env/');
    console.log('  6. single-file  All-in-one .mld.md module (legacy)');
    console.log('');

    const choice = await rl.question('Choice [1]: ') || '1';

    const typeMap: Record<string, ModuleType | 'single-file'> = {
      '1': 'app', 'app': 'app',
      '2': 'library', 'library': 'library', 'lib': 'library',
      '3': 'command', 'command': 'command', 'cmd': 'command',
      '4': 'skill', 'skill': 'skill',
      '5': 'environment', 'environment': 'environment', 'env': 'environment',
      '6': 'single-file', 'single-file': 'single-file',
    };

    const selected = typeMap[choice.trim().toLowerCase()];
    if (!selected) {
      throw new MlldError(`Invalid choice: ${choice}`, {
        code: 'INVALID_CHOICE',
        severity: ErrorSeverity.Fatal
      });
    }

    return selected;
  } finally {
    rl.close();
  }
}

export function createInitModuleCommand() {
  return {
    name: 'module',
    aliases: ['mod'],
    description: 'Create a new mlld module',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld module [type] [name] [options]
       mlld module [name]

Create mlld modules - either directory-based (app, library, command, skill)
or single-file modules for the registry.

Module Types:
  app         Runnable application      → llm/run/<name>/
  library     Importable module         → llm/lib/<name>/
  command     Claude slash command      → .claude/commands/<name>/
  skill       Claude skill              → .claude/skills/<name>/
  environment AI agent environment      → .mlld/env/<name>/

Examples:
  mlld module app myapp              Create app in llm/run/myapp/
  mlld module library utils          Create library in llm/lib/utils/
  mlld module command review         Create command in .claude/commands/review/
  mlld module skill helper           Create skill in .claude/skills/helper/
  mlld module environment myenv      Create environment in .mlld/env/myenv/
  mlld module app myapp --global     Create in ~/.mlld/run/myapp/

Single-file modules (legacy):
  mlld module mymod                  Create single-file module interactively
  mlld module @local/utils           Create in configured @local/ path

Options:
  -n, --name <name>           Module name
  -a, --author <author>       Author name
  -d, --about <description>   Module description
  -g, --global                Install to global location (~/.mlld/)
  --version <version>         Module version (default: 1.0.0)
  -f, --force                 Overwrite existing files
  -h, --help                  Show this help message
        `);
        return;
      }

      // Check if first arg is a module type
      const firstArg = args[0];
      let moduleType: ModuleType | undefined;
      let moduleName: string | undefined;

      if (firstArg && VALID_MODULE_TYPES.includes(firstArg as ModuleType)) {
        moduleType = firstArg as ModuleType;
        moduleName = args[1] || flags.name || flags.n;
      } else {
        // Legacy single-file module behavior
        moduleName = flags.name || flags.n;
        if (firstArg && !moduleName) {
          // First arg is the module name/path
          const basename = path.basename(firstArg);
          if (basename.endsWith('.mld.md')) {
            moduleName = basename.slice(0, -7);
          } else if (basename.endsWith('.mld')) {
            moduleName = basename.slice(0, -4);
          } else if (basename.endsWith('.mlld.md')) {
            moduleName = basename.slice(0, -8);
          } else {
            const extIndex = basename.lastIndexOf('.');
            moduleName = extIndex > 0 ? basename.slice(0, extIndex) : basename;
          }
        }
      }

      const options: InitModuleOptions = {
        type: moduleType,
        name: moduleName,
        about: flags.about || flags.description || flags.d,
        author: flags.author || flags.a,
        output: moduleType ? undefined : (firstArg || flags.output || flags.o),
        skipGit: flags['skip-git'] || flags['no-git'],
        version: flags.version,
        keywords: flags.keywords || flags.k,
        homepage: flags.homepage || flags.url,
        force: flags.force || flags.f,
        global: flags.global || flags.g,
      };

      try {
        await initModuleCommand(args, options);
      } catch (error) {
        if (error instanceof MlldError) {
          console.error(chalk.red(`Error: ${error.message}`));
        } else {
          console.error(chalk.red(`Unexpected error: ${error}`));
        }
        process.exit(1);
      }
    }
  };
}
