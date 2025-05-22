import type { MeldNode, DirectiveNode, TextNode, VariableReferenceNode } from '@core/ast/types/index';
import { isTextNode, isDirectiveNode, isVariableReferenceNode } from '@core/ast/types/guards';
import type { IInterpreterService, InterpreterOptions } from './IInterpreterService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { StateServiceAdapter } from '@services/state/StateService/StateServiceAdapter';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.new';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { MeldInterpreterError, ErrorSeverity } from '@core/errors';
import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'crypto';

/**
 * Minimal InterpreterService implementation.
 * 
 * Processes AST nodes and coordinates directive execution.
 * All complexity removed - just simple node traversal and directive dispatch.
 */
@injectable()
export class InterpreterService implements IInterpreterService {
  constructor(
    @inject('IDirectiveService') private directiveService: IDirectiveService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IStateService') private stateService: IStateService
  ) {}

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions,
    initialState?: IStateService
  ): Promise<IStateService> {
    // Validate input
    if (!nodes) {
      throw new MeldInterpreterError(
        'No nodes provided for interpretation',
        'interpretation',
        undefined,
        { severity: ErrorSeverity.Fatal }
      );
    }

    if (!Array.isArray(nodes)) {
      throw new MeldInterpreterError(
        'Invalid nodes provided for interpretation: expected array',
        'interpretation',
        undefined,
        { severity: ErrorSeverity.Fatal }
      );
    }

    // Get initial state or create a new one
    const state = initialState || this.createEmptyState();
    
    // Set file path if provided
    if (options?.filePath) {
      state.currentFilePath = options.filePath;
    }

    // Process nodes sequentially
    let currentState = state;
    for (const node of nodes) {
      currentState = await this.processNode(node, currentState, options || {});
    }

    return currentState;
  }

  private async processNode(
    node: MeldNode,
    state: IStateService,
    options: InterpreterOptions
  ): Promise<IStateService> {
    // Add the node to state
    state.addNode(node);

    if (isTextNode(node)) {
      // Text nodes are just added, no processing needed
      return state;
    }

    if (isVariableReferenceNode(node)) {
      // Resolve variable reference and add as text node
      const variable = state.getVariable(node.identifier);
      if (variable) {
        const resolvedNode: TextNode = {
          type: 'Text',
          nodeId: randomUUID(),
          content: String(variable.value)
        };
        state.addNode(resolvedNode);
      } else if (options.strict !== false) {
        throw new MeldInterpreterError(
          `Variable not found: ${node.identifier}`,
          'variable-resolution',
          undefined,
          { severity: ErrorSeverity.Error }
        );
      }
      return state;
    }

    if (isDirectiveNode(node)) {
      // Process directive through directive service
      const result = await this.directiveService.handleDirective(
        node,
        state,
        {
          strict: options.strict !== false,
          filePath: state.currentFilePath || undefined
        }
      );

      // Apply state changes if any
      if (result.stateChanges) {
        state = await this.applyStateChanges(state, result.stateChanges);
      }

      // Handle replacements if any
      if (result.replacement) {
        // In the minimal version, replacements are handled by adding the replacement nodes
        // The transformation tracking is removed
        for (const replacementNode of result.replacement) {
          state.addNode(replacementNode);
        }
      }

      return state;
    }

    // Unknown node type - just add it
    return state;
  }

  private async applyStateChanges(
    state: IStateService,
    changes: any
  ): Promise<IStateService> {
    // Apply variable changes
    if (changes.variables) {
      for (const [name, variable] of Object.entries(changes.variables)) {
        state.setVariable(variable as any);
      }
    }

    return state;
  }

  private createEmptyState(): IStateService {
    // This is a temporary solution - should be injected
    return new StateServiceAdapter();
  }
}