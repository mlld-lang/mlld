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
import { createTextNode, createDirectiveNode, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';
import type { DirectiveProcessingContext, ExecutionContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';

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
    { token: 'ParserServiceClientFactory', name: 'parserClientFactory' },
    { token: 'IPathService', name: 'pathService' }
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
  private pathService!: IPathService;

  /**
   * Creates a new InterpreterService
   * 
   * @param resolutionService - Service for text resolution (Required)
   * @param pathService - Service for path operations (Required)
   * @param directiveServiceClientFactory - Factory for creating directive service clients (Optional)
   * @param stateService - Service for state management (Optional)
   * @param parserClientFactory - Factory for creating parser service clients (Optional)
   */
  constructor(
    // Required parameters first
    @inject('IResolutionService') resolutionService: IResolutionService,
    @inject('IPathService') pathService: IPathService,
    // Optional parameters last
    @inject('DirectiveServiceClientFactory') directiveServiceClientFactory?: DirectiveServiceClientFactory,
    @inject('IStateService') stateService?: IStateService,
    @inject('ParserServiceClientFactory') parserClientFactory?: ParserServiceClientFactory
  ) {
    // Assign properties based on the new order
    this.resolutionService = resolutionService;
    this.pathService = pathService;
    this.directiveClientFactory = directiveServiceClientFactory;
    this.stateService = stateService;
    this.parserClientFactory = parserClientFactory;
    
    logger.debug('InterpreterService constructor', {
      hasResolutionService: !!this.resolutionService,
      hasPathService: !!this.pathService,
      hasDirectiveFactory: !!this.directiveClientFactory,
      hasStateService: !!this.stateService,
      hasParserFactory: !!this.parserClientFactory,
    });
    
    // Updated initialization check
    if (this.directiveClientFactory && this.stateService) { 
      this.initializeDirectiveClient();
      this.initializeParserClient();
      this.initialized = true;
      logger.debug('InterpreterService initialized via DI');
    } else {
      logger.warn('InterpreterService constructed with missing optional dependencies (DirectiveClientFactory, StateService, ParserClientFactory). Manual initialization might be needed (deprecated).');
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
        const result = await this.directiveClient.handleDirective(node, context);
        return result as IStateService | DirectiveResult;
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
    
    const errorFilePath = meldError.sourceLocation?.filePath;

    if (options.strict || !meldError.canBeWarning()) {
      throw meldError;
    }
    
    if (options.errorHandler) {
      options.errorHandler(meldError);
    } else {
      logger.warn(`Warning: ${meldError.message}`, {
        code: meldError.code,
        filePath: errorFilePath,
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
          // Ensure initialState is treated as IStateService
          currentState = (opts.initialState as IStateService).createChildState();
        } else {
          currentState = this.stateService!.createChildState();
        }
      } else {
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
              // Ensure initialState is treated as IStateService
              (opts.initialState as IStateService).mergeChildState(initialSnapshot);
            }
            throw fatalError;
          }
        }
      }

      // Merge state back to parent if requested
      if (opts.initialState && opts.mergeState) {
        // Ensure initialState is treated as IStateService
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
      let textState: IStateService;
      let currentState: IStateService = state;

      switch (node.type) {
        case 'Text':
          if (node.type === 'Text' && typeof node.content === 'string' && node.content !== null && node.content.includes('{{')) {
            this.initializeParserClient();
            if (!this.parserClient) {
              throw new MeldInterpreterError('Parser client not available for text node resolution', 'initialization');
            }
            const parsedNodes = await this.parserClient.parseString(node.content, { filePath: state.getCurrentFilePath() });
            const context = ResolutionContextFactory.create(state, state.getCurrentFilePath());
            const resolvedContent = await this.resolutionService.resolveNodes(parsedNodes, context);
            const resolvedNode: TextNode = { ...node, content: resolvedContent };
            node = resolvedNode;
          }
          textState = currentState.clone();
          if (node.type === 'Text') {
            textState.addNode(node);
          }
          currentState = textState;
          break;

        case 'Directive':
          const directiveNode = node as DirectiveNode;
          if (this.callDirectiveSupportsDirective(directiveNode.directive.kind)) {
            const context = this.createDirectiveProcessingContext(currentState, directiveNode);
            const result: IStateService | DirectiveResult = await this.callDirectiveHandleDirective(directiveNode, context);

            if (result && typeof result === 'object' && 'replacement' in result) {
                const directiveResult = result as DirectiveResult;
                currentState = directiveResult.state;
                if (directiveResult.replacement !== undefined) {
                  if (typeof currentState.clone === 'function' && typeof currentState.transformNode === 'function') {
                      const transformedState = currentState.clone();
                      const originalNodes = currentState.getNodes();
                      const index = originalNodes.findIndex(n => n === directiveNode);
                      if (index !== -1) {
                           transformedState.transformNode(index, directiveResult.replacement);
                      } else {
                           logger.warn('Could not find original directive node index for transformation');
                      }
                      currentState = transformedState;
                  } else {
                     logger.warn('StateService missing clone or transformNode method');
                     currentState = directiveResult.state;
                  }
                } else {
                   currentState = directiveResult.state;
                   currentState = currentState.clone();
                }
            } else {
                currentState = result as IStateService;
            }
          } else {
            logger.warn('Unsupported directive encountered', { kind: directiveNode.directive.kind });
            const unsupportedState = currentState.clone();
            unsupportedState.addNode(directiveNode);
            currentState = unsupportedState;
          }
          break;

        case 'CodeFence':
          const codeFenceState = currentState.clone();
          if (node.type === 'CodeFence') {
            codeFenceState.addNode(node);
          }
          currentState = codeFenceState;
          break;

        default:
          logger.warn('Unhandled node type during interpretation', { type: node.type });
          const unhandledState = currentState.clone();
          unhandledState.addNode(node);
          currentState = unhandledState;
      }

      return currentState;
    } catch (error) {
      const location = convertLocation(node?.location); 
      const meldError = error instanceof MeldError 
        ? error 
        : new MeldInterpreterError(
            `Error interpreting ${node?.type ?? 'unknown'} node: ${getErrorMessage(error)}`,
            node?.type ?? 'interpretation_error', 
            location,
            { cause: error instanceof Error ? error : undefined } 
          );
      if (!meldError.sourceLocation && node?.location) {
         // Don't assign to read-only sourceLocation
      } else if (!meldError.location && location) {
         meldError.location = location; // Assign legacy location if sourceLocation missing
      }
      throw meldError; 
    }
  }

  /**
   * Creates a processing context for a directive.
   */
  private createDirectiveProcessingContext(
    currentState: IStateService, // Use IStateService
    directiveNode: DirectiveNode
  ): DirectiveProcessingContext {
    const filePath = typeof currentState.getCurrentFilePath === 'function' 
                      ? currentState.getCurrentFilePath() 
                      : undefined;
                      
    const resolutionContext = ResolutionContextFactory.create(currentState, filePath);
    
    const formattingContext: FormattingContext = {}; 
    const executionContext: ExecutionContext | undefined = directiveNode.directive.kind === 'run' ? { cwd: process.cwd() } : undefined;

    return {
      state: currentState, 
      resolutionContext,
      formattingContext,
      executionContext,
      directiveNode
    };
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