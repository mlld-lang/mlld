import type { DirectiveNode, TextNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler } from '../IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { injectable, inject } from 'tsyringe';
import { execSync } from 'child_process';

/**
 * Minimal RunDirectiveHandler implementation.
 * 
 * Processes @run directives and returns replacement nodes.
 * Actually executes commands and returns their output.
 */
@injectable()
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';
  
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
    // Create resolution context
    const resolutionContext = {
      strict: options.strict,
      currentPath: options.filePath
    };
    
    let output = '';
    
    if (directive.subtype === 'runCommand') {
      // Handle command execution
      const commandNodes = directive.values.identifier || directive.values.command;
      if (!commandNodes) {
        throw new Error('Run command directive missing command');
      }
      
      const command = await this.resolution.resolveNodes(
        commandNodes,
        resolutionContext
      );
      
      try {
        // Execute the command
        output = execSync(command, {
          encoding: 'utf8',
          cwd: options.filePath ? require('path').dirname(options.filePath) : process.cwd()
        });
      } catch (error) {
        if (error instanceof Error && 'stdout' in error) {
          // Even on error, we might have output
          output = (error as any).stdout || '';
        }
        if (!output && error instanceof Error) {
          throw new Error(`Command execution failed: ${error.message}`);
        }
      }
    } else if (directive.subtype === 'runCode') {
      // Handle code execution (simplified - only supports Node.js)
      const codeNodes = directive.values.code;
      if (!codeNodes) {
        throw new Error('Run code directive missing code');
      }
      
      const code = await this.resolution.resolveNodes(
        codeNodes,
        resolutionContext
      );
      
      try {
        // Execute the code and capture output
        const result = eval(code);
        output = result !== undefined ? String(result) : '';
      } catch (error) {
        throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (directive.subtype === 'runExec') {
      // Handle exec reference
      const execRef = directive.raw.execRef;
      if (!execRef) {
        throw new Error('Run exec directive missing exec reference');
      }
      
      // Get the command variable from state
      const cmdVar = state.getVariable(execRef);
      if (!cmdVar || cmdVar.type !== 'command') {
        throw new Error(`Command variable not found: ${execRef}`);
      }
      
      const cmdDef = cmdVar.value;
      if ('executableName' in cmdDef) {
        // It's a command
        const fullCommand = `${cmdDef.executableName} ${cmdDef.args.join(' ')}`;
        try {
          output = execSync(fullCommand, {
            encoding: 'utf8',
            cwd: options.filePath ? require('path').dirname(options.filePath) : process.cwd()
          });
        } catch (error) {
          if (error instanceof Error && 'stdout' in error) {
            output = (error as any).stdout || '';
          }
          if (!output && error instanceof Error) {
            throw new Error(`Command execution failed: ${error.message}`);
          }
        }
      } else if ('code' in cmdDef) {
        // It's code
        try {
          const result = eval(cmdDef.code);
          output = result !== undefined ? String(result) : '';
        } catch (error) {
          throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } else {
      throw new Error(`Unsupported run subtype: ${directive.subtype}`);
    }
    
    // Create replacement text node with the output
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-output`,
      content: output.trimEnd() // Remove trailing newline
    };
    
    // Return replacement node
    return {
      replacement: [replacementNode]
    };
  }
}