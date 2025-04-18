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
      
      // <<< Explicitly ensure transformation is enabled >>>
      if (!currentState.isTransformationEnabled()) {
        logger.warn(`Transformation was initially disabled for state ${currentState.getStateId()}, explicitly enabling.`);
        currentState.setTransformationEnabled(true);
      } else {
        logger.debug(`Transformation is enabled for initial state ${currentState.getStateId()}.`);
      }
      // <<< End explicit enable >>>

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
          
          // <<< Track state before call >>>
          const stateBeforeNode: IStateService | null = currentState;
          const stateIdBefore = stateBeforeNode?.getStateId();
          const nodesBeforeCount = stateBeforeNode?.getTransformedNodes()?.length ?? -1;

          currentState = await this.interpretNode(node, currentState, opts);
          
          // <<< Log state comparison >>>
          const stateIdAfter = currentState?.getStateId();
          const nodesAfterCount = currentState?.getTransformedNodes()?.length ?? -1;
          process.stdout.write(`DEBUG: [InterpreterService Loop] State Before: ${stateIdBefore} (Nodes: ${nodesBeforeCount}). State After: ${stateIdAfter} (Nodes: ${nodesAfterCount}). Same Object? ${stateBeforeNode === currentState}\n`);
          if (stateBeforeNode !== currentState) {
             const nodesBefore = stateBeforeNode?.getTransformedNodes();
             const nodesAfter = currentState?.getTransformedNodes();
             process.stdout.write(`DEBUG: [InterpreterService Loop] State instance CHANGED! Before nodes (${nodesBefore?.length}): ${JSON.stringify(nodesBefore?.map((n: MeldNode) => n.nodeId))}. After nodes (${nodesAfter?.length}): ${JSON.stringify(nodesAfter?.map((n: MeldNode) => n.nodeId))}\n`);
          } else if (nodesBeforeCount !== nodesAfterCount) {
             process.stdout.write(`DEBUG: [InterpreterService Loop] Node count changed but state instance SAME.\n`);
          }
          // <<< End log state comparison >>>

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

    process.stdout.write(`DEBUG: [InterpreterService.interpretNode ENTRY] Node Type: ${node.type}, State ID: ${state.getStateId() ?? 'N/A'}\n`);

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState = state;
    let resultStateFromHandler: IStateService | null = null;
    let transformedNode: MeldNode | null = null;
    let replacementNode: MeldNode | MeldNode[] | undefined = undefined;

    switch (node.type) {
      case 'Text':
        // Handle Text nodes
        const textNode = node as TextNode;
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Text] Content: '${textNode.content.substring(0, 50)}...'\n`);
        // --- Revert: Remove incorrect inline resolution --- 
        // The parser should create separate VariableReferenceNodes for {{...}}.
        // TextNodes should be treated as literal content.
        transformedNode = textNode; // Mark original node for adding
        process.stdout.write(`DEBUG: [InterpreterService.interpretNode Text] Marking original TextNode for addition.\n`);
        // --- End Revert --- 
        currentState.addNode(transformedNode); // Add directly to current state
        break; // End of Text case

      case 'CodeFence':
        // Handle CodeFence nodes similar to Text nodes - preserve them exactly
        currentState.addNode(node); // Add directly to current state
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
         } catch (error) {
              logger.error('Failed to resolve VariableReferenceNode during interpretation', {
                 error: error instanceof Error ? error.message : String(error),
                 identifier: varNode.identifier // Use identifier from varNode
              });
              const errorState = currentState.clone();
              errorState.addNode(varNode); // Add original varNode back
              currentState = errorState;
         }
         if (transformedNode) { // transformedNode is the resolved TextNode
           currentState.addNode(transformedNode); // Add resolved node
         } else {
           currentState.addNode(node); // Add original if resolution failed
         }
         break;

      case 'Comment':
        // Comments are ignored during interpretation
        break;

      case 'Directive':
        currentState.addNode(node); // Add original directive node first

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
        const baseResolutionContext = ResolutionContextFactory.create(currentState, currentState.getCurrentFilePath() ?? undefined);
        const formattingContext: OutputFormattingContext = {
          isOutputLiteral: currentState.isTransformationEnabled?.() || false,
          contextType: 'block', // Default to block context
          nodeType: directiveNode.type,
          atLineStart: true, // Default assumption
          atLineEnd: false // Default assumption
        };
        let executionContext: ExecutionContext | undefined = undefined;
        if (directiveNode.directive.kind === 'run') {
          executionContext = {
             cwd: currentState.getCurrentFilePath() ? this.pathService.dirname(currentState.getCurrentFilePath()!) : process.cwd(),
             // ... rest of executionContext
          };
        }
        const handlerContext: DirectiveProcessingContext = {
          state: currentState, // Pass the current state directly
          resolutionContext: baseResolutionContext, 
          formattingContext: formattingContext,
          executionContext: executionContext, 
          directiveNode: directiveNode, 
        };
        // --- End Context Creation ---

        const directiveResult = await this.callDirectiveHandleDirective(directiveNode, handlerContext);

        // Process the result (state and optional replacement)
        if (
          directiveResult &&
          typeof directiveResult === 'object' &&
          'replacement' in directiveResult 
        ) {
          resultStateFromHandler = (directiveResult as DirectiveResult).state as IStateService;
          replacementNode = (directiveResult as DirectiveResult).replacement;
        } else if (directiveResult && typeof directiveResult === 'object') {
          resultStateFromHandler = directiveResult as IStateService;
        } else {
           throw new MeldInterpreterError(
             `Directive handler for '${directiveNode.directive.kind}' returned an unexpected type.`,
             'directive_result_error',
             convertLocation(directiveNode.location)
           );
        }

        if (!resultStateFromHandler) {
           throw new MeldInterpreterError(
             `Directive handler for '${directiveNode.directive.kind}' did not return a valid state object.`,
             'directive_result_error',
             convertLocation(directiveNode.location)
           );
        }
        
        // *** CRITICAL CHANGE: Update currentState to the result from the handler ***
        currentState = resultStateFromHandler;

        // Node replacement logic (operates on the NEW currentState)
        if (replacementNode !== undefined) { // Handle null, undefined, [], node, nodes[]
          if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) { 
            const nodesBefore = currentState.getTransformedNodes(); 
            process.stdout.write(`DEBUG: [InterpreterService Directive Case] Nodes BEFORE findIndex (length ${nodesBefore.length}): ${JSON.stringify(nodesBefore.map(n => ({ type: n.type, kind: (n as DirectiveNode)?.directive?.kind, loc_start: n.location?.start })))} \n`);
            
            // Find the original directive node IN THE NEW STATE's list
            const index = nodesBefore.findIndex(n => 
                n.nodeId === node.nodeId // <<< Use nodeId for reliable finding
            );
            
            process.stdout.write(`DEBUG: [InterpreterService Directive Case] findIndex result for node ${node.type} (${directiveNode.directive.kind} - ID: ${node.nodeId}): ${index}\n`);

            if (index !== -1) {
              if (Array.isArray(replacementNode)) {
                if (replacementNode.length === 0) {
                  // Use transformNode with undefined to remove
                  currentState.transformNode(index, undefined); 
                  process.stdout.write(`DEBUG: [InterpreterService Directive Case] Called transformNode(index=${index}, undefined).\n`);
                  const nodesAfterRemove = currentState.getTransformedNodes(); 
                  process.stdout.write(`DEBUG: [InterpreterService Directive Case] Nodes AFTER remove (length ${nodesAfterRemove.length}): ${JSON.stringify(nodesAfterRemove.map(n => ({ type: n.type, kind: (n as DirectiveNode)?.directive?.kind, nodeId: n.nodeId, loc_start: n.location?.start })))} \n`);
                } else {
                  // Replace with multiple nodes using transformNode
                  currentState.transformNode(index, replacementNode); 
                  process.stdout.write(`DEBUG: [InterpreterService Directive Case] Called transformNode(index=${index}, [${replacementNode.length} nodes]).\n`);
                   const nodesAfterReplaceArray = currentState.getTransformedNodes();
                   process.stdout.write(`DEBUG: [InterpreterService Directive Case] Nodes AFTER array replace (length ${nodesAfterReplaceArray.length}): ${JSON.stringify(nodesAfterReplaceArray.map(n => ({ type: n.type, kind: (n as DirectiveNode)?.directive?.kind, nodeId: n.nodeId, loc_start: n.location?.start })))} \n`);
                }
              } else if (replacementNode) {
                // Replace with single node
                const singleReplacementNode: MeldNode = replacementNode;
                currentState.transformNode(index, singleReplacementNode);
                process.stdout.write(`DEBUG: [InterpreterService Directive Case] Called transformNode(index=${index}, singleNode).\n`);
                 const nodesAfterReplaceSingle = currentState.getTransformedNodes();
                 process.stdout.write(`DEBUG: [InterpreterService Directive Case] Nodes AFTER single replace (length ${nodesAfterReplaceSingle.length}): ${JSON.stringify(nodesAfterReplaceSingle.map(n => ({ type: n.type, kind: (n as DirectiveNode)?.directive?.kind, nodeId: n.nodeId, loc_start: n.location?.start })))} \n`);
              } 
              // If replacementNode is null/undefined, transformNode(index, undefined) is implicitly called by the logic structure (no specific else needed if transformNode handles undefined for removal)
               else { 
                 // Explicitly handle null/undefined if needed, maybe remove is clearer?
                  currentState.transformNode(index, undefined); // Or just let it fall through if transformNode handles undefined
                  process.stdout.write(`DEBUG: [InterpreterService Directive Case] replacementNode is null/undefined. Called transformNode(index=${index}, undefined).\n`);
                    const nodesAfterNullRemove = currentState.getTransformedNodes(); 
                    process.stdout.write(`DEBUG: [InterpreterService Directive Case] Nodes AFTER null/undefined remove (length ${nodesAfterNullRemove.length}): ${JSON.stringify(nodesAfterNullRemove.map(n => ({ type: n.type, kind: (n as DirectiveNode)?.directive?.kind, nodeId: n.nodeId, loc_start: n.location?.start })))} \n`);
               }
            } else {
               process.stderr.write(`WARN: [InterpreterService Directive Case] Original node (ID: ${node.nodeId}) not found in transformed nodes for replacement. Node: ${JSON.stringify(node)}\n`);
            }
          } 
        }
        
        break; // End of Directive case

      default:
        throw new MeldInterpreterError(
          `Unknown node type: ${node.type}`,
          'unknown_node',
          convertLocation(node.location)
        );
    }

    // --- REMOVED REVISED LOGIC --- 
    // Return the currentState as modified throughout the switch block
    process.stdout.write(`DEBUG: [InterpreterService.interpretNode EXIT] Returning State ID: ${currentState.getStateId() ?? 'N/A'}\n`);
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