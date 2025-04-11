import type { DirectiveNode, MeldNode, TextNode } from '@core/syntax/types/index.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
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
import type { MeldPath, StructuredPath as CoreStructuredPath } from '@core/types/paths.js';
import { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import type { VariableReferenceNode } from '@core/ast/ast/astTypes.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import type { EmbedDirectiveData } from '@core/syntax/types/directives.js';
import { vi } from 'vitest';

function isInterpolatableValueArray(value: unknown): value is InterpolatableValue {
    return Array.isArray(value) && 
           (value.length === 0 || 
            (value[0] && typeof value[0] === 'object' && ('type' in value[0]) && 
             (value[0].type === 'Text' || value[0].type === 'VariableReference')));
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
    @inject('IInterpreterServiceClientFactory') private interpreterServiceClientFactory: InterpreterServiceClientFactory,
    @inject('ILogger') private logger: any
  ) {
  }

  private ensureInterpreterServiceClient(): IInterpreterServiceClient {
    // First try to get the client from the factory
    if (!this.interpreterServiceClient && this.interpreterServiceClientFactory) {
      try {
        this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
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
        DirectiveErrorCode.EXECUTION_FAILED
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
    // Use EmbedDirectiveData for the directive part
    const directiveData = node.directive as EmbedDirectiveData;
    this.logger.debug(`Processing embed directive`, { location: node.location });

    // Validate the directive structure (basic validation)
    await this.validationService.validate(node);
    
    try {
      const newState = context.state.clone(); 
      const resolutionContext = ResolutionContextFactory.create(newState, context.currentFilePath);

      let content: string = ''; 

      // <<< Add Logging >>>
      this.logger.debug('>>> EMBED HANDLER - Checking Node Structure Before Switch <<<', {
        nodeExists: !!node,
        directiveExists: !!node?.directive,
        subtype: node?.directive?.subtype,
        locationExists: !!node?.location,
        locationValue: node?.location, 
        directiveObject: node?.directive 
      });

      // Determine content based on directive subtype
      switch (directiveData.subtype) {
        case 'embedPath':
          process.stdout.write('>>> EMBED HANDLER - Handling embedPath subtype <<<\n');
          const embedPathObject = directiveData.path as AstStructuredPath;

          if (!embedPathObject) { 
            throw new DirectiveError(
              `Missing path property for embedPath subtype.`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { location: node?.location }
            );
          }

          let resolvedPath: MeldPath;
          try {
            process.stdout.write(`Resolving embed path\n`);
            // 1. Resolve the path object - prioritize interpolatedValue if present
            const valueToResolve: string | InterpolatableValue = embedPathObject.interpolatedValue ?? embedPathObject.raw;
            // Pass string or InterpolatableValue to resolveInContext
            const resolvedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
            // 2. Validate the resolved string
            resolvedPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
            
            process.stdout.write(`Resolved embed path to: ${resolvedPath.validatedPath}\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving embed path: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { location: node?.location, cause: error instanceof Error ? error : undefined }
            );
          }

          // Read file content
          try {
            // Use validatedPath for logging string
            process.stdout.write(`Attempting to read file: ${resolvedPath.validatedPath}\n`);
            // Use validatedPath for exists check
            if (!(await this.fileSystemService.exists(resolvedPath.validatedPath))) {
              throw new MeldFileNotFoundError(
                `Embed source file not found: ${resolvedPath.validatedPath}`,
                {
                  details: { filePath: resolvedPath.validatedPath, operation: 'embed' },
                  sourceLocation: node.location ? { line: node.location.start.line, column: node.location.start.column, filePath: context.currentFilePath } : undefined
                }
              );
            }
            // Use validatedPath for readFile
            content = await this.fileSystemService.readFile(resolvedPath.validatedPath);
            // Use validatedPath for logging
            process.stdout.write(`Read file content successfully\n`);
          } catch (error) {
            const errorCode = error instanceof MeldFileNotFoundError
              ? DirectiveErrorCode.FILE_NOT_FOUND
              : DirectiveErrorCode.EXECUTION_FAILED;
            const message = error instanceof MeldFileNotFoundError
              ? error.message
              : `Error reading embed source file: ${resolvedPath.validatedPath}: ${error instanceof Error ? error.message : String(error)}`;

            throw new DirectiveError(message, this.kind, errorCode, { location: node?.location, cause: error instanceof Error ? error : undefined });
          }
          break;

        case 'embedVariable':
          process.stdout.write('>>> EMBED HANDLER - Handling embedVariable subtype <<<\n');
          const variablePathObject = directiveData.path as AstStructuredPath;

          if (!variablePathObject) { 
            throw new DirectiveError(
              `Missing path property for embedVariable subtype.`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { location: node?.location }
            );
          }
          
          try {
            process.stdout.write(`Resolving embed variable/path\n`);
            // Use resolveInContext, passing interpolatedValue or raw string
            const valueToResolveVar = variablePathObject.interpolatedValue ?? variablePathObject.raw;
            const resolvedValue = await this.resolutionService.resolveInContext(valueToResolveVar, resolutionContext);

            // Embed expects string content
            if (typeof resolvedValue !== 'string') {
              this.logger.warn('Resolved embed variable content is not a string', {
                variable: JSON.stringify(directiveData.path),
                type: typeof resolvedValue,
                value: JSON.stringify(resolvedValue).substring(0, 100) // Log snippet
              });
              content = String(resolvedValue);
            } else {
              content = resolvedValue;
            }
            process.stdout.write(`Resolved embed variable content\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving embed variable/path: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { location: node?.location, cause: error instanceof Error ? error : undefined }
            );
          }
          break;

        case 'embedTemplate':
          process.stdout.write('>>> EMBED HANDLER - Handling embedTemplate subtype <<<\n');
          process.stdout.write(`Inspecting directive: ${JSON.stringify(directiveData)}\n`);
          
          const templateContent = directiveData.content;

          process.stdout.write(`Extracted templateContent type: ${typeof templateContent}, isArray: ${Array.isArray(templateContent)}\n`);
          process.stdout.write(`Value of templateContent before check: ${JSON.stringify(templateContent)}\n`);
          
          if (!templateContent || !isInterpolatableValueArray(templateContent)) {
            throw new DirectiveError(
              `Missing or invalid content array for embedTemplate subtype.`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { location: node?.location }
            );
          }

          try {
            process.stdout.write(`Attempting resolveNodes on templateContent (length: ${templateContent?.length ?? '?'})\n`);
            // Pass InterpolatableValue directly to resolveNodes
            content = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
            process.stdout.write(`Resolved template content length: ${content.length}\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving embed template: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { location: node?.location, cause: error instanceof Error ? error : undefined }
            );
          }
          break;

        default:
          throw new DirectiveError(
            `Unsupported embed subtype: ${directiveData.subtype}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { location: node?.location }
          );
      }

      // Handle section extraction if specified
      const section = directiveData.section;

      // <<< Add Logging >>>
      process.stdout.write(`>>> EMBED HANDLER - Before Section Check <<<\n`);
      process.stdout.write(`Section value: ${section}\n`);
      process.stdout.write(`Content length after read: ${content?.length ?? 'undefined'}\n`);

      if (section) { 
        process.stdout.write(`Extracting section: ${section}\n`);
        try {
          content = await this.resolutionService.extractSection(
            content,
            section,
            directiveData.options?.fuzzy === 'true' ? 0.8 : undefined
          );
          process.stdout.write(`Section extracted successfully\n`);
        } catch (error) {
          throw new DirectiveError(
            `Error extracting section "${section}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            { location: node?.location, cause: error instanceof Error ? error : undefined }
          );
        }
      }

      // Handle heading level adjustment if specified
      const options = directiveData.options || {};
      const headingLevel = options.headingLevel;
      if (headingLevel) {
        // TODO: Find appropriate service/utility for heading adjustment
        // <<< Log the logger object >>>
        process.stdout.write(`>>> EMBED HANDLER - Logger object: ${typeof this.logger}, Warn is mock: ${vi.isMockFunction(this.logger?.warn)}\n`);
        this.logger.warn(`Heading level adjustment specified (+${headingLevel}) but not currently supported by ResolutionService. Content unchanged.`, { location: node?.location });
        // Validate the option format here if needed
        if (typeof headingLevel !== 'number' || !Number.isInteger(headingLevel) || headingLevel < 1) {
          this.logger.warn(`Invalid headingLevel option: ${headingLevel}. Must be a positive integer.`, { location: node?.location });
        }
      }

      // Handle under-header wrapping if specified
      const underHeader = options.underHeader;
      if (underHeader) {
        // TODO: Find appropriate service/utility for header wrapping
        this.logger.warn(`Under-header wrapping specified ("${underHeader}") but not currently supported by ResolutionService. Content unchanged.`, { location: node?.location });
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
    } catch (error) {
      // Final catch-all for errors during embed execution
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      // Wrap other errors, ensuring location is handled safely
      const details = {
        node,
        context,
        cause: error instanceof Error ? error : undefined,
        location: node?.location // <<< Use optional chaining
      };
      throw new DirectiveError(
        `Error processing embed directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        details
      );
    } finally {
      // Remove incorrect endImport call
      // this.circularityService.endImport();
    }
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