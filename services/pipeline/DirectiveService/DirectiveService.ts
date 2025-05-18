import type { DirectiveNode, DirectiveKind, DirectiveData } from '@core/syntax/types/index';
import { directiveLogger } from '@core/utils/logger';
import { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { 
  ParserServiceLike, 
  InterpreterServiceLike,
  CircularityServiceLike, 
  InterpreterOptionsBase
} from '@core/shared-service-types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError';
import type { ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler';
import { Service } from '@core/ServiceProvider';
import { inject, injectable, delay, injectAll } from 'tsyringe';
import { container } from 'tsyringe';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import type { ResolutionContext } from '@core/types/resolution';
import type { DirectiveProcessingContext, OutputFormattingContext, ExecutionContext } from '@core/types/index';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { RawPath, Location as CoreLocation } from '@core/types';
import type { SourceLocation as SyntaxSourceLocation } from '@core/syntax/types';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { DirectiveLocation } from '@core/errors/MeldDirectiveError';
import { 
    VariableType, 
    VariableMetadata, 
    VariableDefinition, 
    createTextVariable, 
    createDataVariable, 
    createPathVariable, 
    createCommandVariable 
} from '@core/types/variables';
import { MeldVariable } from '@core/types/variables';
import type { ICommandDefinition } from '@core/types/define';
import { isBasicCommand } from '@core/types/define';

// Import all handlers
// import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
// import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler';
// import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
// import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler';
// import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
// import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler';
// import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';

export class MeldLLMXMLError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MeldLLMXMLError';
    Object.setPrototypeOf(this, MeldLLMXMLError.prototype);
  }
}

/**
 * Service responsible for handling directives
 */
@injectable()
@Service({
  description: 'Service responsible for handling and processing directives',
  dependencies: [
    { token: 'IValidationService', name: 'validationService' },
    { token: 'IStateService', name: 'stateService' },
    { token: 'IPathService', name: 'pathService' },
    { token: 'IFileSystemService', name: 'fileSystemService' },
    { token: 'IParserService', name: 'parserService' },
    { token: 'InterpreterServiceClientFactory', name: 'interpreterServiceClientFactory' },
    { token: 'ICircularityService', name: 'circularityService' },
    { token: 'IResolutionService', name: 'resolutionService' }
  ]
})
export class DirectiveService implements IDirectiveService {
  private validationService!: IValidationService;
  private stateService!: IStateService;
  private fileSystemService!: IFileSystemService;
  private parserService!: ParserServiceLike;
  private interpreterService?: InterpreterServiceLike;
  private interpreterClient?: IInterpreterServiceClient;
  private interpreterClientFactory?: InterpreterServiceClientFactory;
  private circularityService!: CircularityServiceLike;
  private resolutionService!: IResolutionService;
  private factoryInitialized: boolean = false;
  private interpreterFactoryInitialized: boolean = false;
  private initialized = false;
  private logger: ILogger;

  private handlers: Map<string, IDirectiveHandler>;

