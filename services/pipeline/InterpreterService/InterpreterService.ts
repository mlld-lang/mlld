import type { MeldNode, SourceLocation, DirectiveNode } from '@core/syntax/types/index.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { Service } from '@core/ServiceProvider.js';
import { inject, injectable, delay, container } from 'tsyringe';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTextNode, createDirectiveNode, createLocation, createCommandVariable } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';
import type { DirectiveProcessingContext, ExecutionContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';

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
@injectable()
@Service({
  description: 'Service for interpreting Meld AST nodes and executing directives',
  dependencies: [
    { token: 'DirectiveServiceClientFactory', name: 'directiveServiceClientFactory' },
    { token: 'IStateService', name: 'stateService' },
    { token: 'IResolutionService', name: 'resolutionService' },
    { token: 'ParserServiceClientFactory', name: 'parserClientFactory' }
  ]
})
export class InterpreterService implements IInterpreterService {
  private directiveClient?: IDirectiveServiceClient;
  private directiveClientFactory?: DirectiveServiceClientFactory;
  private stateService?: IStateService;
  private initialized = false;
  private stateVariableCopier = new StateVariableCopier();
  private resolutionService!: IResolutionService;
  private parserClientFactory?: ParserServiceClientFactory;
  private parserClient?: IParserServiceClient;

  /**
   * Creates a new InterpreterService
   * 
   * @param directiveServiceClientFactory - Factory for creating directive service clients
   * @param stateService - Service for state management
   * @param resolutionService - Service for text resolution
   * @param parserClientFactory - Factory for creating parser service clients
   */
  constructor(
    @inject('DirectiveServiceClientFactory') directiveServiceClientFactory?: DirectiveServiceClientFactory,
    @inject('IStateService') stateService?: IStateService,
    @inject('IResolutionService') resolutionService: IResolutionService,
    @inject('ParserServiceClientFactory') parserClientFactory?: ParserServiceClientFactory
  ) {
    this.directiveClientFactory = directiveServiceClientFactory;
    this.stateService = stateService;
    this.resolutionService = resolutionService;
    this.parserClientFactory = parserClientFactory;
    
    logger.debug('InterpreterService constructor', {
      hasDirectiveFactory: !!this.directiveClientFactory,
      hasStateService: !!this.stateService,
      hasResolutionService: !!this.resolutionService,
      hasParserFactory: !!this.parserClientFactory
    });
    
    if (this.directiveClientFactory && this.stateService) {
      this.initializeDirectiveClient();
      this.initializeParserClient();
      this.initialized = true;
      logger.debug('InterpreterService initialized via DI');
    } else {
      logger.warn('InterpreterService constructed with missing core dependencies. Manual initialization might be needed (deprecated).');
    }
  }

  /**
   * Initialize the directiveClient using the factory
   */
  private initializeDirectiveClient(): void {
    if (!this.directiveClientFactory) {
      logger.debug('Cannot initialize directive client: factory is missing.');
      return;
    }
    
    try {
      this.directiveClient = this.directiveClientFactory.createClient();
      logger.debug('Successfully created DirectiveServiceClient using factory', { hasClient: !!this.directiveClient });
    } catch (error) {
      logger.warn('Failed to create DirectiveServiceClient', { error });
      this.directiveClient = undefined;
    }
  }

  /**
   * Initialize the parserClient using the factory
   */
  private initializeParserClient(): void {
    if (!this.parserClientFactory) {
      logger.debug('Cannot initialize parser client: factory is missing.');
      return;
    }
    try {
      this.parserClient = this.parserClientFactory.createClient();
      logger.debug('Successfully created ParserServiceClient using factory', { hasClient: !!this.parserClient });
    } catch (error) {
      logger.warn('Failed to create ParserServiceClient', { error });
      this.parserClient = undefined;
    }
  }

  /**
   * Ensure the service is initialized before use
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MeldInterpreterError(
        'InterpreterService not initialized. Check for missing dependencies (DirectiveServiceClientFactory, IStateService).',
        'initialization',
        undefined,
        { severity: ErrorSeverity.Fatal }
      );
    }
  }

  /**
   * Calls the directive service to handle a directive node
   * Uses the client if available, falls back to direct service reference
   * Updated to accept DirectiveProcessingContext
   */
  private async callDirectiveHandleDirective(node: DirectiveNode, context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    if (this.directiveClient && this.directiveClient.handleDirective) {
      try {
        return await this.directiveClient.handleDirective(node, context);
      } catch (error) {
        throw new MeldInterpreterError(
          `Failed to handle directive '${node.directive.kind}' via client: ${getErrorMessage(error)}`,
          'directive_client_error',
          convertLocation(node.location),
          { cause: error instanceof Error ? error : undefined, severity: ErrorSeverity.Fatal }
        );
      }
    }
    
    throw new MeldInterpreterError(
      'No directive service client available to handle directive. Initialization likely failed.',
      'directive_handling',
      convertLocation(node.location),
      { severity: ErrorSeverity.Fatal }
    );
  }

  /**
   * Calls the directive service to check if it supports a directive kind
   * Uses the client if available, falls back to direct service reference
   */
  private callDirectiveSupportsDirective(kind: string): boolean {
    if (this.directiveClient) {
      try {
        return this.directiveClient.supportsDirective(kind);
      } catch (error) {
        logger.warn('Error calling directiveClient.supportsDirective', { error });
      }
    }
    
    return false;
  }

  /**
   * Returns whether this service can handle transformations
   * Required by the pipeline validation system
   */
  public canHandleTransformations(): boolean {
    return this.stateService?.hasTransformationSupport?.() ?? true;
  }

  /**
   * Explicitly initialize the service with all required dependencies.
   * @deprecated This method is maintained for backward compatibility. 
   * The service is automatically initialized via dependency injection.
   */
  initialize(
    directiveService: any, // Keep type loose for deprecation
    stateService: IStateService // Use strict type here
  ): void {
    this.stateService = stateService;
    this.initialized = true;
    logger.warn('InterpreterService initialized manually (deprecated method)');
  }

  /**
   * Handle errors based on severity and options
   * In strict mode, all errors throw
   * In permissive mode, recoverable errors become warnings
   */
  private handleError(error: Error, options: Required<Omit<InterpreterOptions, 'initialState' | 'errorHandler'>> & Pick<InterpreterOptions, 'errorHandler'>): void {
    const meldError = error instanceof MeldError 
      ? error 
      : new MeldInterpreterError(
          `Interpretation failed: ${error.message}`,
          'interpretation',
          undefined,
          { severity: ErrorSeverity.Recoverable, cause: error }
        );
    
    logger.error('Error in InterpreterService', { error: meldError });
    
    if (options.strict || !meldError.canBeWarning()) {
      throw meldError;
    }
    
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
              (opts.initialState as IStateService).mergeChildState(initialSnapshot);
            }
            throw fatalError;
          }
        }
      }

      // Merge state back to parent if requested
      if (opts.initialState && opts.mergeState) {
        (opts.initialState as IStateService).mergeChildState(currentState);
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
      // Reverted outer catch block: Just re-throw any error caught here.
      // Wrapping and location addition should happen in interpretNode.
      // console.log("[TEST DEBUG] Outer catch block caught:", error);
      throw error; 
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService,
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

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
      let currentState = state; // Use incoming state directly

      // Process based on node type
      switch (node.type) {
        case 'Text':
          process.stdout.write(`[InterpreterService LOG] Processing TextNode. Content includes '{{': ${node.content.includes('{{')}\n`);
          process.stdout.write(`[InterpreterService LOG] Checking services: parserClient=${!!this.parserClient}, resolutionService=${!!this.resolutionService}\n`);
          
          let processedNode = node;
          if (node.content.includes('{{')) {
            logger.debug('TextNode content requires resolution', { content: node.content.substring(0, 50) });
            this.ensureInitialized(); // Ensure parser client is ready
            if (this.parserClient && this.resolutionService) {
              process.stdout.write(`[InterpreterService LOG] Parser and Resolution services OK. Attempting parse/resolve.\n`);
              try {
                const parsedNodes = await this.parserClient.parseString(node.content, { filePath: state.getCurrentFilePath() });
                const context = ResolutionContextFactory.create(state, state.getCurrentFilePath());
                const textResolutionContext = context.withFlags({ preserveUnresolved: false }); 
                process.stdout.write(`[InterpreterService LOG] Context for resolveNodes: strict=${textResolutionContext.strict}, depth=${textResolutionContext.depth}, preserveUnresolved=${textResolutionContext.flags.preserveUnresolved}\n`);
                const resolvedContent = await this.resolutionService.resolveNodes(parsedNodes, textResolutionContext);
                // Create a new node with resolved content
                processedNode = { ...node, content: resolvedContent };
                process.stdout.write(`[InterpreterService LOG] Resolved content: '${resolvedContent}'\n`);
                process.stdout.write(`[InterpreterService LOG] Processed node content: '${processedNode.content}'\n`);
                logger.debug('Successfully resolved TextNode content', { 
                  originalLength: node.content.length, 
                  resolvedLength: resolvedContent.length 
                });
              } catch (error) {
                logger.error('Failed to resolve TextNode content during interpretation', {
                   error: error instanceof Error ? error.message : String(error),
                   content: node.content.substring(0, 100)
                });
                // If resolution fails, use the original node (processedNode remains node)
              }
            } else {
              logger.warn('ParserClient or ResolutionService not available for TextNode resolution.');
              // Use original node if services aren't available
            }
          }
          // Create new state for the potentially resolved text node
          const textState = currentState.clone();
          textState.addNode(processedNode);
          currentState = textState;
          break;

        case 'CodeFence':
          // Handle CodeFence nodes similar to Text nodes - preserve them exactly
          const codeFenceState = currentState.clone();
          codeFenceState.addNode(node);
          currentState = codeFenceState;
          break;

        case 'VariableReference':
          // Handle variable reference nodes
          if ((node as any).valueType === 'text') {
            // Handle TextVar nodes similar to Text nodes
            const textVarState = currentState.clone();
            textVarState.addNode(node);
            currentState = textVarState;
          } else if ((node as any).valueType === 'data') {
            // Handle DataVar nodes similar to Text/TextVar nodes
            const dataVarState = currentState.clone();
            dataVarState.addNode(node);
            currentState = dataVarState;
          }
          break;
          
        // Note: Legacy TextVar and DataVar cases are kept for backward compatibility
        case 'TextVar' as any:
          // Handle TextVar nodes similar to Text nodes
          const textVarState = currentState.clone();
          textVarState.addNode(node);
          currentState = textVarState;
          break;

        case 'DataVar' as any:
          // Handle DataVar nodes similar to Text/TextVar nodes
          const dataVarState = currentState.clone();
          dataVarState.addNode(node);
          currentState = dataVarState;
          break;

        case 'Comment':
          // Comments are ignored during interpretation
          break;

        case 'Directive':
          const directiveState = currentState.clone(); // Clone the loop's current state ONCE
          directiveState.addNode(node); // Add the node first to maintain order
          if (node.type !== 'Directive' || !('directive' in node) || !node.directive) {
            throw new MeldInterpreterError(
              'Invalid directive node',
              'invalid_directive',
              convertLocation(node.location)
            );
          }
          const directiveNode = node as DirectiveNode;
          const isImportDirective = directiveNode.directive.kind === 'import';
          
          // --- Create Context Objects --- 
          const baseResolutionContext = ResolutionContextFactory.create(directiveState, directiveState.getCurrentFilePath() ?? undefined);
          // Create Formatting Context (example initialization)
          const formattingContext: FormattingContext = {
            isOutputLiteral: directiveState.isTransformationEnabled?.() || false,
            contextType: 'block', // Default to block context
            nodeType: directiveNode.type,
            atLineStart: true, // Default assumption
            atLineEnd: false // Default assumption
          };
          
          // Create Execution Context (only for @run - example)
          let executionContext: ExecutionContext | undefined = undefined;
          if (directiveNode.directive.kind === 'run') {
            // Populate based on directiveNode properties or defaults
            executionContext = {
              cwd: directiveState.getCurrentFilePath() ? this.resolutionService.dirname(directiveState.getCurrentFilePath()!) : process.cwd(),
              // ... other ExecutionContext fields based on directive options or defaults
            };
          }
          
          // Assemble the main processing context
          const handlerContext: DirectiveProcessingContext = {
            state: directiveState,
            resolutionContext: baseResolutionContext, // Use the created resolution context
            formattingContext: formattingContext,
            executionContext: executionContext, // Include if it was created
            directiveNode: directiveNode, // Pass the directive node itself
          };
          // --- End Context Creation ---

          const directiveResult = await this.callDirectiveHandleDirective(directiveNode, handlerContext);

          let resultState: IStateService;
          let replacementNode: MeldNode | undefined = undefined;

          if (
            directiveResult &&
            typeof directiveResult === 'object' &&
            'state' in directiveResult &&
            directiveResult.state
          ) {
            resultState = directiveResult.state;
            replacementNode = directiveResult.replacement;
          } else if (directiveResult && typeof directiveResult === 'object' && 'getNodes' in directiveResult) {
            resultState = directiveResult as IStateService;
          } else {
             throw new MeldInterpreterError(
               `Directive handler for '${directiveNode.directive.kind}' returned an unexpected type.`,
               'directive_result_error',
               convertLocation(directiveNode.location)
             );
          }

          if (!resultState) {
             throw new MeldInterpreterError(
               `Directive handler for '${directiveNode.directive.kind}' did not return a valid state object.`,
               'directive_result_error',
               convertLocation(directiveNode.location)
             );
          }

          currentState = resultState;

          if ('getFormattingContext' in resultState && typeof resultState.getFormattingContext === 'function') {
            const updatedContext = resultState.getFormattingContext();
            if (updatedContext) {
              logger.debug('Formatting context updated by directive', {
                directiveKind: directiveNode.directive.kind,
                contextType: updatedContext.contextType,
                isOutputLiteral: updatedContext.isOutputLiteral
              });
            }
          }
          
          if (replacementNode) {
            if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
              logger.debug('Applying replacement node from directive handler', {
                originalType: node.type,
                replacementType: replacementNode.type,
                directiveKind: directiveNode.directive.kind,
                isVarReference: directiveNode.directive.kind === 'embed' && 
                               typeof directiveNode.directive.path === 'object' &&
                               directiveNode.directive.path !== null &&
                               'isVariableReference' in directiveNode.directive.path
              });
              
              currentState.transformNode(node, replacementNode as MeldNode);
            }
          }
          
          if (isImportDirective && 
              currentState.isTransformationEnabled && 
              currentState.isTransformationEnabled()) {
            try {
              logger.debug('Import directive in transformation mode, copying variables to original state');
              
              this.stateVariableCopier.copyAllVariables(
                currentState,
                state,
                {
                  skipExisting: false,
                  trackContextBoundary: false,
                  trackVariableCrossing: false
                }
              );
            } catch (e) {
              logger.debug('Error copying variables from import to original state', { error: e });
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
        console.log("[TEST DEBUG] Re-throwing existing MeldInterpreterError:", JSON.stringify(error));
        throw error;
      }
      // Wrap other errors, ensuring location is included
      const errorLocation: InterpreterLocation | undefined = node.location ? {
          line: node.location.start?.line,
          column: node.location.start?.column,
          filePath: state?.getCurrentFilePath() ?? undefined
      } : undefined;
      
      console.log("[TEST DEBUG] interpretNode catch creating error with location:", JSON.stringify(errorLocation));

      throw new MeldInterpreterError(
        getErrorMessage(error),
        node.type, // Use node type as code for context
        errorLocation, // Pass constructed ErrorSourceLocation
        {
          cause: error instanceof Error ? error : undefined,
          severity: ErrorSeverity.Recoverable, 
          context: {
            nodeType: node.type,
            state: {
              filePath: state?.getCurrentFilePath() ?? undefined
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
} 