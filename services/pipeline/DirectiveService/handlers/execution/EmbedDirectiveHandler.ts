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
 */
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';
  private debugEnabled: boolean = false;
  private stateTrackingService?: IStateTrackingService;

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
    
    // Create a resolution context
    const resolutionContext = ResolutionContextFactory.forImportDirective(
      context.currentFilePath,
      newState
    );

    // Track path resolution for finally block
    let resolvedPath: string | undefined;

    try {
      // Resolve variables in the path
      resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      // Begin import tracking
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
      let content = await this.fileSystemService.readFile(resolvedPath);
      
      // Extract the requested section if specified
      if (section) {
        const sectionName = await this.resolutionService.resolveInContext(
          section,
          resolutionContext
        );
        
        content = await this.resolutionService.extractSection(
          content,
          sectionName,
          fuzzy ? parseFloat(fuzzy) : undefined
        );
      }
      
      // Apply heading level if specified
      if (headingLevel) {
        content = this.applyHeadingLevel(content, parseInt(headingLevel, 10));
      }
      
      // Wrap under header if specified
      if (underHeader) {
        content = this.wrapUnderHeader(content, underHeader);
      }
      
      // Parse the content into nodes
      const nodes = await this.parserService.parse(content);
      
      // Create a child state for interpretation
      const childState = newState.createChildState();
      
      // Track context boundaries for debugging
      this.trackContextBoundary(newState, childState, resolvedPath);
      
      // Interpret the parsed nodes
      const interpretedState = await this.interpreterService.interpret(nodes, {
        initialState: childState,
        filePath: resolvedPath,
        mergeState: true
      });
      
      // Merge the interpreted state back into the new state
      newState.mergeChildState(interpretedState);
      
      // Copy all variables from the interpreted state to the context state
      // Track text variables
      if (typeof interpretedState.getAllTextVars === 'function') {
        const textVars = interpretedState.getAllTextVars();
        for (const [key, value] of Object.entries(textVars)) {
          newState.setTextVar(key, value);
          
          // Track variable crossing for debugging
          this.trackVariableCrossing(key, 'text', interpretedState, newState);
        }
      }
      
      // Track data variables
      if (typeof interpretedState.getAllDataVars === 'function') {
        const dataVars = interpretedState.getAllDataVars();
        for (const [key, value] of Object.entries(dataVars)) {
          newState.setDataVar(key, value);
          
          // Track variable crossing for debugging
          this.trackVariableCrossing(key, 'data', interpretedState, newState);
        }
      }
      
      // Track path variables
      if (typeof interpretedState.getAllPathVars === 'function') {
        const pathVars = interpretedState.getAllPathVars();
        for (const [key, value] of Object.entries(pathVars)) {
          newState.setPathVar(key, value);
          
          // Track variable crossing for debugging
          this.trackVariableCrossing(key, 'path', interpretedState, newState);
        }
      }
      
      // Track commands
      if (typeof interpretedState.getAllCommands === 'function') {
        const commands = interpretedState.getAllCommands();
        for (const [key, value] of Object.entries(commands)) {
          newState.setCommand(key, value);
          
          // Track variable crossing for debugging
          this.trackVariableCrossing(key, 'command', interpretedState, newState);
        }
      }
      
      // Log successful processing
      this.logger.debug(`Successfully processed embed directive`, {
        path: resolvedPath,
        section: section || undefined,
        headingLevel: headingLevel || undefined,
        underHeader: underHeader || undefined
      });

      // If transformation is enabled, return the parsed content
      if (newState.isTransformationEnabled()) {
        // IMPORTANT: Copy variables from embedded state to parent state
        // even in transformation mode
        if (context.parentState) {
          // Copy all text variables from the embedded state to the parent state
          if (typeof interpretedState.getAllTextVars === 'function') {
            const textVars = interpretedState.getAllTextVars();
            for (const [key, value] of Object.entries(textVars)) {
              if (context.parentState) {
                context.parentState.setTextVar(key, value);
              }
            }
          }
          
          // Copy all data variables from the embedded state to the parent state
          if (typeof interpretedState.getAllDataVars === 'function') {
            const dataVars = interpretedState.getAllDataVars();
            for (const [key, value] of Object.entries(dataVars)) {
              if (context.parentState) {
                context.parentState.setDataVar(key, value);
              }
            }
          }
          
          // Copy all path variables from the embedded state to the parent state
          if (typeof interpretedState.getAllPathVars === 'function') {
            const pathVars = interpretedState.getAllPathVars();
            for (const [key, value] of Object.entries(pathVars)) {
              if (context.parentState) {
                context.parentState.setPathVar(key, value);
              }
            }
          }
          
          // Copy all commands from the embedded state to the parent state
          if (typeof interpretedState.getAllCommands === 'function') {
            const commands = interpretedState.getAllCommands();
            for (const [key, value] of Object.entries(commands)) {
              if (context.parentState) {
                context.parentState.setCommand(key, value);
              }
            }
          }
        }

        return {
          state: newState,
          replacement: {
            type: 'Text',
            content,
            location: node.location
          } as TextNode
        };
      }
      
      // Otherwise, just return the new state
      return {
        state: newState
      };
    } catch (error: any) {
      // Handle and log errors
      this.logger.error(`Error executing embed directive: ${error.message}`, {
        error,
        node
      });
      
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
      try {
        if (resolvedPath) {
          this.circularityService.endImport(resolvedPath);
        }
      } catch (error: any) {
        // Don't let errors in endImport affect the main flow
        this.logger.debug(`Error ending import tracking: ${error.message}`, { error });
      }
    }
  }

  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      throw new DirectiveError(
        `Invalid heading level: ${level}. Must be between 1 and 6.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {}
      );
    }
    
    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
} 