  /**
   * Creates a new DirectiveService instance.
   * Uses dependency injection for service dependencies.
   * 
   * @param allHandlers All registered IDirectiveHandler instances (injected)
   * @param validationService Validation service for directives (injected)
   * @param stateService State service for managing variables (injected)
   * @param pathService Path service for handling file paths (injected)
   * @param fileSystemService File system service for file operations (injected)
   * @param parserService Parser service for parsing Meld files (injected)
   * @param circularityService Circularity service for detecting circular imports (injected)
   * @param resolutionService Resolution service for variable resolution (injected)
   * @param interpreterServiceClientFactory Factory for creating interpreter clients (injected)
   * @param logger Logger for directive operations (optional)
   */
  constructor(
    @injectAll('IDirectiveHandler') private allHandlers: IDirectiveHandler[],
    @inject('IValidationService') validationService?: IValidationService,
    @inject('IStateService') stateService?: IStateService,
    @inject('IPathService') private pathService?: IPathService,
    @inject('IFileSystemService') fileSystemService?: IFileSystemService,
    @inject('IParserService') parserService?: ParserServiceLike,
    @inject('ICircularityService') circularityService?: CircularityServiceLike,
    @inject('IResolutionService') resolutionService?: IResolutionService,
    @inject(delay(() => InterpreterServiceClientFactory)) interpreterServiceClientFactory?: InterpreterServiceClientFactory,
    @inject('ILogger') logger?: ILogger
  ) {
    this.logger = logger || directiveLogger;
    
    // Initialize handlers map from injected array FIRST
    this.handlers = new Map();
    if (this.allHandlers) {
      this.allHandlers.forEach(handler => {
        if (handler && handler.kind) {
          this.handlers.set(handler.kind, handler);
          this.logger.debug(`Registered injected handler for directive: ${handler.kind}`);
        } else {
          this.logger.warn('Received an invalid handler during injection.', { handler });
        }
      });
    } else {
      this.logger.warn('No handlers were injected via @injectAll(\'IDirectiveHandler\'). Handler map will be empty.');
    }

    // Initialize interpreter client factory first if available
    this.interpreterClientFactory = interpreterServiceClientFactory;
    if (this.interpreterClientFactory) {
      this.interpreterFactoryInitialized = true;
      this.initializeInterpreterClient();
    }
    
    // >>> NOW attempt DI initialization <<< 
    if (validationService && stateService && pathService && fileSystemService && 
        parserService && circularityService && resolutionService) {
      this.initializeFromParams(
        validationService,
        stateService,
        pathService,
        fileSystemService,
        parserService,
        interpreterServiceClientFactory,
        circularityService,
        resolutionService
      );
    } else {
       this.logger.debug('DirectiveService constructed but dependencies incomplete. Call initialize() manually if needed.');
    }
    
    // Set initialized to true after handler map is populated
    // this.initialized = true; 
    
    // Assign services with checks
    if (validationService) {
        this.validationService = validationService;
    } else {
        console.error('ERROR: ValidationService not provided to DirectiveService constructor!');
    }
    if (resolutionService) {
        this.resolutionService = resolutionService;
    } else {
        console.error('ERROR: ResolutionService not provided to DirectiveService constructor!');
    }
    if (stateService) {
        this.stateService = stateService;
    } else {
        console.error('ERROR: StateService not provided to DirectiveService constructor!');
    }
    if (pathService) {
        this.pathService = pathService;
    } else {
        console.error('ERROR: PathService not provided to DirectiveService constructor!');
    }
    if (fileSystemService) {
        this.fileSystemService = fileSystemService;
    } else {
        console.error('ERROR: FileSystemService not provided to DirectiveService constructor!');
    }
    if (parserService) {
        this.parserService = parserService;
    } else {
        console.error('ERROR: ParserService not provided to DirectiveService constructor!');
    }
    if (circularityService) {
        this.circularityService = circularityService;
    } else {
        console.error('ERROR: CircularityService not provided to DirectiveService constructor!');
    }
    
    // Initialize client using factory
    if (interpreterServiceClientFactory) {
      this.interpreterClient = interpreterServiceClientFactory.createClient();
    } else {
      this.logger.warn('InterpreterServiceClientFactory not provided to DirectiveService');
    }

    // Register default handlers (Example - replace with actual DI resolution if applicable)
    // If not using DI for handlers, they need manual instantiation
    // This section likely needs adjustment based on how handlers are managed (DI vs. manual)
    // this.directiveHandlers.set('import', new ImportDirectiveHandler(
    //     this.validationService!,
    //     this.resolutionService!,
    //     this.stateService!,
    //     this.fileSystemService!,
    //     this.parserService!,
    //     this.pathService!,
    //     // Pass the container instead of factory
    //     container, // Assuming global container for now, this NEEDS review for proper scoping
    //     this.interpreterServiceClient,
    //     undefined, // No URL resolver in this context? Needs review
    //     undefined  // No tracking service in this context? Needs review
    //   ));
    // ... register other handlers ...

    this.initialized = true;
  }
  
