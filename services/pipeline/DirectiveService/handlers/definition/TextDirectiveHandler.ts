import { DirectiveNode } from '@core/syntax/types.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ErrorSeverity, FieldAccessError, PathValidationError, MeldResolutionError } from '@core/errors';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
@Service({
  description: 'Handler for text directives',
  dependencies: [
    { token: 'IValidationService', name: 'validationService' },
    { token: 'IStateService', name: 'stateService' },
    { token: 'IResolutionService', name: 'resolutionService' }
  ]
})
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  private stringLiteralHandler: StringLiteralHandler;
  private stringConcatenationHandler: StringConcatenationHandler;
  private variableReferenceResolver: VariableReferenceResolver;
  private fileSystemService?: IFileSystemService;

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {
    logger.debug('TextDirectiveHandler constructor called', {
      hasValidationService: !!validationService,
      hasStateService: !!stateService,
      hasResolutionService: !!resolutionService,
      state: stateService ? {
        hasTrackingService: !!(stateService as any).trackingService
      } : 'undefined'
    });

    this.stringLiteralHandler = new StringLiteralHandler();
    this.stringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    
    // Note: We'll rely on ResolutionService.ts for variable resolution rather than initializing a separate resolver
    // The ResolutionService has its own VariableReferenceResolver
    this.variableReferenceResolver = null as any; // We won't use this directly
  }

  setFileSystemService(fileSystemService: IFileSystemService): void {
    this.fileSystemService = fileSystemService;
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ['\'', '"', '`'];
    
    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing text directive', {
      location: node.location,
      context: {
        currentFilePath: context.currentFilePath,
        stateExists: !!context.state,
        stateMethods: context.state ? Object.keys(context.state) : 'undefined'
      },
      directive: node.directive
    });
    
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        if (!node || !node.directive) {
          throw new DirectiveError(
            'Invalid directive: missing required fields',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { 
              node, 
              context,
              severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
            }
          );
        }
        await this.validationService.validate(node);
      } catch (error) {
        // If it's already a DirectiveError, just rethrow
        if (error instanceof DirectiveError) {
          throw error;
        }
        // Otherwise wrap in DirectiveError
        const errorMessage = error instanceof Error ? error.message : 'Text directive validation failed';
        throw new DirectiveError(
          errorMessage,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : new Error(errorMessage),
            location: node.location,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }

      // 3. Get identifier from directive
      const { identifier } = node.directive;
      
      // 4. Handle different types of text directives
      let resolvedValue: string;
      
      // Create a resolution context that includes the parent state to access variables from previous directives
      const resolutionContext = ResolutionContextFactory.forTextDirective(
        context.currentFilePath,
        context.parentState || newState
      );

      // Handle @text with @run value
      if (node.directive.source === 'run' && node.directive.run) {
        try {
          // Resolve variables in the command nodes directly
          const commandNodes = node.directive.run.command; // This is InterpolatableValue
          const resolvedCommandString = await this.resolutionService.resolveNodes(commandNodes, resolutionContext);
          
          // Ensure FileSystemService is available
          if (!this.fileSystemService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          // Execute the resolved command string
          const { stdout } = await this.fileSystemService.executeCommand(
              resolvedCommandString,
              { cwd: this.fileSystemService.getCwd() } // Use CWD from FileSystem
          );
          // Trim trailing newline from command output (common shell behavior)
          resolvedValue = stdout.replace(/\n$/, ''); 

          logger.debug('Directly executed command for @text directive', {
            originalCommandNodes: commandNodes,
            resolvedCommand: resolvedCommandString,
            output: resolvedValue
          });

        } catch (error) {
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError) {
            throw new DirectiveError(
                'Failed to resolve command for @text directive', 
                this.kind, 
                DirectiveErrorCode.RESOLUTION_FAILED, 
                { node, context: context, cause: error, location: node.location, severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED] }
            );
          } else if (error instanceof Error) {
            throw new DirectiveError(
                `Failed to execute command for @text directive: ${error.message}`,
                this.kind, 
                DirectiveErrorCode.EXECUTION_FAILED,
                { node, context: context, cause: error, location: node.location, severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED] }
            );
          }
          throw error;
        }
      }
      // Handle @text with @embed value
      else if (node.directive.source === 'embed' && node.directive.embed) {
        try {
          // 1. Get the StructuredPath object for the embed source
          const embedPathObject = node.directive.embed.path;
          if (!embedPathObject) {
             throw new DirectiveError('Missing path for @embed source in @text directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
          }
          
          // 2. Resolve the path using resolveInContext
          const resolvedEmbedPathString = await this.resolutionService.resolveInContext(embedPathObject, resolutionContext);
          
          // 3. Validate the resolved path string using the *new* resolvePath
          const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
          
          // 4. Ensure FileSystemService is available to read the file
          if (!this.fileSystemService) {
            throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
          }
          
          // 5. Read the file content
          const fileContent = await this.fileSystemService.readFile(validatedMeldPath.validatedPath);
          
          // 6. Handle section extraction if needed
          if (node.directive.embed.section) {
             resolvedValue = await this.resolutionService.extractSection(fileContent, node.directive.embed.section);
          } else {
             resolvedValue = fileContent;
          }
          
          logger.debug('Resolved @embed source for @text directive', {
            embedPathObject,
            resolvedPath: resolvedEmbedPathString,
            section: node.directive.embed.section,
            finalValueLength: resolvedValue.length
          });
          
        } catch (error) {
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
            throw new DirectiveError(
                'Failed to resolve @embed source for @text directive',
                this.kind, 
                DirectiveErrorCode.RESOLUTION_FAILED, 
                { node, context: context, cause: error, location: node.location, severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED] }
            );
          } else if (error instanceof Error) {
            throw new DirectiveError(
                `Failed to read/process embed source for @text directive: ${error.message}`,
                this.kind, 
                DirectiveErrorCode.EXECUTION_FAILED,
                { node, context: context, cause: error, location: node.location, severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED] }
            );
          }
          throw error;
        }
      }
      // Handle regular @text with value
      else {
        // Get the InterpolatableValue from the directive
        const interpolatableValue = node.directive.value;
        
        // Log the resolution context
        logger.debug('Created resolution context for text directive', {
          currentFilePath: resolutionContext.currentFilePath,
          allowedVariableTypes: resolutionContext.allowedVariableTypes,
          stateIsPresent: !!resolutionContext.state,
          parentStateExists: !!context.parentState,
          value: interpolatableValue
        });

        // SIMPLIFIED LOGIC: Always attempt to resolve the value using ResolutionService
        // resolveNodes now handles InterpolatableValue arrays.
        try {
          // Pass the InterpolatableValue array to resolveNodes
          resolvedValue = await this.resolutionService.resolveNodes(interpolatableValue, resolutionContext);
        } catch (error) {
          // <<< Add logging for resolution errors >>>
          logger.error('Error resolving nodes in TextDirectiveHandler:', {
            identifier,
            interpolatableValue: JSON.stringify(interpolatableValue),
            context: {
              currentFilePath: resolutionContext.currentFilePath,
              allowedTypes: resolutionContext.allowedVariableTypes
            },
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError) {
            throw new DirectiveError(
              'Failed to resolve value in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                cause: error,
                location: node.location,
                severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED],
                context: { 
                   currentFilePath: context.currentFilePath,
                }
              }
            );
          }
          throw error;
        }
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      // If it's already a DirectiveError, just rethrow
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      // Otherwise, wrap it in a DirectiveError
      // Ensure location is passed correctly, even if potentially undefined
      const details = {
          node,
          cause: error instanceof Error ? error : undefined,
          location: node?.location,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED],
          context: { 
              currentFilePath: context.currentFilePath 
          }
      };
      
      throw new DirectiveError(
        `Failed to process text directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        details
      );
    }
  }
} 