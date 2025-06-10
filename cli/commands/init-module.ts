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
import { execSync } from 'child_process';

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
    console.log(chalk.blue('=� Creating new mlld module...\n'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const metadata: any = {};

      if (options.name) {
        metadata.name = options.name;
      } else {
        metadata.name = await rl.question('Module name (lowercase, hyphens allowed): ');
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
        metadata.about = await rl.question('About (brief description): ');
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
            defaultAuthor = execSync('git config user.name', { encoding: 'utf8' }).trim();
          } catch {
            // Ignore git errors
          }
        }

        console.log('\nAuthor (your GitHub username or organization):');
        if (defaultAuthor) {
          const authorInput = await rl.question(`Author [${defaultAuthor}]: `);
          metadata.author = authorInput || defaultAuthor;
        } else {
          metadata.author = await rl.question('Author: ');
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
        const keywordsInput = await rl.question('Keywords (comma-separated, press Enter to skip): ');
        if (keywordsInput) {
          metadata.keywords = keywordsInput.split(',').map(k => k.trim());
        }
      }

      // Homepage
      if (options.homepage) {
        metadata.homepage = options.homepage;
      } else if (!allRequiredProvided) {
        const homepageInput = await rl.question('Homepage URL (press Enter to skip): ');
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
            console.log(chalk.gray(`\nAuto-detected repository: ${metadata.repo}`));
          }
        } catch {
          // Not in git repo or no remote
        }
      }

      console.log('\nRuntime dependencies:');
      console.log(chalk.gray('  Dependencies will be auto-detected when you publish.'));
      console.log(chalk.gray('  For now, specify if you know you\'ll use external runtimes.'));
      console.log(chalk.gray('  Options: js, py, sh (comma-separated, or press Enter for none)'));
      
      const needsInput = await rl.question('Needs []: ');
      if (needsInput) {
        metadata.needs = needsInput.split(',').map(n => n.trim());
      } else {
        metadata.needs = [];
      }

      console.log('\nModule export pattern:');
      console.log('  1. Structured interface (recommended for reusable modules)');
      console.log('  2. Simple module (for basic functionality)');
      console.log('  3. Empty (I\'ll add content later)');
      
      const patternChoice = await rl.question('\nChoice [1]: ') || '1';

      metadata.license = 'CC0';
      metadata['mlld-version'] = '*';

      const content = this.generateModuleContent(metadata, patternChoice);

      const outputFile = options.output || `${metadata.name}.mld.md`;
      const outputPath = path.resolve(outputFile);

      try {
        await fs.access(outputPath);
        const overwrite = await rl.question(chalk.yellow(`\nFile ${outputFile} already exists. Overwrite? (y/n): `));
        if (overwrite.toLowerCase() !== 'y') {
          console.log(chalk.gray('Module creation cancelled.'));
          return;
        }
      } catch {
        // File doesn't exist, good to go
      }

      await fs.writeFile(outputPath, content, 'utf8');
      
      console.log(chalk.green(`\n Module created: ${outputFile}`));
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.gray(`  1. Edit ${outputFile} to add your module functionality`));
      console.log(chalk.gray(`  2. Test locally: mlld ${outputFile}`));
      console.log(chalk.gray(`  3. Publish: mlld publish ${outputFile}`));
      
      if (metadata.needs.length === 0) {
        console.log(chalk.gray('\nNote: Dependencies will be auto-detected when you publish.'));
      }

    } finally {
      rl.close();
    }
  }

  private generateModuleContent(metadata: any, patternChoice: string): string {
    const frontmatter = this.formatFrontmatter(metadata);
    
    let moduleContent = '';
    
    switch (patternChoice) {
      case '1':
        moduleContent = `
# @${metadata.author}/${metadata.name}

## tldr

Tell us:
- what problem it solves
- why it's useful

## export

\`\`\`mlld-run
@exec example(input) = @run [echo "Processing: @input"]

>> Add your mlld code here
\`\`\`

## interface

\`\`\`mlld-run
@data module = {
  example: @example
}
\`\`\`
`;
        break;
        
      case '2':
        moduleContent = `
# @${metadata.author}/${metadata.name}

## tldr

Tell us:
- what problem it solves  
- why it's useful

## export

\`\`\`mlld-run
@text greeting = "Hello from ${metadata.name}!"
\`\`\`
`;
        break;
        
      case '3':
      default:
        moduleContent = `
# @${metadata.author}/${metadata.name}

## tldr

Tell us:
- what problem it solves
- why it's useful

## export

\`\`\`mlld-run
>> Write your mlld code here
\`\`\`
`;
        break;
    }
    
    return frontmatter + moduleContent.trim() + '\n';
  }

  private formatFrontmatter(metadata: any): string {
    const lines = ['---'];
    
    lines.push(`name: ${metadata.name}`);
    lines.push(`author: ${metadata.author}`);
    if (metadata.version) lines.push(`version: ${metadata.version}`);
    lines.push(`about: ${metadata.about}`);
    
    lines.push(`needs: [${metadata.needs.map((n: string) => `"${n}"`).join(', ')}]`);
    
    if (metadata.bugs) lines.push(`bugs: ${metadata.bugs}`);
    if (metadata.repo) lines.push(`repo: ${metadata.repo}`);
    if (metadata.keywords && metadata.keywords.length > 0) {
      lines.push(`keywords: [${metadata.keywords.map((k: string) => `"${k}"`).join(', ')}]`);
    }
    if (metadata.homepage) lines.push(`homepage: ${metadata.homepage}`);
    lines.push(`license: ${metadata.license}`);
    if (metadata['mlld-version']) lines.push(`mlld-version: ${metadata['mlld-version']}`);
    
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
    name: 'init-module',
    aliases: ['init'],
    description: 'Create a new mlld module interactively',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld init [options] [target]

Create a new mlld project or module.

Project Creation (when target is a directory):
  mlld init                    Initialize project in current directory
  mlld init my-project         Create new project directory 'my-project'

Module Creation (when target ends with .mld.md or .mld):
  mlld init my-module.mld.md   Create a new module file interactively

Options:
  -n, --name <name>           Module name (for module creation)
  -a, --author <author>       Author name
  -d, --about <description>   Module description
  -o, --output <path>         Output file path
  --version <version>         Module version (default: 1.0.0)
  -k, --keywords <keywords>   Comma-separated keywords
  --homepage, --url <url>     Homepage URL
  --skip-git                  Skip git integration
  -f, --force                 Overwrite existing files

Examples:
  mlld init                   # Initialize mlld project in current directory
  mlld init my-project        # Create new project 'my-project'
  mlld init utils.mld.md      # Create new module file interactively
  mlld init --name utils --about "Utility functions" utils.mld.md
        `);
        return;
      }
      
      // Extract module name from .mld filename if provided
      let moduleName = flags.name || flags.n;
      let outputPath = flags.output || flags.o || args[0];
      
      if (args[0] && (args[0].endsWith('.mld.md') || args[0].endsWith('.mld')) && !moduleName) {
        // Extract name from filename: "my-module.mld.md" -> "my-module" or "my-module.mld" -> "my-module"
        if (args[0].endsWith('.mld.md')) {
          moduleName = path.basename(args[0], '.mld.md');
        } else {
          moduleName = path.basename(args[0], '.mld');
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