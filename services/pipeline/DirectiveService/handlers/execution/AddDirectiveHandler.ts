import type { DirectiveNode, MeldNode, TextNode } from '@core/syntax/types/index';
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
import { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes';
import type { VariableReferenceNode } from '@core/ast/ast/astTypes';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import type { AddDirectiveData } from '@core/syntax/types/directives';
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

    // Assert directive node structure
    if (!node.directive || node.directive.kind !== 'add') {
        throw new DirectiveError('Invalid node type provided to AddDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, standardErrorDetails);
    }
    const directiveData = node.directive as AddDirectiveData;
    this.logger.debug(`Processing add directive`, { location: node.location });

    // Validate the directive structure (basic validation)
    await this.validationService.validate(node);
    
    try {
      let content: string = ''; 

      // <<< Add Logging >>>
      this.logger.debug('>>> ADD HANDLER - Checking Node Structure Before Switch <<<', {
        nodeExists: !!node,
        directiveExists: !!node?.directive,
        subtype: node?.directive?.subtype,
        locationExists: !!node?.location,
        locationValue: node?.location, 
        directiveObject: node?.directive 
      });

      // Determine content based on directive subtype
      switch (directiveData.subtype) {
        case 'addPath':
          // process.stdout.write('>>> ADD HANDLER - Handling addPath subtype <<<\n');
          const addPathObject = directiveData.path as AstStructuredPath;

          // ValidationService.validate() already confirmed addPathObject exists for this subtype.
          // No need for the redundant check here.

          let resolvedPath: MeldPath;
          try {
            // process.stdout.write(`Resolving add path\n`);
            const valueToResolve: string | InterpolatableValue = addPathObject.interpolatedValue ?? addPathObject.raw;
            const resolvedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
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
          // process.stdout.write('>>> ADD HANDLER - Handling addVariable subtype <<<\n');
          const variablePathObject = directiveData.path as AstStructuredPath;

          // ValidationService.validate() already confirmed variablePathObject and its necessary
          // internal structure (like variable reference) exist for this subtype.
          // The redundant 'if' block below is removed.

          // The code below relies on the validator having passed.
          try {
            // process.stdout.write(`Resolving add variable/path\n`);
            const valueToResolveVar = variablePathObject.interpolatedValue ?? variablePathObject.raw;
            content = await this.resolutionService.resolveInContext(valueToResolveVar, resolutionContext);
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
          // process.stdout.write('>>> ADD HANDLER - Handling addTemplate subtype <<<\n');
          // process.stdout.write(`Inspecting directive: ${JSON.stringify(directiveData)}\n`);
          
          const templateContent = directiveData.content;

          // process.stdout.write(`Extracted templateContent type: ${typeof templateContent}, isArray: ${Array.isArray(templateContent)}\n`);
          // process.stdout.write(`Value of templateContent before check: ${JSON.stringify(templateContent)}\n`);
          
          if (!templateContent || !isInterpolatableValueArray(templateContent)) {
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
            `Unsupported add subtype: ${directiveData.subtype}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            standardErrorDetails
          );
      }

      // Handle section extraction if specified
      const section = directiveData.section;

      // <<< Add Logging >>>
      // process.stdout.write(`>>> ADD HANDLER - Before Section Check <<<\n`);
      // process.stdout.write(`Section value: ${section}\n`);
      // process.stdout.write(`Content length after read: ${content?.length ?? 'undefined'}\n`);

      if (section) { 
        // process.stdout.write(`Extracting section: ${section}\n`);
        try {
          content = await this.resolutionService.extractSection(
            content,
            section,
            directiveData.options?.fuzzy === 'true' ? 0.8 : undefined
          );
          // process.stdout.write(`Section extracted successfully\n`);
        } catch (error) {
          throw new DirectiveError(
            `Error extracting section "${section}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.EXECUTION_FAILED,
            { ...standardErrorDetails, cause: error instanceof Error ? error : undefined }
          );
        }
      }

      // Handle heading level adjustment if specified
      const options = directiveData.options || {};
      const headingLevel = options.headingLevel;
      if (headingLevel) {
        // TODO: Find appropriate service/utility for heading adjustment
        this.logger.warn(`Heading level adjustment specified (+${headingLevel}) but not currently supported by ResolutionService. Content unchanged.`, standardErrorDetails);
        // Validate the option format here if needed
        if (typeof headingLevel !== 'number' || !Number.isInteger(headingLevel) || headingLevel < 1) {
          this.logger.warn(`Invalid headingLevel option: ${headingLevel}. Must be a positive integer.`, standardErrorDetails);
        }
      }

      // Handle under-header wrapping if specified
      const underHeader = options.underHeader;
      if (underHeader) {
        // TODO: Find appropriate service/utility for header wrapping
        this.logger.warn(`Under-header wrapping specified ("${underHeader}") but not currently supported by ResolutionService. Content unchanged.`, standardErrorDetails);
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