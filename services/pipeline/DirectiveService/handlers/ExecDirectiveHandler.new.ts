import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { createCommandVariable } from '@core/types';
import { injectable, inject } from 'tsyringe';

/**
 * Minimal ExecDirectiveHandler implementation.
 * 
 * Processes @exec directives and returns state changes.
 * Creates command definitions without executing them.
 */
@injectable()
export class ExecDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'exec';
  
  constructor(
    @inject('IResolutionService') private resolution: IResolutionService
  ) {}
  
  async handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    // Extract identifier from directive
    const identifier = directive.raw.identifier;
    if (!identifier) {
      throw new Error('Exec directive missing identifier');
    }
    
    // Create resolution context
    const resolutionContext = {
      strict: options.strict,
      currentPath: options.filePath
    };
    
    // Handle different exec subtypes
    let commandDefinition: any;
    
    if (directive.subtype === 'execCommand') {
      // Handle command exec
      const commandNodes = directive.values.identifier;
      if (!commandNodes) {
        throw new Error('Exec command directive missing command');
      }
      
      const command = await this.resolution.resolveNodes(
        commandNodes,
        resolutionContext
      );
      
      // Parse command and arguments
      const parts = command.trim().split(/\s+/);
      const executableName = parts[0];
      const args = parts.slice(1);
      
      commandDefinition = {
        executableName,
        args,
        raw: command
      };
    } else if (directive.subtype === 'execCode') {
      // Handle code exec
      const codeNodes = directive.values.code;
      if (!codeNodes) {
        throw new Error('Exec code directive missing code');
      }
      
      const code = await this.resolution.resolveNodes(
        codeNodes,
        resolutionContext
      );
      
      const language = directive.values.language?.[0]?.content || 'javascript';
      
      commandDefinition = {
        language,
        code,
        raw: code
      };
    } else {
      throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
    }
    
    // Create the command variable
    const variable = createCommandVariable(identifier, commandDefinition);
    
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