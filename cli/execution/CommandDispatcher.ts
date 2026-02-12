import { registryCommand } from '../commands/registry';
import { createInstallCommand } from '../commands/install';
import { createLsCommand } from '../commands/ls';
import { createInfoCommand } from '../commands/info';
import { createDocsCommand } from '../commands/docs';
import { createAuthCommand } from '../commands/auth';
import { createPublishCommand } from '../commands/publish';
import { createInitCommand } from '../commands/init';
import { createInitModuleCommand } from '../commands/init-module';
import { createAddNeedsCommand } from '../commands/add-needs';
import { createSetupCommand } from '../commands/setup';
import { createAliasCommand } from '../commands/alias';
import { createKeychainCommand } from '../commands/keychain';
import { varsCommand } from '../commands/vars';
import { envCommand } from '../commands/env';
import { languageServerCommand } from '../commands/language-server';
import { testCommand } from '../commands/test';
import { createRunCommand } from '../commands/run';
import { errorTestCommand } from '../commands/error-test';
import { createDevCommand } from '../commands/dev';
import { createCleanCommand } from '../commands/clean';
import { createNvimSetupCommand } from '../commands/nvim-setup';
import { createNvimDoctorCommand } from '../commands/nvim-doctor';
import { createUpdateCommand } from '../commands/update';
import { createOutdatedCommand } from '../commands/outdated';
import { createMcpCommand } from '../commands/mcp';
import { createLiveCommand } from '../commands/live';
import { mcpDevCommand } from '../commands/mcp-dev';
import { createHowtoCommand, createQuickstartCommand } from '../commands/howto';
import { createValidateCommand } from '../commands/analyze';
import { createVerifyCommand } from '../commands/verify';
import type { CLIOptions } from '../index';

export class CommandDispatcher {
  private readonly commandMap: Map<string, any> = new Map();

  constructor() {
    this.initializeCommands();
  }

  private initializeCommands(): void {
    // Map command names to their handlers
    this.commandMap.set('registry', registryCommand);
    this.commandMap.set('install', createInstallCommand());
    this.commandMap.set('i', createInstallCommand()); // Alias for install
    this.commandMap.set('ls', createLsCommand());
    this.commandMap.set('list', createLsCommand()); // Alias for ls
    this.commandMap.set('info', createInfoCommand());
    this.commandMap.set('show', createInfoCommand()); // Alias for info
    this.commandMap.set('docs', createDocsCommand());
    this.commandMap.set('auth', createAuthCommand());
    this.commandMap.set('publish', createPublishCommand());
    this.commandMap.set('init', createInitCommand());
    this.commandMap.set('module', createInitModuleCommand());
    this.commandMap.set('mod', createInitModuleCommand()); // Alias
    this.commandMap.set('add-needs', createAddNeedsCommand());
    this.commandMap.set('needs', createAddNeedsCommand()); // Alias
    this.commandMap.set('deps', createAddNeedsCommand()); // Alias
    this.commandMap.set('setup', createSetupCommand());
    this.commandMap.set('alias', createAliasCommand());
    this.commandMap.set('keychain', createKeychainCommand());
    this.commandMap.set('vars', varsCommand);
    this.commandMap.set('env', envCommand);
    this.commandMap.set('language-server', languageServerCommand);
    this.commandMap.set('lsp', languageServerCommand); // Alias for language-server
    this.commandMap.set('test', testCommand);
    this.commandMap.set('run', createRunCommand());
    this.commandMap.set('error-test', errorTestCommand);
    this.commandMap.set('dev', createDevCommand());
    this.commandMap.set('clean', createCleanCommand());
    this.commandMap.set('update', createUpdateCommand());
    this.commandMap.set('outdated', createOutdatedCommand());
    const mcpCommand = createMcpCommand();
    this.commandMap.set('mcp', mcpCommand);
    this.commandMap.set('serve', mcpCommand); // Alias for backward compatibility
    this.commandMap.set('live', createLiveCommand());
    this.commandMap.set('mcp-dev', mcpDevCommand);
    this.commandMap.set('nvim-setup', createNvimSetupCommand());
    this.commandMap.set('nvim', createNvimSetupCommand()); // Alias
    this.commandMap.set('nvim-doctor', createNvimDoctorCommand());
    this.commandMap.set('howto', createHowtoCommand());
    this.commandMap.set('ht', createHowtoCommand()); // Alias
    this.commandMap.set('qs', createQuickstartCommand());
    this.commandMap.set('quickstart', createQuickstartCommand()); // Alias
    this.commandMap.set('validate', createValidateCommand());
    this.commandMap.set('analyze', createValidateCommand()); // Alias
    this.commandMap.set('verify', createVerifyCommand());
  }

