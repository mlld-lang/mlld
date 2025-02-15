import type { MeldNode } from 'meld-spec';
import { interpreterLogger as logger } from '../../core/utils/logger';
import { IInterpreterService, type InterpreterOptions } from './IInterpreterService';
import type { IDirectiveService } from '../DirectiveService/IDirectiveService';
import type { IStateService } from '../StateService/IStateService';
import { MeldInterpreterError } from '../../core/errors/MeldInterpreterError';

const DEFAULT_OPTIONS: Required<Omit<InterpreterOptions, 'initialState'>> = {
  filePath: undefined,
  mergeState: true
};

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

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState = opts.initialState ?? this.stateService!.createChildState();

    if (opts.filePath) {
      currentState.setCurrentFilePath(opts.filePath);
    }

    logger.debug('Starting interpretation', {
      nodeCount: nodes.length,
      filePath: opts.filePath
    });

    try {
      // Take a snapshot of initial state for rollback
      const initialSnapshot = currentState.clone();
      let lastGoodState = initialSnapshot;

      for (const node of nodes) {
        try {
          // Process the node with a cloned state to ensure isolation
          const nodeState = lastGoodState.clone();
          const updatedState = await this.interpretNode(node, nodeState);
          
          // If successful, update the last good state
          lastGoodState = updatedState;
          currentState = updatedState;
        } catch (error) {
          // Roll back to last good state
          currentState = lastGoodState;
          
          // Preserve MeldInterpreterError or wrap other errors
          if (error instanceof MeldInterpreterError) {
            // Add state context if not present
            if (!error.context?.state) {
              error.context = {
                ...error.context,
                state: {
                  filePath: lastGoodState.getCurrentFilePath(),
                  nodeCount: lastGoodState.getNodes().length
                }
              };
            }
            throw error;
          }
          throw new MeldInterpreterError(
            error.message,
            node.type,
            node.location?.start,
            {
              cause: error,
              context: {
                nodeType: node.type,
                location: node.location,
                filePath: opts.filePath,
                state: {
                  lastGoodStateNodes: lastGoodState.getNodes().length
                }
              }
            }
          );
        }
      }

      // If mergeState is true and we have a parent state, merge back
      if (opts.mergeState && opts.initialState) {
        try {
          await opts.initialState.mergeChildState(currentState);
          currentState = opts.initialState; // Use parent state after merge
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: opts.filePath
          });
          // Roll back to last good state
          currentState = lastGoodState;
          throw new MeldInterpreterError(
            'Failed to merge child state',
            'state_merge',
            undefined,
            {
              cause: error,
              context: {
                filePath: opts.filePath,
                state: {
                  lastGoodStateNodes: lastGoodState.getNodes().length
                }
              }
            }
          );
        }
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes.length,
        filePath: opts.filePath,
        finalStateNodes: currentState.getNodes().length
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes.length,
        filePath: opts.filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        error.message,
        'interpretation',
        undefined,
        {
          cause: error,
          context: {
            filePath: opts.filePath,
            nodeCount: nodes.length
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

    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location,
      filePath: state.getCurrentFilePath()
    });

    try {
      // Take a snapshot before processing
      const preNodeState = state.clone();

      switch (node.type) {
        case 'Text':
          // Add text node to state
          state.addNode(node);
          break;

        case 'Directive':
          try {
            // Process directive using DirectiveService
            await this.directiveService!.processDirective(node, {
              state,
              filePath: state.getCurrentFilePath()
            });
            state.addNode(node);
          } catch (directiveError) {
            // Restore state to pre-node state on directive error
            state = preNodeState;
            throw directiveError;
          }
          break;

        case 'CodeFence':
          // Add code fence node to state as-is
          state.addNode(node);
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            'unknown_node',
            node.location,
            {
              context: {
                nodeType: node.type,
                location: node.location,
                filePath: state.getCurrentFilePath()
              }
            }
          );
      }

      return state;
    } catch (error) {
      // Log detailed error information
      logger.error('Node interpretation failed', {
        nodeType: node.type,
        location: node.location,
        filePath: state.getCurrentFilePath(),
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        // Add current state context if not present
        if (!error.context?.state) {
          error.context = {
            ...error.context,
            state: {
              filePath: state.getCurrentFilePath(),
              nodeCount: state.getNodes().length
            }
          };
        }
        throw error;
      }

      throw new MeldInterpreterError(
        error.message,
        node.type,
        node.location,
        {
          cause: error,
          context: {
            nodeType: node.type,
            location: node.location,
            filePath: state.getCurrentFilePath(),
            state: {
              nodeCount: state.getNodes().length
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
    const childState = parentState.createChildState();
    
    if (filePath) {
      childState.setCurrentFilePath(filePath);
    }

    logger.debug('Created child interpreter context', { filePath });
    return childState;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('InterpreterService must be initialized before use');
    }
  }
} 