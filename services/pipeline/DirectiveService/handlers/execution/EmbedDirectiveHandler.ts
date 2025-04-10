import { DirectiveNode, MeldNode, TextNode } from '@core/syntax/types/index.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { MeldFileSystemError } from '@core/errors/MeldFileSystemError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { embedLogger } from '@core/utils/logger.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js'; 
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { InterpreterOptionsBase, StructuredPath, StateServiceLike } from '@core/shared-service-types.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IInterpreterServiceClientFactory } from '@services/interpreter-client/IInterpreterServiceClientFactory.js';

// Define the embed directive parameters interface
interface EmbedDirectiveParams {
  path?: string | StructuredPath;
  url?: string;
  allowURLs?: boolean;
  urlOptions?: {
    allowedProtocols?: string[];
    allowedDomains?: string[];
    blockedDomains?: string[];
    maxResponseSize?: number;
    timeout?: number;
  };
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
}

export interface ILogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Handler for @embed directives
 * Embeds content from files or sections of files
 * 
 * The @embed directive can operate in several modes:
 * 
 * 1. fileEmbed: Embeds content from a file path
 *    - Content is treated as literal text (not parsed)
 *    - File system operations are used to read the file
 *    - Example: @embed(path="path/to/file.md")
 * 
 * 2. variableEmbed: Embeds content from a variable reference
 *    - Content is resolved from variables and treated as literal text
 *    - No file system operations are performed
 *    - Example: @embed(path={{variable}})
 * 
 * 3. Section/Heading modifiers (apply to both types):
 *    - Can extract specific sections from content
 *    - Can adjust heading levels or wrap under headers
 *    - Example: @embed(path="file.md", section="Introduction")
 *
 * IMPORTANT: In all cases, embedded content is treated as literal text
 * and is NOT parsed for directives or other Meld syntax.
 */
