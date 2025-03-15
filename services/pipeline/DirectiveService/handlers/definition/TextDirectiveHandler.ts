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
import { ErrorSeverity } from '@core/errors/MeldError.js';
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
    const validQuotes = ["'", '"', '`'];
    
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
        // For @run source, execute the command
        try {
          // First resolve any variables in the command string itself
          const commandWithResolvedVars = await this.resolutionService.resolveInContext(
            node.directive.run.command, 
            resolutionContext
          );
          
          // We need to use the FileSystemService if available to directly execute the command
          // Otherwise fall back to the resolution service
          if (this.fileSystemService) {
            // Execute the command directly using FileSystemService
            const { stdout } = await this.fileSystemService.executeCommand(
              commandWithResolvedVars,
              { cwd: this.fileSystemService.getCwd() }
            );
            
            // Use stdout as the direct resolved value
            resolvedValue = stdout;
            
            logger.debug('Directly executed command for @text directive', {
              originalCommand: node.directive.run.command,
              resolvedCommand: commandWithResolvedVars,
              output: resolvedValue
            });
          } else {
            // Fall back to resolution service (though this will include the @run syntax)
            resolvedValue = await this.resolutionService.resolveInContext(
              `@run [${commandWithResolvedVars}]`, 
              resolutionContext
            );
            
            logger.debug('Resolved @run command in text directive via resolution service', {
              originalCommand: node.directive.run.command,
              resolvedCommand: commandWithResolvedVars,
              output: resolvedValue
            });
          }
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve @run command in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location,
                severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
              }
            );
          }
          throw error;
        }
      }
      // Handle @text with @embed value
      else if (node.directive.source === 'embed' && node.directive.embed) {
        // For @embed source, resolve the embed
        try {
          // Use the resolution service to resolve the embed
          resolvedValue = await this.resolutionService.resolveInContext(`@embed [${node.directive.embed.path}${node.directive.embed.section ? ' # ' + node.directive.embed.section : ''}]`, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve @embed in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location,
                severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
              }
            );
          }
          throw error;
        }
      }
      // Handle regular @text with value
      else {
        const { value } = node.directive;
        
        // Log the resolution context
        logger.debug('Created resolution context for text directive', {
          currentFilePath: resolutionContext.currentFilePath,
          allowedVariableTypes: resolutionContext.allowedVariableTypes,
          stateIsPresent: !!resolutionContext.state,
          parentStateExists: !!context.parentState,
          value: value
        });

        // Check for string concatenation first
        if (await this.stringConcatenationHandler.hasConcatenation(value)) {
          try {
            resolvedValue = await this.stringConcatenationHandler.resolveConcatenation(value, resolutionContext);
          } catch (error) {
            if (error instanceof ResolutionError) {
              throw new DirectiveError(
                'Failed to resolve string concatenation',
                this.kind,
                DirectiveErrorCode.RESOLUTION_FAILED,
                {
                  node,
                  context,
                  cause: error,
                  location: node.location,
                  severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
                }
              );
            }
            throw error;
          }
        } else if (this.stringLiteralHandler.isStringLiteral(value)) {
          // First, strip the quotes and handle escapes
          const parsedLiteral = this.stringLiteralHandler.parseLiteral(value);
          
          // Then resolve any variable references within the string
          try {
            resolvedValue = await this.resolutionService.resolveInContext(parsedLiteral, resolutionContext);
          } catch (error) {
            if (error instanceof ResolutionError) {
              throw new DirectiveError(
                'Failed to resolve variables in string literal',
                this.kind,
                DirectiveErrorCode.RESOLUTION_FAILED,
                {
                  node,
                  context,
                  cause: error,
                  location: node.location,
                  severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
                }
              );
            }
            throw error;
          }
        } else {
          // For values with variables, resolve them using the resolution service
          try {
            resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
          } catch (error) {
            if (error instanceof ResolutionError) {
              throw new DirectiveError(
                'Failed to resolve variables in text directive',
                this.kind,
                DirectiveErrorCode.RESOLUTION_FAILED,
                {
                  node,
                  context,
                  cause: error,
                  location: node.location,
                  severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
                }
              );
            }
            throw error;
          }
        }
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        'Failed to process text directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED]
        }
      );
    }
  }
} 