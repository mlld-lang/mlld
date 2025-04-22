import type { MeldNode, SourceLocation, DirectiveNode, TextNode, VariableReferenceNode } from '@core/syntax/types/index.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { Service } from '@core/ServiceProvider.js';
import { inject, injectable, delay, container as globalContainer, DependencyContainer } from 'tsyringe';
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
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';

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
    @inject(delay(() => DirectiveServiceClientFactory)) directiveServiceClientFactory?: DirectiveServiceClientFactory,
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
    
    // << REMOVED eager client initialization >>
    // if (this.directiveClientFactory && this.stateService && this.pathService) {
    //   this.initializeDirectiveClient();
    //   if (this.parserClientFactory) { 
    //     this.initializeParserClient();
    //   } else {
    //     logger.warn('ParserClientFactory not available during InterpreterService construction');
    //   }
    //   this.initialized = true;
    //   logger.debug('InterpreterService initialized via DI');
    // } else {
    //   logger.warn('InterpreterService constructed with missing core dependencies (DirectiveClientFactory, StateService, PathService). Manual initialization might be needed (deprecated).');
    // }
    
    // << ADDED simple initialization check based on core dependencies >>
    this.initialized = !!(this.resolutionService && this.pathService && this.directiveClientFactory && this.stateService && this.parserClientFactory);
    if (this.initialized) {
        logger.debug('InterpreterService core dependencies resolved.');
    } else {
        logger.warn('InterpreterService constructed with missing core dependencies. Check DI configuration.');
    }
  }

  /**
   * Ensure clients are initialized before use.
   */
  private ensureClientsInitialized(): void {
    if (!this.directiveClient) {
        this.initializeDirectiveClient();
    }
    if (!this.parserClient) {
        this.initializeParserClient();
    }
    // Ensure clients were successfully created after attempting initialization
    if (!this.directiveClient || !this.parserClient) {
        throw new MeldInterpreterError(
            'Failed to initialize necessary clients (Directive/Parser). Check factory dependencies.',
            'initialization',
            undefined,
            { severity: ErrorSeverity.Fatal }
        );
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
    // << ADDED lazy initialization >>
    this.ensureClientsInitialized(); 
    
    if (this.directiveClient && this.directiveClient.handleDirective) {
      try {
        process.stdout.write(`DEBUG: [callDirectiveHandleDirective] BEFORE await client.handleDirective for ${node.directive.kind}\n`);
        const result = await this.directiveClient.handleDirective(node, context);
        process.stdout.write(`DEBUG: [callDirectiveHandleDirective] AFTER await client.handleDirective for ${node.directive.kind}. Result type: ${typeof result}\n`);
        return result as DirectiveResult;
      } catch (error) {
        // Re-throw the original error to preserve its type and details
        throw error;
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
  private handleError(error: Error, options: Required<Omit<InterpreterOptions, 'initialState' | 'errorHandler'>> & Pick<InterpreterOptions, 'errorHandler'>, node?: MeldNode): void {
    const errorLocation = node ? convertLocation(node.location) : undefined;
    const meldError = error instanceof MeldError 
      ? error 
      : new MeldInterpreterError(
          `Interpretation failed: ${error.message}`,
          'interpretation',
          errorLocation,
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
    initialState?: IStateService,
    circularityService?: ICircularityService
  ): Promise<IStateService> {
    // Log entry 
    process.stdout.write(`DEBUG [InterpreterService.interpret ENTRY] Has circularityService param? ${!!circularityService}\n`);
    
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
      let baseState: IStateService;
      let isBasedOnInitialState = false; // Flag to track origin
      // Determine the base state to create the working state from
      try {
        if (initialState) { // Check parameter first
          baseState = initialState;
          isBasedOnInitialState = true;
          logger.debug('Using provided initialState parameter as base for interpretation', { stateId: baseState.getStateId() });
        } else if (opts.initialState) { // Check deprecated option second
          baseState = opts.initialState;
          isBasedOnInitialState = true;
          logger.warn('Using initialState from options (deprecated), prefer passing initialState parameter.');
        } else { // Fallback to internal state service
          if (!this.stateService) {
             throw new MeldInterpreterError('StateService is not available for creating initial state', 'initialization', undefined, { severity: ErrorSeverity.Fatal });
          }
          baseState = this.stateService; // Use the injected service as base
          isBasedOnInitialState = false;
          logger.debug('Using injected StateService as base for interpretation');
        }

        // <<< FIX: Clone if based on initial state, otherwise create child >>>
        if (isBasedOnInitialState) {
           if (typeof baseState.clone !== 'function') {
             throw new MeldInterpreterError('Provided initial state does not support clone()', 'initialization', undefined, { severity: ErrorSeverity.Fatal });
           }
           currentState = baseState.clone(); // CLONE the provided initial state
           logger.debug('Cloned initial state for interpretation', { stateId: currentState?.getStateId() });
        } else {
           if (typeof baseState.createChildState !== 'function') {
             throw new MeldInterpreterError('Internal StateService does not support createChildState()', 'initialization', undefined, { severity: ErrorSeverity.Fatal });
           }
           currentState = await baseState.createChildState(); // CREATE CHILD from internal service
           logger.debug('Created working child state from internal service for interpretation', { stateId: currentState?.getStateId() });
        }

        if (!currentState) {
          throw new MeldInterpreterError(
            'Failed to create working state (clone or child) for interpretation',
            'initialization',
            undefined,
            { severity: ErrorSeverity.Fatal }
          );
        }
        
      } catch (initializationError) {
        // Catch errors during base state determination or child state creation
        logger.error('Fatal error during interpreter state initialization', { error: initializationError });
        throw initializationError; // Re-throw original error
      }

      // --- Proceed only if state initialization was successful ---
      // <<< ADD CHECK FOR VALID currentState >>>
      if (!currentState || typeof currentState.isTransformationEnabled !== 'function') {
        // If state initialization failed but didn't throw in a way caught above,
        // or if initialState was invalid, throw a specific error here.
        logger.error('InterpreterService: currentState is invalid after initialization attempt.', { state: currentState });
        throw new MeldInterpreterError(
          'Invalid state after initialization attempt. Cannot proceed.',
          'initialization',
          undefined,
          { severity: ErrorSeverity.Fatal }
        );
      }
      
      // Fix 6 & 7: Move these checks after successful initialization AND validation
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

      initialSnapshot = currentState!.clone() as IStateService; // Keep initial snapshot for potential error rollback
      lastGoodState = currentState; // Initialize lastGoodState *before* the loop without cloning

      for (const node of nodes) {
        // If we enter the loop, *now* clone the lastGoodState for the first time if it hasn't been cloned yet
        // This ensures clone isn't called for empty node arrays.
        if (lastGoodState === currentState && nodes.length > 0) { 
             lastGoodState = currentState.clone() as IStateService; 
        }
        
        let nodeResult: DirectiveResult | undefined;
        try {
          const stateBeforeNode: IStateService | null = currentState;

          // Step 1: Modify interpretNode call to receive tuple
          const [intermediateState, nodeResult] = await this.interpretNode(node, currentState, opts);
          currentState = intermediateState;
          
          // <<< ADDED: Validate DirectiveResult structure >>>
          if (node.type === 'Directive' && nodeResult && (typeof nodeResult !== 'object' || (nodeResult.stateChanges === undefined && nodeResult.replacement === undefined))) {
            logger.error('Invalid result type returned from directive handler client after interpretNode', { nodeResult, nodeId: node.nodeId, kind: (node as DirectiveNode).directive.kind });
            throw new MeldInterpreterError(
              `Invalid result type returned from directive handler client for directive '${(node as DirectiveNode).directive.kind}'`, 
              'directive_client_error', 
              convertLocation(node.location),
              { severity: ErrorSeverity.Fatal }
            );
          }

          // Apply state changes if present and supported
          if (nodeResult?.stateChanges && currentState && typeof currentState.applyStateChanges === 'function') {
            logger.debug(`Applying state changes from directive result for node ${node.nodeId}`);
            currentState = await currentState.applyStateChanges(nodeResult.stateChanges);
            // Add null check after potential reassignment
            if (!currentState) {
              throw new MeldInterpreterError('State became null after applying changes.', 'internal_error', convertLocation(node.location), { severity: ErrorSeverity.Fatal });
            }
          } else if (nodeResult?.stateChanges) {
            logger.warn(`State object doesn't support applyStateChanges or currentState is null, skipping changes for node ${node.nodeId}`);
          }
          
          // Handle replacements
          if (nodeResult?.replacement !== undefined && currentState) { // Add null check for currentState
            if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) { 
              const nodesBefore = currentState.getTransformedNodes(); 
              const index = nodesBefore.findIndex(n => n.nodeId === node.nodeId);
  
              // <<< ADD LOGGING HERE >>>
              logger.debug(`[Interpreter Loop] Processing node ${node.nodeId} (Type: ${node.type}, Kind: ${(node as DirectiveNode).directive?.kind}). Replacement found? ${!!nodeResult.replacement}. Index in transformed list: ${index}`);
              if (nodeResult.replacement) {
                logger.debug(`[Interpreter Loop] Replacement content: ${JSON.stringify(nodeResult.replacement)}`);
              }
              // <<< END LOGGING >>>

              if (index !== -1) {
                const replacementNodes = nodeResult.replacement;
                // <<< ADD LOGGING HERE >>>
                logger.debug(`[Interpreter Loop] Calling transformNode. Index: ${index}, Replacement Node Count: ${replacementNodes.length}, First Replacement Node Type: ${replacementNodes[0]?.type}, First Replacement Node Content: ${(replacementNodes[0] as TextNode)?.content?.substring(0, 50)}...`);
                currentState.transformNode(index, replacementNodes.length > 0 ? replacementNodes : undefined);
                // <<< END LOGGING >>>
                logger.debug(`Applied ${replacementNodes.length} replacement nodes for original node ${node.nodeId} at index ${index}`);
              } else {
                 process.stderr.write(`WARN: [InterpreterService Loop] Original node (ID: ${node.nodeId}) not found for replacement.\n`);
              }
            } 
          } 
          
          if (!currentState) { // Add null check before cloning
             throw new MeldInterpreterError('State became null unexpectedly before cloning last good state.', 'internal_error', convertLocation(node.location), { severity: ErrorSeverity.Fatal });
          }
          // Clone at the end of successful processing within the loop
          lastGoodState = currentState.clone() as IStateService; 
        } catch (error) {
          try {
            this.handleError(error instanceof Error ? error : new Error(String(error)), opts, node);
            // Rollback to the last known good state *before* the failed node processing
            currentState = lastGoodState; // No clone needed here, revert to the state before the try block for this node
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

      // <<< ADD CHECK FOR VALID currentState BEFORE MERGE >>>
      if (!currentState || typeof currentState.mergeChildState !== 'function') {
        // This shouldn't happen if the loop completed, but adds safety
        logger.error('InterpreterService: currentState is invalid before final merge.', { state: currentState });
        throw new MeldInterpreterError(
          'Invalid final state before merging.',
          'internal_error',
          undefined,
          { severity: ErrorSeverity.Fatal }
        );
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

      // <<< Use process.stdout.write to log ID before return >>>
      process.stdout.write(`>>> [Interpreter EXIT] Returning state ID: ${currentState?.getStateId()}\n`);

      return currentState;
    } catch (error) {
      throw error; 
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService,
    options?: InterpreterOptions
  ): Promise<[IStateService, DirectiveResult | undefined]> {
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
    let directiveResult: DirectiveResult | undefined = undefined;

    switch (node.type) {
      case 'Text':
        const textNode = node as TextNode;
        let nodeToAdd: TextNode = textNode; // Start with the original node

        // Check if content potentially needs resolution
        if (textNode.content.includes('{{')) {
            // << ADDED lazy initialization >>
            this.ensureClientsInitialized(); 

            // Ensure parser client is available after lazy init
            if (this.parserClient && this.resolutionService) {
                logger.debug(`[InterpreterService] TextNode content might need resolution: ${textNode.content.substring(0, 50)}...`);
                try {
                    // 1. Parse the string content into an InterpolatableValue array
                    // Assuming parseString exists and returns INode[] - Needs Filtering
                    const parsedNodesRaw = await this.parserClient.parseString(
                        textNode.content, 
                        { 
                            // Linter Fix 3: Ensure filePath is string | undefined
                            filePath: currentState.getCurrentFilePath() ?? undefined, 
                            // Linter Fix 2: Removed unsupported 'startRule' option
                        }
                    );
                    // Linter Fix 1: Filter/Cast the result to InterpolatableValue
                    const parsedNodes: InterpolatableValue = parsedNodesRaw.filter(
                      (node): node is TextNode | VariableReferenceNode => 
                        node.type === 'Text' || node.type === 'VariableReference'
                    );

                    logger.debug(`[InterpreterService] Parsed TextNode content into ${parsedNodes?.length ?? 0} nodes.`);

                    // 2. Resolve the parsed nodes
                    const context = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath() ?? undefined);
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
        directiveResult = await this.callDirectiveHandleDirective(directiveNode, handlerContext);
        
        break;

      default:
        throw new MeldInterpreterError(
          `Unknown node type: ${node.type}`,
          'unknown_node',
          convertLocation(node.location)
        );
    }

    // Step 1: Return the tuple
    return [currentState, directiveResult];
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