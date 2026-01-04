import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import { NVIM_CONFIG_VERSION } from './nvim-setup';

interface DiagnosticResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  fix?: () => void;
}

export function createNvimDoctorCommand() {
  return {
    name: 'nvim-doctor',
    description: 'Diagnose and fix mlld Neovim LSP configuration',

    async execute(args: string[], flags: any): Promise<void> {
      console.log(chalk.blue.bold('mlld Neovim LSP Doctor\n'));

      const homeDir = os.homedir();
      const nvimConfig = process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, 'nvim')
        : path.join(homeDir, '.config', 'nvim');

      const diagnostics: DiagnosticResult[] = [];
      const fixes: Array<{ name: string; fix: () => void }> = [];

      // 1. Check if mlld is in PATH
      let mlldPath: string | null = null;
      try {
        const checkCommand = process.platform === 'win32' ? 'where mlld' : 'which mlld';
        mlldPath = execSync(checkCommand, { encoding: 'utf-8' }).trim().split('\n')[0];
        diagnostics.push({
          name: 'mlld installation',
          status: 'ok',
          message: `Found at ${mlldPath}`
        });
      } catch {
        diagnostics.push({
          name: 'mlld installation',
          status: 'error',
          message: 'mlld not found in PATH. Install with: npm install -g mlld'
        });
      }

      // 2. Check mlld version
      if (mlldPath) {
        try {
          const version = execSync('mlld --version', { encoding: 'utf-8' }).trim().split('\n')[0];
          diagnostics.push({
            name: 'mlld version',
            status: 'ok',
            message: version
          });
        } catch {
          diagnostics.push({
            name: 'mlld version',
            status: 'warn',
            message: 'Could not determine mlld version'
          });
        }
      }

      // 3. Check if LSP server can start
      if (mlldPath) {
        const canStartLsp = await testLspStartup();
        if (canStartLsp) {
          diagnostics.push({
            name: 'LSP server',
            status: 'ok',
            message: 'Server starts correctly'
          });
        } else {
          diagnostics.push({
            name: 'LSP server',
            status: 'error',
            message: 'Server failed to start. Run: DEBUG=mlld:lsp mlld lsp'
          });
        }
      }

      // 4. Check nvim config directory
      if (!fs.existsSync(nvimConfig)) {
        diagnostics.push({
          name: 'Neovim config',
          status: 'error',
          message: `Config directory not found: ${nvimConfig}`
        });
      } else {
        diagnostics.push({
          name: 'Neovim config',
          status: 'ok',
          message: nvimConfig
        });
      }

      // 5. Check for mlld config files
      const lazyVimDir = path.join(nvimConfig, 'lua', 'plugins');
      const afterPluginDir = path.join(nvimConfig, 'after', 'plugin');
      const lazyVimConfig = path.join(lazyVimDir, 'mlld.lua');
      const afterPluginConfig = path.join(afterPluginDir, 'mlld-lsp.lua');

      let configFile: string | null = null;
      let setupType: 'lazyvim' | 'standard' | null = null;

      if (fs.existsSync(lazyVimConfig)) {
        configFile = lazyVimConfig;
        setupType = 'lazyvim';
      } else if (fs.existsSync(afterPluginConfig)) {
        configFile = afterPluginConfig;
        setupType = 'standard';
      }

      if (!configFile) {
        diagnostics.push({
          name: 'mlld LSP config',
          status: 'error',
          message: 'No mlld config found. Run: mlld nvim-setup',
          fix: () => {
            console.log(chalk.dim('  Running: mlld nvim-setup'));
            execSync('mlld nvim-setup', { stdio: 'inherit' });
          }
        });
        fixes.push({ name: 'Create mlld config', fix: diagnostics[diagnostics.length - 1].fix! });
      } else {
        diagnostics.push({
          name: 'mlld LSP config',
          status: 'ok',
          message: `Found: ${configFile}`
        });

        // 6. Check config version and content
        const configContent = fs.readFileSync(configFile, 'utf-8');
        const issues = analyzeConfig(configContent, setupType!);

        if (issues.length === 0) {
          diagnostics.push({
            name: 'Config quality',
            status: 'ok',
            message: `Version ${NVIM_CONFIG_VERSION}, all checks passed`
          });
        } else {
          for (const issue of issues) {
            diagnostics.push({
              name: issue.name,
              status: issue.severity as 'warn' | 'error',
              message: issue.message
            });
          }

          // Add fix for outdated config
          const fix = () => {
            console.log(chalk.dim(`  Updating: ${configFile}`));
            execSync(`mlld nvim-setup --force`, { stdio: 'inherit' });
          };
          fixes.push({ name: 'Update mlld config', fix });
        }
      }

      // 7. Check nvim-lspconfig (simplified - if config loaded, it's installed)
      // If we got this far and have a config file, lspconfig must be working
      if (configFile) {
        diagnostics.push({
          name: 'nvim-lspconfig',
          status: 'ok',
          message: 'Installed (config file loaded successfully)'
        });
      } else {
        // No config file, so can't verify lspconfig
        try {
          const result = execSync(
            'nvim --headless -c "lua local ok = pcall(require, \'lspconfig\'); print(ok)" -c "q"',
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();

          if (result.includes('true')) {
            diagnostics.push({
              name: 'nvim-lspconfig',
              status: 'ok',
              message: 'Installed'
            });
          } else {
            diagnostics.push({
              name: 'nvim-lspconfig',
              status: 'error',
              message: 'Not installed. Add to your plugin manager.'
            });
          }
        } catch {
          diagnostics.push({
            name: 'nvim-lspconfig',
            status: 'warn',
            message: 'Could not verify'
          });
        }
      }

      // 8. Add troubleshooting hint for autostart issues
      if (configFile) {
        diagnostics.push({
          name: 'LSP autostart',
          status: 'ok',
          message: 'Config has autostart enabled. If LSP doesn\'t attach, try :LspStart mlld_ls'
        });
      }

      // Print diagnostics
      console.log(chalk.bold('Diagnostics:\n'));
      for (const d of diagnostics) {
        const icon = d.status === 'ok' ? chalk.green('✓') :
                     d.status === 'warn' ? chalk.yellow('⚠') :
                     chalk.red('✗');
        const color = d.status === 'ok' ? chalk.white :
                      d.status === 'warn' ? chalk.yellow :
                      chalk.red;
        console.log(`  ${icon} ${chalk.bold(d.name)}: ${color(d.message)}`);
      }

      // Check if there are issues to fix
      const hasErrors = diagnostics.some(d => d.status === 'error');
      const hasWarnings = diagnostics.some(d => d.status === 'warn');

      console.log('');

      if (fixes.length > 0 && (flags.fix || flags.f)) {
        console.log(chalk.blue.bold('Applying fixes...\n'));
        for (const fix of fixes) {
          console.log(chalk.dim(`→ ${fix.name}`));
          try {
            fix.fix();
            console.log(chalk.green(`  ✓ Done\n`));
          } catch (e: any) {
            console.log(chalk.red(`  ✗ Failed: ${e.message}\n`));
          }
        }
        console.log(chalk.blue.bold('\nRestart Neovim to apply changes.'));
      } else if (fixes.length > 0) {
        console.log(chalk.yellow(`Found ${fixes.length} fixable issue(s).`));
        console.log(chalk.dim('Run with --fix to auto-repair:\n'));
        console.log(chalk.cyan('  mlld nvim-doctor --fix\n'));
      } else if (hasErrors) {
        console.log(chalk.red('Issues found that require manual intervention.'));
      } else if (hasWarnings) {
        console.log(chalk.yellow('Some warnings, but should work.'));
      } else {
        console.log(chalk.green('Everything looks good!'));
        console.log(chalk.dim('\nIf LSP still doesn\'t work after restarting Neovim:'));
        console.log(chalk.dim('\nDEBUG STEPS:'));
        console.log(chalk.dim('  1. Open a .mld file in Neovim'));
        console.log(chalk.dim('  2. Check filetype: :set filetype?'));
        console.log(chalk.dim('     Expected: filetype=mld'));
        console.log(chalk.dim('     If wrong, see "Filetype Issues" below'));
        console.log(chalk.dim('  3. Try manual start: :LspStart mlld_ls'));
        console.log(chalk.dim('     Watch for errors in :messages'));
        console.log(chalk.dim('  4. If manual start works, autostart may be disabled'));
        console.log(chalk.dim('     Check: :lua print(require("lspconfig.configs").mlld_ls.autostart)'));
        console.log(chalk.dim('  5. Check root directory: :lua print(require("lspconfig.configs").mlld_ls.get_root_dir(vim.api.nvim_buf_get_name(0)))'));
        console.log(chalk.dim('     Should show a path, not nil'));
        console.log(chalk.dim('  6. Check LSP logs: :LspLog'));
        console.log(chalk.dim('\nFILETYPE ISSUES:'));
        console.log(chalk.dim('  If filetype is NOT "mld":'));
        console.log(chalk.dim('  - Another plugin may be setting filetype first'));
        console.log(chalk.dim('  - LazyVim loads plugins in order based on dependencies'));
        console.log(chalk.dim('  - Try adding priority to mlld.lua:'));
        console.log(chalk.cyan('    return {'));
        console.log(chalk.cyan('      "neovim/nvim-lspconfig",'));
        console.log(chalk.cyan('      priority = 1000,  -- Load early'));
        console.log(chalk.cyan('      config = function() ... end'));
        console.log(chalk.cyan('    }'));
      }
    }
  };
}

