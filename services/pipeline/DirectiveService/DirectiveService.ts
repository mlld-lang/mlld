import type { DirectiveNode, DirectiveKind, DirectiveData } from '@core/syntax/types/index.js';
import { directiveLogger } from '@core/utils/logger.js';
import { IDirectiveService, IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { 
  ValidationServiceLike, 
  StateServiceLike, 
  PathServiceLike, 
  FileSystemLike, 
  ParserServiceLike, 
  InterpreterServiceLike,
  CircularityServiceLike, 
  ResolutionServiceLike,
  DirectiveServiceLike
} from '@core/shared-service-types.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import { Service } from '@core/ServiceProvider.js';
import { inject, delay, injectable } from 'tsyringe';
import { container } from 'tsyringe';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';
import { ResolutionServiceClientForDirectiveFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientForDirectiveFactory.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { DirectiveResult } from './interfaces/DirectiveTypes.js';

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
export class DirectiveService implements IDirectiveService, DirectiveServiceLike {
  private validationService!: ValidationServiceLike;
  private stateService!: StateServiceLike;
  private pathService!: PathServiceLike;
  private fileSystemService!: FileSystemLike;
  private parserService!: ParserServiceLike;
  private interpreterService?: InterpreterServiceLike; // Legacy reference
  private interpreterClient?: IInterpreterServiceClient; // Client from factory pattern
  private interpreterClientFactory?: InterpreterServiceClientFactory;
  private circularityService!: CircularityServiceLike;
  private resolutionService!: ResolutionServiceLike;
  private resolutionClient?: IResolutionServiceClientForDirective;
  private resolutionClientFactory?: ResolutionServiceClientForDirectiveFactory;
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
    @inject('IValidationService') validationService?: ValidationServiceLike,
    @inject('IStateService') stateService?: StateServiceLike,
    @inject('IPathService') pathService?: PathServiceLike,
    @inject('IFileSystemService') fileSystemService?: FileSystemLike,
    @inject('IParserService') parserService?: ParserServiceLike,
    @inject('InterpreterServiceClientFactory') interpreterServiceClientFactory?: InterpreterServiceClientFactory,
    @inject('ICircularityService') circularityService?: CircularityServiceLike,
    @inject('IResolutionService') resolutionService?: ResolutionServiceLike,
    @inject('DirectiveLogger') logger?: ILogger
  ) {
    // Always ensure we have a logger (both in DI and non-DI modes)
    this.logger = logger || directiveLogger;
    
    // Skip initialization if we're in DI mode and not all required services are provided
    if (validationService && stateService && pathService && fileSystemService && 
        parserService && circularityService && resolutionService) {
      this.initializeFromParams(
        validationService,
        stateService,
        pathService,
        fileSystemService,
        parserService,
        undefined, // Replaced by interpreterServiceClientFactory
        circularityService,
        resolutionService
      );
    } else {
      // In non-DI mode or when not fully initialized, just set up the logger
      this.logger.debug('DirectiveService constructed but not fully initialized, call initialize() manually');
    }
    
    // Initialize interpreter client factory
    this.interpreterClientFactory = interpreterServiceClientFactory;
    if (this.interpreterClientFactory) {
      this.interpreterFactoryInitialized = true;
      this.initializeInterpreterClient();
    }
    
    // Set initialized to true before registering handlers
    this.initialized = true;
    
    // Register default handlers
    this.registerDefaultHandlers();
  }
  
  /**
   * Initialize this service with the given parameters.
   * Uses DI-only mode for initialization.
   */
  private initializeFromParams(
    validationService?: ValidationServiceLike,
    stateService?: StateServiceLike,
    pathService?: PathServiceLike,
    fileSystemService?: FileSystemLike,
    parserService?: ParserServiceLike,
    interpreterServiceClientFactory?: InterpreterServiceClientFactory,
    circularityService?: CircularityServiceLike,
    resolutionService?: ResolutionServiceLike
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
    
    // Handle the circular dependency with InterpreterService
    // We'll set this later in updateInterpreterService()
    // but use the delay-injected service if available
    if (interpreterServiceClientFactory) {
      // Use setTimeout to ensure all services are fully initialized
      setTimeout(() => {
        this.registerDefaultHandlers();
        this.logger.debug('DirectiveService initialized via DI', {
          handlers: Array.from(this.handlers.keys())
        });
      }, 0);
    }
  }

  /**
   * Explicitly initialize the service with all required dependencies.
   * @deprecated This method is maintained for backward compatibility. 
   * The service is automatically initialized via dependency injection.
   */
  initialize(
    validationService: ValidationServiceLike,
    stateService: StateServiceLike,
    pathService: PathServiceLike,
    fileSystemService: FileSystemLike,
    parserService: ParserServiceLike,
    interpreterServiceClientFactory: InterpreterServiceClientFactory,
    circularityService: CircularityServiceLike,
    resolutionService: ResolutionServiceLike
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

    // Register default handlers
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
    // Add debug logging to help diagnose DI issues
    this.logger.debug('Registering default handlers', {
      hasValidationService: !!this.validationService,
      hasStateService: !!this.stateService,
      hasResolutionService: !!this.resolutionService,
      hasFileSystemService: !!this.fileSystemService,
      stateTransformationEnabled: this.stateService?.isTransformationEnabled?.(),
      state: this.stateService ? {
        hasTrackingService: !!(this.stateService as any).trackingService,
        hasEventService: !!(this.stateService as any).eventService
      } : 'undefined'
    });

    try {
      // Definition handlers
      const textHandler = new TextDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      );
      
      // Set FileSystemService if available
      if (this.fileSystemService) {
        textHandler.setFileSystemService(this.fileSystemService);
      }
      
      this.registerHandler(textHandler);

      this.registerHandler(
        new DataDirectiveHandler(
          this.validationService!,
          this.stateService!,
          this.resolutionService!
        )
      );
    } catch (error) {
      this.logger.error('Error registering directive handlers', { error });
      throw error;
    }

    this.registerHandler(
      new PathDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DefineDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    // Execution handlers
    this.registerHandler(
      new RunDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!
      )
    );

    // Create the EmbedDirectiveHandler
    // Note: We need to cast pathService to any to avoid type errors with IPathService
    this.registerHandler(
      new EmbedDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.circularityService!,
        this.fileSystemService!,
        this.parserService!,
        this.pathService! as any,
        this.interpreterClientFactory!,
        this.logger
      )
    );

    // Create the ImportDirectiveHandler
    // Note: We need to cast pathService to any to avoid type errors with IPathService
    this.registerHandler(
      new ImportDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!,
        this.parserService!,
        this.pathService! as any,
        this.interpreterClientFactory!,
        this.circularityService!
      )
    );
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
  public async handleDirective(node: DirectiveNode, context: DirectiveContext): Promise<StateServiceLike> {
    return this.processDirective(node, context);
  }

  /**
   * Process multiple directives in sequence
   */
  async processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<StateServiceLike> {
    let currentState = parentContext?.state?.clone() || this.stateService!.createChildState();
    
    // Inherit or create initial formatting context
    let currentFormattingContext = parentContext?.formattingContext ? { ...parentContext.formattingContext } : {
      isOutputLiteral: currentState.isTransformationEnabled(),
      contextType: 'block' as 'inline' | 'block',
      nodeType: 'Text'
    };

    for (const node of nodes) {
      // Create a new context with the current state as both parent and state
      // This ensures that subsequent directives can see variables defined by previous directives
      const nodeContext = {
        currentFilePath: parentContext?.currentFilePath || '',
        parentState: currentState,
        state: currentState.clone(),
        formattingContext: {
          ...currentFormattingContext,
          nodeType: node.type,
          parentContext: currentFormattingContext
        }
      } as DirectiveContext;

      // Process directive and get the updated state
      const result = await this.processDirective(node, nodeContext);
      
      // Update formatting context for the next directive
      // This ensures consistent newline handling between directives
      if (nodeContext.formattingContext) {
        currentFormattingContext = nodeContext.formattingContext;
      }
      
      // If transformation is enabled, we don't merge states since the directive
      // will be replaced with a text node and its state will be handled separately
      if (!currentState.isTransformationEnabled?.()) {
        // Update currentState directly with the result so next directives have access to it
        currentState = result;
      } else {
        // Even if transformation is enabled, we need to make sure variables defined in one directive
        // are available to subsequent directives
        if (result !== nodeContext.state) {
          // Only apply the new state if it actually changed (as a result of directive execution)
          currentState = result;
        }
      }
    }

    return currentState;
  }

  /**
   * Create execution context for a directive
   */
  private createContext(node: DirectiveNode, parentContext?: DirectiveContext): DirectiveContext {
    // Create a new state or clone parent state
    const state = parentContext?.state?.clone() || this.stateService!.createChildState();
    
    // Create a new resolution context or inherit from parent
    const resolutionContext = parentContext?.resolutionContext || {};
    
    // Set the default formatting context based on node type
    const formattingContext = {
      isOutputLiteral: state.isTransformationEnabled?.() || false,
      contextType: 'block' as 'inline' | 'block',
      nodeType: node.type,
      parentContext: parentContext?.formattingContext
    };
    
    // Determine working directory - use parent's or default to current directory
    const workingDirectory = parentContext?.workingDirectory || this.fileSystemService?.getCwd() || process.cwd();
    
    // Return the complete context
    return {
      state,
      parentState: parentContext?.state,
      currentFilePath: parentContext?.currentFilePath || this.stateService?.getCurrentFilePath() || '',
      workingDirectory,
      resolutionContext,
      formattingContext
    } as DirectiveContext;
  }

  /**
   * Update the interpreter service reference
   */
  updateInterpreterService(interpreterService: InterpreterServiceLike): void {
    this.interpreterService = interpreterService;
    this.logger.debug('Updated interpreter service reference');
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
  public createChildContext(parentContext: DirectiveContext, filePath: string): DirectiveContext {
    // Create a child state that inherits from parent
    const childState = parentContext.state.createChildState();
    
    // Set the file path in the child state
    if (filePath) {
      childState.setCurrentFilePath(filePath);
    }
    
    // Create a new resolution context - inherit from parent with updated state
    const resolutionContext = {
      ...(parentContext.resolutionContext || {}),
      state: childState,
      currentFilePath: filePath
    };
    
    // Inherit or create formatting context
    const formattingContext = {
      isOutputLiteral: parentContext.formattingContext?.isOutputLiteral ?? childState.isTransformationEnabled(),
      parentContext: parentContext.formattingContext,
      contextType: (parentContext.formattingContext?.contextType || 'block') as 'inline' | 'block',
      nodeType: parentContext.formattingContext?.nodeType || 'Text',
      atLineStart: parentContext.formattingContext?.atLineStart,
      atLineEnd: parentContext.formattingContext?.atLineEnd
    };
    
    // Return the complete child context
    return {
      state: childState,
      parentState: parentContext.state,
      currentFilePath: filePath,
      workingDirectory: parentContext.workingDirectory,
      resolutionContext,
      formattingContext
    } as DirectiveContext;
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }
  }

  private async handleTextDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;
    
    this.logger.debug('Processing text directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      await this.stateService!.setTextVar(directive.identifier, directive.value);
      
      this.logger.debug('Text directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));
      
      this.logger.error('Failed to process text directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });
      
      throw new MeldDirectiveError(
        errorMessage,
        'text',
        { location: node.location?.start }
      );
    }
  }

  private async handleDataDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;
    
    this.logger.debug('Processing data directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      let value = directive.value;
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }

      await this.stateService!.setDataVar(directive.identifier, value);
      
      this.logger.debug('Data directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));
      
      this.logger.error('Failed to process data directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });
      
      throw new MeldDirectiveError(
        errorMessage,
        'data',
        { location: node.location?.start }
      );
    }
  }

  private async handleImportDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;
    
    this.logger.debug('Processing import directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);
      
      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Import file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content, 
            directive.section, 
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.callInterpreterInterpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Import content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));
      
      this.logger.error('Failed to process import directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });
      
      throw new MeldDirectiveError(
        errorMessage,
        'import',
        { location: node.location?.start }
      );
    }
  }

  private async extractSection(
    content: string,
    section: string,
    fuzzyMatch: number
  ): Promise<string> {
    try {
      // Split content into lines
      const lines = content.split('\n');
      const headings: { title: string; line: number; level: number }[] = [];
      
      // Find all headings and their levels
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            title: match[2],
            line: i,
            level: match[1].length
          });
        }
      }

      // Find best matching heading
      let bestMatch: typeof headings[0] | undefined;
      let bestScore = 0;

      for (const heading of headings) {
        const score = this.calculateSimilarity(heading.title, section);
        if (score > fuzzyMatch && score > bestScore) {
          bestScore = score;
          bestMatch = heading;
        }
      }

      if (!bestMatch) {
        // Find closest match for error message
        let closestMatch = '';
        let closestScore = 0;
        for (const heading of headings) {
          const score = this.calculateSimilarity(heading.title, section);
          if (score > closestScore) {
            closestScore = score;
            closestMatch = heading.title;
          }
        }

        throw new MeldLLMXMLError(
          'Section not found',
          'SECTION_NOT_FOUND',
          { title: section, bestMatch: closestMatch }
        );
      }

      // Find the end of the section (next heading of same or higher level)
      let endLine = lines.length;
      for (let i = bestMatch.line + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+/);
        if (match && match[1].length <= bestMatch.level) {
          endLine = i;
          break;
        }
      }

      // Extract the section content
      return lines.slice(bestMatch.line, endLine).join('\n');
    } catch (error) {
      if (error instanceof MeldLLMXMLError) {
        throw error;
      }
      throw new MeldLLMXMLError(
        error instanceof Error ? error.message : 'Unknown error during section extraction',
        'PARSE_ERROR',
        error
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1.0 - matrix[len1][len2] / maxLen;
  }

  private async handleEmbedDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;
    
    this.logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      names: directive.names,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);
      
      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Embed file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content, 
            directive.section, 
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.callInterpreterInterpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Embed content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));
      
      this.logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });
      
      throw new MeldDirectiveError(
        errorMessage,
        'embed',
        { location: node.location?.start }
      );
    }
  }

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  public async processDirective(node: DirectiveNode, context: DirectiveContext): Promise<StateServiceLike> {
    // Add initialization check before any other processing
    if (!this.initialized) {
      throw new MeldDirectiveError(
        'DirectiveService must be initialized before use',
        'initialization',
        { severity: ErrorSeverity.Fatal }
      );
    }

    try {
      // Get the handler for this directive kind
      const { kind } = node.directive;
      const handler = this.handlers.get(kind);

      if (!handler) {
        throw new DirectiveError(
          `No handler found for directive: ${kind}`,
          kind,
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { node }
        );
      }

      // Validate directive before handling
      await this.validateDirective(node);

      // Execute the directive and handle both possible return types
      const result = await handler.execute(node, context);
      
      // If result is a DirectiveResult with formatting context, update context for propagation
      if ('state' in result) {
        // If the directive returned a formatting context, update the context
        if ((result as DirectiveResult).formattingContext && context.formattingContext) {
          Object.assign(context.formattingContext, (result as DirectiveResult).formattingContext);
        }
        return result.state;
      }
      
      // Otherwise, result is already an IStateService
      return result;
    } catch (error) {
      // If it's already a DirectiveError or MeldDirectiveError, just rethrow
      if (error instanceof DirectiveError || error instanceof MeldDirectiveError) {
        throw error;
      }

      // Simplify error messages for common cases
      let message = error instanceof Error ? error.message : String(error);
      let code = DirectiveErrorCode.EXECUTION_FAILED;
      let severity = ErrorSeverity.Recoverable;
      
      if (message.includes('file not found') || message.includes('no such file')) {
        message = `Referenced file not found: ${node.directive.path || node.directive.value}`;
        code = DirectiveErrorCode.FILE_NOT_FOUND;
        severity = DirectiveErrorSeverity[code];
      } else if (message.includes('circular import') || message.includes('circular reference')) {
        message = 'Circular import detected';
        code = DirectiveErrorCode.CIRCULAR_REFERENCE;
        severity = DirectiveErrorSeverity[code];
      } else if (message.includes('parameter count') || message.includes('wrong number of parameters')) {
        message = 'Invalid parameter count';
        code = DirectiveErrorCode.VALIDATION_FAILED;
        severity = DirectiveErrorSeverity[code];
      } else if (message.includes('invalid path') || message.includes('path validation failed')) {
        message = 'Invalid path';
        code = DirectiveErrorCode.VALIDATION_FAILED;
        severity = DirectiveErrorSeverity[code];
      }

      throw new DirectiveError(
        message,
        node.directive?.kind || 'unknown',
        code,
        { 
          node, 
          context,
          cause: error instanceof Error ? error : undefined 
        }
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
      this.resolutionClientFactory = container.resolve('ResolutionServiceClientForDirectiveFactory');
      this.initializeResolutionClient();
    } catch (error) {
      // Factory not available, will use direct reference
      this.logger.debug('ResolutionServiceClientForDirectiveFactory not available, using direct reference for resolution operations');
    }
  }
  
  /**
   * Initialize the ResolutionServiceClientForDirective using the factory
   */
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      this.logger.debug('Successfully created ResolutionServiceClientForDirective using factory');
    } catch (error) {
      this.logger.warn('Failed to create ResolutionServiceClientForDirective, falling back to direct reference', { error });
      this.resolutionClient = undefined;
    }
  }

  /**
   * Resolve text using the resolution service
   * @private
   */
  private async resolveText(text: string, context: DirectiveContext): Promise<string> {
    this.ensureFactoryInitialized();
    
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolveInContext(text, context.resolutionContext || {
          currentFilePath: context.currentFilePath,
          workingDirectory: context.workingDirectory
        } as ResolutionContext);
      } catch (error) {
        directiveLogger.warn('Error using resolutionClient.resolveInContext', { error });
      }
    }
    
    // Fallback to direct resolution service
    return this.resolutionService.resolveInContext(text, {
      currentFilePath: context.currentFilePath,
      workingDirectory: context.workingDirectory
    } as ResolutionContext);
  }

  /**
   * Resolve data using the resolution service
   * @private
   */
  private async resolveData(ref: string, context: DirectiveContext): Promise<any> {
    this.ensureFactoryInitialized();
    
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolveData(ref, context.resolutionContext || {
          currentFilePath: context.currentFilePath,
          workingDirectory: context.workingDirectory
        });
      } catch (error) {
        directiveLogger.warn('Error using resolutionClient.resolveData', { error });
      }
    }
    
    // Fallback to direct resolution service
    return this.resolutionService.resolveData(ref, {
      currentFilePath: context.currentFilePath,
      workingDirectory: context.workingDirectory
    });
  }

  /**
   * Resolve path using the resolution service
   * @private
   */
  private async resolvePath(path: string, context: DirectiveContext): Promise<string> {
    this.ensureFactoryInitialized();
    
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolvePath(path, context.resolutionContext || {
          currentFilePath: context.currentFilePath,
          workingDirectory: context.workingDirectory
        });
      } catch (error) {
        directiveLogger.warn('Error using resolutionClient.resolvePath', { error });
      }
    }
    
    // Fallback to direct resolution service
    return this.resolutionService.resolvePath(path, {
      currentFilePath: context.currentFilePath,
      workingDirectory: context.workingDirectory
    });
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
  private async callInterpreterInterpret(nodes: any[], options?: any): Promise<StateServiceLike> {
    // Ensure factory is initialized
    this.ensureInterpreterFactoryInitialized();
    
    // Try to use the client from factory first
    if (this.interpreterClient) {
      try {
        return await this.interpreterClient.interpret(nodes, options);
      } catch (error) {
        this.logger.warn('Error using interpreterClient.interpret, falling back to direct service', { error });
      }
    }
    
    // Fall back to direct service reference
    if (this.interpreterService) {
      return await this.interpreterService.interpret(nodes, options);
    }
    
    throw new Error('No interpreter service available');
  }
  
  /**
   * Calls the createChildContext method on the interpreter service
   * Uses the client if available, falls back to direct service reference
   */
  private async callInterpreterCreateChildContext(parentState: StateServiceLike, filePath?: string, options?: any): Promise<StateServiceLike> {
    // Ensure factory is initialized
    this.ensureInterpreterFactoryInitialized();
    
    // Try to use the client from factory first
    if (this.interpreterClient) {
      try {
        return await this.interpreterClient.createChildContext(parentState, filePath, options);
      } catch (error) {
        this.logger.warn('Error using interpreterClient.createChildContext, falling back to direct service', { error });
      }
    }
    
    // Fall back to direct service reference
    if (this.interpreterService) {
      return await this.interpreterService.createChildContext(parentState, filePath, options);
    }
    
    throw new Error('No interpreter service available');
  }
} 