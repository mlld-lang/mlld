# Clean-Repo: Node Package Specification

## Overview

Clean-Repo is a Node package that helps maintainers create and manage clean public repositories by automatically handling development files, setting up branch management, and establishing proper Git practices.

## Goals

- Automate the separation of development files from public code
- Provide scripts for branch management
- Add Git hooks to prevent accidental commits
- Set up CI workflows for repository hygiene
- Infer project-specific settings where possible
- Require minimal configuration

## Architecture

### Core Components

1. **Configuration Manager**
   - Infers settings from package.json where possible
   - Handles user-provided overrides
   - Sets sensible defaults when needed

2. **File Manager**
   - Generates/updates .gitignore
   - Generates/updates .gitattributes
   - Creates Git hooks
   - Creates CI workflows

3. **Script Generator**
   - Produces branch management scripts
   - Adapts scripts to project-specific needs

4. **Command Line Interface**
   - Provides commands for initialization and updates
   - Handles one-time setup

### Configuration Sources (in order of priority)

1. Command line arguments
2. `.clean-repo.json` configuration file
3. `package.json` "clean-repo" field
4. Inferred from project structure
5. Default settings

## Feature Specification

### 1. Project Analysis

- **Auto-detect repository type**
  - Identify language (Node.js, Python, etc.)
  - Identify package manager (npm, yarn, pnpm)
  - Identify framework (if applicable)

- **Auto-detect existing patterns**
  - Find common temporary file patterns
  - Identify work directories

- **Analyze existing .gitignore**
  - Parse and categorize existing rules
  - Identify missing rules

### 2. Configuration

Auto-detect configuration from `package.json`:

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "clean-repo": {
    "ignoreDirs": ["_docs", "tmp", "notes"],
    "protectedBranches": ["main", "release"],
    "publicBranch": "public",
    "developmentBranch": "develop",
    "ignorePatterns": ["*.log", "*.tmp", "temp_*"]
  }
}
```

Or use a separate `.clean-repo.json` configuration file:

```json
{
  "ignoreDirs": ["_docs", "tmp", "notes"],
  "protectedBranches": ["main", "release"],
  "publicBranch": "public",
  "developmentBranch": "develop",
  "ignorePatterns": ["*.log", "*.tmp", "temp_*"]
}
```

### 3. Git Hooks Installation

- Install pre-commit hook
- Install pre-push hook
- Ensure hooks are executable
- Support common hook managers (husky, simple-git-hooks)

### 4. Branch Management Scripts

- **prepare-public.js** - Creates/updates a clean public branch
- **sync-public.js** - Syncs development changes to public branch
- **verify-public.js** - Checks if the public branch is clean

### 5. CI Workflow Templates

- GitHub Actions workflow
- GitLab CI workflow
- Circle CI workflow

### 6. Documentation Templates

- `CONTRIBUTING.md` template
- `RELEASE_GUIDE.md` template

## Implementation Plan

### Dependencies

- **cosmiconfig**: For flexible configuration loading
- **simple-git**: For Git operations
- **inquirer** (optional): For interactive setup
- **chalk**: For terminal styling
- **commander**: For CLI argument parsing
- **ignore**: For .gitignore parsing and manipulation
- **fs-extra**: For file operations
- **globby**: For file pattern matching
- **detect-indent**: For preserving file formatting

### CLI Commands

```
clean-repo init            # Set up clean-repo in the current project
clean-repo update          # Update configuration and scripts
clean-repo prepare-public  # Create/update the public branch
clean-repo sync            # Sync changes to the public branch
clean-repo verify          # Verify the public branch is clean
```

### File Structure

```
clean-repo/
├── bin/
│   └── clean-repo.js      # CLI entry point
├── lib/
│   ├── config.js          # Configuration manager
│   ├── git.js             # Git operations
│   ├── hooks.js           # Git hooks generator
│   ├── ignore.js          # .gitignore manager
│   ├── scripts.js         # Script generator
│   ├── templates.js       # Template manager
│   └── workflows.js       # CI workflow generator
├── templates/
│   ├── contributing.md    # Template for CONTRIBUTING.md
│   ├── gitattributes      # Template for .gitattributes
│   ├── githooks/          # Git hook templates
│   ├── gitignore          # Template for .gitignore
│   ├── release-guide.md   # Template for RELEASE_GUIDE.md
│   └── workflows/         # CI workflow templates
└── package.json
```

## Implementation Details

### Configuration Manager

1. Load configuration from all sources
2. Merge with default settings
3. Validate configuration
4. Generate effective configuration

```javascript
// Example configuration loading
const { cosmiconfigSync } = require('cosmiconfig');
const explorer = cosmiconfigSync('clean-repo');
const result = explorer.search() || { config: {} };

