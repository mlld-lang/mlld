import type { DirectiveNode, MeldNode, TextNode } from '@core/ast/types';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ResolutionContext } from '@core/types/resolution';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import { MeldFileSystemError } from '@core/errors/MeldFileSystemError';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { directiveLogger as logger } from '@core/utils/logger';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient'; 
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { MeldPath } from '@core/types/paths';
import type { VariableReferenceNode, PathNodeArray } from '@core/ast/types';
import type { InterpolatableValue } from '@core/ast/types/guards';
import { isInterpolatableValueArray } from '@core/ast/types/guards';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { SourceLocation } from '@core/types/common';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';

export interface ILogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Handler for @add directives
 * Adds content from files or sections of files
 * 
 * The @add directive can operate in several modes:
 * 
 * 1. fileAdd: Adds content from a file path
 *    - Content is treated as literal text (not parsed)
 *    - File system operations are used to read the file
 *    - Example: @add(path="path/to/file.md")
 * 
 * 2. variableAdd: Adds content from a variable reference
 *    - Content is resolved from variables and treated as literal text
 *    - No file system operations are performed
 *    - Example: @add(path={{variable}})
 * 
 * 3. Section/Heading modifiers (apply to both types):
 *    - Can extract specific sections from content
 *    - Can adjust heading levels or wrap under headers
 *    - Example: @add(path="file.md", section="Introduction")
 *
 * IMPORTANT: In all cases, added content is treated as literal text
 * and is NOT parsed for directives or other Meld syntax.
 */
