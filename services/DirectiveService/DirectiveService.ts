import type { DirectiveNode, TextDirective, DataDirective, ImportDirective, EmbedDirective } from 'meld-spec';
import { directiveLogger as logger } from '@core/utils/logger';
import { IDirectiveService, IDirectiveHandler, DirectiveContext } from './IDirectiveService';
import { IValidationService } from '../ValidationService/IValidationService';
import { IStateService } from '../StateService/IStateService';
import { IPathService } from '../PathService/IPathService';
import { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { IParserService } from '../ParserService/IParserService';
import { IInterpreterService } from '../InterpreterService/IInterpreterService';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';
import { ICircularityService } from '../CircularityService/ICircularityService';
import { IResolutionService } from '../ResolutionService/IResolutionService';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError';

// Import handlers
import { TextDirectiveHandler } from './handlers/definition/TextDirectiveHandler';
import { DataDirectiveHandler } from './handlers/definition/DataDirectiveHandler';
import { PathDirectiveHandler } from './handlers/definition/PathDirectiveHandler';
import { RunDirectiveHandler } from './handlers/execution/RunDirectiveHandler';
import { EmbedDirectiveHandler } from './handlers/execution/EmbedDirectiveHandler';
import { ImportDirectiveHandler } from './handlers/execution/ImportDirectiveHandler';

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
export class DirectiveService implements IDirectiveService {
  private validationService?: IValidationService;
  private stateService?: IStateService;
  private pathService?: IPathService;
  private fileSystemService?: IFileSystemService;
  private parserService?: IParserService;
  private interpreterService?: IInterpreterService;
  private circularityService?: ICircularityService;
  private resolutionService?: IResolutionService;
  private initialized = false;

  private handlers: Map<string, IDirectiveHandler> = new Map();

  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void {
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.interpreterService = interpreterService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    this.initialized = true;

    // Register default handlers
    this.registerDefaultHandlers();

    logger.debug('DirectiveService initialized', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   */
  updateInterpreterService(interpreterService: IInterpreterService): void {
    this.interpreterService = interpreterService;
    logger.debug('Updated interpreter service reference');
  }

  /**
   * Register the default set of directive handlers
   */
  private registerDefaultHandlers(): void {
    // Definition handlers
    this.registerHandler(
      new TextDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DataDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new PathDirectiveHandler(
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
        this.stateService!
      )
    );

    this.registerHandler(
      new EmbedDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.circularityService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!
      )
    );

    this.registerHandler(
      new ImportDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.circularityService!
      )
    );
  }

  /**
   * Handle a directive node
   */
  async handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<void> {
    // 1. Validate directive type is capitalized
    if (node.type !== 'Directive') {
      throw new DirectiveError(
        'Invalid node type - must be "Directive"',
        node.directive.kind,
        DirectiveErrorCode.INVALID_NODE_TYPE,
        { node, context }
      );
    }

    // 2. Validate directive
    await this.validateDirective(node);

    // 3. Get appropriate handler
    const handler = this.handlers.get(node.directive.kind);
    if (!handler) {
      throw new DirectiveError(
        `No handler found for directive: ${node.directive.kind}`,
        node.directive.kind,
        DirectiveErrorCode.HANDLER_NOT_FOUND,
        { node, context }
      );
    }

    try {
      // 4. Execute handler
      await handler.execute(node, context);
    } catch (error) {
      // Wrap handler errors
      throw new DirectiveError(
        error.message,
        node.directive.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error
        }
      );
    }
  }

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void {
    this.handlers.set(handler.kind, handler);
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
    } catch (error) {
      throw new DirectiveError(
        error.message,
        node.directive.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node,
          cause: error
        }
      );
    }
  }

  /**
   * Create a child context for nested directives
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext {
    return {
      currentFilePath: filePath,
      parentState: parentContext.parentState
    };
  }

  async processDirective(node: DirectiveNode): Promise<void> {
    this.ensureInitialized();

    logger.debug('Processing directive', {
      kind: node.directive.kind,
      location: node.location
    });

    // Validate the directive
    this.validationService!.validate(node);

    // Get and execute the handler
    const handler = this.handlers.get(node.directive.kind);
    if (!handler) {
      throw new MeldDirectiveError(
        `No handler registered for directive kind: ${node.directive.kind}`,
        node.directive.kind,
        node.location?.start
      );
    }

    try {
      await handler.execute(node, { currentFilePath: node.location?.filePath, parentState: this.stateService });
      logger.debug('Directive processed successfully', {
        kind: node.directive.kind,
        location: node.location
      });
    } catch (error) {
      logger.error('Directive processing failed', {
        kind: node.directive.kind,
        location: node.location,
        error
      });
      throw error;
    }
  }

  async processDirectives(nodes: DirectiveNode[]): Promise<void> {
    for (const node of nodes) {
      await this.processDirective(node);
    }
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    this.ensureInitialized();
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }
  }

  private async handleTextDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive as TextDirective;
    
    logger.debug('Processing text directive', {
      name: directive.name,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      await this.stateService!.setTextVar(directive.name, directive.value);
      
      logger.debug('Text directive processed successfully', {
        name: directive.name,
        location: node.location
      });
    } catch (error) {
      logger.error('Failed to process text directive', {
        name: directive.name,
        location: node.location,
        error
      });
      throw new MeldDirectiveError(
        `Failed to set text variable: ${error.message}`,
        'text',
        node.location?.start
      );
    }
  }

  private async handleDataDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive as DataDirective;
    
    logger.debug('Processing data directive', {
      name: directive.name,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      let value = directive.value;
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }

      await this.stateService!.setDataVar(directive.name, value);
      
      logger.debug('Data directive processed successfully', {
        name: directive.name,
        location: node.location
      });
    } catch (error) {
      logger.error('Failed to process data directive', {
        name: directive.name,
        location: node.location,
        error
      });
      throw new MeldDirectiveError(
        `Failed to set data variable: ${error.message}`,
        'data',
        node.location?.start
      );
    }
  }

  private async handleImportDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive as ImportDirective;
    
    logger.debug('Processing import directive', {
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
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        logger.debug('Import content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error) {
      logger.error('Failed to process import directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error
      });
      throw new MeldDirectiveError(
        `Failed to import content: ${error.message}`,
        'import',
        node.location?.start
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
    const directive = node.directive as EmbedDirective;
    
    logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);
      
      // Check for circular imports (embeds can also cause cycles)
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Embed file not found: ${fullPath}`);
        }

        // Create a child state for the embed
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
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        logger.debug('Embed content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error) {
      logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error
      });
      throw new MeldDirectiveError(
        `Failed to embed content: ${error.message}`,
        'embed',
        node.location?.start
      );
    }
  }
} 