import { DirectiveHandler } from './types.js';
import { DirectiveNode, DirectiveData } from 'meld-spec';
import { InterpreterState } from '../state/state.js';

interface DefineDirectiveMetadata {
  risk?: string;
  about?: string;
  meta?: Record<string, any>;
}

interface CommandDefinition {
  parameters: string[];
  metadata: DefineDirectiveMetadata;
  body: DirectiveNode;
  execute: Function;
}

interface DefineDirectiveData extends DirectiveData {
  kind: 'define';
  name: string;
  parameters?: string[];
  metadata?: DefineDirectiveMetadata;
  body: DirectiveNode; // Must be a @run directive
}

export class DefineDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === 'define';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as DefineDirectiveData;
    
    // Validate that body is a @run directive
    if (!data.body || data.body.directive.kind !== 'run') {
      throw new Error('Define directive body must be a @run directive');
    }

    // Create the command definition with an execute function
    const commandDef: CommandDefinition = {
      parameters: data.parameters || [],
      metadata: data.metadata || {},
      body: data.body,
      execute: function(...args: any[]) {
        // TODO: Implement command execution
        console.log('Executing command with args:', args);
      }
    };

    state.commands.set(data.name, commandDef.execute);
  }
} 