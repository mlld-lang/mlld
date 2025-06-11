/**
 * Add Runtime Dependencies CLI Command
 * Analyzes mlld module and updates needs in frontmatter
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { parseSync } from '@grammar/parser';
import * as yaml from 'js-yaml';

export interface AddNeedsOptions {
  verbose?: boolean;
  autoDetect?: boolean;
  force?: boolean;
}

export class AddNeedsCommand {
  /**
   * Analyze module and update runtime dependencies
   */
  async addNeeds(modulePath: string = '.', options: AddNeedsOptions = {}): Promise<void> {
    try {
      console.log(chalk.blue('🔍 Analyzing module dependencies...\n'));

      // Resolve module path
      const resolvedPath = path.resolve(modulePath);
      const stat = await fs.stat(resolvedPath);
      let filePath: string;
      
      if (stat.isDirectory()) {
        // Look for .mld or .mld.md files in directory
        const files = await fs.readdir(resolvedPath);
        const mldFiles = files.filter(f => f.endsWith('.mld') || f.endsWith('.mld.md'));
        
        if (mldFiles.length === 0) {
          throw new MlldError('No .mld or .mld.md files found in the specified directory', {
            code: 'NO_MLD_FILES',
            severity: ErrorSeverity.Fatal
          });
        }
        
        // Prefer main.mld.md, main.mld, index.mld.md, or index.mld
        if (mldFiles.includes('main.mld.md')) {
          filePath = path.join(resolvedPath, 'main.mld.md');
        } else if (mldFiles.includes('main.mld')) {
          filePath = path.join(resolvedPath, 'main.mld');
        } else if (mldFiles.includes('index.mld.md')) {
          filePath = path.join(resolvedPath, 'index.mld.md');
        } else if (mldFiles.includes('index.mld')) {
          filePath = path.join(resolvedPath, 'index.mld');
        } else {
          // Prefer .mld.md over .mld
          const mldMdFile = mldFiles.find(f => f.endsWith('.mld.md'));
          filePath = path.join(resolvedPath, mldMdFile || mldFiles[0]);
        }
      } else {
        filePath = resolvedPath;
        
        if (!filePath.endsWith('.mld') && !filePath.endsWith('.mld.md')) {
          throw new MlldError('Module file must have .mld or .mld.md extension', {
            code: 'INVALID_FILE_EXTENSION',
            severity: ErrorSeverity.Fatal
          });
        }
      }

      // Read file content
      let content = await fs.readFile(filePath, 'utf8');
      
      // Parse AST
      console.log(chalk.gray('Parsing module...'));
      let ast;
      try {
        ast = parseSync(content);
      } catch (parseError: any) {
        throw new MlldError(
          `Invalid mlld syntax: ${parseError.message}`,
          { code: 'INVALID_SYNTAX', severity: ErrorSeverity.Fatal }
        );
      }

      // Detect dependencies
      const detector = new DependencyDetector();
      const runtimeNeeds = detector.detectRuntimeNeeds(ast);
      const jsPackages = detector.detectJavaScriptPackages(ast);
      const pyPackages = detector.detectPythonPackages(ast);
      const shCommands = detector.detectShellCommands(ast);

      console.log(chalk.green('✅ Analysis complete\n'));

      // Display detected dependencies
      console.log(chalk.bold('Detected runtime needs:'));
      if (runtimeNeeds.length > 0) {
        console.log(`  needs: [${runtimeNeeds.map(n => `"${n}"`).join(', ')}]`);
      } else {
        console.log(chalk.gray('  needs: [] (pure mlld module)'));
      }

      if (jsPackages.length > 0) {
        console.log('\n  needs-js:');
        console.log(`    packages: [${jsPackages.map(p => `"${p}"`).join(', ')}]`);
      }

      if (pyPackages.length > 0) {
        console.log('\n  needs-py:');
        console.log(`    packages: [${pyPackages.map(p => `"${p}"`).join(', ')}]`);
      }

      if (shCommands.length > 0) {
        console.log('\n  needs-sh:');
        console.log(`    commands: [${shCommands.map(c => `"${c}"`).join(', ')}]`);
      }

      // Parse existing frontmatter
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      let metadata: any = {};
      
      if (frontmatterMatch) {
        try {
          metadata = yaml.load(frontmatterMatch[1]) as any;
        } catch (e) {
          throw new MlldError('Invalid YAML in frontmatter', {
            code: 'INVALID_FRONTMATTER',
            severity: ErrorSeverity.Fatal
          });
        }
      } else if (!options.force) {
        throw new MlldError(
          'No frontmatter found. Use --force to add frontmatter automatically.',
          { code: 'NO_FRONTMATTER', severity: ErrorSeverity.Fatal }
        );
      }

      // Update metadata with detected dependencies
      const oldNeeds = metadata.needs ? [...metadata.needs] : [];
      // Use string for single value, array for multiple values
      metadata.needs = runtimeNeeds.length === 1 ? runtimeNeeds[0] : runtimeNeeds;
      
      if (runtimeNeeds.includes('js') && jsPackages.length > 0) {
        metadata['needs-js'] = {
          packages: jsPackages
        };
      } else {
        delete metadata['needs-js'];
      }
      
      if (runtimeNeeds.includes('py') && pyPackages.length > 0) {
        metadata['needs-py'] = {
          packages: pyPackages
        };
      } else {
        delete metadata['needs-py'];
      }
      
      if (runtimeNeeds.includes('sh') && shCommands.length > 0) {
        metadata['needs-sh'] = {
          commands: shCommands
        };
      } else {
        delete metadata['needs-sh'];
      }

      // Check if anything changed
      const needsChanged = JSON.stringify(oldNeeds) !== JSON.stringify(runtimeNeeds);
      if (!needsChanged && !metadata['needs-js'] && !metadata['needs-py'] && !metadata['needs-sh']) {
        console.log(chalk.gray('\nNo changes needed - dependencies are up to date.'));
        return;
      }

      // Update the file
      console.log(chalk.blue('\n📝 Updating frontmatter...'));
      
      if (frontmatterMatch) {
        // Replace existing frontmatter
        const newFrontmatter = yaml.dump(metadata, { 
          sortKeys: false,
          lineWidth: -1,
          noArrayIndent: true  // Use compact array format when possible
        }).trim();
        content = content.replace(
          frontmatterMatch[0],
          `---\n${newFrontmatter}\n---`
        );
      } else {
        // Add new frontmatter
        const newFrontmatter = yaml.dump(metadata, { 
          sortKeys: false,
          lineWidth: -1,
          noArrayIndent: true  // Use compact array format when possible
        }).trim();
        content = `---\n${newFrontmatter}\n---\n\n${content}`;
      }

      // Write back to file
      await fs.writeFile(filePath, content, 'utf8');
      
      console.log(chalk.green(`✅ Updated ${path.basename(filePath)}`));
      
      if (options.verbose) {
        console.log(chalk.gray('\nChanges:'));
        if (JSON.stringify(oldNeeds) !== JSON.stringify(runtimeNeeds)) {
          console.log(chalk.gray(`  needs: [${oldNeeds.join(', ')}] → [${runtimeNeeds.join(', ')}]`));
        }
      }

    } catch (error) {
      if (error instanceof MlldError) {
        throw error;
      }
      throw new MlldError(`Failed to update dependencies: ${error.message}`, {
        code: 'ADD_NEEDS_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function addNeedsCommand(args: string[], options: AddNeedsOptions = {}): Promise<void> {
  const modulePath = args[0] || '.';
  const command = new AddNeedsCommand();
  await command.addNeeds(modulePath, options);
}

/**
 * Create add-needs command for CLI integration
 */
export function createAddNeedsCommand() {
  return {
    name: 'add-needs',
    aliases: ['needs', 'deps'],
    description: 'Analyze and update module runtime dependencies',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld add-needs [options] [module-path]

Analyze and update module runtime dependencies.

Analyzes your mlld module to detect runtime dependencies (js, py, sh) and
updates the frontmatter automatically.

Options:
  -v, --verbose               Show detailed output
  -a, --auto                  Auto-detect mode (default behavior)
  -f, --force                 Add frontmatter even if none exists

Examples:
  mlld add-needs              # Analyze current directory
  mlld add-needs my-module.mld.md # Analyze specific module
  mlld add-needs --force      # Add frontmatter if missing
  mlld add-needs --verbose    # Show detailed dependency analysis

Aliases:
  mlld needs                  # Short alias
  mlld deps                   # Alternative alias
        `);
        return;
      }
      
      const options: AddNeedsOptions = {
        verbose: flags.verbose || flags.v,
        autoDetect: flags.auto || flags.a,
        force: flags.force || flags.f,
      };
      
      try {
        await addNeedsCommand(args, options);
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