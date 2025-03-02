import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IResolutionService, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

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
    this.logger.debug('Processing embed directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and section from directive
      const { path, section, headingLevel, underHeader, fuzzy } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Embed directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node
          }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve variables in path - properly handle structured path objects
      const rawPath = typeof path === 'string' ? path : path.raw;
      const resolvedPath = await this.resolutionService.resolveInContext(
        rawPath,
        resolutionContext
      );

      // Check for circular imports
      this.circularityService.beginImport(resolvedPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Embed file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { 
              node, 
              context
            }
          );
        }

        // Read file content
        const content = await this.fileSystemService.readFile(resolvedPath);

        // Extract section if specified
        let processedContent = content;
        if (section) {
          const resolvedSection = await this.resolutionService.resolveInContext(
            section,
            resolutionContext
          );
          try {
            const fuzzyThreshold = typeof fuzzy === 'number' ? fuzzy : undefined;
            this.logger.debug('Extracting section with parameters', {
              section: resolvedSection,
              fuzzyThreshold
            });
            processedContent = await this.resolutionService.extractSection(
              content,
              resolvedSection,
              fuzzyThreshold
            );
          } catch (error) {
            throw new DirectiveError(
              `Failed to extract section '${resolvedSection}': ${error instanceof Error ? error.message : String(error)}`,
              this.kind,
              DirectiveErrorCode.SECTION_NOT_FOUND,
              { 
                node
              }
            );
          }
        }

        // Apply heading level if specified
        if (headingLevel !== undefined) {
          // Validate heading level
          if (headingLevel < 1 || headingLevel > 6) {
            throw new DirectiveError(
              `Invalid heading level: ${headingLevel}. Must be between 1 and 6.`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { 
                node
              }
            );
          }
          processedContent = this.applyHeadingLevel(processedContent, headingLevel);
        }

        // Apply under header if specified
        if (underHeader) {
          processedContent = this.wrapUnderHeader(processedContent, underHeader);
        }

        // Parse content
        const nodes = await this.parserService.parse(processedContent);

        // Create child state for interpretation
        const childState = newState.createChildState();
        
        // Track context boundary for debugging
        this.trackContextBoundary(newState, childState, resolvedPath);

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

        // Track variables that will be merged back to parent
        if (this.debugEnabled && this.stateTrackingService) {
          // Track text variables
          const textVars = interpretedState.getAllTextVars();
          textVars.forEach((value, name) => {
            this.trackVariableCrossing(name, 'text', interpretedState, newState);
          });
          
          // Track data variables
          const dataVars = interpretedState.getAllDataVars();
          dataVars.forEach((value, name) => {
            this.trackVariableCrossing(name, 'data', interpretedState, newState);
          });
          
          // Track path variables
          const pathVars = interpretedState.getAllPathVars();
          pathVars.forEach((value, name) => {
            this.trackVariableCrossing(name, 'path', interpretedState, newState);
          });
        }

        // Merge interpreted state back
        newState.mergeChildState(interpretedState);

        this.logger.debug('Embed directive processed successfully', {
          path: resolvedPath,
          section,
          location: node.location
        });

        // If transformation is enabled, return a replacement node
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: processedContent,
            location: node.location
          };
          return { state: newState, replacement };
        }

        return { state: newState };
      } finally {
        // Always end import tracking
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error: unknown) {
      this.logger.error('Failed to process embed directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = error instanceof Error ? error : new Error(String(error));
      
      throw new DirectiveError(
        `Failed to execute embed directive: ${errorMessage}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: errorCause
        }
      );
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