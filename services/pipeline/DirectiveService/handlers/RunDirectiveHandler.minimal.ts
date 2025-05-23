import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';
import { createCommandVariable } from '@core/types';

/**
 * RunDirectiveHandler using new minimal interfaces.
 * 
 * Handles @run directives - executes commands without capturing output.
 * Supports both inline commands and command variable references.
 */
@injectable()
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService,
    @inject('IFileSystemService') private fileSystem: IFileSystemService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    const subtype = directive.subtype;
    
    // Create resolution context
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0)
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    if (subtype === 'runCommand') {
      // Handle inline command execution
      const commandNodes = directive.values?.command || directive.values?.identifier;
      if (!commandNodes) {
        throw new MeldError('Run command directive missing command', {
          code: 'RUN_MISSING_COMMAND',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Resolve the command
      const command = await this.resolution.resolve({
        value: commandNodes,
        context: resolutionContext,
        type: 'command'
      });
      
      // Execute the command (without capturing output for @run)
      await this.fileSystem.executeCommand(command, {
        cwd: resolutionContext.basePath
      });
      
      // @run directives don't produce output or state changes
      return { stateChanges: {} };
      
    } else if (subtype === 'runCode') {
      // Handle inline code execution
      const code = directive.values?.code;
      if (!code) {
        throw new MeldError('Run code directive missing code', {
          code: 'RUN_MISSING_CODE',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // For inline code, we execute it as a shell command
      // In a real implementation, this might use a different executor
      await this.fileSystem.executeCommand(code, {
        cwd: resolutionContext.basePath
      });
      
      return { stateChanges: {} };
      
    } else if (subtype === 'runExec') {
      // Handle command variable reference
      const identifier = directive.raw?.identifier;
      if (!identifier) {
        throw new MeldError('Run exec directive missing identifier', {
          code: 'RUN_MISSING_IDENTIFIER',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Get the command variable
      const cmdVar = state.getVariable(identifier);
      if (!cmdVar || cmdVar.type !== 'command') {
        throw new MeldError(`Command variable not found: ${identifier}`, {
          code: 'RUN_COMMAND_NOT_FOUND',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Execute the command
      await this.fileSystem.executeCommand(String(cmdVar.value), {
        cwd: resolutionContext.basePath
      });
      
      return { stateChanges: {} };
    }
    
    throw new MeldError(`Unknown run directive subtype: ${subtype}`, {
      code: 'RUN_UNKNOWN_SUBTYPE',
      severity: ErrorSeverity.Fatal
    });
  }
}