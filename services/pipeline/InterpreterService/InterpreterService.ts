import type { MeldNode, SourceLocation, DirectiveNode, TextNode, VariableReferenceNode } from '@core/syntax/types/index.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
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
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { DirectiveProcessingContext, ExecutionContext, OutputFormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import * as crypto from 'crypto';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';

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
   * @param resolutionService - Service for text resolution
   * @param pathService - Service for path operations
   * @param directiveServiceClientFactory - Factory for creating directive service clients
   * @param stateService - Service for state management
   * @param parserClientFactory - Factory for creating parser service clients
   */
  constructor(
    @inject('IResolutionService') resolutionService: IResolutionService,
    @inject('IPathService') pathService: IPathService,
    @inject(DirectiveServiceClientFactory) directiveServiceClientFactory?: DirectiveServiceClientFactory,
    @inject('IStateService') stateService?: IStateService,
    @inject(ParserServiceClientFactory) parserClientFactory?: ParserServiceClientFactory
  ) {
    this.resolutionService = resolutionService;
    this.pathService = pathService;
    this.directiveClientFactory = directiveServiceClientFactory;
    this.stateService = stateService;
    this.parserClientFactory = parserClientFactory;
    
    logger.debug('InterpreterService constructor', {
      hasDirectiveFactory: !!this.directiveClientFactory,
      hasStateService: !!this.stateService,
      hasResolutionService: !!this.resolutionService,
      hasParserFactory: !!this.parserClientFactory,
      hasPathService: !!this.pathService
    });
    
    if (this.directiveClientFactory && this.stateService && this.pathService) {
      this.initializeDirectiveClient();
      this.initializeParserClient();
      this.initialized = true;
      logger.debug('InterpreterService initialized via DI');
    } else {
      logger.warn('InterpreterService constructed with missing core dependencies (DirectiveClientFactory, StateService, PathService). Manual initialization might be needed (deprecated).');
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
  private async callDirectiveHandleDirective(node: DirectiveNode, context: DirectiveProcessingContext): Promise<DirectiveResult> {
    if (this.directiveClient && this.directiveClient.handleDirective) {
      try {
        process.stdout.write(`DEBUG: [callDirectiveHandleDirective] BEFORE await client.handleDirective for ${node.directive.kind}\n`);
        const result = await this.directiveClient.handleDirective(node, context);
        process.stdout.write(`DEBUG: [callDirectiveHandleDirective] AFTER await client.handleDirective for ${node.directive.kind}. Result type: ${typeof result}\n`);
        return result as DirectiveResult;
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
    options?: InterpreterOptions,
    initialState?: IStateService
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
    let currentState: IStateService | null = null;
    let initialSnapshot: IStateService | undefined = undefined;
    let lastGoodState: IStateService | undefined = undefined;

    try {
      // Initialize state
      if (initialState) {
        currentState = initialState;
        logger.debug('Using provided initial state for interpretation', { stateId: currentState.getStateId() });
      } else if (opts.initialState) {
        if (opts.mergeState) {
          currentState = opts.initialState.createChildState();
        } else {
          currentState = this.stateService!.createChildState();
        }
        logger.warn('Using initialState from options (deprecated), prefer passing initialState parameter.');
      } else {
        if (!this.stateService) {
           throw new MeldInterpreterError('StateService is not available for creating initial state', 'initialization', undefined, { severity: ErrorSeverity.Fatal });
        }
        currentState = this.stateService.createChildState();
        logger.debug('Created new root state for interpretation', { stateId: currentState.getStateId() });
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
      
      if (!currentState.isTransformationEnabled()) {
        logger.warn(`Transformation was initially disabled for state ${currentState.getStateId()}, explicitly enabling.`);
        currentState.setTransformationEnabled(true);
      } else {
        logger.debug(`Transformation is enabled for initial state ${currentState.getStateId()}.`);
      }

      logger.debug('Starting interpretation', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        mergeState: opts.mergeState
      });

      initialSnapshot = currentState!.clone() as IStateService; 
      lastGoodState = initialSnapshot;

      for (const node of nodes) {
        try {
          const stateBeforeNode: IStateService | null = currentState;

          currentState = await this.interpretNode(node, currentState, opts);
          
          lastGoodState = currentState.clone() as IStateService;
        } catch (error) {
          try {
            this.handleError(error instanceof Error ? error : new Error(String(error)), opts);
            currentState = lastGoodState.clone() as IStateService;
          } catch (fatalError) {
            if (opts.initialState && opts.mergeState) {
              if (typeof opts.initialState.mergeChildState === 'function') {
                 (opts.initialState as IStateService).mergeChildState(initialSnapshot as IStateService);
              } else {
                  logger.warn('Initial state does not support mergeChildState', { initialState: opts.initialState });
              }
            }
            throw fatalError;
          }
        }
      }

      if (opts.initialState && opts.mergeState) {
        if (typeof opts.initialState.mergeChildState === 'function') {
          (opts.initialState as IStateService).mergeChildState(currentState);
        } else {
          logger.warn('Initial state does not support mergeChildState', { initialState: opts.initialState });
        }
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
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

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState = state;
    let replacementNodes: MeldNode[] | undefined = undefined;

    switch (node.type) {
      case 'Text':
        const textNode = node as TextNode;
        let nodeToAdd: TextNode = textNode; // Start with the original node

        // Check if content potentially needs resolution and parser client is available
        if (textNode.content.includes('{{') && this.parserClient && this.resolutionService) {
            logger.debug(`[InterpreterService] TextNode content might need resolution: ${textNode.content.substring(0, 50)}...`);
            try {
                // 1. Parse the string content into an InterpolatableValue array
                // Assuming parseString exists and returns InterpolatableValue or throws
                const parsedNodes: InterpolatableValue = await this.parserClient.parseString(
                    textNode.content, 
                    { 
                        filePath: currentState.getCurrentFilePath() ?? 'unknown',
                        startRule: 'InterpolatableContentOrEmpty' // Assuming this rule exists and is suitable
                    }
                );
                logger.debug(`[InterpreterService] Parsed TextNode content into ${parsedNodes?.length ?? 0} nodes.`);

                // 2. Resolve the parsed nodes
                const context = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath());
                const resolvedContent = await this.resolutionService.resolveNodes(parsedNodes, context);
                logger.debug(`[InterpreterService] Resolved TextNode content to: ${resolvedContent.substring(0, 50)}...`);

                // 3. Create a new node with resolved content
                nodeToAdd = {
                    ...textNode, // Copy original properties (location, nodeId, etc.)
                    content: resolvedContent, // Use the resolved content
                };

            } catch (resolutionError) {
                logger.warn('[InterpreterService] Failed to parse/resolve TextNode content, adding original node instead.', {
                    error: resolutionError instanceof Error ? resolutionError.message : String(resolutionError),
                    originalContent: textNode.content.substring(0, 100),
                    filePath: currentState.getCurrentFilePath()
                });
                // Fallback to adding the original node if resolution fails
                nodeToAdd = textNode;
            }
        }
        // Add either the original node or the newly resolved node
        currentState.addNode(nodeToAdd);
        break;

      case 'CodeFence':
        currentState.addNode(node);
        break;

      case 'VariableReference':
         const varNode = node as VariableReferenceNode;
         try {
             const varRefContext = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath() ?? undefined);
             const resolvedStringValue = await this.resolutionService.resolveNodes([varNode], varRefContext);
             const resolvedTextNode: TextNode = {
                 type: 'Text',
                 content: resolvedStringValue,
                 location: varNode.location,
                 nodeId: crypto.randomUUID()
             };
             currentState.addNode(resolvedTextNode);
         } catch (error) {
              logger.error('Failed to resolve VariableReferenceNode during interpretation', {
                 error: error instanceof Error ? error.message : String(error),
                 identifier: varNode.identifier
              });
              const errorState = currentState.clone();
              errorState.addNode(varNode);
              currentState = errorState;
         }
         break;

      case 'Comment':
        break;

      case 'Directive':
        currentState.addNode(node);

        if (node.type !== 'Directive' || !('directive' in node) || !node.directive) {
          throw new MeldInterpreterError(
            'Invalid directive node',
            'invalid_directive',
            convertLocation(node.location)
          );
        }
        const directiveNode = node as DirectiveNode;
        const isImportDirective = directiveNode.directive.kind === 'import';
        
        const baseResolutionContext = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath() ?? undefined);
        const formattingContext: OutputFormattingContext = {
          isOutputLiteral: currentState.isTransformationEnabled?.() || false,
          contextType: 'block',
          nodeType: directiveNode.type,
          atLineStart: true,
          atLineEnd: false
        };
        let executionContext: ExecutionContext | undefined = undefined;
        if (directiveNode.directive.kind === 'run') {
          executionContext = {
             cwd: currentState.getCurrentFilePath() ? this.pathService.dirname(currentState.getCurrentFilePath()!) : process.cwd(),
          };
        }
        const handlerContext: DirectiveProcessingContext = {
          state: currentState,
          resolutionContext: baseResolutionContext, 
          formattingContext: formattingContext,
          executionContext: executionContext, 
          directiveNode: directiveNode, 
        };

        // Call the directive handler (now returns new DirectiveResult)
        const directiveResult: DirectiveResult = await this.callDirectiveHandleDirective(directiveNode, handlerContext);
        
        // Extract replacement nodes directly from the result
        replacementNodes = directiveResult.replacement;

        // Apply replacement nodes if transformation is enabled
        if (replacementNodes !== undefined) {
          if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) { 
            const nodesBefore = currentState.getTransformedNodes(); 
            const index = nodesBefore.findIndex(n => n.nodeId === node.nodeId);

            if (index !== -1) {
              // Use replacementNodes directly (already Array<MeldNode> | undefined)
              currentState.transformNode(index, replacementNodes.length > 0 ? replacementNodes : undefined);
            } else {
               process.stderr.write(`WARN: [InterpreterService Directive Case] Original node (ID: ${node.nodeId}) not found for replacement.\n`);
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