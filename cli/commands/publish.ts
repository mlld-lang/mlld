/**
 * Module Publishing CLI Command v2
 * Combines git-native publishing with gist fallback
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as readline from 'readline/promises';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { OutputFormatter } from '../utils/output';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { MlldError, ErrorSeverity } from '@core/errors';
import * as yaml from 'js-yaml';
import { version as currentMlldVersion } from '@core/version';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { parseSync } from '@grammar/parser';

export interface PublishOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  useGist?: boolean; // Force gist creation even if in git repo
  useRepo?: boolean; // Force repository publishing (skip interactive prompt)
  org?: string; // Publish on behalf of an organization
  skipVersionCheck?: boolean; // Skip checking for latest mlld version (dev only)
}

export interface RuntimeDependencies {
  node?: string;
  python?: string;
  shell?: string;
  packages?: string[];
  commands?: string[];
}

export interface ModuleMetadata {
  name: string;
  author: string;
  version?: string;
  about: string;  // Renamed from description
  needs: string[];  // Required, empty array for pure mlld
  needsJs?: RuntimeDependencies;
  needsNode?: RuntimeDependencies;
  needsPy?: RuntimeDependencies;
  needsSh?: RuntimeDependencies;
  bugs?: string;
  repo?: string;
  keywords?: string[];
  homepage?: string;
  license: string;  // Always CC0, required
  mlldVersion?: string;
}

export interface GitInfo {
  isGitRepo: boolean;
  owner?: string;
  repo?: string;
  sha?: string;
  branch?: string;
  relPath?: string;
  isClean?: boolean;
  remoteUrl?: string;
}

export class PublishCommand {
  private authService: GitHubAuthService;

  constructor() {
    this.authService = new GitHubAuthService();
  }

  /**
   * Publish a module from the current directory or specified path
   */
  async publish(modulePath: string = '.', options: PublishOptions = {}): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Publishing mlld module...\n'));

      // Check for latest mlld version (unless skipped)
      if (!options.skipVersionCheck) {
        console.log(chalk.gray('Checking mlld version...'));
        const latestVersion = await this.getLatestMlldVersion();
        if (latestVersion && this.isNewerVersion(latestVersion, currentMlldVersion)) {
          throw new MlldError(
            `You're using mlld v${currentMlldVersion}, but v${latestVersion} is available.\n` +
            `Please update mlld before publishing:\n` +
            `  npm install -g mlld@latest\n\n` +
            `This ensures modules are compatible with the latest features.`,
            {
              code: 'OUTDATED_MLLD_VERSION',
              severity: ErrorSeverity.Fatal
            }
          );
        }
        console.log(chalk.green(`✅ Using latest mlld version (${currentMlldVersion})`));
      }

      // Check for conflicting options
      if (options.useGist && options.useRepo) {
        throw new MlldError('Cannot use both --use-gist and --use-repo options', {
          code: 'CONFLICTING_OPTIONS',
          severity: ErrorSeverity.Fatal
        });
      }

      // Get authenticated Octokit instance
      const octokit = await this.authService.getOctokit();
      const user = await this.authService.getGitHubUser();
      
      if (!user) {
        throw new MlldError('Failed to get GitHub user information', {
          code: 'GITHUB_AUTH_ERROR',
          severity: ErrorSeverity.Fatal
        });
      }

      // Read and validate module
      const resolvedPath = path.resolve(modulePath);
      const { content, metadata, filename, filePath } = await this.readModule(resolvedPath, { verbose: options.verbose });
      
      // Check git status before making any auto-changes
      const initialGitInfo = await this.detectGitInfo(filePath);
      let needsGitCommit = false;
      
      // Run validation phase (but don't write changes yet)
      console.log(chalk.gray('Running module validation...'));
      const validationResult = await this.validateModule(metadata, content, user, octokit, filePath, { dryRun: true });
      if (!validationResult.valid) {
        throw new MlldError(
          'Module validation failed:\n' +
          validationResult.errors.map(e => `  • ${e}`).join('\n'),
          {
            code: 'VALIDATION_FAILED',
            severity: ErrorSeverity.Fatal
          }
        );
      }
      console.log(chalk.green('✅ Module validation passed'));
      
      // Check if validation would make changes to the file
      const hasAutoChanges = validationResult.updatedContent && validationResult.updatedContent !== content;
      
      if (hasAutoChanges && initialGitInfo.isGitRepo && !options.force) {
        // Show what changes will be made
        console.log(chalk.blue('\n📝 The following metadata will be automatically added:'));
        if (validationResult.updatedMetadata) {
          const changes = this.describeMetadataChanges(metadata, validationResult.updatedMetadata);
          changes.forEach(change => console.log(chalk.gray(`   ${change}`)));
        }
        
        console.log(chalk.yellow('\n⚠️  These changes need to be committed before publishing.'));
        console.log(chalk.gray('Choose an option:'));
        console.log(chalk.gray('  1. Commit and push changes, then publish'));
        console.log(chalk.gray('  2. Cancel and let me commit manually'));
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const choice = await rl.question('\nChoice [1]: ');
        rl.close();
        
        if (choice === '2') {
          // Apply changes but don't proceed with publishing
          Object.assign(metadata, validationResult.updatedMetadata);
          await fs.writeFile(filePath, validationResult.updatedContent!, 'utf8');
          console.log(chalk.blue(`\n📝 Metadata added to ${path.basename(filePath)}`));
          console.log(chalk.gray('Please commit your changes and run publish again.'));
          return;
        }
        
        needsGitCommit = true;
      }
      
      // Apply any fixes from validation
      if (validationResult.updatedMetadata) {
        Object.assign(metadata, validationResult.updatedMetadata);
      }
      if (validationResult.updatedContent) {
        // Update the file with validated content
        await fs.writeFile(filePath, validationResult.updatedContent, 'utf8');
        
        if (needsGitCommit) {
          // Commit the changes
          await this.commitMetadataChanges(filePath, validationResult.updatedMetadata);
        }
      }
      
      // Determine the publishing author (user or org)
      let publishingAuthor = user.login;
      
      // Check if publishing on behalf of an organization via --org flag
      if (options.org) {
        publishingAuthor = options.org;
        
        // Verify user has permission to publish for this org
        const hasOrgPermission = await this.checkOrgPermission(octokit, options.org, user.login);
        if (!hasOrgPermission) {
          throw new MlldError(
            `You don't have permission to publish on behalf of organization '${options.org}'.\n` +
            `Please ensure you're a member of the organization.`,
            {
              code: 'ORG_PERMISSION_ERROR',
              severity: ErrorSeverity.Fatal
            }
          );
        }
        
        console.log(chalk.green(`✅ Verified permission to publish as @${options.org}`));
        metadata.author = publishingAuthor;
      } else if (metadata.author) {
        // Author was already validated in validateModule
        publishingAuthor = metadata.author;
      }

      // Validate imports reference only public modules
      console.log(chalk.gray('Validating module imports...'));
      const importValidation = await this.validateImports(content, metadata, publishingAuthor, octokit);
      if (!importValidation.valid) {
        throw new MlldError(
          'Module imports validation failed:\n' +
          importValidation.errors.map(e => `  • ${e}`).join('\n') +
          '\n\nOnly published modules from the registry can be imported.',
          {
            code: 'IMPORT_VALIDATION_ERROR',
            severity: ErrorSeverity.Fatal
          }
        );
      }

      // Detect git information
      const gitInfo = await this.detectGitInfo(filePath);
      
      // Check for clean working tree if in git repo
      if (gitInfo.isGitRepo && !gitInfo.isClean && !options.force) {
        throw new MlldError(
          `Uncommitted changes in ${filename}\n` +
          'Please commit your changes before publishing or use --force to override.',
          {
            code: 'UNCOMMITTED_CHANGES',
            severity: ErrorSeverity.Fatal
          }
        );
      }

      console.log(chalk.bold('Module Information:'));
      console.log(`  Name: @${publishingAuthor}/${metadata.name}`);
      console.log(`  About: ${metadata.about}`);
      console.log(`  Version: ${metadata.version || '1.0.0'}`);
      
      if (metadata.keywords && metadata.keywords.length > 0) {
        console.log(`  Keywords: ${metadata.keywords.join(', ')}`);
      }
      
      // Calculate content hash
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      console.log(`  Content Hash: ${chalk.gray(contentHash.substring(0, 16) + '...')}`);
      
      // Determine publishing method
      let sourceUrl: string;
      let registryEntry: any;
      
      if (gitInfo.isGitRepo && !options.useGist && gitInfo.remoteUrl?.includes('github.com')) {
        // Check if repository is public
        console.log(`  Repository: ${chalk.cyan(`github.com/${gitInfo.owner}/${gitInfo.repo}`)}`);
        console.log(`  Commit: ${chalk.gray(gitInfo.sha?.substring(0, 8))}`);
        
        const isPublicRepo = await this.checkIfRepoIsPublic(octokit, gitInfo.owner!, gitInfo.repo!);
        
        if (!isPublicRepo) {
          console.log(chalk.yellow('\n⚠️  Repository is private. Switching to gist creation...'));
          console.log(chalk.gray('Modules must be publicly accessible. Use --use-gist to force gist creation.'));
          // Fall through to gist creation
        } else {
          // Git-native publishing for public repos
          console.log(chalk.green(`\n✅ Repository is public`));
          
          // Interactive confirmation
          if (!options.dryRun && !options.force && !options.useRepo) {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            
            console.log(chalk.blue(`\n📦 Publishing @${publishingAuthor}/${metadata.name} from ${gitInfo.owner}/${gitInfo.repo}`));
            console.log(chalk.gray(`   Source: ${gitInfo.relPath} @ ${gitInfo.sha?.substring(0, 8)}`));
            console.log(chalk.gray(`   This will create a pull request to the mlld registry\n`));
            
            console.log('Options:');
            console.log('  [Enter] Confirm and publish from repository');
            console.log('  [g]     Publish as gist instead');
            console.log('  [c]     Cancel');
            
            const choice = await rl.question('\nYour choice: ');
            rl.close();
            
            if (choice.toLowerCase() === 'c') {
              throw new MlldError('Publication cancelled by user', {
                code: 'USER_CANCELLED',
                severity: ErrorSeverity.Info
              });
            } else if (choice.toLowerCase() === 'g') {
              console.log(chalk.yellow('\n📝 Switching to gist creation...'));
              // Fall through to gist creation
            } else {
              // Continue with git repo publishing
              sourceUrl = `https://raw.githubusercontent.com/${gitInfo.owner}/${gitInfo.repo}/${gitInfo.sha}/${gitInfo.relPath}`;
              
              registryEntry = {
                name: metadata.name,
                author: user.login,
                version: metadata.version || '1.0.0',
                about: metadata.about,
                needs: metadata.needs || [],
                repo: metadata.repo,
                keywords: metadata.keywords || [],
                bugs: metadata.bugs,
                homepage: metadata.homepage,
                license: metadata.license,
                mlldVersion: metadata.mlldVersion || currentMlldVersion,
                ownerGithubUserIds: [user.id],
                source: {
                  type: 'github' as const,
                  url: sourceUrl,
                  contentHash: contentHash,
                  repository: {
                    type: 'git',
                    url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
                    commit: gitInfo.sha,
                    path: gitInfo.relPath,
                  },
                },
                dependencies: this.buildDependenciesObject(metadata),
                publishedAt: new Date().toISOString(),
              };
              
              console.log(chalk.green(`\n✅ Using git repository for source`));
            }
          } else {
            // Skip confirmation with --use-gist or --force
            sourceUrl = `https://raw.githubusercontent.com/${gitInfo.owner}/${gitInfo.repo}/${gitInfo.sha}/${gitInfo.relPath}`;
            
            registryEntry = {
              name: metadata.name,
              author: user.login,
              version: metadata.version || '1.0.0',
              about: metadata.about,
              needs: metadata.needs || [],
              repo: metadata.repo,
              keywords: metadata.keywords || [],
              bugs: metadata.bugs,
              homepage: metadata.homepage,
              license: metadata.license,
              mlldVersion: metadata.mlldVersion || '>=0.5.0',
              ownerGithubUserIds: [user.id],
              source: {
                type: 'github' as const,
                url: sourceUrl,
                contentHash: contentHash,
                repository: {
                  type: 'git',
                  url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
                  commit: gitInfo.sha,
                  path: gitInfo.relPath,
                },
              },
              dependencies: this.buildDependenciesObject(metadata),
              publishedAt: new Date().toISOString(),
            };
            
            console.log(chalk.green(`\n✅ Using git repository for source`));
          }
        }
      }
      
      if (!registryEntry) {
        // Gist-based publishing (fallback)
        
        // Check if we're trying to publish as an organization
        if (publishingAuthor !== user.login) {
          throw new MlldError(
            `Cannot create gists on behalf of organization '${publishingAuthor}'.\n` +
            `GitHub organizations cannot create gists. Please use one of these alternatives:\n` +
            `  1. Publish from a public git repository\n` +
            `  2. Remove the --org flag or org author to publish under your personal account\n` +
            `  3. Create the module in a public repository owned by ${publishingAuthor}`,
            {
              code: 'ORG_GIST_ERROR',
              severity: ErrorSeverity.Fatal
            }
          );
        }
        
        console.log(chalk.yellow('\n📝 Preparing to create GitHub gist...'));
        
        // Interactive confirmation for gist creation
        if (!options.dryRun && !options.force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          
          const sourceInfo = gitInfo.isGitRepo ? 
            `${path.basename(filePath)} (not in git repo)` : 
            path.basename(filePath);
          
          console.log(chalk.blue(`\n📤 Publishing @${publishingAuthor}/${metadata.name} as a GitHub gist`));
          console.log(chalk.gray(`   Source: ${sourceInfo}`));
          console.log(chalk.gray(`   This will create a new gist and pull request to the mlld registry\n`));
          
          console.log('Options:');
          console.log('  [Enter] Confirm and create gist');
          console.log('  [c]     Cancel');
          
          const choice = await rl.question('\nYour choice: ');
          rl.close();
          
          if (choice.toLowerCase() === 'c') {
            throw new MlldError('Publication cancelled by user', {
              code: 'USER_CANCELLED',
              severity: ErrorSeverity.Info
            });
          }
        }
        
        let gistData: any = null;
        
        if (!options.dryRun) {
          const gist = await octokit.gists.create({
            description: `${metadata.name} - ${metadata.about}`,
            public: true,
            files: {
              [filename]: {
                content: content,
              },
            },
          });
          
          console.log(chalk.green(`✅ Gist created: ${gist.data.html_url}`));
          sourceUrl = gist.data.files[filename]!.raw_url!;
          gistData = gist.data;
        } else {
          // For dry run, create a fake gist URL
          sourceUrl = `https://gist.githubusercontent.com/${user.login}/DRY_RUN_ID/raw/${filename}`;
          gistData = { id: 'DRY_RUN_ID' };
          console.log(chalk.yellow('📝 Would create GitHub gist'));
        }
        
        // Auto-populate bugs URL for gist
        if (!metadata.bugs && !options.dryRun) {
          metadata.bugs = `${gist.data.html_url}#comments`;
          console.log(chalk.blue(`📌 Adding bugs URL for gist: ${metadata.bugs}`));
        }
        
        registryEntry = {
          name: metadata.name,
          author: user.login,
          version: metadata.version || '1.0.0',
          about: metadata.about,
          needs: metadata.needs || [],
          repo: metadata.repo,
          keywords: metadata.keywords || [],
          bugs: metadata.bugs,
          homepage: metadata.homepage,
          license: metadata.license,
          mlldVersion: metadata.mlldVersion || '>=0.5.0',
          ownerGithubUserIds: [user.id],
          source: {
            type: 'gist' as const,
            url: sourceUrl,
            gistId: gistData.id,
            contentHash: contentHash,
          },
          dependencies: this.buildDependenciesObject(metadata),
          publishedAt: new Date().toISOString(),
        };
      }
      
      if (options.dryRun) {
        console.log(chalk.cyan('\n✅ Dry run completed - no changes made'));
        console.log('\nWould create PR with:');
        console.log(JSON.stringify(registryEntry, null, 2));
        return;
      }

      // Create pull request to registry
      console.log(chalk.blue('\n🔀 Creating pull request to registry...'));
      const prUrl = await this.createRegistryPR(octokit, user, registryEntry, options);
      
      console.log(chalk.green('\n✅ Module published successfully!\n'));
      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Your pull request: ${chalk.cyan(prUrl)}`);
      console.log(`  2. Once merged, install with: ${chalk.cyan(`mlld install @${publishingAuthor}/${metadata.name}`)}`);
      console.log(`  3. Module source: ${chalk.cyan(sourceUrl)}`);
      
    } catch (error) {
      if (options.verbose) {
        console.error(error);
      }
      throw new MlldError(`Publication failed: ${error.message}`, {
        code: 'PUBLISH_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  /**
   * Get the latest published version of mlld from npm
   */
  private async getLatestMlldVersion(): Promise<string | null> {
    try {
      const response = await fetch('https://registry.npmjs.org/mlld/latest');
      if (!response.ok) {
        console.log(chalk.yellow('⚠️  Could not check latest mlld version'));
        return null;
      }
      
      const data = await response.json();
      return data.version;
    } catch (error) {
      // Don't fail if we can't check the version
      console.log(chalk.yellow('⚠️  Could not check latest mlld version'));
      return null;
    }
  }

  /**
   * Compare semantic versions to check if latest is newer
   */
  private isNewerVersion(latest: string, current: string): boolean {
    const parseVersion = (v: string) => {
      const parts = v.split('-')[0].split('.').map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0
      };
    };
    
    const latestVer = parseVersion(latest);
    const currentVer = parseVersion(current);
    
    if (latestVer.major > currentVer.major) return true;
    if (latestVer.major < currentVer.major) return false;
    
    if (latestVer.minor > currentVer.minor) return true;
    if (latestVer.minor < currentVer.minor) return false;
    
    return latestVer.patch > currentVer.patch;
  }

  /**
   * Check if a GitHub repository is public
   */
  private async checkIfRepoIsPublic(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
    try {
      const { data } = await octokit.repos.get({ owner, repo });
      return !data.private;
    } catch (error: any) {
      // If we get a 404, it might be private or doesn't exist
      if (error.status === 404) {
        return false;
      }
      // For other errors, assume private to be safe
      return false;
    }
  }

  /**
   * Validate module before publishing
   */
  private async validateModule(
    metadata: ModuleMetadata,
    content: string,
    user: any,
    octokit: Octokit,
    filePath: string,
    options: { dryRun?: boolean } = {}
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings?: string[];
    updatedMetadata?: Partial<ModuleMetadata>;
    updatedContent?: string;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let updatedMetadata: Partial<ModuleMetadata> = {};
    let updatedContent = content;
    let needsUpdate = false;

    // 1. Validate author field
    if (metadata.author && metadata.author !== user.login) {
      // Check if the author is an organization the user belongs to
      const hasPermission = await this.checkOrgPermission(octokit, metadata.author, user.login);
      if (!hasPermission) {
        errors.push(
          `Author '${metadata.author}' is not valid. You can only publish as:\n` +
          `    - Your GitHub username: ${user.login}\n` +
          `    - Organizations you belong to`
        );
      }
    } else if (!metadata.author) {
      // Auto-set to current user if missing
      updatedMetadata.author = user.login;
      needsUpdate = true;
    }

    // 2. Validate license is CC0
    if (metadata.license && metadata.license !== 'CC0') {
      errors.push(
        `Invalid license '${metadata.license}'. All modules must be CC0 licensed.\n` +
        `    Please update your frontmatter to: license: CC0`
      );
    } else if (!metadata.license) {
      // Auto-add CC0 if missing
      updatedMetadata.license = 'CC0';
      needsUpdate = true;
    }

    // 3. Validate required fields
    if (!metadata.name) {
      errors.push('Missing required field: name');
    } else if (!metadata.name.match(/^[a-z0-9-]+$/)) {
      errors.push(`Invalid module name '${metadata.name}'. Must be lowercase alphanumeric with hyphens.`);
    }

    if (!metadata.about) {
      errors.push('Missing required field: about');
    }

    if (!metadata.needs || !Array.isArray(metadata.needs)) {
      errors.push(
        'Missing required field: needs\n' +
        '    Add to your frontmatter: needs: [] for pure mlld modules\n' +
        '    Or specify runtime dependencies: needs: ["js", "node", "py", "sh"]'
      );
    } else {
      // Validate needs values
      const validNeeds = ['js', 'node', 'py', 'sh'];
      const invalidNeeds = metadata.needs.filter(n => !validNeeds.includes(n));
      if (invalidNeeds.length > 0) {
        errors.push(`Invalid needs values: ${invalidNeeds.join(', ')}. Valid values are: js, node, py, sh`);
      }
    }

    // 4. Validate mlld syntax
    try {
      parseSync(content);
    } catch (parseError: any) {
      const errorMessage = parseError.message || 'Unknown parse error';
      const location = parseError.location ? 
        ` at line ${parseError.location.start.line}, column ${parseError.location.start.column}` : '';
      errors.push(`Invalid mlld syntax${location}: ${errorMessage}`);
    }

    // 5. Auto-populate missing fields from git info (unless in dry run)
    if (!options.dryRun) {
      const gitInfo = await this.detectGitInfo(filePath);
      if (gitInfo.isGitRepo && gitInfo.owner && gitInfo.repo) {
        if (!metadata.repo) {
          updatedMetadata.repo = `https://github.com/${gitInfo.owner}/${gitInfo.repo}`;
          needsUpdate = true;
        }
        if (!metadata.bugs) {
          updatedMetadata.bugs = `https://github.com/${gitInfo.owner}/${gitInfo.repo}/issues`;
          needsUpdate = true;
        }
      }
    }

    // 6. Add mlld version if missing
    if (!metadata.mlldVersion) {
      updatedMetadata.mlldVersion = currentMlldVersion;
      needsUpdate = true;
    }

    // 7. Check for detailed dependencies consistency
    if (metadata.needs.includes('js') && !metadata.needsJs) {
      try {
        const ast = parseSync(content);
        const detector = new DependencyDetector();
        const packages = detector.detectJavaScriptPackages(ast);
        if (packages.length > 0) {
          warnings.push(
            `Module declares "js" in needs but missing needs-js details.\n` +
            `    Detected packages: ${packages.join(', ')}`
          );
        }
      } catch { /* ignore parse errors */ }
    }

    if (metadata.needs.includes('node') && !metadata.needsNode) {
      try {
        const ast = parseSync(content);
        const detector = new DependencyDetector();
        const packages = detector.detectNodePackages(ast);
        if (packages.length > 0) {
          warnings.push(
            `Module declares "node" in needs but missing needs-node details.\n` +
            `    Detected packages: ${packages.join(', ')}`
          );
        }
      } catch { /* ignore parse errors */ }
    }

    if (metadata.needs.includes('py') && !metadata.needsPy) {
      try {
        const ast = parseSync(content);
        const detector = new DependencyDetector();
        const packages = detector.detectPythonPackages(ast);
        if (packages.length > 0) {
          warnings.push(
            `Module declares "py" in needs but missing needs-py details.\n` +
            `    Detected packages: ${packages.join(', ')}`
          );
        }
      } catch { /* ignore parse errors */ }
    }

    if (metadata.needs.includes('sh') && !metadata.needsSh) {
      try {
        const ast = parseSync(content);
        const detector = new DependencyDetector();
        const commands = detector.detectShellCommands(ast);
        if (commands.length > 0) {
          warnings.push(
            `Module declares "sh" in needs but missing needs-sh details.\n` +
            `    Detected commands: ${commands.join(', ')}`
          );
        }
      } catch { /* ignore parse errors */ }
    }

    // Update content if metadata changed
    if (needsUpdate) {
      const mergedMetadata = { ...metadata, ...updatedMetadata };
      updatedContent = this.updateFrontmatter(content, mergedMetadata);
    }

    // Display warnings
    if (warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Validation warnings:'));
      warnings.forEach(w => console.log(chalk.yellow(`   ${w}`)));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      updatedMetadata: needsUpdate ? updatedMetadata : undefined,
      updatedContent: needsUpdate ? updatedContent : undefined
    };
  }

  /**
   * Describe what metadata changes will be made
   */
  private describeMetadataChanges(
    originalMetadata: ModuleMetadata,
    updatedMetadata: Partial<ModuleMetadata>
  ): string[] {
    const changes: string[] = [];
    
    for (const [key, value] of Object.entries(updatedMetadata)) {
      const originalValue = (originalMetadata as any)[key];
      if (!originalValue) {
        changes.push(`+ ${key}: ${JSON.stringify(value)}`);
      } else if (originalValue !== value) {
        changes.push(`~ ${key}: ${JSON.stringify(originalValue)} → ${JSON.stringify(value)}`);
      }
    }
    
    return changes;
  }

  /**
   * Commit metadata changes to git
   */
  private async commitMetadataChanges(
    filePath: string,
    updatedMetadata?: Partial<ModuleMetadata>
  ): Promise<void> {
    const { execSync } = await import('child_process');
    const fileName = path.basename(filePath);
    
    try {
      console.log(chalk.blue('\n📝 Committing metadata changes...'));
      
      // Add the file
      execSync(`git add "${filePath}"`, { cwd: path.dirname(filePath) });
      
      // Create commit message
      const changes = updatedMetadata ? Object.keys(updatedMetadata) : ['metadata'];
      const commitMessage = `Add ${changes.join(', ')} to ${fileName}

Auto-added by mlld publish command`;
      
      // Commit
      execSync(`git commit -m "${commitMessage}"`, { cwd: path.dirname(filePath) });
      console.log(chalk.green('✅ Changes committed'));
      
      // Push if there's a remote
      try {
        execSync('git push', { cwd: path.dirname(filePath) });
        console.log(chalk.green('✅ Changes pushed to remote'));
      } catch {
        console.log(chalk.yellow('⚠️  Could not push to remote - you may need to push manually'));
      }
      
    } catch (error: any) {
      throw new MlldError(
        `Failed to commit changes: ${error.message}`,
        { code: 'GIT_COMMIT_FAILED', severity: ErrorSeverity.Fatal }
      );
    }
  }

  /**
   * Check if user has permission to publish on behalf of an organization
   */
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

  /**
   * Detect git repository information
   */
  private async detectGitInfo(filePath: string): Promise<GitInfo> {
    try {
      // Check if in git repo
      execSync('git rev-parse --git-dir', { cwd: path.dirname(filePath), stdio: 'ignore' });
      
      // Get repository root
      const gitRoot = execSync('git rev-parse --show-toplevel', { 
        cwd: path.dirname(filePath),
        encoding: 'utf8' 
      }).trim();
      
      // Get current commit SHA
      const sha = execSync('git rev-parse HEAD', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Get current branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Get remote URL
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Parse GitHub owner/repo from remote URL
      let owner = '';
      let repo = '';
      const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
      if (githubMatch) {
        owner = githubMatch[1];
        repo = githubMatch[2];
      }
      
      // Get relative path from git root
      const relPath = path.relative(gitRoot, filePath).replace(/\\/g, '/');
      
      // Check if working tree is clean
      let isClean = true;
      try {
        // First update the index to avoid false positives
        execSync('git update-index --refresh', { cwd: gitRoot, stdio: 'ignore' });
        // Then check for actual changes
        execSync('git diff-index --quiet HEAD --', { cwd: gitRoot });
      } catch {
        isClean = false;
      }
      
      return {
        isGitRepo: true,
        owner,
        repo,
        sha,
        branch,
        relPath,
        isClean,
        remoteUrl,
      };
      
    } catch {
      // Not a git repo or git not available
      return { isGitRepo: false };
    }
  }

  /**
   * Read module file and parse metadata
   */
  private async readModule(modulePath: string, options?: { verbose?: boolean }): Promise<{ 
    content: string; 
    metadata: ModuleMetadata; 
    filename: string; 
    filePath: string;
  }> {
    // Check if path is a directory or file
    const stat = await fs.stat(modulePath);
    let filePath: string;
    let filename: string;
    
    if (stat.isDirectory()) {
      // Look for .mld files in directory
      const files = await fs.readdir(modulePath);
      const mldFiles = files.filter(f => f.endsWith('.mld') || f.endsWith('.mld.md'));
      
      if (mldFiles.length === 0) {
        throw new MlldError('No .mld or .mld.md files found in the specified directory', {
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
        // Prefer .mld.md over .mld
        const mldMdFile = mldFiles.find(f => f.endsWith('.mld.md'));
        filename = mldMdFile || mldFiles[0];
      }
      
      filePath = path.join(modulePath, filename);
    } else {
      // Direct file path
      filePath = modulePath;
      filename = path.basename(filePath);
      
      if (!filename.endsWith('.mld') && !filename.endsWith('.mld.md')) {
        throw new MlldError('Module file must have .mld or .mld.md extension', {
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
      console.log(chalk.green('✅ Frontmatter added to ' + filename));
    }
    
    // Parse and validate basic syntax early
    try {
      parseSync(content);
    } catch (parseError: any) {
      console.log(chalk.red('❌ Invalid mlld syntax'));
      
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
    
    return { content, metadata, filename, filePath };
  }

  /**
   * Build dependencies object for registry entry
   */
  private buildDependenciesObject(metadata: ModuleMetadata): Record<string, any> | undefined {
    const deps: Record<string, any> = {};
    
    if (metadata.needsJs) {
      deps.js = metadata.needsJs;
    }
    if (metadata.needsNode) {
      deps.node = metadata.needsNode;
    }
    if (metadata.needsPy) {
      deps.py = metadata.needsPy;
    }
    if (metadata.needsSh) {
      deps.sh = metadata.needsSh;
    }
    
    return Object.keys(deps).length > 0 ? deps : undefined;
  }

  /**
   * Check if content has frontmatter
   */
  private hasFrontmatter(content: string): boolean {
    return content.startsWith('---\n');
  }

  /**
   * Validate module imports to ensure they reference public modules
   */
  private async validateImports(
    content: string, 
    metadata: ModuleMetadata,
    publishingAuthor: string,
    _octokit: Octokit
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Find all @import directives that reference modules (start with @) in the entire file
    const importRegex = /@import\s+\{[^}]+\}\s+from\s+(@[a-z0-9-]+\/[a-z0-9-]+)(?:@[a-f0-9]+)?/g;
    const matches = content.matchAll(importRegex);
    
    for (const match of matches) {
      const moduleRef = match[1]; // e.g. @author/module
      const [, author, moduleName] = moduleRef.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/) || [];
      
      if (!author || !moduleName) {
        errors.push(`Invalid module reference format: ${moduleRef}`);
        continue;
      }
      
      try {
        // Check if the module exists in the registry
        const registryUrl = `https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json`;
        const response = await fetch(registryUrl);
        
        if (!response.ok) {
          errors.push(`Could not access registry to validate module ${moduleRef}`);
          continue;
        }
        
        const registry = await response.json() as Record<string, any>;
        const fullModuleName = `@${author}/${moduleName}`;
        
        // Skip validation if this is a self-reference (module importing itself in examples)
        const currentModuleName = `@${publishingAuthor}/${metadata.name}`;
        if (fullModuleName === currentModuleName) {
          continue; // Skip self-reference validation
        }
        
        if (!(fullModuleName in registry)) {
          errors.push(`Module ${moduleRef} not found in public registry. Only published modules can be imported.`);
        }
      } catch (error) {
        errors.push(`Failed to validate module ${moduleRef}: ${error.message}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
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
      // Don't set needs here - let it be undefined so validation catches missing field
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
        
        // Parse dependency fields
        metadata.needs = parsed.needs; // Don't default to [] here, let validation catch it
        metadata.needsJs = parsed['needs-js'] || parsed.needsJs;
        metadata.needsPy = parsed['needs-py'] || parsed.needsPy;
        metadata.needsSh = parsed['needs-sh'] || parsed.needsSh;
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
    
    return metadata as ModuleMetadata;
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

      // Runtime dependencies (required)
      console.log('\nRuntime dependencies (required):');
      console.log('  - Use empty array [] for pure mlld modules');
      console.log('  - Options: js, py, sh (comma-separated)');
      const needsInput = await rl.question('Needs []: ');
      if (needsInput) {
        metadata.needs = needsInput.split(',').map(n => n.trim());
      } else {
        metadata.needs = [];
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
      console.log(chalk.blue('\n📄 License: CC0 (public domain dedication)'));
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
   * Format frontmatter for display with canonical field ordering
   */
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
    if (metadata.needs.includes('js') && metadata.needsJs) {
      lines.push('needs-js:');
      if (metadata.needsJs.node) lines.push(`  node: "${metadata.needsJs.node}"`);
      if (metadata.needsJs.packages) lines.push(`  packages: [${metadata.needsJs.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs.includes('node') && metadata.needsNode) {
      lines.push('needs-node:');
      if (metadata.needsNode.node) lines.push(`  node: "${metadata.needsNode.node}"`);
      if (metadata.needsNode.packages) lines.push(`  packages: [${metadata.needsNode.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs.includes('py') && metadata.needsPy) {
      lines.push('needs-py:');
      if (metadata.needsPy.python) lines.push(`  python: "${metadata.needsPy.python}"`);
      if (metadata.needsPy.packages) lines.push(`  packages: [${metadata.needsPy.packages.map(p => `"${p}"`).join(', ')}]`);
    }
    if (metadata.needs.includes('sh') && metadata.needsSh) {
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

  /**
   * Add frontmatter to content
   */
  private addFrontmatter(content: string, metadata: ModuleMetadata): string {
    return this.formatFrontmatter(metadata) + '\n\n' + content;
  }
  
  /**
   * Update existing frontmatter in content
   */
  private updateFrontmatter(content: string, metadata: ModuleMetadata): string {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      // No frontmatter, add it
      return this.addFrontmatter(content, metadata);
    }
    
    // Replace existing frontmatter
    const afterFrontmatter = content.substring(frontmatterMatch[0].length);
    return this.formatFrontmatter(metadata) + afterFrontmatter;
  }

  /**
   * Create pull request to registry repository
   */
  private async createRegistryPR(
    octokit: Octokit,
    user: any,
    entry: any,
    options: PublishOptions
  ): Promise<string> {
    const registryOwner = 'mlld-lang';
    const registryRepo = 'registry';
    
    // Check if fork exists
    let fork;
    try {
      const { data } = await octokit.repos.get({
        owner: user.login,
        repo: registryRepo,
      });
      fork = data;
    } catch (error) {
      // Fork doesn't exist, create it
      console.log(chalk.gray('Creating fork of registry repository...'));
      const { data } = await octokit.repos.createFork({
        owner: registryOwner,
        repo: registryRepo,
      });
      fork = data;
      
      // Wait a moment for fork to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Get current modules.json from fork
    let currentModules: any = {};
    let modulesFile: any;
    
    try {
      const { data } = await octokit.repos.getContent({
        owner: user.login,
        repo: registryRepo,
        path: 'modules.json',
      });
      
      if ('content' in data) {
        modulesFile = data;
        currentModules = JSON.parse(Buffer.from(data.content, 'base64').toString());
      }
    } catch (error) {
      // modules.json doesn't exist, that's okay
      console.log(chalk.gray('Creating new modules.json...'));
    }
    
    // Add or update module entry
    const moduleId = `@${user.login}/${entry.name}`;
    const isUpdate = moduleId in currentModules;
    
    currentModules[moduleId] = entry;
    
    // Create branch for PR
    const branchName = `add-${entry.name}-${Date.now()}`;
    
    // Get default branch ref
    const { data: ref } = await octokit.git.getRef({
      owner: user.login,
      repo: registryRepo,
      ref: 'heads/main',
    });
    
    // Create new branch
    await octokit.git.createRef({
      owner: user.login,
      repo: registryRepo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
    
    // Update modules.json
    const updatedContent = JSON.stringify(currentModules, null, 2) + '\n';
    
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: registryRepo,
      path: 'modules.json',
      message: options.message || `${isUpdate ? 'Update' : 'Add'} ${moduleId}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: modulesFile?.sha,
      branch: branchName,
    });
    
    // Create pull request
    const { data: pr } = await octokit.pulls.create({
      owner: registryOwner,
      repo: registryRepo,
      title: `${isUpdate ? 'Update' : 'Add'} ${moduleId}`,
      head: `${user.login}:${branchName}`,
      base: 'main',
      body: `${isUpdate ? 'Updating' : 'Adding new'} module: **${moduleId}**

## Module Information
- **About**: ${entry.about}
- **Version**: ${entry.version}
- **Source Type**: ${entry.source.type}
- **Source URL**: ${entry.source.url}
- **Content Hash**: \`${entry.source.contentHash}\`
${entry.source.repository ? `- **Repository**: ${entry.source.repository.url}` : ''}
${entry.source.repository ? `- **Commit**: \`${entry.source.repository.commit}\`` : ''}
${entry.source.repository ? `- **Path**: \`${entry.source.repository.path}\`` : ''}
- **Keywords**: ${entry.keywords.length > 0 ? entry.keywords.join(', ') : 'none'}
- **License**: ${entry.license || 'Not specified'}

## Validation
This PR will be automatically validated by the registry workflow to ensure:
- ✅ Module name matches author
- ✅ Source URL is accessible
- ✅ Content hash matches
- ✅ Valid mlld syntax
${entry.source.repository ? '- ✅ Git commit exists and is immutable' : ''}

${options.message ? `\n## Notes\n${options.message}` : ''}`,
    });
    
    return pr.html_url;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function publishCommand(args: string[], options: PublishOptions = {}): Promise<void> {
  const modulePath = args[0] || '.';
  const publisher = new PublishCommand();
  await publisher.publish(modulePath, options);
}

/**
 * Create publish command for CLI integration
 */
export function createPublishCommand() {
  return {
    name: 'publish',
    description: 'Publish module to mlld registry',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: PublishOptions = {
        verbose: flags.verbose || flags.v,
        dryRun: flags['dry-run'] || flags.n,
        force: flags.force || flags.f,
        message: flags.message || flags.m,
        useGist: flags['use-gist'] || flags.gist || flags.g,
        useRepo: flags['use-repo'] || flags.repo || flags.r,
        org: flags.org || flags.o,
        skipVersionCheck: flags['skip-version-check'],
      };
      
      try {
        await publishCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}