// Merge with defaults
const config = {
  ignoreDirs: ['_dev', 'notes', 'tmp'],
  protectedBranches: ['main', 'master'],
  publicBranch: 'public',
  developmentBranch: 'develop',
  ...result.config
};
```

### Git Hooks

Create pre-commit hook to prevent committing ignored files to protected branches:

```javascript
// Example hook generation
const fs = require('fs-extra');
const path = require('path');

function installPreCommitHook(config) {
  const hookPath = path.join('.git', 'hooks', 'pre-commit');
  const hookTemplate = fs.readFileSync(path.join(__dirname, '../templates/githooks/pre-commit'), 'utf8');
  
  // Replace placeholders with configuration
  const hook = hookTemplate
    .replace('{{PROTECTED_BRANCHES}}', JSON.stringify(config.protectedBranches))
    .replace('{{IGNORED_DIRS}}', JSON.stringify(config.ignoreDirs))
    .replace('{{IGNORED_PATTERNS}}', JSON.stringify(config.ignorePatterns));
  
  fs.writeFileSync(hookPath, hook);
  fs.chmodSync(hookPath, '0755');
}
```

### Branch Management Scripts

Generate script for preparing a clean public branch:

```javascript
// Example script generation
function generatePreparePublicScript(config) {
  const scriptTemplate = fs.readFileSync(path.join(__dirname, '../templates/scripts/prepare-public.js'), 'utf8');
  
  // Replace placeholders with configuration
  const script = scriptTemplate
    .replace('{{PUBLIC_BRANCH}}', config.publicBranch)
    .replace('{{DEVELOPMENT_BRANCH}}', config.developmentBranch)
    .replace('{{IGNORED_DIRS}}', JSON.stringify(config.ignoreDirs))
    .replace('{{IGNORED_PATTERNS}}', JSON.stringify(config.ignorePatterns));
  
  fs.writeFileSync('scripts/prepare-public.js', script);
  fs.chmodSync('scripts/prepare-public.js', '0755');
}
```

### .gitignore Management

Append rules to existing .gitignore or create a new one:

```javascript
// Example .gitignore management
const { parseIgnore } = require('ignore');

function updateGitignore(config) {
  let content = '';
  
  // Try to read existing .gitignore
  try {
    content = fs.readFileSync('.gitignore', 'utf8');
  } catch (error) {
    // File doesn't exist, create new
  }
  
  // Parse existing content
  const ignore = parseIgnore(content);
  
  // Add new rules if they don't exist
  let newRules = '';
  for (const dir of config.ignoreDirs) {
    if (!ignore.ignores(dir)) {
      newRules += `/${dir}/\n`;
    }
  }
  
  for (const pattern of config.ignorePatterns) {
    if (!ignore.ignores(pattern)) {
      newRules += `${pattern}\n`;
    }
  }
  
  // Append new rules to .gitignore
  if (newRules) {
    fs.appendFileSync('.gitignore', `\n# Added by clean-repo\n${newRules}`);
  }
}
```

## User Experience

### Non-Interactive Mode (Default)

```bash
# Initialize with sensible defaults (no prompts)
npx clean-repo init

# The package will:
# 1. Analyze the project
# 2. Create configuration
# 3. Update .gitignore
# 4. Set up Git hooks
# 5. Generate branch management scripts
# 6. Add documentation templates
```

### Interactive Mode (Optional)

```bash
# Interactive setup
npx clean-repo init --interactive

# The package will:
# 1. Analyze the project
# 2. Ask for confirmation of detected settings
# 3. Prompt for custom directories to ignore
# 4. Prompt for branch names
# 5. Set up all components based on answers
```

## Advanced Features

### Custom Templates

Users can provide custom templates in `.clean-repo/templates/`:

```
.clean-repo/
├── templates/
│   ├── contributing.md
│   ├── gitattributes
│   └── release-guide.md
```

### Pluggable Architecture

Support for custom plugins to extend functionality:

```javascript
// Example plugin
module.exports = function(cleanRepo) {
  cleanRepo.hooks.afterInit.tap('my-plugin', (config) => {
    // Do something after initialization
  });
};
```

### Migration Assistant

For projects already using manual methods:

```bash
npx clean-repo migrate
```

This command will:
1. Detect existing scripts and hooks
2. Convert them to clean-repo configuration
3. Update all components to use clean-repo managed versions

## Future Extensions

1. Support for monorepos (workspaces)
2. Integration with CI/CD pipelines
3. Automated branch protection rules
4. Statistics and reporting on repository cleanliness
5. Visual interface for managing ignored files

## Conclusion

The Clean-Repo package provides a comprehensive solution for maintaining a clean public repository while allowing developers to work with necessary development files. By automating the setup of Git hooks, branch management scripts, and configuration, it ensures consistent practices across all contributors with minimal effort.

The package balances automation with flexibility, providing sensible defaults while allowing customization where needed. It integrates with existing tools and workflows, making adoption straightforward for projects of any size.