@injectable()
@Service({
  description: 'Handler for @embed directives'
})
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';
  private interpreterServiceClient?: IInterpreterServiceClient;

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IStateService') private stateService: IStateService,
    @inject('ICircularityService') private circularityService: ICircularityService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IPathService') private pathService: IPathService,
    @inject('IInterpreterServiceClientFactory') private interpreterServiceClientFactory: IInterpreterServiceClientFactory,
    private logger: ILogger = embedLogger
  ) {
  }

  private ensureInterpreterServiceClient(): IInterpreterServiceClient {
    // First try to get the client from the factory
    if (!this.interpreterServiceClient && this.interpreterServiceClientFactory) {
      try {
        this.interpreterServiceClient = this.interpreterServiceClientFactory.getClient();
      } catch (error) {
        this.logger.warn('Failed to get interpreter service client from factory', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // If we still don't have a client, throw an error
    if (!this.interpreterServiceClient) {
      throw new DirectiveError(
        'Interpreter service client is not available. Ensure InterpreterServiceClientFactory is registered and resolvable, or provide a mock in tests.',
        this.kind,
        DirectiveErrorCode.INITIALIZATION_FAILED
      );
    }
    
    return this.interpreterServiceClient;
  }

  /**
   * Creates a replacement text node with proper formatting context preservation
   * 
   * @param content - The content for the replacement node
   * @param originalNode - The original directive node being replaced
   * @param context - Optional directive context with formatting information
   * @returns A TextNode with the content and location information from the original
   */
  private createReplacementNode(
    content: string, 
    originalNode: DirectiveNode,
    context?: DirectiveContext
  ): TextNode {
    this.logger.debug('Creating replacement node with content preservation', {
      originalNodeType: originalNode.type,
      contentLength: content.length,
      location: originalNode.location,
      hasFormattingContext: !!context?.formattingContext
    });
    
    // Extract formatting information if available from context
    const formattingMetadata: any = {
      isFromDirective: true,
      originalNodeType: originalNode.type,
      preserveFormatting: true
    };
    
    // If we have formatting context, add more detailed metadata
    if (context?.formattingContext) {
      Object.assign(formattingMetadata, {
        contextType: context.formattingContext.contextType,
        isOutputLiteral: true, // Always use literal output for embeds
        // Add any other formatting context properties
        nodeType: context.formattingContext.nodeType || originalNode.type,
        // Include parent context for proper inheritance
        parentContext: context.formattingContext
      });
      
      this.logger.debug('Added formatting context to replacement node', {
        contextType: formattingMetadata.contextType,
        isOutputLiteral: formattingMetadata.isOutputLiteral,
        nodeType: formattingMetadata.nodeType
      });
    }
    
    return {
      type: 'Text',
      content,
      location: originalNode.location,
      // Add enhanced formatting metadata to help with context preservation
      formattingMetadata
    };
  }

  /**
   * Executes the @embed directive
   * 
   * @param node - The directive node to execute
   * @param context - The context in which to execute the directive
   * @returns A DirectiveResult containing the replacement node and state
   */
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    this.logger.debug(`Processing embed directive`, {
      node: JSON.stringify(node),
      location: node.location
    });

    // Validate the directive structure (basic validation)
    this.validationService.validate(node);

    // Clone the current state for modifications
    const newState = context.state.clone(); // Keep state cloning
    
    // Create a resolution context
    // TODO: Adjust ResolutionContextFactory usage based on directive subtype
    const resolutionContext = ResolutionContextFactory.create(
      context.currentFilePath,
      newState
    );

    let content: string = ''; // Initialize content string

    // Determine content based on directive subtype
    switch (node.subtype) {
      case 'embedPath':
        this.logger.debug('Handling embedPath subtype');

        // Ensure path is provided in the AST node
        if (!node.path) {
          throw new DirectiveError(
            `Missing path property for embedPath subtype.`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            node.location
          );
        }

        let resolvedPath: string;
        try {
          this.logger.debug(`Resolving embed path`, { pathObject: node.path });
          // Assuming node.path is compatible with resolvePath input
          resolvedPath = await this.resolutionService.resolvePath(node.path, resolutionContext);
          this.logger.debug(`Resolved embed path to: ${resolvedPath}`);
        } catch (error) {
            throw new DirectiveError(
            `Error resolving embed path: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            node.location,
            error
          );
        }

        // Read file content
        try {
          this.logger.debug(`Attempting to read file: ${resolvedPath}`);
          if (!(await this.fileSystemService.exists(resolvedPath))) {
            throw new MeldFileNotFoundError(
              `Embed source file not found: ${resolvedPath}`,
              node.location
            );
          }
          content = await this.fileSystemService.readFile(resolvedPath);
          this.logger.debug(`Read file content successfully`, { path: resolvedPath, length: content.length });
        } catch (error) {
          const errorCode = error instanceof MeldFileNotFoundError
            ? DirectiveErrorCode.FILE_NOT_FOUND
            : DirectiveErrorCode.EXTERNAL_ERROR;
          const message = error instanceof MeldFileNotFoundError
            ? error.message
            : `Error reading embed source file: ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`;

          throw new DirectiveError(message, this.kind, errorCode, node.location, error);
        }
        break;

      case 'embedVariable':
        this.logger.debug('Handling embedVariable subtype');

        // Ensure path and variable reference exist in the AST node
        if (!node.path || !node.path.variable) {
          throw new DirectiveError(
            `Missing path or variable reference for embedVariable subtype.`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            node.location
          );
        }

        try {
          this.logger.debug(`Resolving embed variable`, { variableNode: node.path.variable });
          // Assuming node.path.variable is a VariableReferenceNode
          const resolvedValue = await this.resolutionService.resolveVariable(node.path.variable, resolutionContext);
          
          // Embed expects string content
          if (typeof resolvedValue !== 'string') {
            this.logger.warn('Resolved embed variable content is not a string', {
              variable: node.path.variable.name,
              type: typeof resolvedValue,
              value: JSON.stringify(resolvedValue).substring(0, 100) // Log snippet
            });
            // Convert non-string values (like numbers, booleans) to string representation
            // For complex objects/arrays, consider if this should be an error or stringified.
            // Let's stringify for now, aligning with how text directives might handle non-strings.
            content = String(resolvedValue);
          } else {
            content = resolvedValue;
          }
          this.logger.debug(`Resolved embed variable content`, { length: content.length });
        } catch (error) {
          throw new DirectiveError(
            `Error resolving embed variable: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            node.location,
            error
          );
        }
        break;

      case 'embedTemplate':
        this.logger.debug('Handling embedTemplate subtype');

        // Ensure content array exists in the AST node
        if (!node.content || !Array.isArray(node.content)) {
          throw new DirectiveError(
            `Missing or invalid content array for embedTemplate subtype.`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            node.location
          );
        }

        try {
          this.logger.debug(`Resolving embed template`, { contentNodes: node.content.length });
          // Assuming node.content is an array of TextNode/VariableReferenceNode
          content = await this.resolutionService.resolveTemplate(node.content, resolutionContext);
          this.logger.debug(`Resolved embed template content`, { length: content.length });
        } catch (error) {
          throw new DirectiveError(
            `Error resolving embed template: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            node.location,
            error
          );
        }
        break;

      default:
        throw new DirectiveError(
          `Unsupported embed subtype: ${node.subtype}`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          node.location
        );
    }

    // Handle section extraction if specified
    const options = node.options || {};
    const section = options.section;
    if (section) {
      this.logger.debug(`Extracting section: ${section}`);
      try {
        content = await this.resolutionService.extractSection(
          content,
          section,
          { fuzzy: options.fuzzy === 'true' } // Use options.fuzzy
        );
        this.logger.debug(`Section extracted successfully`, { section, length: content.length });
      } catch (error) {
        throw new DirectiveError(
          `Error extracting section \"${section}\": ${error instanceof Error ? error.message : String(error)}`,
          this.kind,
          DirectiveErrorCode.PROCESSING_FAILED,
          node.location,
          error
        );
      }
    }

    // Handle heading level adjustment if specified
    const headingLevel = options.headingLevel;
    if (headingLevel) {
      this.logger.debug(`Adjusting heading level by: ${headingLevel}`);
      content = this.resolutionService.adjustHeadingLevels(content, headingLevel);
      this.logger.debug(`Heading levels adjusted`, { newLength: content.length });
    }

    // Handle under-header wrapping if specified
    const underHeader = options.underHeader;
    if (underHeader) {
      this.logger.debug(`Wrapping content under header: ${underHeader}`);
      content = this.resolutionService.wrapUnderHeader(content, underHeader);
      this.logger.debug(`Content wrapped under header`, { newLength: content.length });
    }

    // Create the replacement node
    const replacementNode = this.createReplacementNode(content, node, context);
    this.logger.debug(`Created replacement node`, { type: replacementNode.type });

    // NOTE: Removed complex interpretation logic that previously existed here.
    // Embed primarily replaces content textually. The cloned `newState` is usually
    // sufficient as the returned state. If transformations *after* embedding are
    // needed, they should occur in the main interpreter loop.

    return {
      state: newState, // Return the cloned state, embed usually doesn't modify state itself
      replacement: replacementNode
    };
  }

  /**
   * Adjusts the heading level of content by prepending the appropriate number of # characters
   * 
   * @param content - The content to adjust
   * @param level - The heading level (1-6)
   * @returns The content with adjusted heading level
   */
  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      this.logger.warn(`Invalid heading level: ${level}. Must be between 1 and 6. Using unmodified content.`, {
        level,
        directive: this.kind
      });
      return content; // Return unmodified content for invalid levels
    }
    
    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  /**
   * Wraps content under a header by prepending the header and adding appropriate spacing
   * 
   * @param content - The content to wrap
   * @param header - The header text to prepend
   * @returns The content wrapped under the header
   */
  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
} 