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
      // Initialize state
      if (opts.initialState) {
        if (opts.mergeState) {
          // When mergeState is true, create child state from initial state
          currentState = opts.initialState.createChildState();
        } else {
          // When mergeState is false, create completely isolated state
          currentState = this.stateService!.createChildState();
        }
      } else {
        // No initial state, create fresh state
        currentState = this.stateService!.createChildState();
      }

      if (!currentState) {
        throw new MeldInterpreterError(
          'Failed to initialize state for interpretation',
          'initialization'
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
        filePath: opts.filePath,
        mergeState: opts.mergeState
      });

      for (const node of nodes) {
        try {
          // Process the node with current state
          const updatedState = await this.interpretNode(node, currentState);
          
          // If successful, update the states and merge back to parent if needed
          lastGoodState = updatedState.clone();
          currentState = updatedState;
          
          // Merge back to parent state if we have one
          if (opts.mergeState && opts.initialState) {
            opts.initialState.mergeChildState(currentState);
          }
        } catch (error) {
          // Roll back to last good state and preserve node order
          currentState = lastGoodState.clone();
          
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
          // Create a new state for merging to maintain immutability
          const mergedState = currentState.clone();
          opts.initialState.mergeChildState(mergedState);
          // Get a fresh clone of the parent state after merge to ensure we have all updates
          currentState = opts.initialState.clone();
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: currentState.getCurrentFilePath()
          });
          // Roll back to last good state
          currentState = lastGoodState.clone();
          throw new MeldInterpreterError(
            'Failed to merge child state: ' + getErrorMessage(error),
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
        const isolatedState = this.stateService!.createChildState();
        isolatedState.mergeChildState(currentState);
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

    if (!node.type) {
      throw new MeldInterpreterError(
        'Unknown node type',
        'interpretation',
        convertLocation(node.location)
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

      // Process based on node type
      switch (node.type) {
        case 'Text':
          // Create new state for text node
          const textState = currentState.clone();
          textState.addNode(node);
          currentState = textState;
          break;

        case 'Directive':
          if (!this.directiveService) {
            throw new MeldInterpreterError(
              'Directive service not initialized',
              'directive_service'
            );
          }
          // Process directive with cloned state to maintain immutability
          const directiveState = currentState.clone();
          // Add the node first to maintain order
          directiveState.addNode(node);
          currentState = await this.directiveService.processDirective(node, {
            state: directiveState,
            filePath: state.getCurrentFilePath() ?? undefined
          });
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            'unknown_node',
            convertLocation(node.location)
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