  /**
   * Initialize this service with the given parameters.
   * Uses DI-only mode for initialization.
   */
  private initializeFromParams(
    validationService?: IValidationService,
    stateService?: IStateService,
    pathService?: IPathService,
    fileSystemService?: IFileSystemService,
    parserService?: ParserServiceLike,
    interpreterServiceClientFactory?: InterpreterServiceClientFactory,
    circularityService?: CircularityServiceLike,
    resolutionService?: IResolutionService
  ): void {
    // Verify that required services are provided
    if (!validationService || !stateService || !pathService || 
        !fileSystemService || !parserService || 
        !circularityService || !resolutionService) {
      this.logger.warn('DirectiveService initialized with missing dependencies');
      return;
    }
    
    // Initialize all services
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    
    // Set initialized to true
    this.initialized = true;
    
    // Register default handlers AFTER setting initialized
    // this.registerDefaultHandlers();
        
    // Handle the interpreter client factory (if provided via DI)
    if (interpreterServiceClientFactory) {
        this.interpreterClientFactory = interpreterServiceClientFactory;
        this.interpreterFactoryInitialized = true;
        this.initializeInterpreterClient();
    }

    this.logger.debug('DirectiveService initialized via DI', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Explicitly initialize the service with all required dependencies.
   * @deprecated This method is maintained for backward compatibility. 
   * The service is automatically initialized via dependency injection.
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: ParserServiceLike,
    interpreterServiceClientFactory: InterpreterServiceClientFactory,
    circularityService: CircularityServiceLike,
    resolutionService: IResolutionService
  ): void {
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    this.initialized = true;

    // Initialize interpreter client factory
    this.interpreterClientFactory = interpreterServiceClientFactory;
    if (this.interpreterClientFactory) {
      this.interpreterFactoryInitialized = true;
      this.initializeInterpreterClient();
    }

    // Register default handlers AFTER setting initialized
    // this.registerDefaultHandlers();

    this.logger.debug('DirectiveService initialized manually', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register a new directive handler
   * @deprecated Handlers should be registered via DI using the 'IDirectiveHandler' token and @injectAll.
   */
  registerHandler(handler: IDirectiveHandler): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before registering handlers');
    }

    if (!handler.kind) {
      throw new Error('Handler must have a kind property');
    }

    this.handlers.set(handler.kind, handler);
    this.logger.debug(`Registered handler for directive: ${handler.kind}`);
  }

  /**
   * Handle a directive node
   */
  public async handleDirective(node: DirectiveNode, context: DirectiveProcessingContext): Promise<DirectiveResult> {
    this.ensureInitialized();
    this.ensureFactoryInitialized(); // Ensure Resolution Client Factory is ready
    
    const kind = node.kind;
    if (!kind) {
      throw new DirectiveError('Directive node is missing kind', 'unknown', DirectiveErrorCode.VALIDATION_FAILED, { node });
    }

    const handler = this.handlers.get(kind);
    if (!handler) {
      // Convert location for the error details
      const errorLocation: CoreLocation | undefined = node.location ? { 
          start: node.location.start, 
          end: node.location.end, 
          // Get file path from context if available
          filePath: context.state?.getCurrentFilePath() ?? context.resolutionContext?.currentFilePath ?? undefined 
      } : undefined;
      throw new DirectiveError(
          `No handler registered for directive kind: ${kind}`, 
          kind, 
          DirectiveErrorCode.HANDLER_NOT_FOUND, 
          { node, location: errorLocation } // Pass converted CoreLocation
      );
    }

    // Explicitly cast the handler retrieved from the map
    const specificHandler = handler as IDirectiveHandler;

    try {
      // REMOVE STATE CLONE: Operate directly on the context state
      // const state = context.state?.clone() || this.stateService!.createChildState(); 
      const state = context.state; // Use the state from the incoming context
      if (!state) { // Add check if context.state could be null/undefined
        throw new MeldError('State service is missing in the directive processing context.', { code: 'INTERNAL_ERROR', severity: ErrorSeverity.Fatal });
      }
      const currentFilePath = state.getCurrentFilePath() ?? undefined;

      // Perform validation first
      await this.validationService!.validate(node); 
      
      // Check for circular imports *after* basic validation but *before* execution
      if (node.kind === 'import') {
         const importPath = this.pathService!.resolvePath(node.raw.path || node.values.path?.[0]?.raw, currentFilePath as RawPath | undefined);
         
         if (this.circularityService!.isInStack(importPath as RawPath)) {
            // --- DEBUG LOG --- Log if circular import detected
            // console.log(`[DirectiveService handleDirective] Circular import DETECTED for: ${importPath}`);
            // Revert to correct constructor call
            throw new MeldError(`Circular import detected: ${importPath}`, { code: 'CIRCULAR_IMPORT', severity: ErrorSeverity.Fatal }); 
         }
         // --- DEBUG LOG --- Log if circular import passed
         // console.log(`[DirectiveService handleDirective] Circularity check passed. Import path: ${importPath}`);
      }
      
      // Context Creation (Moved after checks) --- 
      const resolutionContext = ResolutionContextFactory.create(state, currentFilePath);
      const formattingContext: OutputFormattingContext = { 
         isOutputLiteral: state.isTransformationEnabled(),
         contextType: 'block', 
         nodeType: node.type,
         atLineStart: true, 
         atLineEnd: false
      };
      let executionContext: ExecutionContext | undefined;
      if (kind === 'run' && this.pathService && currentFilePath) {
         executionContext = { cwd: this.pathService.dirname(currentFilePath) };
      } else if (kind === 'run') {
         executionContext = { cwd: process.cwd() };
      }
      
      // Explicitly type the properties when creating the object
      const processingContext: DirectiveProcessingContext = {
          state: state as IStateService, 
          resolutionContext: resolutionContext,
          formattingContext: formattingContext,
          executionContext: executionContext,
          directiveNode: node as DirectiveNode 
      };
      // --- End Context Creation ---

      this.logger.debug(`Executing handler for directive: ${kind}`);
      
      // <<< ADD LOGGING HERE >>>
      // process.stdout.write(`DEBUG: [DirectiveService.handleDirective] BEFORE calling handler '${kind}'. Node: ${JSON.stringify(node)}\n`);

      // Use the specifically cast handler
      const result: DirectiveResult = await specificHandler.handle(processingContext); 
      
      // <<< RETURN the result object unchanged >>>
      // The caller (InterpreterService) will handle the replacement nodes
      // and use the (potentially modified) context.state.
      return result;

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown directive processing error';
        const code = (error instanceof DirectiveError) ? error.code : DirectiveErrorCode.EXECUTION_FAILED;
        // Create a simplified context for the error details
        const errorContext: Partial<DirectiveProcessingContext> = {
           state: context.state, // Keep state if available
           resolutionContext: context.resolutionContext, // Keep context if available
           // Add other context pieces if relevant and available
        };
        // Convert node.location (SyntaxSourceLocation) to CoreLocation for details
        const errorFilePath = errorContext.state?.getCurrentFilePath() ?? undefined;
        const errorLocation: CoreLocation | undefined = node.location ? { 
            start: node.location.start, 
            end: node.location.end, 
            filePath: errorFilePath // Use path from context
        } : undefined;

        throw new DirectiveError(
          message,
          kind,
          code,
          // Pass correct details structure with Partial<DirectiveProcessingContext> and CoreLocation
          { 
              node, 
              context: errorContext, 
              location: errorLocation, // Use 'location' key
              cause: error instanceof Error ? error : undefined 
          } 
        );
    }

    return undefined as never; // Satisfy linter about missing return path
  }

  /**
   * Lazily initialize the ResolutionServiceClientForDirective factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    try {
      this.interpreterClientFactory = container.resolve('InterpreterServiceClientFactory');
      this.initializeInterpreterClient();
    } catch (error) {
      // Factory not available, will use direct reference
      this.logger.debug('InterpreterServiceClientFactory not available, using direct reference for resolution operations');
    }
  }
  
  /**
   * Initialize the ResolutionServiceClientForDirective using the factory
   */
  private initializeResolutionClient(): void {
    if (!this.interpreterClientFactory) {
      return;
    }
    
    try {
      this.interpreterClient = this.interpreterClientFactory.createClient();
      this.logger.debug('Successfully created InterpreterServiceClient using factory');
    } catch (error) {
      this.logger.warn('Failed to create InterpreterServiceClient', { error });
      this.interpreterClient = undefined;
    }
  }

  /**
   * Initialize the interpreterClient using the factory
   */
  private initializeInterpreterClient(): void {
    if (!this.interpreterClientFactory) {
      return;
    }
    
    try {
      this.interpreterClient = this.interpreterClientFactory.createClient();
      this.logger.debug('Successfully created InterpreterServiceClient using factory');
    } catch (error) {
      this.logger.warn('Failed to create InterpreterServiceClient', { error });
      this.interpreterClient = undefined;
    }
  }
  
  /**
   * Lazily initialize the InterpreterServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureInterpreterFactoryInitialized(): void {
    if (this.interpreterFactoryInitialized) {
      return;
    }
    
    this.interpreterFactoryInitialized = true;
    
    try {
      this.interpreterClientFactory = container.resolve('InterpreterServiceClientFactory');
      this.initializeInterpreterClient();
    } catch (error) {
      // Factory not available, will use direct service
      this.logger.debug('InterpreterServiceClientFactory not available, will use direct service if available');
    }
  }
  
  /**
   * Calls the interpret method on the interpreter service
   * Uses the client if available, falls back to direct service reference
   */
  private async callInterpreterInterpret(nodes: any[], options?: any): Promise<IStateService> {
    this.ensureInterpreterFactoryInitialized();
    
    // Try to use the client first
    if (this.interpreterClient) {
      const stateLike = await this.interpreterClient.interpret(nodes, options);
      
      // Verify the returned state has the minimum required methods
      if (!this.isStateService(stateLike)) {
        throw new MeldError('Interpreter client returned invalid state object', { 
          code: 'INVALID_STATE',
          severity: ErrorSeverity.Fatal,
          details: {
            missingMethods: this.getMissingStateMethods(stateLike)
          }
        });
      }
      
      return stateLike;
    }
    
    // Fall back to direct service reference
    if (this.interpreterService) {
      const stateLike = await this.interpreterService.interpret(nodes, options);
      
      // Verify the returned state has the minimum required methods
      if (!this.isStateService(stateLike)) {
        throw new MeldError('Interpreter service returned invalid state object', { 
          code: 'INVALID_STATE',
          severity: ErrorSeverity.Fatal,
          details: {
            missingMethods: this.getMissingStateMethods(stateLike)
          }
        });
      }
      
      return stateLike;
    }
    
    throw new Error('No interpreter service available');
  }
  
  /**
   * Calls the createChildContext method on the interpreter service
   * Uses the client if available, falls back to direct service reference
   */
  private async callInterpreterCreateChildContext(
    parentState: IStateService, 
    filePath?: string, 
    options?: InterpreterOptionsBase 
  ): Promise<IStateService> {
    this.ensureInterpreterFactoryInitialized();
    if (!this.interpreterClient) {
      throw new MeldError('InterpreterServiceClient not available for createChildContext', { code: 'CLIENT_UNAVAILABLE', severity: ErrorSeverity.Fatal });
    }
    // Pass arguments matching the client interface (parentState, filePath, options)
    const childStateLike = await this.interpreterClient.createChildContext(parentState, filePath, options);
    
    // Verify the returned state has the minimum required methods
    if (!this.isStateService(childStateLike)) {
      throw new MeldError('Interpreter client returned invalid state object', { 
        code: 'INVALID_STATE',
        severity: ErrorSeverity.Fatal,
        details: {
          missingMethods: this.getMissingStateMethods(childStateLike)
        }
      });
    }
    
    return childStateLike;
  }

  /**
   * Type guard to check if an object implements IStateService
   * @param obj The object to check
   * @returns True if the object implements IStateService
   */
  private isStateService(obj: any): obj is IStateService {
    const requiredMethods = [
      'setTransformationEnabled',
      'setTransformationOptions',
      'getParentState',
      'getVariable',
      'setVariable',
      'createChildState',
      'mergeChildState',
      'clone',
      'getStateId',
      'getCurrentFilePath',
      'setCurrentFilePath',
      'getTextVar',
      'getDataVar',
      'hasVariable',
      'getAllTextVars',
      'getAllDataVars',
      'getAllPathVars',
      'getAllCommands'
    ];

    return (
      typeof obj === 'object' && 
      obj !== null && 
      requiredMethods.every(method => typeof obj[method] === 'function')
    );
  }

  /**
   * Helper to get list of missing state methods for error reporting
   */
  private getMissingStateMethods(obj: any): string[] {
    const requiredMethods = [
      'setTransformationEnabled',
      'setTransformationOptions',
      'getParentState',
      'getVariable',
      'setVariable',
      'createChildState',
      'mergeChildState',
      'clone',
      'getStateId',
      'getCurrentFilePath',
      'setCurrentFilePath',
      'getTextVar',
      'getDataVar',
      'hasVariable',
      'getAllTextVars',
      'getAllDataVars',
      'getAllPathVars',
      'getAllCommands'
    ];

    return requiredMethods.filter(method => typeof obj[method] !== 'function');
  }

  /**
   * Process multiple directives in sequence
   * @returns The final state after processing all directives
   */
  async processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveProcessingContext): Promise<IStateService> {
    this.ensureInitialized();
    // Initialize with IStateService - Handle potential undefined parentContext.state
    let currentState: IStateService = parentContext?.state?.clone() || this.stateService!.createChildState();

    for (const node of nodes) {
      // Get file path from the state within the PARENT context if available, otherwise from current loop state
      const currentFilePath = parentContext?.state?.getCurrentFilePath() ?? currentState.getCurrentFilePath() ?? undefined;
      const parentLoopState = currentState; // Keep track of the state before processing the node
      // Derive working directory using pathService
      const workingDirectory = currentFilePath ? this.pathService!.dirname(currentFilePath) : process.cwd();

      // Create state for this specific node processing
      const nodeState: IStateService = parentLoopState.createChildState();
      if (currentFilePath) {
        nodeState.setCurrentFilePath(currentFilePath);
      }

      // Create contexts
      const resolutionContext = ResolutionContextFactory.create(nodeState, currentFilePath);
      const formattingContext: OutputFormattingContext = { 
          isOutputLiteral: nodeState.isTransformationEnabled?.() || false,
          contextType: 'block', 
          nodeType: node.type,
          atLineStart: true, 
          atLineEnd: false 
      };
      let executionContext: ExecutionContext | undefined = undefined;
      if (node.kind === 'run') {
        executionContext = {
          cwd: workingDirectory,
        };
      }

      const nodeProcessingContext: DirectiveProcessingContext = {
        state: nodeState,
        resolutionContext: resolutionContext,
        formattingContext: formattingContext,
        executionContext: executionContext,
        directiveNode: node,
      };

      try {
        // handleDirective now returns DirectiveResult { stateChanges?, replacement? }
        const result = await this.handleDirective(node, nodeProcessingContext);

        // Merge the node's modified state back into the loop's current state
        currentState.mergeChildState(nodeProcessingContext.state); 

        // NOTE: Replacement node handling is deferred to InterpreterService

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown directive processing error';
        const code = (error instanceof DirectiveError) ? error.code : DirectiveErrorCode.EXECUTION_FAILED;
        // Create simplified context for error details
        const errorContext: Partial<DirectiveProcessingContext> = {
           state: nodeState, // Use nodeState here
           resolutionContext: resolutionContext,
           // Include other parts if needed
        };
        // Pass correct details structure
        // Get currentFilePath from the captured context state
        const errorFilePath = errorContext.state?.getCurrentFilePath() ?? undefined;
        const errorLocation: CoreLocation | undefined = node.location ? { 
            start: node.location.start, 
            end: node.location.end, 
            filePath: errorFilePath // Use path from context
        } : undefined;
        const errorDetails = { 
            node, 
            context: errorContext, 
            location: errorLocation, // Use 'location' key
            cause: error instanceof Error ? error : undefined 
        };
        throw new DirectiveError(
          message,
          node.kind,
          code,
          errorDetails
        );
      }
    }

    return currentState;
  }

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean {
    return this.handlers.has(kind);
  }

