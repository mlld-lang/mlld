import { registryCommand } from '../commands/registry';
import { createInstallCommand } from '../commands/install';
import { createLsCommand } from '../commands/ls';
import { createInfoCommand } from '../commands/info';
import { createAuthCommand } from '../commands/auth';
import { createPublishCommand } from '../commands/publish';
import { createInitModuleCommand } from '../commands/init-module';
import { createAddNeedsCommand } from '../commands/add-needs';
import { createSetupCommand } from '../commands/setup';
import { createAliasCommand } from '../commands/alias';
import { envCommand } from '../commands/env';
import { languageServerCommand } from '../commands/language-server';
import { testCommand } from '../commands/test';
import { createRunCommand } from '../commands/run';
import { errorTestCommand } from '../commands/error-test';
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
    this.commandMap.set('auth', createAuthCommand());
    this.commandMap.set('publish', createPublishCommand());
    this.commandMap.set('init', createInitModuleCommand());
    this.commandMap.set('init-module', createInitModuleCommand());
    this.commandMap.set('add-needs', createAddNeedsCommand());
    this.commandMap.set('needs', createAddNeedsCommand()); // Alias
    this.commandMap.set('deps', createAddNeedsCommand()); // Alias
    this.commandMap.set('setup', createSetupCommand());
    this.commandMap.set('alias', createAliasCommand());
    this.commandMap.set('env', envCommand);
    this.commandMap.set('language-server', languageServerCommand);
    this.commandMap.set('lsp', languageServerCommand); // Alias for language-server
    this.commandMap.set('test', testCommand);
    this.commandMap.set('run', createRunCommand());
    this.commandMap.set('error-test', errorTestCommand);
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
      if (handler.name === 'registryCommand' || handler.name === 'testCommand' || handler.name === 'errorTestCommand' || handler.name === 'languageServerCommand') {
        await handler(subcommands);
      } else if (handler.name === 'envCommand') {
        // envCommand expects an options object with _ property
        await handler({ _: subcommands });
      } else {
        // Command object with execute method
        await handler.execute(subcommands, this.parseFlags(subcommands));
      }
    } else if (handler && typeof handler.execute === 'function') {
      // Command object with execute method
      await handler.execute(subcommands, this.parseFlags(subcommands));
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
    // Future enhancement: return command descriptions
    const descriptions: Record<string, string> = {
      'registry': 'Manage mlld module registry',
      'install': 'Install mlld modules',
      'ls': 'List installed modules',
      'info': 'Show module details',
      'auth': 'Manage GitHub authentication',
      'publish': 'Publish module to registry',
      'init': 'Create a new mlld module',
      'add-needs': 'Analyze and update module dependencies',
      'setup': 'Configure mlld project',
      'alias': 'Create path aliases',
      'env': 'Manage environment variables',
      'language-server': 'Start language server',
      'test': 'Run mlld tests',
      'run': 'Run mlld scripts',
      'error-test': 'Test error handling'
    };
    
    return descriptions[command] || 'No description available';
  }
}