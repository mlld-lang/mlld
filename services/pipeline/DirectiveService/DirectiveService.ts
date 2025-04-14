import type { DirectiveNode, DirectiveKind, DirectiveData } from '@core/syntax/types/index.js';
import { directiveLogger } from '@core/utils/logger.js';
import { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { 
  ParserServiceLike, 
  InterpreterServiceLike,
  CircularityServiceLike, 
  InterpreterOptionsBase
} from '@core/shared-service-types.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import type { ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { Service } from '@core/ServiceProvider.js';
import { inject, delay, injectable } from 'tsyringe';
import { container } from 'tsyringe';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { DirectiveResult } from './interfaces/DirectiveTypes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { DirectiveProcessingContext, FormattingContext, ExecutionContext } from '@core/types/index.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';

// Import all handlers
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';

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

  private handlers: Map<string, IDirectiveHandler> = new Map();

  /**
   * Creates a new DirectiveService instance.
   * Uses dependency injection for service dependencies.
   * 
   * @param validationService Validation service for directives (injected)
   * @param stateService State service for managing variables (injected)
   * @param pathService Path service for handling file paths (injected)
   * @param fileSystemService File system service for file operations (injected)
   * @param parserService Parser service for parsing Meld files (injected)
   * @param interpreterServiceClientFactory Factory for creating interpreter clients (injected)
   * @param circularityService Circularity service for detecting circular imports (injected)
   * @param resolutionService Resolution service for variable resolution (injected)
   * @param logger Logger for directive operations (optional)
   */
  constructor(
    @inject('IValidationService') validationService?: IValidationService,
    @inject('IStateService') stateService?: IStateService,
    @inject('IPathService') private pathService?: IPathService,
    @inject('IFileSystemService') fileSystemService?: IFileSystemService,
    @inject('IParserService') parserService?: ParserServiceLike,
    @inject('InterpreterServiceClientFactory') interpreterServiceClientFactory?: InterpreterServiceClientFactory,
    @inject('ICircularityService') circularityService?: CircularityServiceLike,
    @inject('IResolutionService') resolutionService?: IResolutionService,
    @inject('DirectiveLogger') logger?: ILogger
  ) {
    this.logger = logger || directiveLogger;
    
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
    
    // Set initialized to true before registering handlers
    // this.initialized = true; 
    
    // Register default handlers
    // this.registerDefaultHandlers();
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
    this.registerDefaultHandlers();
        
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
    this.registerDefaultHandlers();

    this.logger.debug('DirectiveService initialized manually', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register all default directive handlers
   * This is public to allow tests to explicitly initialize handlers in both DI and non-DI modes
   */
  public registerDefaultHandlers(): void {
    // Add checks for required services before registering handlers that depend on them
    if (!this.validationService || !this.stateService || !this.resolutionService) {
        this.logger.warn('Skipping registration of definition handlers due to missing core services.');
        // Skip definition handlers if core services missing
    } else {
        // Definition handlers (require Validation, State, Resolution)
        try {
          // Check for FileSystemService needed by TextDirectiveHandler
          if (!this.fileSystemService) {
            this.logger.warn('FileSystemService not available for TextDirectiveHandler injection');
          }
          const textHandler = new TextDirectiveHandler(
            this.resolutionService,
            this.fileSystemService
          );
          this.registerHandler(textHandler);

          // Check for services needed by DataDirectiveHandler
          if (!this.fileSystemService) {
            this.logger.warn('FileSystemService not available for DataDirectiveHandler injection');
          } else if (!this.pathService) {
            this.logger.warn('PathService not available for DataDirectiveHandler injection');
          } else {
            const dataHandler = new DataDirectiveHandler(
              this.resolutionService,
              this.fileSystemService,
              this.pathService
            );
            this.registerHandler(dataHandler);
          }
          
          // Check for PathService needed by PathDirectiveHandler
          if (!this.pathService) {
             this.logger.warn('PathService not available for PathDirectiveHandler injection');
          }
          const pathHandler = new PathDirectiveHandler(
            this.validationService,
            this.resolutionService
          );
          this.registerHandler(pathHandler);

          const defineHandler = new DefineDirectiveHandler(
            this.validationService,
            this.resolutionService
          );
          this.registerHandler(defineHandler);
        } catch (error) {
          this.logger.error('Error registering definition directive handlers', { error });
        }
    }

    // Execution handlers (have additional dependencies)
    if (!this.fileSystemService) {
        this.logger.warn('Skipping registration of Run handler due to missing FileSystemService.');
    } else {
        try {
            const runHandler = new RunDirectiveHandler(
              this.validationService,
              this.resolutionService,
              this.fileSystemService
            );
            this.registerHandler(runHandler);
        } catch(error) {
            this.logger.error('Error registering Run directive handler', { error });
        }
    }

    if (!this.circularityService || !this.parserService || !this.pathService || !this.interpreterClientFactory) {
        this.logger.warn('Skipping registration of Embed/Import handlers due to missing dependencies.');
    } else {
        try {
            // Check for services needed by EmbedDirectiveHandler
            if (!this.fileSystemService) {
                this.logger.warn('Skipping Embed handler due to missing FileSystemService.');
            } else {
                const embedHandler = new EmbedDirectiveHandler(
                  this.validationService,
                  this.resolutionService,
                  this.circularityService,
                  this.fileSystemService,
                  this.pathService,
                  this.interpreterClientFactory,
                  this.logger
                );
                this.registerHandler(embedHandler);
            }
        } catch (error) {
             this.logger.error('Error registering Embed directive handler', { error });
        }

        try {
             // Check for services needed by ImportDirectiveHandler
            if (!this.circularityService || !this.parserService || !this.pathService || !this.interpreterClientFactory) {
                 this.logger.warn('Skipping Import handler due to missing dependencies.');
            } else {
                const importHandler = new ImportDirectiveHandler(
                  this.validationService,
                  this.resolutionService,
                  this.stateService,
                  this.fileSystemService,
                  this.parserService,
                  this.pathService,
                  this.interpreterClientFactory,
                  this.circularityService
                );
                this.registerHandler(importHandler);
            }
        } catch (error) {
             this.logger.error('Error registering Import directive handler', { error });
        }
    }

    this.logger.debug('Default handlers registration completed.', {
      registeredHandlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register a new directive handler
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
  public async handleDirective(node: DirectiveNode, context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    this.ensureInitialized();
    this.ensureFactoryInitialized(); // Ensure Resolution Client Factory is ready
    
    const kind = node.directive?.kind;
    if (!kind) {
      throw new DirectiveError('Directive node is missing kind', 'unknown', DirectiveErrorCode.VALIDATION_FAILED, { node });
    }

    const handler = this.handlers.get(kind);
    if (!handler) {
      throw new DirectiveError(`No handler registered for directive kind: ${kind}`, kind, DirectiveErrorCode.HANDLER_NOT_FOUND, { node, location: node.location });
    }

    // Explicitly cast the handler retrieved from the map
    const specificHandler = handler as IDirectiveHandler;

    try {
      // --- Create DirectiveProcessingContext --- 
      const state = context.state?.clone() || this.stateService!.createChildState();
      const currentFilePath = state.getCurrentFilePath() ?? undefined;
      const resolutionContext = ResolutionContextFactory.create(state, currentFilePath);
      const formattingContext: FormattingContext = { 
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
      
      // Use the specifically cast handler
      const result = await specificHandler.execute(processingContext); 
      
      // Handle result
      if (result && typeof result === 'object') {
        if ('replacement' in result && 'state' in result && result.state) {
          // It's a DirectiveResult, ensure state is IStateService
          if (!this.isStateService(result.state)) {
             throw new MeldDirectiveError('Invalid state object returned in DirectiveResult', kind, { code: DirectiveErrorCode.EXECUTION_FAILED });
          }
          return result;
        } else if (this.isStateService(result)) {
          // It's an IStateService
          return result;
        } else {
          throw new MeldDirectiveError('Invalid result type returned by directive handler', kind, { code: DirectiveErrorCode.EXECUTION_FAILED });
        }
      } else {
        throw new MeldDirectiveError('Invalid or null result returned by directive handler', kind, { code: DirectiveErrorCode.EXECUTION_FAILED });
      }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown directive processing error';
        const code = (error instanceof DirectiveError) ? error.code : DirectiveErrorCode.EXECUTION_FAILED;
        const simplifiedContext = { currentFilePath: context.state?.getCurrentFilePath() ?? undefined };

        throw new DirectiveError(
          message,
          kind,
          code,
          { node, context: simplifiedContext, cause: error instanceof Error ? error : undefined }
        );
    }
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
    // Ensure factory is initialized
    this.ensureInterpreterFactoryInitialized();
    
    // Try to use the client from factory first
    if (this.interpreterClient) {
      try {
        return await this.interpreterClient.interpret(nodes, options) as IStateService;
      } catch (error) {
        this.logger.warn('Error using interpreterClient.interpret, falling back to direct service', { error });
      }
    }
    
    // Fall back to direct service reference
    if (this.interpreterService) {
      return await this.interpreterService.interpret(nodes, options) as IStateService;
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
      throw new MeldError('InterpreterServiceClient not available for createChildContext');
    }
    // Pass arguments matching the client interface (parentState, filePath, options)
    const childStateLike = await this.interpreterClient.createChildContext(parentState, filePath, options);
    // Keep cast for now
    return childStateLike as IStateService; 
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
      const formattingContext: FormattingContext = { 
          isOutputLiteral: nodeState.isTransformationEnabled?.() || false,
          contextType: 'block', 
          nodeType: node.type,
          atLineStart: true, 
          atLineEnd: false 
      };
      let executionContext: ExecutionContext | undefined = undefined;
      if (node.directive.kind === 'run') {
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
        const result = await this.handleDirective(node, nodeProcessingContext);

        // Correctly handle return type
        let updatedState: IStateService;
        if (result && typeof result === 'object' && 'replacement' in result && 'state' in result) {
           // If it's a DirectiveResult, use its state
           updatedState = result.state;
        } else if (result && typeof result === 'object' && 'getVariable' in result) {
           // If it's directly an IStateService
           updatedState = result;
        } else {
           // Handle unexpected result type
            this.logger.error('Unexpected result type from handleDirective', { result });
            throw new DirectiveError('Invalid result from handler', node.directive.kind, DirectiveErrorCode.EXECUTION_FAILED, { node });
        }

        // Merge the updated state back into the current loop state
        currentState.mergeChildState(updatedState);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown directive processing error';
        const code = (error instanceof DirectiveError) ? error.code : DirectiveErrorCode.EXECUTION_FAILED;
        // Pass correct details structure
        const errorDetails = { 
            node, 
            context: { currentFilePath }, 
            cause: error instanceof Error ? error : undefined 
        };
        throw new DirectiveError(
          message,
          node.directive.kind,
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
        kind: node.directive.kind,
        location: node.location,
        error: errorForLog
      });
      
      throw new DirectiveError(
        errorMessage,
        node.directive.kind,
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
      // Correct call: message, kind, code, optional details
      throw new DirectiveError(
        'DirectiveService must be initialized before use',
        'initialization', // Placeholder kind
        DirectiveErrorCode.INVALID_CONTEXT
        // No details needed here
      );
    }
  }

  /**
   * Type guard to check if an object is an instance of IStateService
   * TODO: Improve this check - instanceof might not work with interfaces/DI. 
   * Relying on specific methods/properties might be better.
   */
  private isStateService(obj: any): obj is IStateService {
    return obj && typeof obj.getVariable === 'function' && typeof obj.clone === 'function'; // Example check
  }

  /**
   * Update the interpreter service reference
   * @deprecated Use interpreterServiceClientFactory instead
   */
  updateInterpreterService(interpreterService: any): void {
    this.logger.warn('DirectiveService.updateInterpreterService is deprecated and may be removed.');
    // This method is required by the interface but functionality might be obsolete.
    // If the internal this.interpreterService property is still used as a fallback,
    // uncomment the line below. Otherwise, this can be a true no-op.
    // this.interpreterService = interpreterService; 
  }

  /**
   * Process a single directive node, validating and executing it.
   * Required by IDirectiveService interface.
   */
  async processDirective(node: DirectiveNode, parentContext?: DirectiveProcessingContext): Promise<IStateService> {
    this.ensureInitialized();
    
    // Use current state if no parent context provided, or clone from parent
    const initialState = parentContext?.state?.clone() || this.stateService!.createChildState();
    
    // Create a processing context specific to this single node
    const currentFilePath = initialState.getCurrentFilePath() ?? undefined;
    const resolutionContext = ResolutionContextFactory.create(initialState, currentFilePath);
    const formattingContext: FormattingContext = { 
      isOutputLiteral: initialState.isTransformationEnabled(),
      contextType: 'block', 
      nodeType: node.type,
      atLineStart: true, 
      atLineEnd: false
    };
    let executionContext: ExecutionContext | undefined;
    const workingDirectory = currentFilePath ? this.pathService!.dirname(currentFilePath) : process.cwd();
    if (node.directive.kind === 'run') {
      executionContext = { cwd: workingDirectory };
    }
    
    const processingContext: DirectiveProcessingContext = {
        state: initialState,
        resolutionContext: resolutionContext,
        formattingContext: formattingContext,
        executionContext: executionContext,
        directiveNode: node
    };

    try {
      const result = await this.handleDirective(node, processingContext);
      
      // Extract the final state
      let finalState: IStateService;
      if (result && typeof result === 'object' && 'state' in result) {
        finalState = result.state;
      } else if (result && typeof result === 'object' && 'getVariable' in result) {
        finalState = result;
      } else {
        this.logger.error('Unexpected result type from handleDirective in processDirective', { result });
        throw new DirectiveError('Invalid result from handler', node.directive.kind ?? 'unknown', DirectiveErrorCode.EXECUTION_FAILED, { node });
      }
      return finalState;
    } catch (error) {
      this.logger.error(`Error processing single directive ${node.directive?.kind ?? 'unknown'}`, { error });
      if (error instanceof DirectiveError) throw error;
      throw new DirectiveError(
          `Failed to process directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
          node.directive?.kind ?? 'unknown',
          DirectiveErrorCode.EXECUTION_FAILED,
          { node, cause: error instanceof Error ? error : undefined }
      );
    }
  }
} 