  /**
   * Validate a directive node
   */
  async validateDirective(node: DirectiveNode): Promise<void> {
    try {
      await this.validationService!.validate(node);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));
      
      this.logger.error('Failed to validate directive', {
        kind: node.kind,
        location: node.location,
        error: errorForLog
      });
      
      throw new DirectiveError(
        errorMessage,
        node.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node
        }
      );
    }
  }

  /**
   * Create a child context for nested directives
   */
  public createChildContext(parentContext: DirectiveProcessingContext, filePath: string): DirectiveProcessingContext {
    const childState = parentContext.state.createChildState();
    if (filePath) {
      childState.setCurrentFilePath(filePath);
    }
    
    const resolutionContext = {
      ...parentContext.resolutionContext,
      state: childState, // Pass the new child state
      currentFilePath: filePath
    };
    
    const formattingContext = {
      isOutputLiteral: parentContext.formattingContext?.isOutputLiteral ?? childState.isTransformationEnabled(),
      parentContext: parentContext.formattingContext,
      contextType: (parentContext.formattingContext?.contextType || 'block') as 'inline' | 'block',
      nodeType: parentContext.formattingContext?.nodeType || 'Text',
      atLineStart: parentContext.formattingContext?.atLineStart,
      atLineEnd: parentContext.formattingContext?.atLineEnd
    };

    // Derive workingDirectory from parent state's file path
    const parentFilePath = parentContext.state.getCurrentFilePath();
    const workingDirectory = parentFilePath ? this.pathService!.dirname(parentFilePath) : process.cwd();
    
    // Return the complete child context - remove parentState, currentFilePath, workingDirectory
    // as they are within state or other context objects
    return {
      state: childState,
      resolutionContext,
      formattingContext,
      directiveNode: parentContext.directiveNode // Pass parent node? Or should this be null/new? Needs review.
                                                 // For now, keep parent node as placeholder.
    };
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new DirectiveError(
        'DirectiveService must be initialized before use',
        'initialization',
        DirectiveErrorCode.INVALID_CONTEXT
      );
    }
  }

  // Simplified updateInterpreterService - assuming client is primary
  updateInterpreterService(_interpreterService: any): void {
    // This might need more complex logic if direct service is still used
    this.logger.debug('updateInterpreterService called (currently no-op)');
  }
  
  /**
   * Process a single directive node
   * @deprecated Use processDirectives for clearer context handling
   */
  async processDirective(node: DirectiveNode, parentContext?: DirectiveProcessingContext): Promise<IStateService> {
    this.logger.warn('processDirective is deprecated, use processDirectives');
    return this.processDirectives([node], parentContext);
  }
} 