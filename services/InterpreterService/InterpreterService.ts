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

    if (opts.filePath) {
      currentState.setCurrentFilePath(opts.filePath);
    }

    logger.debug('Starting interpretation', {
      nodeCount: nodes.length,
      filePath: opts.filePath
    });

    try {
      for (const node of nodes) {
        currentState = await this.interpretNode(node, currentState);
      }

      // If mergeState is true and we have a parent state, merge back
      if (opts.mergeState && opts.initialState) {
        await opts.initialState.mergeChildState(currentState);
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
        case 'text':
          // Add text node to state
          state.addNode(node);
          break;

        case 'directive':
          // Process directive using DirectiveService
          await this.directiveService!.processDirective(node);
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            node.type,
            node.location?.start
          );
      }

      return state;
    } catch (error) {
      // Wrap non-MeldInterpreterErrors
      if (!(error instanceof MeldInterpreterError)) {
        throw new MeldInterpreterError(
          error.message,
          node.type,
          node.location?.start
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