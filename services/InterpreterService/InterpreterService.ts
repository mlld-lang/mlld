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

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState = opts.initialState ?? this.stateService!.createChildState();
    let stateSnapshot: IStateService | undefined;

    if (opts.filePath) {
      currentState.setCurrentFilePath(opts.filePath);
    }

    logger.debug('Starting interpretation', {
      nodeCount: nodes.length,
      filePath: opts.filePath
    });

    try {
      // Take a snapshot of initial state for rollback
      stateSnapshot = currentState.clone();

      for (const node of nodes) {
        try {
          currentState = await this.interpretNode(node, currentState);
          // Update snapshot after each successful node
          stateSnapshot = currentState.clone();
        } catch (error) {
          // Roll back to last good state
          if (stateSnapshot) {
            currentState = stateSnapshot;
          }
          throw error;
        }
      }

      // If mergeState is true and we have a parent state, merge back
      if (opts.mergeState && opts.initialState) {
        try {
          await opts.initialState.mergeChildState(currentState);
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: opts.filePath
          });
          throw new MeldInterpreterError(
            'Failed to merge child state',
            'state_merge',
            undefined,
            { cause: error }
          );
        }
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes.length,
        filePath: opts.filePath
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes.length,
        filePath: opts.filePath,
        error
      });

      // Enhance error with context if needed
      if (!(error instanceof MeldInterpreterError)) {
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
      throw error;
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService> {
    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location
    });

    try {
      switch (node.type) {
        case 'Text':
          // Add text node to state
          state.addNode(node);
          break;

        case 'Directive':
          // Take state snapshot before directive processing
          const stateSnapshot = state.clone();
          try {
            // Process directive using DirectiveService
            await this.directiveService!.processDirective(node, {
              state,
              filePath: state.getCurrentFilePath()
            });
            state.addNode(node);
          } catch (error) {
            // Roll back state on directive error
            state = stateSnapshot;
            throw error;
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
            node.location?.start,
            {
              context: {
                nodeType: node.type,
                location: node.location
              }
            }
          );
      }

      return state;
    } catch (error) {
      // Enhance non-MeldInterpreterErrors with context
      if (!(error instanceof MeldInterpreterError)) {
        throw new MeldInterpreterError(
          error.message,
          node.type,
          node.location?.start,
          {
            cause: error,
            context: {
              nodeType: node.type,
              location: node.location,
              filePath: state.getCurrentFilePath()
            }
          }
        );
      }
      throw error;
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