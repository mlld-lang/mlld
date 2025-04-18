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
import { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';
import type { DirectiveProcessingContext, ExecutionContext, OutputFormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import * as crypto from 'crypto';

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
  private async callDirectiveHandleDirective(node: DirectiveNode, context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    if (this.directiveClient && this.directiveClient.handleDirective) {
      try {
        return await this.directiveClient.handleDirective(node, context) as IStateService | DirectiveResult;
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
    let currentState: IStateService | null = null;
    let initialSnapshot: IStateService | undefined = undefined;
    let lastGoodState: IStateService | undefined = undefined;

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

      logger.debug('Starting interpretation', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        mergeState: opts.mergeState
      });

      initialSnapshot = currentState!.clone() as IStateService; 
      lastGoodState = initialSnapshot;

      for (const node of nodes) {
        try {
          process.stdout.write(`DEBUG: [InterpreterService.interpret LOOP] Processing node type: ${node.type}, Current State ID: ${currentState?.getStateId() ?? 'N/A'}\n`);
          currentState = await this.interpretNode(node, currentState, opts);
          process.stdout.write(`DEBUG: [InterpreterService.interpret LOOP] Node processed. New State ID: ${currentState?.getStateId() ?? 'N/A'}, Node count: ${currentState?.getNodes()?.length ?? 0}\n`);
          lastGoodState = currentState.clone() as IStateService;
        } catch (error) {
          try {
            this.handleError(error instanceof Error ? error : new Error(String(error)), opts);
            currentState = lastGoodState.clone() as IStateService;
          } catch (fatalError) {
            // If we get here, the error was fatal and should be propagated
            // Restore to initial state before rethrowing
            if (opts.initialState && opts.mergeState) {
              // Only attempt to merge back if we have a parent and mergeState is true
              if (typeof opts.initialState.mergeChildState === 'function') {
                 // Ensure initialSnapshot is treated as IStateService here
                 (opts.initialState as IStateService).mergeChildState(initialSnapshot as IStateService);
              } else {
                  logger.warn('Initial state does not support mergeChildState', { initialState: opts.initialState });
              }
            }
            throw fatalError;
          }
        }
      }

      // Merge state back to parent if requested
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

      process.stdout.write(`DEBUG: [InterpreterService.interpret EXIT] Completed. Final State ID: ${currentState?.getStateId() ?? 'N/A'}\n`);
      return currentState;
    } catch (error) {
      process.stdout.write(`DEBUG: [InterpreterService.interpret ERROR] Error during interpretation: ${error instanceof Error ? error.message : String(error)}\n`);
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

    process.stdout.write(`DEBUG: [InterpreterService.interpretNode ENTRY] Node Type: ${node.type}, State ID: ${state.getStateId() ?? 'N/A'}\n`);

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState = state;
    let resultState: IStateService | DirectiveResult | null = null;
    let transformedNode: MeldNode | null = null; // Track potential replacement

    switch (node.type) {
      case 'Text':
        // Handle Text nodes
        const textNode = node as TextNode;
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Text] Content: '${textNode.content.substring(0, 50)}...'. State ID: ${currentState.getStateId()}\n`);
        // --- Revert: Remove incorrect inline resolution --- 
        // The parser should create separate VariableReferenceNodes for {{...}}.
        // TextNodes should be treated as literal content.
        transformedNode = textNode; // Mark original node for adding
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Text] Marking original TextNode for addition.\n`);
        // --- End Revert --- 
        break; // End of Text case

      case 'CodeFence':
        // Handle CodeFence nodes similar to Text nodes - preserve them exactly
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode CodeFence] State ID: ${currentState.getStateId()}\n`);
        const codeFenceState = currentState.clone();
        codeFenceState.addNode(node);
        currentState = codeFenceState;
        break;

      case 'VariableReference':
         const varNode = node as VariableReferenceNode;
         try {
             const varRefContext = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath() ?? undefined);
             const resolvedStringValue = await this.resolutionService.resolveNodes([varNode], varRefContext);
             const resolvedTextNode: TextNode = {
                 type: 'Text',
                 content: resolvedStringValue,
                 location: varNode.location, // Use location from varNode
                 nodeId: crypto.randomUUID() // <<< ADDED
             };
             transformedNode = resolvedTextNode;
             process.stdout.write(`DEBUG: [InterpreterService.interpretNode VariableReference] Resolved '${varNode.identifier}' to TextNode. State ID: ${currentState.getStateId()}\n`);
         } catch (error) {
              logger.error('Failed to resolve VariableReferenceNode during interpretation', {
                 error: error instanceof Error ? error.message : String(error),
                 identifier: varNode.identifier // Use identifier from varNode
              });
              const errorState = currentState.clone();
              errorState.addNode(varNode); // Add original varNode back
              currentState = errorState;
         }
         break;

      case 'Comment':
        // Comments are ignored during interpretation
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Comment] Ignoring. State ID: ${currentState.getStateId()}\n`);
        break;

      case 'Directive':
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Directive] Kind: ${(node as DirectiveNode).directive.kind}. State ID: ${currentState.getStateId()}\n`);
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
        const formattingContext: OutputFormattingContext = {
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
            cwd: directiveState.getCurrentFilePath() ? this.pathService.dirname(directiveState.getCurrentFilePath()!) : process.cwd(),
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
          'replacement' in directiveResult
        ) {
          resultState = (directiveResult as DirectiveResult).state as IStateService;
          replacementNode = (directiveResult as DirectiveResult).replacement;
        } else if (directiveResult && typeof directiveResult === 'object') {
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
        
        // --- Add logging before replacement logic ---
        process.stdout.write(`DEBUG: [InterpreterService Directive Case] Before replacement check. replacementNode type: ${replacementNode?.type}, content: ${(replacementNode as any)?.content}\n`);

        if (replacementNode) { 
          process.stdout.write(`DEBUG: [InterpreterService Directive Case] replacementNode is defined. Checking transformation enabled.\n`);
          // Check if transformation is enabled (always true now)
          if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
            process.stdout.write(`DEBUG: [InterpreterService Directive Case] Transformation enabled. Getting nodes for replacement.\n`);
            // Get the list of nodes currently being built for output
            const nodes = currentState.getTransformedNodes(); 
            process.stdout.write(`DEBUG: [InterpreterService Directive Case] Current transformedNodes length: ${nodes?.length}. Nodes: ${JSON.stringify(nodes?.map(n => ({ type: n.type, loc: n.location?.start })))}`);
            // Find the index of the original directive node we just processed
            const index = nodes.findIndex(n => 
                n.type === node.type &&
                n.location?.start?.line === node.location?.start?.line &&
                n.location?.start?.column === node.location?.start?.column &&
                // Add file path check if available in location
                (n.location?.filePath === node.location?.filePath || 
                 (!n.location?.filePath && !node.location?.filePath)) // Handle cases where filePath might be undefined
            );
            process.stdout.write(`DEBUG: [InterpreterService Directive Case] Found index for original node ${node.type} (${(node as DirectiveNode)?.directive?.kind}) by location: ${index}\n`);
            if (index !== -1) {
              // If found, replace it with the replacementNode from the handler
              process.stdout.write(`DEBUG: [InterpreterService Directive Case] Calling transformNode to replace index ${index} with ${replacementNode.type} node.\n`);
              currentState.transformNode(index, replacementNode); // <<< USE WITHOUT Assertion
              // Add log after transform to verify
              const nodesAfter = currentState.getTransformedNodes();
              process.stdout.write(`DEBUG: [InterpreterService Directive Case] After transformNode. New length: ${nodesAfter?.length}. Node at index ${index}: ${nodesAfter?.[index]?.type}\n`);
            } else {
               // logger.warn('Original node not found in transformed nodes for replacement', { node });
               process.stderr.write(`WARN: [InterpreterService Directive Case] Original node not found in transformed nodes for replacement. Node: ${JSON.stringify(node)}\n`);
            }
          } else {
             process.stdout.write(`DEBUG: [InterpreterService Directive Case] Transformation NOT enabled (or check failed).\n`);
          }
        } // <<< END of replacement logic
        
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

    // --- REVISED LOGIC for returning state --- 
    let finalState = currentState; // Start with the state potentially modified within the switch block

    // If the node itself was transformed (e.g., TextNode with {{, VariableReference), 
    // add the transformed version to a clone of the finalState.
    if (transformedNode) {
      process.stdout.write(`DEBUG: [InterpreterService.interpretNode] Applying transformedNode (Type: ${transformedNode.type}). Cloning state ${finalState.getStateId()}.\n`);
      finalState = finalState.clone(); // Clone the potentially modified state
      finalState.addNode(transformedNode); 
      process.stdout.write(`DEBUG: [InterpreterService.interpretNode] Node added to cloned state. New State ID: ${finalState.getStateId()}\n`);
    } else if (node.type !== 'Directive' && node.type !== 'Comment' && node.type !== 'VariableReference') { 
      // Add original node if not a directive/comment/resolved varRef AND not replaced
      // This handles Text, CodeFence, etc. that don't get transformed but need to be in output state
      process.stdout.write(`DEBUG: [InterpreterService.interpretNode] Adding original untransformed node (Type: ${node.type}). Cloning state ${finalState.getStateId()}.\n`);
      finalState = finalState.clone();
      finalState.addNode(node);
      process.stdout.write(`DEBUG: [InterpreterService.interpretNode] Original node added to cloned state. New State ID: ${finalState.getStateId()}\n`);
    } else {
      // Node was a Directive, Comment, or successfully resolved VariableReference, and no replacement was needed.
      // The current state (`currentState` or `finalState`) already reflects the result.
      process.stdout.write(`DEBUG: [InterpreterService.interpretNode] No node added/transformed for type ${node.type}. Using State ID: ${finalState.getStateId()}.\n`);
    }

    process.stdout.write(`DEBUG: [InterpreterService.interpretNode EXIT] Node Type: ${node.type}, Final State ID: ${finalState.getStateId() ?? 'N/A'}\n`);
    return finalState;
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