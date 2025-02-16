import type { MeldNode, SourceLocation } from 'meld-spec';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import { IInterpreterService, type InterpreterOptions } from './IInterpreterService.js';
import type { IDirectiveService } from '@services/DirectiveService/IDirectiveService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';

const DEFAULT_OPTIONS: Required<Omit<InterpreterOptions, 'initialState'>> = {
  filePath: '',
  mergeState: true
};

function convertLocation(loc?: SourceLocation): InterpreterLocation | undefined {
  if (!loc) return undefined;
  return {
    line: loc.start.line,
    column: loc.start.column,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export class InterpreterService implements IInterpreterService {
  private directiveService?: IDirectiveService;
  private stateService?: IStateService;
  private initialized = false;

  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void {
    this.directiveService = directiveService;
    this.stateService = stateService;
    this.initialized = true;

    logger.debug('InterpreterService initialized');
  }

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!nodes) {
      throw new MeldInterpreterError(
        'No nodes provided for interpretation',
        'interpretation'
      );
    }

    if (!Array.isArray(nodes)) {
      throw new MeldInterpreterError(
        'Invalid nodes provided for interpretation: expected array',
        'interpretation'
      );
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState: IStateService;

    try {
      // Initialize state with proper cloning
      currentState = this.stateService!.createChildState();
      if (opts.initialState) {
        if (opts.mergeState) {
          // When mergeState is true, merge initial state into current state
          await currentState.mergeChildState(opts.initialState.clone());
        } else {
          // When mergeState is false, create a fresh state from initial state's clone
          currentState = this.stateService!.createChildState(opts.initialState.clone());
        }
      }

      if (!currentState) {
        throw new MeldInterpreterError(
          'Failed to initialize state for interpretation',
          'interpretation'
        );
      }

      if (opts.filePath) {
        currentState.setCurrentFilePath(opts.filePath);
      }

      // Take a snapshot of initial state for rollback
      const initialSnapshot = currentState.clone();
      let lastGoodState = initialSnapshot;

      logger.debug('Starting interpretation', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath
      });

      for (const node of nodes) {
        try {
          // Process the node with current state
          const updatedState = await this.interpretNode(node, currentState.clone());
          
          // If successful, update the states
          lastGoodState = updatedState.clone();
          currentState = updatedState;
        } catch (error) {
          // Roll back to last good state and preserve node order
          currentState = lastGoodState.clone();
          
          // Preserve MeldInterpreterError or wrap other errors
          if (error instanceof MeldInterpreterError) {
            // Create new error with updated context
            throw new MeldInterpreterError(
              error.message,
              error.nodeType,
              error.location,
              {
                cause: error.cause,
                context: {
                  ...error.context,
                  state: {
                    filePath: currentState.getCurrentFilePath(),
                    nodeCount: currentState.getNodes()?.length ?? 0
                  }
                }
              }
            );
          }
          throw new MeldInterpreterError(
            getErrorMessage(error),
            node.type,
            convertLocation(node.location),
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                nodeType: node.type,
                location: convertLocation(node.location),
                filePath: currentState.getCurrentFilePath(),
                state: {
                  filePath: currentState.getCurrentFilePath(),
                  nodeCount: currentState.getNodes()?.length ?? 0
                }
              }
            }
          );
        }
      }

      // If mergeState is true and we have a parent state, merge back
      if (opts.mergeState && opts.initialState) {
        try {
          const mergedState = currentState.clone();
          await opts.initialState.mergeChildState(mergedState);
          currentState = opts.initialState; // Use parent state after merge
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: currentState.getCurrentFilePath()
          });
          // Roll back to last good state
          currentState = lastGoodState.clone();
          throw new MeldInterpreterError(
            getErrorMessage(error),
            'state_merge',
            undefined,
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                filePath: currentState.getCurrentFilePath(),
                state: {
                  filePath: currentState.getCurrentFilePath(),
                  nodeCount: currentState.getNodes()?.length ?? 0
                }
              }
            }
          );
        }
      } else {
        // When mergeState is false, ensure we return a completely isolated state
        const isolatedState = currentState.clone();
        isolatedState.setImmutable(); // Prevent further modifications
        currentState = isolatedState;
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'interpretation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            filePath: opts.filePath,
            nodeCount: nodes?.length ?? 0
          }
        }
      );
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService> {
    if (!node) {
      throw new MeldInterpreterError(
        'No node provided for interpretation',
        'interpretation'
      );
    }

    if (!state) {
      throw new MeldInterpreterError(
        'No state provided for node interpretation',
        'interpretation'
      );
    }

    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location,
      filePath: state.getCurrentFilePath()
    });

    try {
      // Take a snapshot before processing
      const preNodeState = state.clone();
      let currentState = preNodeState;

      switch (node.type) {
        case 'Text':
          // Add text node to state and store its value if it has an identifier
          currentState.addNode(node);
          const textNode = node as { content: string; identifier?: string };
          if (textNode.identifier) {
            currentState.setTextVar(textNode.identifier, textNode.content);
          }
          break;

        case 'Directive':
          if (!this.directiveService) {
            throw new MeldInterpreterError(
              'DirectiveService not initialized',
              'interpretation'
            );
          }
          try {
            // Process directive using DirectiveService with cloned state
            const processedState = currentState.clone();
            await this.directiveService.processDirective(node, {
              state: processedState,
              filePath: processedState.getCurrentFilePath()
            });
            // Preserve node order by adding node after processing
            processedState.addNode(node);
            currentState = processedState;
          } catch (error) {
            // Restore state to pre-node state on directive error
            currentState = preNodeState.clone();
            
            // Preserve or wrap the error with proper location
            if (error instanceof MeldInterpreterError) {
              throw new MeldInterpreterError(
                error.message,
                error.nodeType || 'Directive',
                error.location || convertLocation(node.location),
                {
                  cause: error.cause,
                  context: {
                    ...error.context,
                    nodeType: node.type,
                    location: convertLocation(node.location),
                    filePath: currentState.getCurrentFilePath(),
                    state: {
                      filePath: currentState.getCurrentFilePath(),
                      nodeCount: currentState.getNodes()?.length ?? 0
                    }
                  }
                }
              );
            }
            throw new MeldInterpreterError(
              getErrorMessage(error),
              'Directive',
              convertLocation(node.location),
              {
                cause: error instanceof Error ? error : undefined,
                context: {
                  nodeType: node.type,
                  location: convertLocation(node.location),
                  filePath: currentState.getCurrentFilePath(),
                  state: {
                    filePath: currentState.getCurrentFilePath(),
                    nodeCount: currentState.getNodes()?.length ?? 0
                  }
                }
              }
            );
          }
          break;

        case 'CodeFence':
          // Add code fence node to state
          currentState.addNode(node);
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            'unknown_node',
            convertLocation(node.location),
            {
              context: {
                nodeType: node.type,
                location: convertLocation(node.location),
                state: {
                  filePath: currentState.getCurrentFilePath(),
                  nodeCount: currentState.getNodes()?.length ?? 0
                }
              }
            }
          );
      }

      return currentState;
    } catch (error) {
      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        node.type,
        convertLocation(node.location),
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            nodeType: node.type,
            location: convertLocation(node.location),
            filePath: state.getCurrentFilePath(),
            state: {
              filePath: state.getCurrentFilePath(),
              nodeCount: state.getNodes()?.length ?? 0
            }
          }
        }
      );
    }
  }

  async createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!parentState) {
      throw new MeldInterpreterError(
        'No parent state provided for child context creation',
        'context_creation'
      );
    }

    try {
      // Create child state from parent
      const childState = parentState.createChildState();

      if (!childState) {
        throw new MeldInterpreterError(
          'Failed to create child state',
          'context_creation',
          undefined,
          {
            context: {
              parentFilePath: parentState.getCurrentFilePath()
            }
          }
        );
      }

      // Set file path if provided
      if (filePath) {
        childState.setCurrentFilePath(filePath);
      }

      logger.debug('Created child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        hasParent: true
      });

      return childState;
    } catch (error) {
      logger.error('Failed to create child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'context_creation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            parentFilePath: parentState.getCurrentFilePath(),
            childFilePath: filePath,
            state: {
              filePath: parentState.getCurrentFilePath(),
              nodeCount: parentState.getNodes()?.length ?? 0
            }
          }
        }
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.directiveService || !this.stateService) {
      throw new MeldInterpreterError(
        'InterpreterService must be initialized before use',
        'initialization'
      );
    }
  }
} 