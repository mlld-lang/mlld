/**
 * Module Initialization CLI Command
 * Creates a new mlld module file with interactive setup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline/promises';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { findProjectRoot } from '@core/utils/findProjectRoot';

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
  await command.initModule(options);
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
Usage: mlld module [options] [module-name]

Create a new mlld module interactively.

Examples:
  mlld module                    Create a new module interactively
  mlld module test               Create module named 'test'
  mlld module @local/utils       Create 'utils' in configured @local/ path
  mlld module @myorg/helper      Create 'helper' in configured @myorg/ path
  mlld module ./path/to/test     Create module at specific path

Options:
  -n, --name <name>           Module name
  -a, --author <author>       Author name
  -d, --about <description>   Module description
  -o, --output <path>         Output file path
  --version <version>         Module version (default: 1.0.0)
  -k, --keywords <keywords>   Comma-separated keywords
  --homepage, --url <url>     Homepage URL
  --skip-git                  Skip git integration
  -f, --force                 Overwrite existing files

More Examples:
  mlld module --name utils --about "Utility functions"
  mlld module test --author myorg
  mlld mod ./src/helpers.mld.md
        `);
        return;
      }
      
      // Extract module name from filename if provided
      let moduleName = flags.name || flags.n;
      let outputPath = flags.output || flags.o;
      
      // If first arg is provided and no output flag, treat it as the output/name
      if (args[0] && !outputPath) {
        outputPath = args[0];
        
        // Extract module name from the filename if not provided via flag
        if (!moduleName) {
          const basename = path.basename(args[0]);
          // First strip module extensions
          if (basename.endsWith('.mld.md')) {
            moduleName = basename.slice(0, -7);
          } else if (basename.endsWith('.mld')) {
            moduleName = basename.slice(0, -4);
          } else if (basename.endsWith('.mlld.md')) {
            moduleName = basename.slice(0, -8);
          } else {
            // Strip any other file extension (e.g., .md, .txt, etc.)
            const extIndex = basename.lastIndexOf('.');
            if (extIndex > 0) {
              moduleName = basename.slice(0, extIndex);
            } else {
              moduleName = basename;
            }
          }
        }
      }
      
      const options: InitModuleOptions = {
        name: moduleName,
        about: flags.about || flags.description || flags.d,
        author: flags.author || flags.a,
        output: outputPath,
        skipGit: flags['skip-git'] || flags['no-git'],
        version: flags.version || flags.v,
        keywords: flags.keywords || flags.k,
        homepage: flags.homepage || flags.url,
        force: flags.force || flags.f,
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
