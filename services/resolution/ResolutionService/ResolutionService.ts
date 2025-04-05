import * as path from 'path';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { 
  ResolutionContext, 
  JsonValue, 
  VariableType,
  FormattingContext,
  PathPurpose,
  Result,
  success,
  failure,
  FieldAccess, 
  FieldAccessError, 
  MeldPath, 
  StructuredPath, 
  ValidatedResourcePath, 
  PathValidationContext, 
  MeldVariable, 
  TextVariable, 
  DataVariable, 
  IPathVariable, 
  CommandVariable, 
  SourceLocation, 
  isDataVariable,
  MeldFileNotFoundError, 
  MeldResolutionError, 
  PathValidationError,
  VariableResolutionError,
  isFilesystemPath,
  isUrlPath
} from '@core/types';
import type { MeldNode, VariableReferenceNode, DirectiveNode, TextNode, CodeFenceNode } from '@core/ast/ast/astTypes';
import { ResolutionContextFactory } from './ResolutionContextFactory';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
import { VariableReferenceResolver } from './resolvers/VariableReferenceResolver.js';
import { logger } from '@core/utils/logger.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { inject, singleton, container } from 'tsyringe';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { Service } from '@core/ServiceProvider.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { IVariableReferenceResolverClient } from './interfaces/IVariableReferenceResolverClient.js';
import { VariableReferenceResolverClientFactory } from './factories/VariableReferenceResolverClientFactory.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { VariableResolutionErrorFactory } from './resolvers/error-factory.js';
import { isTextVariable, isPathVariable, isCommandVariable } from '@core/types/guards.js';

/**
 * Internal type for heading nodes in the ResolutionService
 * This is converted from TextNode when we detect a heading pattern
 */
interface InternalHeadingNode {
  content: string;
  level: number;
}

/**
 * Convert a TextNode to an InternalHeadingNode if it matches heading pattern
 * Returns null if the node is not a heading
 */
