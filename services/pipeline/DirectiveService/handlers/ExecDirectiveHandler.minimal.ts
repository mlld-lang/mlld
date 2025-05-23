import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.new';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.new';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors';
import { createTextVariable, createCommandVariable } from '@core/types';

/**
 * ExecDirectiveHandler using new minimal interfaces.
 * 
 * Handles @exec directives - executes commands and captures output.
 * Stores the output in a variable for later use.
 */
@injectable()
export class ExecDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'exec';
  
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
    
    // Extract identifier for output variable
    const identifier = directive.raw?.identifier;
    if (!identifier) {
      throw new MeldError('Exec directive missing identifier', {
        code: 'EXEC_MISSING_IDENTIFIER',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Create resolution context
    const resolutionContext: ResolutionContext = {
      state: state,
      basePath: options.filePath 
        ? options.filePath.substring(0, options.filePath.lastIndexOf('/') || 0)
        : process.cwd(),
      currentFilePath: options.filePath || process.cwd()
    };
    
    let output: string;
    
    if (subtype === 'execCommand') {
      // Handle inline command execution
      const commandNodes = directive.values?.command;
      if (!commandNodes) {
        throw new MeldError('Exec command directive missing command', {
          code: 'EXEC_MISSING_COMMAND',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Resolve the command
      const command = await this.resolution.resolve({
        value: commandNodes,
        context: resolutionContext,
        type: 'command'
      });
      
      // Execute the command and capture output
      output = await this.fileSystem.executeCommand(command, {
        cwd: resolutionContext.basePath
      });
      
    } else if (subtype === 'execCode') {
      // Handle inline code execution
      const code = directive.values?.code;
      if (!code) {
        throw new MeldError('Exec code directive missing code', {
          code: 'EXEC_MISSING_CODE',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Execute code as shell command and capture output
      output = await this.fileSystem.executeCommand(code, {
        cwd: resolutionContext.basePath
      });
      
    } else if (subtype === 'execReference') {
      // Handle command variable reference with parameters
      const refIdentifier = directive.values?.identifier?.[0]?.identifier;
      if (!refIdentifier) {
        throw new MeldError('Exec reference directive missing command reference', {
          code: 'EXEC_MISSING_REFERENCE',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Get the command variable
      const cmdVar = state.getVariable(refIdentifier);
      if (!cmdVar || cmdVar.type !== 'command') {
        throw new MeldError(`Command variable not found: ${refIdentifier}`, {
          code: 'EXEC_COMMAND_NOT_FOUND',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Get parameters if any
      let command = String(cmdVar.value);
      const params = directive.values?.parameters;
      if (params && Array.isArray(params)) {
        // Resolve each parameter
        const resolvedParams = await Promise.all(
          params.map(param => 
            this.resolution.resolve({
              value: param,
              context: resolutionContext,
              type: 'text'
            })
          )
        );
        command += ' ' + resolvedParams.join(' ');
      }
      
      // Execute the command with parameters
      output = await this.fileSystem.executeCommand(command, {
        cwd: resolutionContext.basePath
      });
      
    } else {
      throw new MeldError(`Unknown exec directive subtype: ${subtype}`, {
        code: 'EXEC_UNKNOWN_SUBTYPE',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Trim the output and create a text variable with the result
    const trimmedOutput = output.trim();
    const variable = createTextVariable(identifier, trimmedOutput);
    
    // Return state changes
    return {
      stateChanges: {
        variables: {
          [identifier]: variable
        }
      }
    };
  }
}