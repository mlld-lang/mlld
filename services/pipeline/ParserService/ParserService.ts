import { injectable, singleton, container, inject, delay } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { parserLogger as logger } from '@core/utils/logger';
import { MeldParseError } from '@core/errors/MeldParseError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import type { MeldNode } from '@core/syntax/types/index';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { 
  CodeFenceNode, 
  TextNode,
  DirectiveNode,
  DirectiveKind,
  SourceLocation,
  Position
} from '@core/syntax/types/index';
import type { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference';
import { parse } from '@core/ast/index';  // Import the parse function directly
import type { Location } from '@core/types/index';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError extends Error {
  message: string;
  name: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  toString(): string;
}

// Updated to recognize both the old MeldAstError and our new core/ast MeldAstError
function isMeldAstError(error: unknown): error is MeldAstError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'name' in error &&
    typeof (error as any).toString === 'function' &&
    (
      (error as any).name === 'MeldAstError' ||
      ((error as any).name === 'Error' && 'location' in error && 'code' in error)
    )
  );
}

@injectable()
@Service({
  description: 'Service responsible for parsing Meld syntax into AST nodes'
})
export class ParserService implements IParserService {
  private resolutionClient?: IResolutionServiceClient;
  private factoryInitialized: boolean = false;
  private variableNodeFactory: VariableNodeFactory;

  /**
   * Creates a new instance of the ParserService
   */
  constructor(
    @inject(VariableNodeFactory) variableNodeFactory: VariableNodeFactory,
    @inject(delay(() => ResolutionServiceClientFactory)) private resolutionClientFactory?: ResolutionServiceClientFactory
  ) {
    this.variableNodeFactory = variableNodeFactory;
    if (process.env.DEBUG === 'true') {
      console.log('ParserService: Initialized with factory:', !!this.resolutionClientFactory);
    }
  }