  async executeCommand(
    command: string, 
    subcommands: string[], 
    options: CLIOptions
  ): Promise<void> {
    const handler = this.commandMap.get(command);
    
    if (!handler) {
      throw new Error(`Unknown command: ${command}`);
    }

    // Handle different command types
    if (typeof handler === 'function') {
      // Direct function (like registryCommand, envCommand, etc.)
      if (handler.name === 'registryCommand' || handler.name === 'testCommand' || handler.name === 'errorTestCommand' || handler.name === 'languageServerCommand' || handler.name === 'mcpDevCommand') {
        await handler(subcommands);
      } else if (handler.name === 'varsCommand' || handler.name === 'envCommand') {
        // varsCommand and envCommand expect an options object with _ property
        await handler({ _: subcommands });
      } else {
        // Command object with execute method
        const { flags, remaining } = this.parseCommandFlags(subcommands);
        await handler.execute(remaining, flags);
      }
    } else if (handler && typeof handler.execute === 'function') {
      // Command object with execute method
      const { flags, remaining } = this.parseCommandFlags(subcommands);
      await handler.execute(remaining, flags);
    } else {
      throw new Error(`Invalid command handler for: ${command}`);
    }
  }

  supportsCommand(command: string): boolean {
    return this.commandMap.has(command);
  }

  createCommandHandler(command: string): any {
    return this.commandMap.get(command);
  }

  handleSubcommands(command: string, subcommands: string[], options: CLIOptions): string[] {
    // Process subcommands based on the command type
    return subcommands;
  }

  parseFlags(args: string[]): any {
    const flags: any = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        const key = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      }
    }
    
    return flags;
  }

  parseCommandFlags(args: string[]): { flags: any; remaining: string[] } {
    const flags: any = {};
    const remaining: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        const key = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      } else {
        remaining.push(arg);
      }
    }

    return { flags, remaining };
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commandMap.keys());
  }

  getCommandDescription(command: string): string {
    const descriptions: Record<string, string> = {
      'registry': 'Manage mlld module registry',
      'install': 'Install mlld modules',
      'ls': 'List installed modules',
      'info': 'Show module details',
      'docs': 'Show module documentation',
      'auth': 'Manage GitHub authentication',
      'publish': 'Publish module to registry',
      'init': 'Initialize mlld project with defaults',
      'module': 'Create a new mlld module',
      'mod': 'Create a new mlld module',
      'add-needs': 'Analyze and update module dependencies',
      'setup': 'Interactive project configuration wizard',
      'alias': 'Create path aliases',
      'keychain': 'Manage project keychain entries',
      'vars': 'Manage environment variable permissions',
      'env': 'Manage AI agent environments',
      'dev': 'Inspect local module discovery',
      'live': 'Start persistent live RPC server over stdio',
      'language-server': 'Start language server',
      'test': 'Run mlld tests',
      'run': 'Run mlld scripts',
      'verify': 'Verify signed variables from MLLD_VERIFY_VARS',
      'error-test': 'Test error handling',
      'clean': 'Remove modules from lock file and cache',
      'update': 'Update installed modules to latest versions',
      'outdated': 'List modules with available updates',
      'validate': 'Validate mlld syntax and show module structure',
      'analyze': 'Validate mlld syntax and show module structure',
      'howto': 'Get help on mlld topics',
      'ht': 'Get help on mlld topics',
      'qs': 'Quick start guide',
      'quickstart': 'Quick start guide'
    };

    return descriptions[command] || 'No description available';
  }
}