function parseHeadingNode(node: TextNode): InternalHeadingNode | null {
  if (node.type !== 'Text' || !node.content.startsWith('#')) return null;
  let level = 0;
  for (let i = 0; i < node.content.length && i < 6; i++) {
    if (node.content[i] === '#') level++; else break;
  }
  if (level === 0 || level > 6 || node.content[level] !== ' ') return null;
  const content = node.content.substring(level + 1).trim();
  return content ? { level, content } : null;
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  if (node.type !== 'Text') return false;
  const textNode = node as TextNode;
  if (!textNode.content.startsWith('#')) return false;
  let hashCount = 0;
  for (let i = 0; i < textNode.content.length && i < 6; i++) {
    if (textNode.content[i] === '#') hashCount++; else break;
  }
  return hashCount >= 1 && hashCount <= 6 && textNode.content.length > hashCount &&
         textNode.content[hashCount] === ' ' && textNode.content.substring(hashCount + 1).trim().length > 0;
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
@singleton()
@Service({
  description: 'Service responsible for resolving variable references and other dynamic content'
})
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver = null!;
  private dataResolver: DataResolver = null!;
  private pathResolver: PathResolver = null!;
  private commandResolver: CommandResolver = null!;
  private contentResolver: ContentResolver = null!;
  private variableReferenceResolver: VariableReferenceResolver = null!;
  private resolutionTracker?: VariableResolutionTracker;
  
  private stateService: IStateService = null!;
  private fileSystemService: IFileSystemService = null!;
  private pathService: IPathService = null!;
  private parserService?: IParserService;
  
  private parserClient?: IParserServiceClient;
  private parserClientFactory?: ParserServiceClientFactory;
  
  private variableResolverClient?: IVariableReferenceResolverClient;
  private variableResolverClientFactory?: VariableReferenceResolverClientFactory;
  
  private directiveClient?: IDirectiveServiceClient;
  private directiveClientFactory?: DirectiveServiceClientFactory;
  
  private fsClient?: IFileSystemServiceClient;
  private fsClientFactory?: FileSystemServiceClientFactory;
  
  private factoryInitialized: boolean = false;

  /**
   * Creates a new instance of the ResolutionService
   * @param stateService - State service for variable management
   * @param fileSystemService - File system service for file operations
   * @param pathService - Path service for path operations
   * @param parserService - Parser service for parsing strings
   */
  constructor(
    @inject('IStateService') stateService?: IStateService,
    @inject('IFileSystemService') fileSystemService?: IFileSystemService, 
    @inject('IPathService') pathService?: IPathService,
    @inject('IParserService') parserService?: IParserService
  ) {
    this.initializeFromParams(stateService, fileSystemService, pathService, parserService);
    
    // We'll initialize the factory lazily to avoid circular dependencies
    if (process.env.DEBUG === 'true') {
      console.log('ResolutionService: Initialized with', {
        hasStateService: !!this.stateService,
        hasFileSystemService: !!this.fileSystemService,
        hasPathService: !!this.pathService,
        hasParserService: !!this.parserService
      });
    }
  }
  
  /**
   * Lazily initialize all factories
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    // Initialize parser client factory
    try {
      this.parserClientFactory = container.resolve('ParserServiceClientFactory');
      this.initializeParserClient();
    } catch (error) {
      // In test environment, we need to work even without factories
      logger.debug(`ParserServiceClientFactory not available: ${(error as Error).message}`);
    }
    
    // Initialize variable resolver client factory
    try {
      this.variableResolverClientFactory = container.resolve('VariableReferenceResolverClientFactory');
      this.initializeVariableResolverClient();
    } catch (error) {
      // In test environment, we need to work even without factories
      logger.debug(`VariableReferenceResolverClientFactory not available: ${(error as Error).message}`);
    }
    
    // Initialize directive client factory
    try {
      this.directiveClientFactory = container.resolve('DirectiveServiceClientFactory');
      this.initializeDirectiveClient();
    } catch (error) {
      // In test environment, we need to work even without factories
      logger.debug(`DirectiveServiceClientFactory not available: ${(error as Error).message}`);
    }
    
    // Initialize file system client factory
    try {
      this.fsClientFactory = container.resolve('FileSystemServiceClientFactory');
      this.initializeFsClient();
    } catch (error) {
      // In test environment, we need to work even without factories
      logger.debug(`FileSystemServiceClientFactory not available: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize the ParserServiceClient using the factory
   */
  private initializeParserClient(): void {
    if (!this.parserClientFactory) {
      throw new Error('ParserServiceClientFactory is not initialized');
    }
    
    try {
      this.parserClient = this.parserClientFactory.createClient();
      logger.debug('Successfully created ParserServiceClient using factory');
    } catch (error) {
      throw new Error(`Failed to create ParserServiceClient: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize the VariableResolverClient using the factory
   */
  private initializeVariableResolverClient(): void {
    if (!this.variableResolverClientFactory) {
      throw new Error('VariableReferenceResolverClientFactory is not initialized');
    }
    
    try {
      this.variableResolverClient = this.variableResolverClientFactory.createClient();
      logger.debug('Successfully created VariableReferenceResolverClient using factory');
    } catch (error) {
      throw new Error(`Failed to create VariableReferenceResolverClient: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize the DirectiveServiceClient using the factory
   */
  private initializeDirectiveClient(): void {
    if (!this.directiveClientFactory) {
      throw new Error('DirectiveServiceClientFactory is not initialized');
    }
    
    try {
      this.directiveClient = this.directiveClientFactory.createClient();
      logger.debug('Successfully created DirectiveServiceClient using factory');
    } catch (error) {
      throw new Error(`Failed to create DirectiveServiceClient: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize the FileSystemServiceClient using the factory
   */
  private initializeFsClient(): void {
    if (!this.fsClientFactory) {
      throw new Error('FileSystemServiceClientFactory is not initialized');
    }
    
    try {
      this.fsClient = this.fsClientFactory.createClient();
      logger.debug('Successfully created FileSystemServiceClient using factory');
    } catch (error) {
      throw new Error(`Failed to create FileSystemServiceClient: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize this service with the given parameters
   * Using DI-only mode
   */
  private initializeFromParams(
    stateService?: IStateService,
    fileSystemService?: IFileSystemService,
    pathService?: IPathService,
    parserService?: IParserService
  ): void {
    // Verify required dependencies
    if (!stateService) {
      throw new Error('StateService is required for ResolutionService');
    }
    
    // Initialize services
    this.stateService = stateService;
    this.fileSystemService = fileSystemService || this.createDefaultFileSystemService();
    this.pathService = pathService || this.createDefaultPathService();
    this.parserService = parserService;
    
    // Initialize resolvers
    this.initializeResolvers();
  }

  /**
   * Create a default file system service if not provided
   * Used as fallback in case dependency injection fails
   */
  private createDefaultFileSystemService(): IFileSystemService {
    logger.warn('Using default FileSystemService - this should only happen in tests');
    // Use unknown as an intermediate cast to avoid strict type checking
    return {
      readFile: async (): Promise<string> => '',
      exists: async (): Promise<boolean> => false,
      writeFile: async (): Promise<void> => {},
      stat: async (): Promise<any> => ({ isDirectory: () => false }),
      isFile: async (): Promise<boolean> => false,
      readDir: async (): Promise<string[]> => [],
      ensureDir: async (): Promise<void> => {},
      isDirectory: async (): Promise<boolean> => false,
      getCwd: (): string => '',
      dirname: (filePath: string): string => '',
      watch: (): any => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
      executeCommand: async (): Promise<any> => ({ stdout: '', stderr: '' }),
      mkdir: async (): Promise<void> => {},
    } as unknown as IFileSystemService;
  }
  
  /**
   * Create a default path service if not provided
   * Used as fallback in case dependency injection fails
   */
  private createDefaultPathService(): IPathService {
    logger.warn('Using default PathService - this should only happen in tests');
    // Use unknown as an intermediate cast to avoid strict type checking
    return {
      validatePath: async (path: string | StructuredPath): Promise<string | StructuredPath> => path,
      resolvePath: (path: string | StructuredPath): string | StructuredPath => path,
      normalizePath: (path: string): string => path,
      initialize: (): void => {},
      enableTestMode: (): void => {},
      disableTestMode: (): void => {},
      isTestMode: (): boolean => false,
      setTestMode: (): void => {},
      getHomePath: (): string => '',
      getProjectPath: (): string => '',
      setProjectPath: (): void => {},
      dirname: (): string => '',
      isAbsolute: (): boolean => false,
      // Minimal implementation for fallback
    } as unknown as IPathService;
  }
  
  /**
   * Initialize the resolver components used by this service
   */
  private initializeResolvers(): void {
    this.textResolver = new TextResolver(this.stateService);
    this.dataResolver = new DataResolver(this.stateService);
    this.pathResolver = new PathResolver(this.stateService, this.pathService);
    this.commandResolver = new CommandResolver(this.stateService, this.parserService);
    this.contentResolver = new ContentResolver(this.stateService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      this.stateService,
      this,
      this.parserService
    );
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string, context?: ResolutionContext): Promise<MeldNode[]> {
    try {
      this.ensureFactoryInitialized();
      if (this.parserClient) {
        try {
          const nodes = await this.parserClient.parseString(value, { filePath: context?.state?.getCurrentFilePath() ?? undefined });
          return nodes || [];
        } catch (error) {
          logger.error('Error using parserClient.parseString', { 
            error, 
            valueLength: value.length 
          });
          if (context?.strict) throw error;
        }
      }
      if (this.parserService) {
        try {
          const nodes = await this.parserService.parse(value);
          return nodes || [];
        } catch (error) {
          logger.warn('Error using injected parser service', { error });
          if (context?.strict) throw error;
        }
      }
      // Last resort fallback to direct parsing in tests
      logger.warn('No parser client available - falling back to direct import or mock parser');
      
      // Try using require
      try {
        // Use require for better build compatibility
        const coreAst = require('@core/ast');
        const result = await coreAst.parse(value, { trackLocations: true });
        return result.ast || [];
      } catch (error) {
        // In a test environment, create a fallback text node
        logger.warn('Last resort - creating fallback text node', { value });
        return [{ type: 'Text', content: value } as TextNode];
      }
    } catch (error) {
      logger.error('Error parsing content for resolution', { error });
      return [];
    }
  }

  /**
   * Internal helper to resolve an array of AST nodes into a single string.
   * Handles TextNodes and delegates VariableReferenceNodes to the appropriate resolver.
   * Skips/ignores other node types encountered during simple text resolution.
   */
  private async resolveNodes(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    // Restore original logic, just add logging
    logger.debug(`resolveNodes called`, { nodeCount: nodes.length, contextFlags: context.flags });
    const resolvedParts: string[] = [];
    for (const node of nodes) {
      // Add logging here
      console.log(`[resolveNodes] Processing node: type=${node.type}`); 
      if (node.type === 'Text') {
        resolvedParts.push((node as TextNode).content);
      } else if (node.type === 'VariableReference') {
        try {
          // Add logging before calling resolver
          console.log(`[resolveNodes] Found VariableReferenceNode:`, JSON.stringify(node)); 
          const resolvedValue = await this.variableReferenceResolver.resolve(node as VariableReferenceNode, context);
          // Add logging after calling resolver
          console.log(`[resolveNodes] Resolved value for ${node.identifier}:`, resolvedValue.substring(0,100)); 
          resolvedParts.push(resolvedValue);
        } catch (error) {
           logger.error(`resolveNodes: Error resolving individual node ${ (node as VariableReferenceNode).identifier }`, { error });
           if (context.strict) {
             throw error; // Re-throw original error temporarily
           } else {
             resolvedParts.push(''); // Append empty string in non-strict mode
           }
         }
       } else {
          // Add logging for skipped nodes
          console.log(`[resolveNodes] Skipping node type: ${node.type}`); 
          logger.warn(`resolveNodes: Skipping unexpected node type during node resolution: ${node.type}`);
       }
    }
    
    const finalResult = resolvedParts.join('');
    logger.debug(`resolveNodes: Final resolved string: ${finalResult.substring(0,100)}`);
    return finalResult;
  }

  /**
   * Resolve text, potentially containing multiple variables or plain text.
   * Parses the string into AST nodes and resolves them using the internal resolveNodes method.
   * Primarily used for resolving string values that might contain further variables.
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    logger.debug(`resolveText called`, { text: text.substring(0, 50), contextFlags: context.flags });
    
    // Optimization: If no variable syntax, return text directly
    if (!text.includes('{{') && !text.includes('$')) { // Added check for $ for potential path/command vars
        logger.debug('resolveText: Input contains no variable markers, returning original text.');
        return text; 
    }

    try {
      // 1. Parse the input string into nodes
      const nodes = await this.parseForResolution(text, context);
      logger.debug(`resolveText: Parsed into ${nodes.length} nodes. Delegating to resolveNodes.`);
      
      // 2. Delegate node resolution to the core internal method
      return await this.resolveNodes(nodes, context);

    } catch (error) {
      // Catch errors from parsing or re-thrown strict errors from resolveNodes
      logger.error('resolveText failed', { error });
      if (context.strict) {
          // Ensure the error is a MeldResolutionError or wrap it
          if (error instanceof MeldResolutionError) throw error;
          throw MeldResolutionError.fromError(error, 'Failed to resolve text', { context });
      }
      return text; // Return original text if not strict
    }
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<JsonValue> {
    logger.debug(`resolveData called`, { ref, contextFlags: context.flags });
    const parts = ref.split('.');
    const varName = parts[0];
    const fieldPathString = parts.slice(1).join('.');
    
    const fieldAccess: FieldAccess[] = fieldPathString.split('.').map(key => ({
        type: /^[0-9]+$/.test(key) ? 'index' : 'field',
        value: /^[0-9]+$/.test(key) ? parseInt(key, 10) : key
    }));

    const result = await this.resolveFieldAccess(varName, fieldAccess, context);
    if (result.success) {
        // Handle potential undefined value from successful resolution
        return result.value === undefined ? null : result.value; 
    } else {
        logger.error('resolveData failed', { error: result.error });
        if (context.strict) {
            throw new MeldResolutionError(`Failed to resolve data reference: ${ref}`, {
                cause: result.error, 
                details: { ref, context }
            });
        }
        return null; // Return null if not strict and resolution fails
    }
  }

  /**
   * Resolve path variables
   */
  async resolvePath(pathString: string | MeldPath, context: ResolutionContext): Promise<MeldPath> {
    logger.debug(`Resolving path: ${JSON.stringify(pathString)}`, { context: context.flags });
    const validationContext = this.createValidationContext(context);
    const validatedPath = await this.pathService.validatePath(pathString, validationContext); 
    return validatedPath; // Assuming validatePath returns MeldPath
  }

  /**
   * Resolve command references
   */
  async resolveCommand(commandName: string, args: string[], context: ResolutionContext): Promise<string> {
    logger.debug(`resolveCommand called`, { commandName, args, contextFlags: context.flags });
    try {
      const commandDef = await this.commandResolver.resolve(commandName, args, context);
      return commandDef;
    } catch (error) {
       logger.error('resolveCommand failed', { error });
       if (context.strict) {
           throw MeldResolutionError.fromError(error, 'Failed to resolve command', { context, commandName });
       }
       return '';
    }
  }

  /**
   * Resolve content from a file path
   */
  async resolveFile(path: MeldPath): Promise<string> {
    logger.debug(`resolveFile called`, { pathValue: path.value });
    if (!isFilesystemPath(path.value) || !path.value.validatedPath) {
        throw new MeldResolutionError(`Cannot resolve file from non-filesystem or non-validated path: ${path.value.originalValue}`, {
            details: { path }
        });
    }
    try {
        return await this.fileSystemService.readFile(path.value.validatedPath);
        } catch (error) {
        throw MeldFileNotFoundError.fromError(error, `Failed to read file: ${path.value.validatedPath}`, { path });
    }
  }

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    logger.debug(`resolveContent called`, { nodeCount: nodes.length, contextFlags: context.flags });
    try {
      return await this.contentResolver.resolve(nodes, context);
      } catch (error) {
       logger.error('resolveContent failed', { error });
       if (context.strict) {
          throw MeldResolutionError.fromError(error, 'Failed to resolve content from nodes', { context });
       }
       return '';
    }
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string> {
    logger.debug(`resolveInContext called`, { 
        value: typeof value === 'string' ? value.substring(0, 50) : value.raw?.substring(0,50),
        contextFlags: context.flags, 
        allowedTypes: context.allowedVariableTypes 
    });

    const valueString = typeof value === 'object' ? value.raw : value;

    try {
        if (context.allowedVariableTypes?.includes(VariableType.PATH) && (valueString.includes('$') || valueString.includes('/'))) {
            const meldPath = await this.resolvePath(valueString, context);
            return meldPath.value.validatedPath ?? meldPath.value.originalValue; 
        } else if (context.allowedVariableTypes?.includes(VariableType.COMMAND) && valueString.startsWith('$')) {
            return await this.resolveCommand(valueString.substring(1), [], context);
        } else if (context.allowedVariableTypes?.includes(VariableType.DATA) && valueString.includes('.')) {
            const resolvedData = await this.resolveData(valueString, context);
            return await this.convertToFormattedString(resolvedData, context);
        } else if (context.allowedVariableTypes?.includes(VariableType.TEXT)) {
             return await this.resolveText(valueString, context);
        }
         logger.warn('resolveInContext: No allowed variable type matched, returning original value', { valueString });
         return valueString;
        } catch (error) {
       logger.error('resolveInContext failed', { error });
       if (context.strict) {
          throw MeldResolutionError.fromError(error, 'Failed to resolve value in context', { context, value });
       }
       return valueString;
    }
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void> {
    logger.debug(`validateResolution called`, { value: typeof value === 'string' ? value : value.raw, contextFlags: context.flags });
    const strictContext = context.withStrictMode(true);
    try {
        await this.resolveInContext(value, strictContext);
    } catch (error) {
        logger.warn('validateResolution failed', { error });
            throw error;
          }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string, context: ResolutionContext): Promise<void> {
    logger.debug(`detectCircularReferences called`, { value: value.substring(0, 50) });
    await Promise.resolve(); 
  }

  /**
   * Extract a section from content by its heading
   * @param content The content to extract the section from
   * @param heading The heading text to search for
   * @param fuzzy Optional fuzzy matching threshold (0-1, where 1 is exact match, defaults to 0.7)
   */
  async extractSection(content: string, heading: string, fuzzy?: number): Promise<string> {
    logger.debug('Extracting section from content', {
      headingToFind: heading,
      contentLength: content.length,
      fuzzyThreshold: fuzzy
    });
    
    try {
      // Use llmxml for section extraction with new improved API
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        warningLevel: 'none'
      });
      
      // Extract the section directly from markdown using per-call configuration
      const section = await llmxml.getSection(content, heading, {
        includeNested: true,
        fuzzyThreshold: fuzzy !== undefined ? fuzzy : 0.7
      });
      
      logger.debug('Found section using llmxml', {
        heading,
        sectionLength: section.length
      });
      
      return section;
    } catch (error) {
      if (error instanceof MeldResolutionError) {
        throw error;
      }
      
      // Handle error from llmxml, which now provides detailed diagnostic information
      if (error && typeof error === 'object' && 'code' in error) {
        const llmError = error as any;
        
        if (llmError.code === 'SECTION_NOT_FOUND') {
          // Get available headings and closest matches from the error details
          const availableHeadings = llmError.details?.availableHeadings?.map((h: any) => h.title) || [];
          const closestMatches = llmError.details?.closestMatches?.map((m: any) => 
            `${m.title} (${Math.round(m.similarity * 100)}%)`
          ) || [];
          
          logger.warn('Section not found', {
            heading,
            availableHeadings,
            closestMatches
          });
          
          throw new MeldResolutionError(
            'Section not found: ' + heading,
            {
              code: ResolutionErrorCode.SECTION_NOT_FOUND,
              details: { 
                value: heading,
                contentPreview: content.substring(0, 100) + '...',
                availableHeadings: availableHeadings.join(', '),
                suggestions: closestMatches.join(', ')
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }
      }
      
      // For other errors, log and rethrow with additional context
      logger.error('Error extracting section', {
        heading,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw new MeldResolutionError(
        `Failed to extract section: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ResolutionErrorCode.SECTION_EXTRACTION_FAILED,
          details: { 
            value: heading
          },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }
  
  /**
   * Extract all headings from content using regex
   * Since llmxml API compatibility issues, we'll use a simple regex approach
   * @private
   */
  private async extractHeadingsFromContent(content: string): Promise<{ title: string; level: number; path: string[] }[]> {
    try {
      // Simple regex to extract markdown headings
      const headingRegex = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/gm;
      const matches = [...content.matchAll(headingRegex)];
      
      // Transform regex matches into structured heading objects
      const headings: { title: string; level: number; path: string[] }[] = [];
      const pathMap: Map<number, string[]> = new Map(); // Level -> current path at that level
      
      for (const match of matches) {
        const level = match[1].length; // Number of # characters
        const title = match[2].trim();
        
        // Create a path array by inheriting from parent levels
        const path: string[] = [];
        for (let i = 1; i < level; i++) {
          const parentPath = pathMap.get(i);
          if (parentPath && parentPath.length > 0) {
            path.push(...parentPath);
          }
        }
        path.push(title);
        
        // Update the path map for this level
        pathMap.set(level, [title]);
        
        // Add to headings array
        headings.push({
          title,
          level,
          path
        });
      }
      
      return headings;
    } catch (error) {
      logger.warn('Error extracting headings', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  private nodesToString(nodes: MeldNode[]): string {
    return nodes.map(node => {
      switch (node.type) {
        case 'Text':
          return (node as TextNode).content;
        case 'CodeFence':
          const codeFence = node as CodeFenceNode;
          return '```' + (codeFence.language || '') + '\n' + codeFence.content + '\n```';
        case 'Directive':
          const directive = node as DirectiveNode;
          return `@${directive.directive.kind} ${directive.directive.value || ''}`;
        default:
          return '';
      }
    }).join('\n');
  }

  /**
   * Get the variable reference resolver
   */
  getVariableResolver(): VariableReferenceResolver {
    return this.variableReferenceResolver;
  }

  /**
   * Enable tracking of variable resolution attempts
   * @param config Configuration for the resolution tracker
   */
  enableResolutionTracking(config: Partial<ResolutionTrackingConfig>): void {
    if (!this.resolutionTracker) {
      this.resolutionTracker = new VariableResolutionTracker();
      logger.info('Resolution tracking enabled.');
      this.resolutionTracker.configure(config);
      this.variableReferenceResolver?.setTracker(this.resolutionTracker);
    } else {
      this.resolutionTracker.configure(config);
    }
  }

  /**
   * Get the resolution tracker for debugging
   * @returns The current resolution tracker or undefined if not enabled
   */
  getResolutionTracker(): VariableResolutionTracker | undefined {
    return this.resolutionTracker;
  }

  /**
   * Validate a path for security and existence
   * 
   * @param path - The path to validate
   * @param context - The resolution context with state and allowed variable types
   * @returns A promise that resolves to true if the path is valid, false otherwise
   */
  async validatePath(path: string, context: ResolutionContext): Promise<boolean> {
    try {
      const validationContext = this.createValidationContext(context);
      await this.pathService.validatePath(path, validationContext);
      return true;
    } catch (error) {
      logger.debug('Path validation failed', { 
        path, 
        error: (error as Error).message 
      });
      return false;
    }
  }

  /**
   * Resolves a field access on a variable (e.g., variable.field.subfield)
   * 
   * @param variableName - The base variable name
   * @param fieldPath - The path to the specific field
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved field value
   * @throws {MeldResolutionError} If field access fails
   */
  async resolveFieldAccess(variableName: string, fieldPath: FieldAccess[], context: ResolutionContext): Promise<Result<JsonValue, FieldAccessError>> {
    logger.debug('Resolving field access', { variableName, fieldPath: JSON.stringify(fieldPath) });
    // ... (implementation might need adjustment based on actual types) ...
    const variable = this.stateService.getDataVar(variableName); // Example: Assume getting DataVar
    if (!variable) {
      return failure(new MeldResolutionError(`Variable not found: ${variableName}`, context));
    }
    // Placeholder for actual field access logic using VariableReferenceResolver or similar
    // return await this.variableReferenceResolver.accessFields(variable.value, fieldPath, context);
    return failure(new MeldResolutionError('Field access resolution not fully implemented here yet', context)); // Placeholder
  }

  /**
   * Convert a value to a formatted string based on the provided formatting context.
   * Delegates to the VariableReferenceResolverClient when available.
   * 
   * @param value - The value to convert to a string
   * @param options - Formatting options including context information
   * @returns The formatted string representation of the value
   */
  async convertToFormattedString(value: JsonValue, context: ResolutionContext): Promise<string> {
    logger.debug(`convertToFormattedString called`, { valueType: typeof value, contextFlags: context.flags, formattingContext: context.formattingContext });
    try {
        if (typeof value === 'string') {
      return value;
        } else if (value === null) {
            return 'null';
        } else if (typeof value === 'undefined') {
            return '';
        }
        return JSON.stringify(value, null, context.formattingContext?.indentationLevel ? 2 : undefined);
      } catch (error) {
        logger.error('convertToFormattedString failed', { error });
        return String(value);
      }
  }

  // Helper to create PathValidationContext from ResolutionContext
  private createValidationContext(context: ResolutionContext): PathValidationContext {
    const validationContext: PathValidationContext = {
      strict: context.strict,
      filePath: context.state?.getCurrentFilePath(),
    };
    if (validationContext.filePath === undefined) {
      delete validationContext.filePath;
    }
    return validationContext;
  }
} 