  /**
   * Lazily initialize the ResolutionServiceClient factory
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    this.factoryInitialized = true;
    
    if (this.resolutionClientFactory) {
      this.initializeResolutionClient();
    } else {
      logger.warn('ResolutionServiceClientFactory not injected into ParserService');
    }
  }

  /**
   * Initialize the ResolutionServiceClient using the factory
   */
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      logger.debug('Successfully created ResolutionServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create ResolutionServiceClient', { error });
      this.resolutionClient = undefined;
    }
  }

  private async parseContent(content: string, filePath?: string): Promise<MeldNode[]> {
    try {
      const options = {
        failFast: true,
        trackLocations: true,
        validateNodes: true,
        preserveCodeFences: true,
        validateCodeFences: true,
        structuredPaths: true,
        onError: (error: unknown) => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        }
      };

      if (filePath) {
        try {
          const { registerSource } = require('@core/utils/sourceMapUtils.js');
          registerSource(filePath, content);
          logger.debug(`Registered content for source mapping: ${filePath}`);
        } catch (err) {
          logger.debug('Source mapping not available, skipping registration', { error: err });
        }
      }

      const result = await parse(content, options);

      const ast = result.ast || [];

      this.validateCodeFences(ast);

      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((error: unknown) => {
          if (isMeldAstError(error)) {
            logger.debug('Parse warning detected', { errorMessage: error.toString() });
          }
        });
      }

      return ast;
    } catch (error) {
      if (isMeldAstError(error)) {
        const errorLocation = error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
        
        const actualFilePath = filePath;
        const locationWithPath = {
          ...errorLocation,
          filePath: actualFilePath
        };
        
        const parseError = new MeldParseError(
          error.message,
          locationWithPath,
          {
            filePath: actualFilePath,
            cause: isMeldAstError(error) ? error : undefined,
            context: {
              originalError: error,
              sourceLocation: {
                filePath: actualFilePath,
                line: errorLocation.start.line,
                column: errorLocation.start.column
              },
              location: locationWithPath,
              errorFilePath: actualFilePath
            }
          }
        );
        
        if (filePath) {
          try {
            const { enhanceMeldErrorWithSourceInfo } = require('@core/utils/sourceMapUtils.js');
            const enhancedError = enhanceMeldErrorWithSourceInfo(parseError);
            
            logger.debug('Enhanced parse error with source mapping', {
              original: parseError.message,
              enhanced: enhancedError.message,
              sourceLocation: enhancedError.context?.sourceLocation
            });
            
            throw enhancedError;
          } catch (enhancementError) {
            // If enhancement fails, throw the original error
            logger.debug('Failed to enhance parse error with source mapping', {
              error: enhancementError
            });
            
            throw parseError;
          }
        }
        
        throw parseError;
      }
      
      // For unknown errors, provide a generic message with proper location information
      const actualFilePath = filePath;
      const locationWithPath = { 
        start: { line: 1, column: 1 }, 
        end: { line: 1, column: 1 }, 
        filePath: actualFilePath
      };
      
      const genericError = new MeldParseError(
        'Parse error: Unknown error occurred',
        locationWithPath,
        {
          filePath: actualFilePath, // Directly set filePath in the error options
          cause: isMeldAstError(error) ? error : undefined, // Set the original error as the cause only if it's a proper Error
          context: {
            originalError: error,
            sourceLocation: {
              filePath: actualFilePath,
              line: 1,
              column: 1
            },
            location: locationWithPath,
            // Add the file path in the context for the error display service to use
            errorFilePath: actualFilePath
          }
        }
      );
      
      // Try to enhance with source mapping information
      if (filePath) {
        try {
          const { enhanceMeldErrorWithSourceInfo } = require('@core/utils/sourceMapUtils.js');
          throw enhanceMeldErrorWithSourceInfo(genericError);
        } catch (enhancementError) {
          // If enhancement fails, throw the original error
          throw genericError;
        }
      }
      
      throw genericError;
    }
  }

  public async parse(content: string, filePath?: string): Promise<MeldNode[]> {
    return this.parseContent(content, filePath);
  }

  /**
   * Parse a string into AST nodes (alias for parse to match ParserServiceLike interface)
   * 
   * @param content - The content to parse
   * @param options - Optional parsing options
   * @returns A promise that resolves with the parsed AST nodes
   */
  public async parseString(content: string, options?: { filePath?: string }): Promise<MeldNode[]> {
    return this.parse(content, options?.filePath);
  }

  /**
   * Parse a file into AST nodes
   * 
   * @param filePath - The path to the file to parse
   * @returns A promise that resolves with the parsed AST nodes
   */
  public async parseFile(filePath: string): Promise<MeldNode[]> {
    try {
      // Use the resolution client to read the file
      this.ensureFactoryInitialized();
      
      if (this.resolutionClient) {
        const content = await this.resolutionClient.resolveFile(filePath);
        return this.parse(content, filePath);
      }
      
      // If no resolution client, throw an error
      throw new MeldParseError(`Cannot parse file: ${filePath} - No file resolution service available`);
    } catch (error) {
      throw new MeldParseError(
        `Failed to parse file: ${filePath}`, 
        undefined,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { error: error instanceof Error ? error.message : String(error) }
        }
      );
    }
  }

  public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    const nodes = await this.parseContent(content, filePath);
    if (!filePath) {
      return nodes;
    }

    return nodes.map(node => {
      if (node.location) {
        // Preserve exact column numbers from original location
        return {
          ...node,
          location: {
            ...node.location,  // Preserve all original location properties
            filePath          // Only add filePath
          }
        };
      }
      return node;
    });
  }

  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'location' in error &&
      typeof error.location === 'object' &&
      error.location !== null &&
      'start' in error.location &&
      'end' in error.location
    );
  }
  
  /**
   * Check if a node is a variable reference node using the factory
   */
  private isVariableReferenceNode(node: any): node is IVariableReference {
    if (this.variableNodeFactory) {
      return this.variableNodeFactory.isVariableReferenceNode(node);
    }
    
    // Fallback to direct checking
    return (
      node?.type === 'VariableReference' &&
      typeof node?.identifier === 'string' &&
      typeof node?.valueType === 'string'
    );
  }

  private validateCodeFences(nodes: MeldNode[]): void {
    // Since we're using the meld-ast parser with validateNodes=true and preserveCodeFences=true,
    // we can trust that the code fences are already valid.
    // This is just an extra validation layer to ensure code fence integrity
    for (const node of nodes) {
      if (node.type === 'CodeFence') {
        const codeFence = node as CodeFenceNode;
        const content = codeFence.content;
        
        // Skip empty code fences (should be rare but possible)
        if (!content) {
          continue;
        }
        
        // Split the content by lines
        const lines = content.split('\n');
        if (lines.length < 2) {
          throw new MeldParseError(
            'Invalid code fence: must have at least an opening and closing line',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        // Get the first line (opening fence) and count backticks
        const firstLine = lines[0];
        let openTickCount = 0;
        for (let i = 0; i < firstLine.length; i++) {
          if (firstLine[i] === '`') {
            openTickCount++;
          } else {
            break;
          }
        }
        
        // Get the last line (closing fence) and count backticks
        const lastLine = lines[lines.length - 1];
        let closeTickCount = 0;
        for (let i = 0; i < lastLine.length; i++) {
          if (lastLine[i] === '`') {
            closeTickCount++;
          } else {
            break;
          }
        }
        
        if (openTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing opening backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (closeTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing closing backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (openTickCount !== closeTickCount) {
          throw new MeldParseError(
            `Code fence must be closed with exactly ${openTickCount} backticks, got ${closeTickCount}`,
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
      }
    }
  }

  /**
   * Resolve a variable reference node
   * @param node - The variable reference node to resolve
   * @param context - The resolution context
   * @returns The resolved node
   */
  async resolveVariableReference(node: IVariableReference, context: ResolutionContext): Promise<IVariableReference> {
    try {
      // Ensure factory is initialized
      this.ensureFactoryInitialized();
      
      // Try to use the resolution client
      if (this.resolutionClient) {
        try {
          // Convert the node to string format for the client
          const nodeStr = `{{${node.valueType}.${node.identifier}${node.fields ? '.' + node.fields.map(f => f.value).join('.') : ''}}}`;
          // Use resolveVariableReference method which is in the interface
          const resolvedStr = await this.resolutionClient.resolveVariableReference(nodeStr, context);
          
          // Return the original node with updated information
          // Use type assertion since we're adding a property that's not in the interface
          return {
            ...node,
            resolvedValue: resolvedStr
          } as IVariableReference & { resolvedValue: string };
        } catch (error) {
          logger.warn('Error using resolutionClient.resolve', { 
            error, 
            node 
          });
        }
      }
      
      // If we get here, we couldn't resolve the variable
      logger.warn('No resolution client available for variable transformation');
      return node;
    } catch (error) {
      logger.warn('Failed to transform variable node', { error, node });
      return node;
    }
  }
} 