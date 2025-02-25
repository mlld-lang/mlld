import { DirectiveNode, MeldNode, TextNode, StructuredPath } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';

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

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    this.logger.debug('Processing embed directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and section from directive
      const { path, section, headingLevel, underHeader } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Embed directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
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

      // Resolve variables in path
      const resolvedPath = await this.resolutionService.resolveInContext(
        typeof path === 'string' ? path : path.raw,
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
            { node, context }
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
          processedContent = await this.resolutionService.extractSection(
            content,
            resolvedSection
          );
        }

        // Apply heading level if specified
        if (headingLevel !== undefined) {
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

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

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
    } catch (error) {
      this.logger.error('Failed to process embed directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
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
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
    
    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
} 