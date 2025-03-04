import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IResolutionService, StructuredPath, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { StateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';

// Define the embed directive parameters interface
interface EmbedDirectiveParams {
  path?: string | StructuredPath;
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
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';
  private debugEnabled: boolean = false;
  private stateTrackingService?: IStateTrackingService;
  private stateVariableCopier: StateVariableCopier;

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger,
    trackingService?: IStateTrackingService
  ) {
    this.stateTrackingService = trackingService;
    this.debugEnabled = !!trackingService && (process.env.MELD_DEBUG === 'true');
    this.stateVariableCopier = new StateVariableCopier(trackingService);
  }

  /**
   * Track context boundary between states
   */
  private trackContextBoundary(sourceState: IStateService, targetState: IStateService, filePath?: string): void {
    if (!this.debugEnabled || !this.stateTrackingService) {
      return;
    }

    try {
      const sourceId = sourceState.getStateId();
      const targetId = targetState.getStateId();
      
      if (!sourceId || !targetId) {
        this.logger.debug('Cannot track context boundary - missing state ID', {
          source: sourceState,
          target: targetState
        });
        return;
      }
      
      this.logger.debug('Tracking context boundary', {
        sourceId,
        targetId,
        filePath
      });
      
      // Call the tracking service with the correct parameters
      this.stateTrackingService.trackContextBoundary(
        sourceId,
        targetId,
        'embed',
        filePath || ''
      );
    } catch (error) {
      // Don't let tracking errors affect normal operation
      this.logger.debug('Error tracking context boundary', { error });
    }
  }

  /**
   * Track variable copying between contexts
   */
  private trackVariableCrossing(
    variableName: string,
    variableType: 'text' | 'data' | 'path' | 'command',
    sourceState: IStateService,
    targetState: IStateService,
    alias?: string
  ): void {
    if (!this.debugEnabled || !this.stateTrackingService) {
      return;
    }

    try {
      const sourceId = sourceState.getStateId();
      const targetId = targetState.getStateId();
      
      if (!sourceId || !targetId) {
        this.logger.debug('Cannot track variable crossing - missing state ID', {
          source: sourceState,
          target: targetState
        });
        return;
      }
      
      this.logger.debug('Tracking variable crossing', {
        variableName,
        variableType,
        sourceId,
        targetId,
        alias
      });
      
      this.stateTrackingService.trackVariableCrossing(
        sourceId,
        targetId,
        variableName,
        variableType,
        alias
      );
    } catch (error) {
      // Don't let tracking errors affect normal operation
      this.logger.debug('Error tracking variable crossing', { error });
    }
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

    // Validate the directive structure
    this.validationService.validate(node);
    
    // Extract properties from the directive
    const { path, section, headingLevel, underHeader, fuzzy } = node.directive as EmbedDirectiveParams;

    if (!path) {
      throw new DirectiveError(
        'Path is required for embed directive',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Clone the current state for modifications
    const newState = context.state.clone();
    
    // Create a child state for embedded content processing
    // This is crucial for tests that expect variables to be in childState
    const childState = newState.createChildState();
    
    // Create a resolution context
    const resolutionContext = ResolutionContextFactory.forImportDirective(
      context.currentFilePath,
      newState
    );

    // Track path resolution for finally block
    let resolvedPath: string | undefined;
    let content: string;

    try {
      // Check if this is a variable reference embed
      const isVariableReference = typeof path === 'object' && 
                                path.isVariableReference === true;

      this.logger.debug(`Processing embed directive with ${isVariableReference ? 'variable reference' : 'file path'}`, {
        isVariableReference,
        path: typeof path === 'object' ? JSON.stringify(path) : path
      });

      // Resolve variables in the path
      resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      /**
       * variableEmbed:
       * If this is a variable reference, use the resolved value directly as content.
       * No file system operations are performed, and content is treated as literal text.
       */
      if (isVariableReference) {
        content = resolvedPath;
        
        this.logger.debug(`Using variable reference directly as content`, {
          content
        });
        
        // We never parse variable references in the actual implementation
        this.logger.debug('Not parsing variable reference content (standard behavior)');
      } 
      /**
       * fileEmbed:
       * If this is a file path, read the content from the file system.
       * Content is treated as literal text and not parsed.
       */
      else {
        // Begin import tracking for file paths
        this.circularityService.beginImport(resolvedPath);

        // Check for circular imports
        try {
          if (this.circularityService.isInStack(resolvedPath)) {
            throw new Error(`Circular import detected: ${resolvedPath}`);
          }
        } catch (error: any) {
          // Circular imports during embedding should be logged but not fail normal operation
          this.logger.warn(`Circular import detected in embed directive: ${error.message}`, {
            error,
            path: resolvedPath,
            currentFile: context.currentFilePath
          });
        }

        // Check if the file exists
        if (!(await this.fileSystemService.exists(resolvedPath))) {
          throw new MeldFileNotFoundError(
            resolvedPath,
            {
              context: { 
                directive: this.kind,
                location: node.location
              }
            }
          );
        }

        // Read the file content
        content = await this.fileSystemService.readFile(resolvedPath);
        
        // Register the source file with source mapping service if available
        try {
          const { registerSource, addMapping } = require('@core/utils/sourceMapUtils.js');
          
          // Register the source file content
          registerSource(resolvedPath, content);
          
          // Add a mapping from the first line of the source file to the location of the embed directive
          if (node.location && node.location.start) {
            addMapping(
              resolvedPath,
              1, // Start at line 1 of the embedded file
              1, // Start at column 1
              node.location.start.line,
              node.location.start.column
            );
            
            this.logger.debug(`Added source mapping from ${resolvedPath}:1:1 to line ${node.location.start.line}:${node.location.start.column}`);
          }
        } catch (err) {
          // Source mapping is optional, so just log a debug message if it fails
          this.logger.debug('Source mapping not available, skipping', { error: err });
        }
      }
      
      /**
       * Section extraction (applies to both fileEmbed and variableEmbed):
       * If a section parameter is provided, extract only that section from the content.
       */
      if (section) {
        const sectionName = await this.resolutionService.resolveInContext(
          section,
          resolutionContext
        );
        
        try {
          content = await this.resolutionService.extractSection(
            content,
            sectionName,
            fuzzy ? parseFloat(fuzzy) : undefined
          );
        } catch (error: unknown) {
          // If section extraction fails, log a warning and continue with the full content
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Section extraction failed for ${sectionName}: ${errorMessage}`, {
            error,
            section: sectionName,
            content: content.substring(0, 100) + '...'
          });
          // Section extraction failure is not fatal
        }
      }
      
      /**
       * Heading level adjustment (applies to both fileEmbed and variableEmbed):
       * If a headingLevel parameter is provided, adjust the heading level of the content.
       */
      // Apply heading level if specified
      if (headingLevel) {
        try {
          content = this.applyHeadingLevel(content, parseInt(headingLevel, 10));
        } catch (error: unknown) {
          // If heading level application fails, log a warning and continue with unmodified content
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to apply heading level ${headingLevel}: ${errorMessage}`, {
            error,
            headingLevel
          });
          // Heading level failure is not fatal
        }
      }
      
      /**
       * Header wrapping (applies to both fileEmbed and variableEmbed):
       * If an underHeader parameter is provided, wrap the content under that header.
       */
      // Wrap under header if specified
      if (underHeader) {
        try {
          const resolvedHeader = await this.resolutionService.resolveInContext(
            underHeader,
            resolutionContext
          );
          content = this.wrapUnderHeader(content, resolvedHeader);
        } catch (error: unknown) {
          // If header wrapping fails, log a warning and continue with unmodified content
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to wrap content under header ${underHeader}: ${errorMessage}`, {
            error,
            underHeader: underHeader
          });
          // Header wrapping failure is not fatal
        }
      }
      
      /**
       * IMPORTANT: Content handling in @embed
       * 
       * For BOTH fileEmbed and variableEmbed:
       * - Content is ALWAYS treated as literal text in the final output
       * - Content is NOT parsed for directives or other Meld syntax
       * - This ensures that embedded content appears exactly as written
       */
      
      this.logger.debug(`Successfully processed embed directive`, {
        path: resolvedPath,
        section: section || undefined,
        headingLevel: headingLevel || undefined,
        underHeader: underHeader || undefined
      });

      /**
       * Variable propagation in transformation mode:
       * If in transformation mode, copy variables from child state to parent state.
       * This applies to both fileEmbed and variableEmbed.
       */
      // If in transformation mode (parentState exists), copy variables to parent state
      if (context.parentState) {
        this.logger.debug('Transformation mode detected, copying variables to parent state', {
          childStateId: childState.getStateId?.() || 'unknown',
          parentStateId: context.parentState.getStateId?.() || 'unknown'
        });
        
        try {
          // Get all variables from the child state
          const textVars = childState.getAllTextVars?.() || {};
          const dataVars = childState.getAllDataVars?.() || {};
          const pathVars = childState.getAllPathVars?.() || {};
          const commandVars = childState.getAllCommands?.() || {};
          
          this.logger.debug('Variables available for copying', {
            textVars: Object.keys(textVars),
            dataVars: Object.keys(dataVars),
            pathVars: Object.keys(pathVars),
            commandVars: Object.keys(commandVars)
          });
          
          // Copy each variable type to parent state
          Object.entries(textVars).forEach(([name, value]) => {
            this.logger.debug(`Copying text variable: ${name}`);
            context.parentState!.setTextVar(name, value);
            this.trackVariableCrossing(name, 'text', childState, context.parentState!);
          });
          
          Object.entries(dataVars).forEach(([name, value]) => {
            this.logger.debug(`Copying data variable: ${name}`);
            context.parentState!.setDataVar(name, value);
            this.trackVariableCrossing(name, 'data', childState, context.parentState!);
          });
          
          Object.entries(pathVars).forEach(([name, value]) => {
            this.logger.debug(`Copying path variable: ${name}`);
            context.parentState!.setPathVar(name, value);
            this.trackVariableCrossing(name, 'path', childState, context.parentState!);
          });
          
          Object.entries(commandVars).forEach(([name, value]) => {
            this.logger.debug(`Copying command variable: ${name}`);
            context.parentState!.setCommand(name, value);
            this.trackVariableCrossing(name, 'command', childState, context.parentState!);
          });
          
          // Track context boundary for debugging
          this.trackContextBoundary(childState, context.parentState, context.currentFilePath);
        } catch (error) {
          // Log but don't throw - variable copying shouldn't break functionality
          this.logger.warn(`Error copying variables to parent state: ${error instanceof Error ? error.message : String(error)}`, {
            error
          });
        }
      }

      // Always return the content as literal text in a TextNode
      /**
       * Final output generation (applies to both fileEmbed and variableEmbed):
       * Return the content as a literal text node in the Meld AST.
       * This ensures consistent handling of embedded content regardless of source.
       */
      // This applies to both transformation mode and normal mode
      return {
        state: newState, // Return newState to maintain compatibility with existing tests
        replacement: {
          type: 'Text',
          content,
          location: node.location
        } as TextNode
      };
    } catch (error: any) {
      // Don't log MeldFileNotFoundError since it will be logged by the CLI
      if (!(error instanceof MeldFileNotFoundError)) {
        // Handle and log errors
        this.logger.error(`Error executing embed directive: ${error.message}`, {
          error,
          node
        });
      }
      
      // Wrap the error in a DirectiveError if it's not already one
      if (!(error instanceof DirectiveError)) {
        throw new DirectiveError(
          `Failed to execute embed directive: ${error.message}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { cause: error }
        );
      }
      
      throw error;
    } finally {
      // Always end import tracking, even if there was an error
      // Only do this for file paths, not variable references
      try {
        // Check if this was a variable reference (in which case we didn't call beginImport)
        const isVariableReference = typeof path === 'object' && path.isVariableReference === true;
        
        if (resolvedPath && !isVariableReference) {
          this.circularityService.endImport(resolvedPath);
        }
      } catch (error: any) {
        // Don't let errors in endImport affect the main flow
        this.logger.debug(`Error ending import tracking: ${error.message}`, { error });
      }
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