@injectable()
@Service({
  description: 'Handler for @add directives'
})
export class AddDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'add';
  private interpreterServiceClient?: IInterpreterServiceClient;

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('ICircularityService') private circularityService: ICircularityService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IPathService') private pathService: IPathService,
    @inject('InterpreterServiceClientFactory') private interpreterServiceClientFactory: InterpreterServiceClientFactory,
    @inject('ILogger') private logger: ILogger
  ) {
  }

  private ensureInterpreterServiceClient(): IInterpreterServiceClient {
    // First try to get the client from the factory if not already created
    if (!this.interpreterServiceClient && this.interpreterServiceClientFactory) {
      try {
        this.interpreterServiceClient = this.interpreterServiceClientFactory.createClient();
      } catch (error) {
        // Log warning HERE if factory fails during lazy creation
        this.logger.warn('Failed to get interpreter service client from factory', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Re-throw or handle as appropriate? For now, let's let it proceed, 
        // subsequent checks will throw the EXECUTION_FAILED error.
      }
    }
    
    // If we still don't have a client (factory failed or wasn't available),
    // throw the EXECUTION_FAILED error.
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
    context?: DirectiveProcessingContext
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
        isOutputLiteral: true, // Always use literal output for adds
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
      nodeId: crypto.randomUUID(),
      // Add enhanced formatting metadata to help with context preservation
      formattingMetadata
    };
  }

  /**
   * Executes the @add directive
   * 
   * @param context - The context in which to execute the directive
   * @returns A DirectiveResult containing the replacement node and state
   */
  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const node = context.directiveNode as DirectiveNode;
    const state = context.state;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const errorDetailsContext: Partial<DirectiveProcessingContext> = {
        state: context.state,
        resolutionContext: context.resolutionContext,
        executionContext: context.executionContext,
        formattingContext: context.formattingContext,
        directiveNode: node // Include node if helpful in details context
    };
    const standardErrorDetails = { 
      node: node, 
      context: errorDetailsContext 
    };

    // Assert directive node structure - using new flattened structure
    if (!node || node.kind !== 'add') {
        throw new DirectiveError('Invalid node type provided to AddDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, standardErrorDetails);
    }
    this.logger.debug(`Processing add directive`, { location: node.location });

    // Validate the directive structure (basic validation)
    await this.validationService.validate(node);
    
    try {
      let content: string = ''; 

      // <<< Add Logging >>>
      this.logger.debug('>>> ADD HANDLER - Checking Node Structure Before Switch <<<', {
        nodeExists: !!node,
        kind: node?.kind,
        subtype: node?.subtype,
        locationExists: !!node?.location,
        locationValue: node?.location, 
        values: node?.values 
      });

      // Determine content based on directive subtype
      switch (node.subtype) {
        case 'addPath':
          const pathNodes = node.values.path as TextNode[];
          if (!pathNodes || pathNodes.length === 0) {
            throw new DirectiveError(
              'Missing path value for addPath directive',
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              standardErrorDetails
            );
          }
          const pathContent = pathNodes[0].content;

          // ValidationService.validate() already confirmed addPathObject exists for this subtype.
          // No need for the redundant check here.

          let resolvedPath: MeldPath;
          try {
            const resolvedPathString = await this.resolutionService.resolveInContext(pathContent, resolutionContext);
            resolvedPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
            
            // process.stdout.write(`Resolved add path to: ${resolvedPath.validatedPath}\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving add path: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { ...standardErrorDetails, cause: error instanceof Error ? error : undefined }
            );
          }

          // Read file content
          try {
            // process.stdout.write(`Attempting to read file: ${resolvedPath.validatedPath}\n`);
            if (!(await this.fileSystemService.exists(resolvedPath.validatedPath))) {
              const errorSourceLocation: SourceLocation | undefined = node?.location ? { 
                line: node.location.start.line, 
                column: node.location.start.column, 
                filePath: currentFilePath ?? 'unknown'
              } : undefined;

              throw new MeldFileNotFoundError(
                `Add source file not found: ${resolvedPath.validatedPath}`,
                {
                  details: { filePath: resolvedPath.validatedPath, operation: 'add' },
                  sourceLocation: errorSourceLocation
                }
              );
            }
            content = await this.fileSystemService.readFile(resolvedPath.validatedPath);
            // process.stdout.write(`Read file content successfully\n`);
          } catch (error) {
            const errorCode = error instanceof MeldFileNotFoundError
              ? DirectiveErrorCode.FILE_NOT_FOUND
              : DirectiveErrorCode.EXECUTION_FAILED;
            const message = error instanceof MeldFileNotFoundError
              ? error.message
              : `Error reading add source file: ${resolvedPath.validatedPath}: ${error instanceof Error ? error.message : String(error)}`;

            throw new DirectiveError(message, this.kind, errorCode, { ...standardErrorDetails, cause: error instanceof Error ? error : undefined });
          }
          break;

        case 'addVariable':
          const variableNodes = node.values.variable as VariableReferenceNode[];
          if (!variableNodes || variableNodes.length === 0) {
            throw new DirectiveError(
              'Missing variable value for addVariable directive',
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              standardErrorDetails
            );
          }

          // Resolve the variable value
          try {
            // Use the raw variable value for resolution
            const rawVariable = node.raw.variable;
            content = await this.resolutionService.resolveInContext(rawVariable, resolutionContext);
            // process.stdout.write(`Resolved add variable to content of length: ${content?.length ?? 0}\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving add variable/path: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { ...standardErrorDetails, cause: error instanceof Error ? error : undefined }
            );
          }
          break;

        case 'addTemplate':
          const templateContent = node.values.content as TextNode[];
          
          if (!templateContent || templateContent.length === 0) {
            throw new DirectiveError(
              `Missing or invalid content array for addTemplate subtype.`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              standardErrorDetails
            );
          }

          try {
            // process.stdout.write(`Attempting resolveNodes on templateContent (length: ${templateContent?.length ?? '?'})\n`);
            content = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
            // process.stdout.write(`Resolved template content length: ${content.length}\n`);
          } catch (error) {
            throw new DirectiveError(
              `Error resolving add template: ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              { ...standardErrorDetails, cause: error instanceof Error ? error : undefined }
            );
          }
          break;

        default:
          throw new DirectiveError(
            `Unsupported add subtype: ${node.subtype}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            standardErrorDetails
          );
      }

      // Handle section extraction if specified
      const sectionNodes = node.values.section as TextNode[] | undefined;

      if (sectionNodes && sectionNodes.length > 0) { 
        const sectionName = sectionNodes[0].content;
        try {
          content = await this.resolutionService.extractSection(
            content,
            sectionName,
            node.values.options?.fuzzy === 'true' ? 0.8 : undefined
          );
          // process.stdout.write(`Section extracted successfully\n`);
        } catch (error) {
          throw new DirectiveError(
            `Error extracting section "${sectionName}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            { ...standardErrorDetails, cause: error instanceof Error ? error : undefined }
          );
        }
      }

      // Handle heading level adjustment if specified
      const headerLevel = node.values.headerLevel;
      if (headerLevel && headerLevel.length > 0) {
        const levelValue = headerLevel[0].value;
        // TODO: Find appropriate service/utility for heading adjustment
        this.logger.warn(`Heading level adjustment specified (+${levelValue}) but not currently supported by ResolutionService. Content unchanged.`, standardErrorDetails);
        // Validate the option format here if needed
        if (typeof levelValue !== 'number' || !Number.isInteger(levelValue) || levelValue < 1) {
          this.logger.warn(`Invalid headerLevel option: ${levelValue}. Must be a positive integer.`, standardErrorDetails);
        }
      }

      // Handle under-header wrapping if specified
      const underHeader = node.values.underHeader;
      if (underHeader && underHeader.length > 0) {
        const headerText = underHeader[0].content;
        // TODO: Find appropriate service/utility for header wrapping
        this.logger.warn(`Under-header wrapping specified ("${headerText}") but not currently supported by ResolutionService. Content unchanged.`, standardErrorDetails);
      }

      // Create the replacement node - This should ALWAYS happen for @add
      const replacementNode = this.createReplacementNode(content, node, context);
      this.logger.debug(`Created replacement node`, { type: replacementNode.type });
      const replacementNodes = replacementNode ? [replacementNode] : undefined; // Ensure array or undefined if creation failed

      // Return NEW DirectiveResult shape
      // Add doesn't change state variables, so stateChanges is undefined
      return {
        stateChanges: undefined, 
        replacement: replacementNodes // Use the potentially undefined array
      };
    } catch (error) {
      if (error instanceof DirectiveError) {
         if (!error.details?.context) {
            throw new DirectiveError(
                error.message,
                this.kind,
                error.code,
                { 
                  ...(error.details || {}),
                  ...standardErrorDetails,
                  cause: error.details?.cause instanceof Error ? error.details.cause : undefined 
                }
            );
         }
        throw error;
      }
      
      // Wrap other errors
      throw new DirectiveError(
        `Error processing add directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          cause: error instanceof Error ? error : undefined 
        }
      );
    } finally {
      // Correctly no cleanup needed here for add
    }
  }
} 