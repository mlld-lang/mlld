import type { MeldNode, SourceLocation, DirectiveNode } from 'meld-spec';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import { IInterpreterService, type InterpreterOptions } from './IInterpreterService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { Service } from '@core/ServiceProvider.js';
import { inject, delay } from 'tsyringe';

const DEFAULT_OPTIONS: Required<Omit<InterpreterOptions, 'initialState' | 'errorHandler'>> = {
  filePath: '',
  mergeState: true,
  importFilter: [],
  strict: true
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

/**
 * Service for interpreting Meld AST and executing directives
 */
@Service({
  description: 'Service for interpreting Meld AST nodes and executing directives',
  dependencies: [
    { token: 'IDirectiveService', name: 'directiveService' },
    { token: 'IStateService', name: 'stateService' }
  ]
})
export class InterpreterService implements IInterpreterService {
  private directiveService?: IDirectiveService;
  private stateService?: IStateService;
  private initialized = false;
  private stateVariableCopier = new StateVariableCopier();

  constructor(
    @inject(delay(() => 'IDirectiveService')) directiveService?: IDirectiveService,
    @inject('IStateService') stateService?: IStateService
  ) {
    // Handle DI constructor injection
    if (directiveService && stateService) {
      // Use setTimeout to handle circular dependency with DirectiveService
      setTimeout(() => {
        this.directiveService = directiveService;
        this.stateService = stateService;
        this.initialized = true;
        logger.debug('InterpreterService initialized via DI');
      }, 0);
    }
  }

  public canHandleTransformations(): boolean {
    return true;
  }

  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void {
    this.directiveService = directiveService;
    this.stateService = stateService;
    this.initialized = true;

    logger.debug('InterpreterService initialized manually');
  }

  /**
   * Handle errors based on severity and options
   * In strict mode, all errors throw
   * In permissive mode, recoverable errors become warnings
   */
  private handleError(error: Error, options: Required<Omit<InterpreterOptions, 'initialState' | 'errorHandler'>> & Pick<InterpreterOptions, 'errorHandler'>): void {
    // If it's not a MeldError, wrap it
    const meldError = error instanceof MeldError 
      ? error 
      : MeldError.wrap(error);
    
    // In strict mode, or if it's a fatal error, throw it
    if (options.strict || !meldError.canBeWarning()) {
      throw meldError;
    }
    
    // In permissive mode with recoverable errors, use the error handler or log a warning
    if (options.errorHandler) {
      options.errorHandler(meldError);
    } else {
      logger.warn(`Warning: ${meldError.message}`, {
        code: meldError.code,
        filePath: meldError.filePath,
        severity: meldError.severity
      });
    }
  }

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

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
          'initialization',
          undefined,
          { severity: ErrorSeverity.Fatal }
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
          currentState = await this.interpretNode(node, currentState, opts);
          // Update last good state after successful interpretation
          lastGoodState = currentState.clone();
        } catch (error) {
          // Handle errors based on severity and options
          try {
            this.handleError(error instanceof Error ? error : new Error(String(error)), opts);
            // If we get here, the error was handled as a warning
            // Continue with the last good state
            currentState = lastGoodState.clone();
          } catch (fatalError) {
            // If we get here, the error was fatal and should be propagated
            // Restore to initial state before rethrowing
            if (opts.initialState && opts.mergeState) {
              // Only attempt to merge back if we have a parent and mergeState is true
              opts.initialState.mergeChildState(initialSnapshot);
            }
            throw fatalError;
          }
        }
      }

      // Merge state back to parent if requested
      if (opts.initialState && opts.mergeState) {
        opts.initialState.mergeChildState(currentState);
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
      // Wrap any unexpected errors
      const wrappedError = error instanceof Error
        ? error
        : new MeldInterpreterError(
            `Unexpected error during interpretation: ${String(error)}`,
            'interpretation',
            undefined,
            { severity: ErrorSeverity.Fatal, cause: error instanceof Error ? error : undefined }
          );
      
      throw wrappedError;
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService,
    options?: InterpreterOptions
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

    const opts = { ...DEFAULT_OPTIONS, ...options };

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

        case 'CodeFence':
          // Handle CodeFence nodes similar to Text nodes - preserve them exactly
          const codeFenceState = currentState.clone();
          codeFenceState.addNode(node);
          currentState = codeFenceState;
          break;

        case 'TextVar':
          // Handle TextVar nodes similar to Text nodes
          const textVarState = currentState.clone();
          textVarState.addNode(node);
          currentState = textVarState;
          break;

        case 'DataVar':
          // Handle DataVar nodes similar to Text/TextVar nodes
          const dataVarState = currentState.clone();
          dataVarState.addNode(node);
          currentState = dataVarState;
          break;

        case 'Comment':
          // Comments are ignored during interpretation
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
          if (node.type !== 'Directive' || !('directive' in node) || !node.directive) {
            throw new MeldInterpreterError(
              'Invalid directive node',
              'invalid_directive',
              convertLocation(node.location)
            );
          }
          const directiveNode = node as DirectiveNode;
          
          // Capture the original state for importing directives in transformation mode
          const originalState = state;
          const isImportDirective = directiveNode.directive.kind === 'import';
          
          // Store the directive result to check for replacement nodes
          const directiveResult = await this.directiveService.processDirective(directiveNode, {
            state: directiveState,
            parentState: currentState,
            currentFilePath: state.getCurrentFilePath() ?? undefined
          });
          
          // Update current state with the result
          currentState = directiveResult;
          
          // Check if the directive handler returned a replacement node
          // This happens when the handler implements the DirectiveResult interface
          // with a replacement property
          if (directiveResult && 'replacement' in directiveResult && 'state' in directiveResult) {
            // We need to extract the replacement node and state from the result
            const result = directiveResult as unknown as { 
              replacement: MeldNode;
              state: IStateService;
            };

            const replacement = result.replacement;
            const resultState = result.state;
            
            // Update current state with the result state
            currentState = resultState;
            
            // Special handling for imports in transformation mode:
            // Copy all variables from the imported file to the original state
            if (isImportDirective && 
                currentState.isTransformationEnabled && 
                currentState.isTransformationEnabled()) {
              try {
                logger.debug('Import directive in transformation mode, copying variables to original state');
                
                // Use the state variable copier utility to copy all variables
                this.stateVariableCopier.copyAllVariables(currentState, originalState, {
                  skipExisting: false,
                  trackContextBoundary: false, // No tracking service in the interpreter
                  trackVariableCrossing: false
                });
              } catch (e) {
                logger.debug('Error copying variables from import to original state', { error: e });
              }
            }
            
            // If transformation is enabled and we have a replacement node,
            // we need to apply it to the transformed nodes
            if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
              logger.debug('Applying replacement node from directive handler', {
                originalType: node.type,
                replacementType: replacement.type,
                directiveKind: directiveNode.directive.kind
              });
              
              // Apply the transformation by replacing the directive node with the replacement
              try {
                // Ensure we have the transformed nodes array initialized
                if (!currentState.getTransformedNodes || !currentState.getTransformedNodes()) {
                  // Initialize transformed nodes if needed
                  const originalNodes = currentState.getNodes();
                  if (originalNodes && currentState.setTransformedNodes) {
                    currentState.setTransformedNodes([...originalNodes]);
                    logger.debug('Initialized transformed nodes array', {
                      nodesCount: originalNodes.length
                    });
                  }
                }
                
                // Apply the transformation
                currentState.transformNode(node, replacement as MeldNode);
                
              } catch (transformError) {
                logger.error('Error applying transformation', {
                  error: transformError,
                  directiveKind: directiveNode.directive.kind
                });
                // Continue execution despite transformation error
              }
            }
          }
          
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
              filePath: state.getCurrentFilePath() ?? undefined
            }
          }
        }
      );
    }
  }

  async createChildContext(
    parentState: IStateService,
    filePath?: string,
    options?: InterpreterOptions
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
              parentFilePath: parentState.getCurrentFilePath() ?? undefined
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
            parentFilePath: parentState.getCurrentFilePath() ?? undefined,
            childFilePath: filePath,
            state: {
              filePath: parentState.getCurrentFilePath() ?? undefined
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