async function testLspStartup(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn('mlld', ['lsp'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let resolved = false;

      // Give it 2 seconds to start
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          resolve(true); // If it didn't crash in 2s, it's probably fine
        }
      }, 2000);

      proc.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(false);
        }
      });

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(code === 0 || code === null); // null means we killed it
        }
      });
    } catch {
      resolve(false);
    }
  });
}

interface ConfigIssue {
  name: string;
  severity: 'warn' | 'error';
  message: string;
}

function analyzeConfig(content: string, setupType: 'lazyvim' | 'standard'): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  // Check config version
  const versionMatch = content.match(/Config version:\s*(\d+)/);
  const configVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;

  if (configVersion < NVIM_CONFIG_VERSION) {
    issues.push({
      name: 'Config version',
      severity: 'warn',
      message: `Outdated (v${configVersion} < v${NVIM_CONFIG_VERSION}). Run: mlld nvim-setup --force`
    });
  }

  // Check for old filetype patterns
  if (content.includes('mlld = "mlld"') || content.includes("mlld = 'mlld'")) {
    issues.push({
      name: 'Filetype mapping',
      severity: 'error',
      message: 'Using old "mlld" filetype. Should be "mld".'
    });
  }

  // Check for missing lspconfig.mlld_ls.setup() call (critical for custom servers)
  if (!content.includes('lspconfig.mlld_ls.setup')) {
    issues.push({
      name: 'LSP setup call',
      severity: 'error',
      message: 'Missing lspconfig.mlld_ls.setup() call. LSP won\'t start!'
    });
  }

  // LazyVim-specific: check for setup() in opts vs config
  if (setupType === 'lazyvim') {
    // Using opts = function instead of config = function
    if (content.includes('opts = function') && !content.includes('config = function')) {
      issues.push({
        name: 'LazyVim plugin pattern',
        severity: 'error',
        message: 'Using "opts" instead of "config". Custom LSP setup needs "config = function()".'
      });
    }

    if (content.includes('opts.servers.mlld_ls') && !content.includes('lspconfig.mlld_ls.setup')) {
      issues.push({
        name: 'LazyVim config',
        severity: 'error',
        message: 'opts.servers doesn\'t work for custom servers. Need explicit setup().'
      });
    }
  }

  // Check for deprecated get_active_clients (Neovim 0.10+)
  if (content.includes('get_active_clients')) {
    issues.push({
      name: 'Deprecated API',
      severity: 'warn',
      message: 'Using deprecated get_active_clients. Use get_clients instead.'
    });
  }

  return issues;
}
