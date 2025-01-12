import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface DefineDirectiveData {
  kind: 'define';
  name: string;
  body: string;
}

/**
 * Handler for @define directives
 */
class DefineDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'define';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Define directive requires a name',
        'define',
        node.location?.start
      );
    }

    if (!data.body) {
      throw new MeldDirectiveError(
        'Define directive requires a body',
        'define',
        node.location?.start
      );
    }

    // Handle both string and object run directives
    if (typeof data.body === 'string') {
      if (!data.body.trim().startsWith('@run')) {
        throw new MeldDirectiveError(
          'Define directive body must be a @run directive',
          'define',
          node.location?.start
        );
      }
    } else if (data.body.type === 'Directive' && data.body.directive?.kind === 'run') {
      // Valid run directive object
    } else {
      throw new MeldDirectiveError(
        'Define directive body must be a @run directive',
        'define',
        node.location?.start
      );
    }

    // Store the command
    const command = typeof data.body === 'string' ? 
      data.body.replace(/^@run\s+/, '') : 
      data.body.directive.command;

    state.setCommand(data.name, () => command);
  }
}

export const defineDirectiveHandler = new DefineDirectiveHandler(); 