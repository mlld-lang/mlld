import * as path from 'path';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { TextResolver } from '@services/resolution/ResolutionService/resolvers/TextResolver.js';
import { DataResolver } from '@services/resolution/ResolutionService/resolvers/DataResolver.js';
import { PathResolver } from '@services/resolution/ResolutionService/resolvers/PathResolver.js';
import { CommandResolver } from '@services/resolution/ResolutionService/resolvers/CommandResolver.js';
import { ContentResolver } from '@services/resolution/ResolutionService/resolvers/ContentResolver.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind, CodeFenceNode } from '@core/syntax/types/index.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, singleton, container } from 'tsyringe';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { Service } from '@core/ServiceProvider.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { VariableResolutionErrorFactory } from '@services/resolution/ResolutionService/resolvers/error-factory.js';

/**
 * Interface matching the StructuredPath expected from meld-spec
 */
interface StructuredPath {
  raw: string;
  structured: {
    segments: string[];
    variables?: {
      special?: string[];
      path?: string[];
    };
    cwd?: boolean;
  };
  normalized?: string;
}

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
  // Instead of using regex, check the AST properties
  if (!node.content.startsWith('#')) {
    return null;
  }
  
  // Count the number of # characters at the start
  let level = 0;
  for (let i = 0; i < node.content.length && i < 6; i++) {
    if (node.content[i] === '#') {
      level++;
    } else {
      break;
    }
  }
  
  // Validate level and check for space after #s
  if (level === 0 || level > 6 || node.content[level] !== ' ') {
    return null;
  }
  
  // Extract the content after the # characters
  const content = node.content.substring(level + 1).trim();
  
  if (!content) {
    return null;
  }
  
  return {
    level,
    content
  };
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  if (node.type !== 'Text') {
    return false;
  }
  
  const textNode = node as TextNode;
  
  // Must start with at least one # and at most 6
  if (!textNode.content.startsWith('#')) {
    return false;
  }
  
  // Count the number of # characters
  let hashCount = 0;
  for (let i = 0; i < textNode.content.length && i < 6; i++) {
    if (textNode.content[i] === '#') {
      hashCount++;
    } else {
      break;
    }
  }
  
  // Valid heading must have:
  // 1. Between 1-6 hash characters
  // 2. A space after the hash characters
  // 3. Content after the space
  return (
    hashCount >= 1 && 
    hashCount <= 6 && 
    textNode.content.length > hashCount &&
    textNode.content[hashCount] === ' ' &&
    textNode.content.substring(hashCount + 1).trim().length > 0
  );
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
    this.pathResolver = new PathResolver(this.stateService);
    this.commandResolver = new CommandResolver(this.stateService);
    this.contentResolver = new ContentResolver(this.stateService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      this.stateService,
      this
    );
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string): Promise<MeldNode[]> {
    try {
      // Ensure factory is initialized before trying to use it
      this.ensureFactoryInitialized();
      
      // Use the parser client if available
      if (this.parserClient) {
        try {
          const nodes = await this.parserClient.parseString(value);
          return nodes || [];
        } catch (error) {
          logger.error('Error using parserClient.parseString', { 
            error, 
            valueLength: value.length 
          });
        }
      }
      
      // Last resort fallback to direct parsing in tests
      logger.warn('No parser client available - falling back to direct import or mock parser');
      
      // Try using directly injected parser service if available (for tests)
      if (this.parserService) {
        try {
          const nodes = await this.parserService.parse(value);
          return nodes || [];
        } catch (error) {
          logger.warn('Error using injected parser service', { error });
        }
      }
      
      // Finally, try using require
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
   * Resolve text variables in a string
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    const nodes = await this.parseForResolution(text);
    return this.textResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<any> {
    const nodes = await this.parseForResolution(ref);
    return this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve path variables
   */
  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    const nodes = await this.parseForResolution(path);
    return this.pathResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve command references
   */
  async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'run',
        name: cmd,
        identifier: cmd,
        args
      }
    };
    return this.commandResolver.resolve(node, context);
  }

  /**
   * Resolve content from a file path
   */
  async resolveFile(path: string): Promise<string> {
    try {
      // Ensure factory is initialized
      this.ensureFactoryInitialized();
      
      // Try to use the file system client if available
      if (this.fsClient) {
        try {
          // The IFileSystemServiceClient interface doesn't include readFile
          // so we need to directly use the fileSystemService instead
          return await this.fileSystemService.readFile(path);
        } catch (error) {
          logger.warn('Error reading file with fileSystemService', { 
            error: error instanceof Error ? error.message : 'Unknown error', 
            path 
          });
        }
      }
      
      // Fall back to direct file system service
      return await this.fileSystemService.readFile(path);
    } catch (error) {
      throw new MeldFileNotFoundError(`Failed to read file: ${path}`, { 
        cause: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    if (!Array.isArray(nodes)) {
      // If a string path is provided, read the file
      const path = String(nodes);
      if (!await this.fileSystemService.exists(path)) {
        throw new MeldResolutionError(
          `File not found: ${path}`,
          {
            code: ResolutionErrorCode.INVALID_PATH,
            details: { value: path },
            severity: ErrorSeverity.Fatal
          }
        );
      }
      return this.fileSystemService.readFile(path);
    }

    // Otherwise, process the nodes
    return this.contentResolver.resolve(nodes, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string> {
    // Add debug logging for debugging path handling issues
    logger.debug('ResolutionService.resolveInContext', {
      value: typeof value === 'string' ? value : value.raw,
      allowedVariableTypes: context.allowedVariableTypes,
      pathValidation: context.pathValidation,
      stateExists: !!context.state,
      specialPathVars: context.state ? {
        PROJECTPATH: context.state.getPathVar('PROJECTPATH'),
        HOMEPATH: context.state.getPathVar('HOMEPATH')
      } : 'state not available'
    });

    // Handle structured path objects by delegating to the dedicated method
    if (typeof value === 'object' && value !== null && 'raw' in value) {
      return this.resolveStructuredPath(value, context);
    }

    // Handle string values
    if (typeof value === 'string') {
      // Check for special direct path variable references
      if (value === '$HOMEPATH' || value === '$~') {
        const homePath = context.state?.getPathVar('HOMEPATH') || this.stateService.getPathVar('HOMEPATH');
        return homePath || '';
      }
      
      if (value === '$PROJECTPATH' || value === '$.') {
        const projectPath = context.state?.getPathVar('PROJECTPATH') || this.stateService.getPathVar('PROJECTPATH');
        return projectPath || '';
      }
      
      // Check for command references in the format $command(args)
      const commandRegex = /^\$(\w+)\(([^)]*)\)$/;
      const commandMatch = value.match(commandRegex);
      
      if (commandMatch) {
        const [, cmdName, argsStr] = commandMatch;
        // Parse args, splitting by comma but respecting quoted strings
        const args = argsStr.split(',').map(arg => arg.trim());
        
        try {
          logger.debug('Resolving command reference', { cmdName, args });
          const result = await this.resolveCommand(cmdName, args, context);
          return result;
        } catch (error) {
          logger.warn('Command execution failed', { cmdName, args, error });
          // Fall back to the command name and args, joining with spaces
          return `${cmdName} ${args.join(' ')}`;
        }
      }
      
      // Try to parse the string as a path using the parser service
      try {
        // Only attempt parsing if the string contains path variable indicators
        if (value.includes('$.') || value.includes('$~') || value.includes('$/') || value.includes('$')) {
          const nodes = await this.parseForResolution(value);
          const pathNode = nodes.find(node => 
            (node as any).type === 'PathVar' || 
            (node.type === 'Directive' && (node as any).directive?.kind === 'path')
          );
          
          if (pathNode) {
            // Extract the structured path from the node
            let structPath: StructuredPath;
            
            if ((pathNode as any).type === 'PathVar' && (pathNode as any).value) {
              structPath = (pathNode as any).value as StructuredPath;
              // Recursive call with the structured path
              return this.resolveStructuredPath(structPath, context);
            } else if (pathNode.type === 'Directive') {
              const directiveNode = pathNode as any;
              if (directiveNode.directive.value && 
                  typeof directiveNode.directive.value === 'object' && 
                  'raw' in directiveNode.directive.value) {
                structPath = directiveNode.directive.value as StructuredPath;
                // Recursive call with the structured path
                return this.resolveStructuredPath(structPath, context);
              }
            }
          }
        }
      } catch (error) {
        // If parsing fails, fall back to variable resolution
        logger.debug('Path parsing failed, falling back to variable resolution', { 
          error: (error as Error).message
        });
      }
    }

    // Handle string values
    return this.resolveVariables(value as string, context);
  }
  
  /**
   * Resolve variables within a string value
   * @internal Used by resolveInContext
   */
  private async resolveVariables(value: string, context: ResolutionContext): Promise<string> {
    // Check if the string contains variable references
    if (value.includes('{{') || value.includes('${') || value.includes('$')) {
      logger.debug('Resolving variables in string:', { value });
      
      // Ensure factory is initialized before trying to use it
      this.ensureFactoryInitialized();
      
      // Try new approach first (factory pattern)
      if (this.variableResolverClient) {
        try {
          return await this.variableResolverClient.resolve(value, context);
        } catch (error) {
          logger.warn('Error using variableResolverClient.resolve, falling back to direct reference', { 
            error, 
            value 
          });
        }
      }
      
      // Fall back to direct reference
      return this.variableReferenceResolver.resolve(value, context);
    }
    
    return value;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void> {
    // Convert StructuredPath to string if needed
    const stringValue = typeof value === 'string' ? value : value.raw;
    
    // Parse the value to check for variable types
    const nodes = await this.parseForResolution(stringValue);

    for (const node of nodes) {
      if (node.type !== 'Directive') continue;

      const directiveNode = node as DirectiveNode;
      
      // Check if the directive type is allowed
      switch (directiveNode.directive.kind) {
        case 'text':
          if (!context.allowedVariableTypes.text) {
            const errorMessage = 'Text variables are not allowed in this context';
            const errorDetails = { 
              value: typeof value === 'string' ? value : value.raw, 
              context: JSON.stringify(context)
            };
            const error = new MeldResolutionError(
              errorMessage,
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: errorDetails,
                severity: ErrorSeverity.Fatal
              }
            );
            logger.error('Validation error in ResolutionService', { error });
            throw error;
          }
          break;

        case 'data':
          if (!context.allowedVariableTypes.data) {
            const errorMessage = 'Data variables are not allowed in this context';
            const errorDetails = { 
              value: typeof value === 'string' ? value : value.raw, 
              context: JSON.stringify(context)
            };
            const error = new MeldResolutionError(
              errorMessage,
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: errorDetails,
                severity: ErrorSeverity.Fatal
              }
            );
            logger.error('Validation error in ResolutionService', { error });
            throw error;
          }
          break;

        case 'path':
          if (!context.allowedVariableTypes.path) {
            const errorMessage = 'Path variables are not allowed in this context';
            const errorDetails = { 
              value: typeof value === 'string' ? value : value.raw, 
              context: JSON.stringify(context)
            };
            const error = new MeldResolutionError(
              errorMessage,
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: errorDetails,
                severity: ErrorSeverity.Fatal
              }
            );
            logger.error('Validation error in ResolutionService', { error });
            throw error;
          }
          break;

        case 'run':
          if (!context.allowedVariableTypes.command) {
            const errorMessage = 'Command references are not allowed in this context';
            const errorDetails = { 
              value: typeof value === 'string' ? value : value.raw, 
              context: JSON.stringify(context)
            };
            const error = new MeldResolutionError(
              errorMessage,
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: errorDetails,
                severity: ErrorSeverity.Fatal
              }
            );
            logger.error('Validation error in ResolutionService', { error });
            throw error;
          }
          break;
      }
    }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string): Promise<void> {
    const visited = new Set<string>();
    const stack: string[] = [];

    const checkReferences = async (text: string, currentRef?: string) => {
      // Parse the text to get variable references
      const nodes = await this.parseForResolution(text);
      if (!nodes || !Array.isArray(nodes)) {
        throw new MeldResolutionError(
          'Invalid parse result',
          {
            code: ResolutionErrorCode.SYNTAX_ERROR,
            details: { value: text },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      for (const node of nodes) {
        if (node.type !== 'Directive') continue;

        const directiveNode = node as DirectiveNode;
        const ref = directiveNode.directive.identifier;
        if (!ref) continue;

        // Skip if this is a direct reference to the current variable
        if (ref === currentRef) continue;

        if (stack.includes(ref)) {
          // Create the circular reference path
          const path = [...stack, ref].join(' -> ');
          throw new MeldResolutionError(
            `Circular reference detected: ${path}`,
            {
              code: ResolutionErrorCode.CIRCULAR_REFERENCE,
              details: { 
                value: text,
                variableName: ref
              },
              severity: ErrorSeverity.Fatal
            }
          );
        }

        if (!visited.has(ref)) {
          visited.add(ref);
          stack.push(ref);

          let refValue: string | undefined;

          switch (directiveNode.directive.kind) {
            case 'text':
              refValue = this.stateService.getTextVar(ref);
              break;
            case 'data':
              const dataValue = this.stateService.getDataVar(ref);
              if (dataValue && typeof dataValue === 'string') {
                refValue = dataValue;
              }
              break;
            case 'path':
              refValue = this.stateService.getPathVar(ref);
              break;
            case 'run':
              const cmdValue = this.stateService.getCommand(ref);
              if (cmdValue) {
                refValue = cmdValue.command;
              }
              break;
          }

          if (refValue) {
            await checkReferences(refValue, ref);
          }

          // Remove from stack after checking
          stack.pop();
        }
      }
    };

    await checkReferences(value);
  }

  /**
   * Extract a section from content by its heading
   * @param content The content to extract the section from
   * @param heading The heading text to search for
   * @param fuzzy Optional fuzzy matching threshold (0-1, where 1 is exact match, defaults to 0.7)
   * 
   * NOTE: This implementation contains workarounds for limitations in the llmxml library.
   * See dev/LLMXML-IMPROVEMENTS.md for details about planned improvements to the library
   * instead of maintaining these workarounds.
   * 
   * Current workarounds include:
   * 1. Manual section extraction when llmxml fails
   * 2. Error reporting with available headings
   * 3. Configurable fuzzy matching threshold
   */
  async extractSection(content: string, heading: string, fuzzy?: number): Promise<string> {
    logger.debug('Extracting section from content', {
      headingToFind: heading,
      contentLength: content.length,
      fuzzyThreshold: fuzzy
    });
    
    try {
      // Use llmxml for section extraction
      // TODO: Once llmxml is enhanced with better error reporting and per-call
      // configuration, simplify this implementation
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: fuzzy !== undefined ? fuzzy : 0.7,
        warningLevel: 'none'
      });
      
      // Extract the section directly from markdown
      const section = await llmxml.getSection(content, heading, {
        exact: fuzzy === 1 || fuzzy === undefined ? false : true,
        includeNested: true,
        fuzzyThreshold: fuzzy
      });
      
      if (!section) {
        // If section not found with llmxml, fall back to manual extraction
        // TODO: Remove this fallback once llmxml reliability is improved
        const manualSection = this.manualSectionExtraction(content, heading, fuzzy);
        
        if (manualSection) {
          logger.debug('Found section using manual extraction', {
            heading,
            sectionLength: manualSection.length
          });
          return manualSection;
        }
        
        // If still not found, throw error with enhanced diagnostic information
        // TODO: Once llmxml provides this information, use it directly
        logger.warn('Section not found', {
          heading,
          contentFirstLines: content.split('\n').slice(0, 5).join('\n')
        });
        
        throw new MeldResolutionError(
          'Section not found: ' + heading,
          {
            code: ResolutionErrorCode.SECTION_NOT_FOUND,
            details: { 
              value: heading,
              contentPreview: content.substring(0, 100) + '...',
              availableHeadings: this.extractHeadings(content).join(', ')
            },
            severity: ErrorSeverity.Recoverable
          }
        );
      }
      
      logger.debug('Found section using llmxml', {
        heading,
        sectionLength: section.length
      });
      
      return section;
    } catch (error) {
      if (error instanceof MeldResolutionError) {
        throw error;
      }
      
      // Log the actual error for debugging
      logger.error('Error extracting section', {
        heading,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Try manual extraction as fallback after llmxml error
      // TODO: Remove once llmxml error handling is improved
      const manualSection = this.manualSectionExtraction(content, heading, fuzzy);
      if (manualSection) {
        logger.debug('Found section using manual extraction after llmxml error', {
          heading,
          sectionLength: manualSection.length
        });
        return manualSection;
      }
      
      throw new MeldResolutionError(
        'Section not found: ' + heading,
        {
          code: ResolutionErrorCode.SECTION_NOT_FOUND,
          details: { 
            value: heading,
            error: error instanceof Error ? error.message : String(error),
            availableHeadings: this.extractHeadings(content).join(', ')
          },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }
  
  /**
   * Extract all headings from content for error reporting
   * This functionality should ideally be provided by the llmxml library
   * @private
   * @todo Move this functionality into llmxml
   */
  private extractHeadings(content: string): string[] {
    const headings: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push(match[2].trim());
      }
    }
    
    return headings;
  }
  
  /**
   * Manual section extraction as a fallback when llmxml fails
   * This is a workaround for limitations in the llmxml library
   * @private
   * @todo Remove once llmxml reliability is improved
   */
  private manualSectionExtraction(content: string, heading: string, fuzzy?: number): string | null {
    try {
      const lines = content.split('\n');
      const threshold = fuzzy !== undefined ? fuzzy : 0.7;
      
      // Find all headings with their levels
      const headings: { text: string; level: number; index: number }[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            text: match[2].trim(),
            level: match[1].length,
            index: i
          });
        }
      }
      
      if (headings.length === 0) {
        return null;
      }
      
      // Find the best matching heading
      let bestMatch: { text: string; level: number; index: number; similarity: number } | null = null;
      
      for (const h of headings) {
        const similarity = this.calculateSimilarity(h.text, heading);
        if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { ...h, similarity };
        }
      }
      
      if (!bestMatch) {
        return null;
      }
      
      // Find the end of the section (next heading of same or higher level)
      let endIndex = lines.length;
      
      for (let i = bestMatch.index + 1; i < headings.length; i++) {
        const nextHeading = headings[i];
        if (nextHeading.level <= bestMatch.level) {
          endIndex = nextHeading.index;
          break;
        }
      }
      
      // Extract the section content
      const sectionLines = lines.slice(bestMatch.index, endIndex);
      return sectionLines.join('\n');
    } catch (error) {
      logger.warn('Manual section extraction failed', {
        heading,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  // TODO: This isn't really necessary as llmxml has built-in 
  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // If either string is empty, return 0
    if (!s1 || !s2) {
      return 0;
    }

    // If strings are equal, return 1
    if (s1 === s2) {
      return 1;
    }

    // Calculate Levenshtein distance
    const m = s1.length;
    const n = s2.length;
    const d: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLength = Math.max(m, n);
    const distance = d[m][n];
    return 1 - (distance / maxLength);
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
   * Resolve a structured path to an absolute path
   * @private
   */
  private async resolveStructuredPath(path: StructuredPath, context: ResolutionContext): Promise<string> {
    const { structured, raw } = path;
    
    // Get base directory from context if available (use currentFilePath if available)
    const baseDir = context.currentFilePath ? this.pathService.dirname(context.currentFilePath) : process.cwd();
    
    // Add detailed debug logging for path resolution
    logger.debug('Resolving structured path', {
      raw: path.raw,
      structured: path.structured,
      baseDir,
      currentFilePath: context.currentFilePath,
      home: process.env.HOME,
      cwd: process.cwd()
    });
    
    // Add specific logging for home path resolution
    if (structured.variables?.special?.includes('HOMEPATH')) {
      const homePath = this.pathService.getHomePath();
      if (process.env.DEBUG === 'true') {
        console.log('Resolving home path in structured path:', {
          raw,
          homePath,
          segments: structured.segments,
          baseDir
        });
      }
    }
    
    try {
      // Use the PathService to resolve the structured path
      // This handles all special variables and path normalization
      const resolvedPath = this.pathService.resolvePath(path, baseDir);
      
      // Log the final resolved path for debugging
      if (process.env.DEBUG === 'true') {
        console.log('Path resolved successfully:', {
          raw,
          resolvedPath,
          exists: await this.fileSystemService.exists(resolvedPath)
        });
      }
      
      return resolvedPath;
    } catch (error) {
      // Log detailed error information
      if (process.env.DEBUG === 'true') {
        console.error('Path resolution failed:', {
          raw,
          structured,
          baseDir,
          error: (error as Error).message
        });
      }
      
      // Handle error based on severity
      throw new MeldResolutionError(
        `Failed to resolve path: ${(error as Error).message}`,
        {
          code: ResolutionErrorCode.INVALID_PATH,
          details: { value: raw },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
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
    // Import and create the tracker if it doesn't exist
    if (!this.resolutionTracker) {
      this.resolutionTracker = new VariableResolutionTracker();
    }
    
    // Configure the tracker
    this.resolutionTracker.configure({
      enabled: true,
      ...config
    });
    
    // Set it on the variable reference resolver
    this.variableReferenceResolver.setResolutionTracker(this.resolutionTracker);
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
      // First resolve the path to handle any variables
      const resolvedPath = await this.resolvePath(path, context);
      
      // Then validate the resolved path using the PathService
      await this.pathService.validatePath(resolvedPath, {
        mustExist: true
      });
      
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
  async resolveFieldAccess(variableName: string, fieldPath: string, context: ResolutionContext): Promise<any> {
    logger.debug(`Resolving field access: ${variableName}.${fieldPath}`);
    
    if (!context || !context.state) {
      throw new MeldResolutionError(
        `Cannot resolve field access without state context`,
        {
          code: ResolutionErrorCode.INVALID_CONTEXT,
          severity: ErrorSeverity.Fatal
        }
      );
    }
    
    // Get the base variable value
    const baseValue = context.state.getDataVar(variableName);
    
    if (baseValue === undefined) {
      throw VariableResolutionErrorFactory.variableNotFound(variableName);
    }
    
    // Parse the field path into segments
    const fields = fieldPath.split('.').map(field => {
      // Check if this is a numeric index for array access
      const numIndex = parseInt(field, 10);
      if (!isNaN(numIndex)) {
        return { type: 'index' as const, value: numIndex };
      }
      // Otherwise it's a field name
      return { type: 'field' as const, value: field };
    });
    
    try {
      // Use the variableReferenceResolver's private method to access fields
      // This is a bit of a hack, but it's the cleanest solution for now
      // We're casting here because the method is private but we need to use it
      // @ts-ignore - accessing private method
      const result = await this.variableReferenceResolver.accessFields(
        baseValue,
        fields as any,
        context,
        variableName
      );
      
      logger.debug(`Successfully resolved field access ${variableName}.${fieldPath}`, {
        resultType: typeof result,
        isArray: Array.isArray(result)
      });
      
      return result;
    } catch (error) {
      logger.error(`Error resolving field access ${variableName}.${fieldPath}`, { error });
      throw VariableResolutionErrorFactory.fieldAccessError(
        `Error accessing field "${fieldPath}" of variable "${variableName}": ${error instanceof Error ? error.message : String(error)}`,
        variableName
      );
    }
  }
} 