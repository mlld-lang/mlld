import { DirectiveNode, EmbedDirective } from 'meld-spec';
import { IDirectiveHandler } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { IStateService } from '../../../StateService/IStateService';
import { ICircularityService } from '../../../CircularityService/ICircularityService';
import { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import { IParserService } from '../../../ParserService/IParserService';
import { IInterpreterService } from '../../../InterpreterService/IInterpreterService';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { embedLogger as logger } from '@core/utils/logger';

export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService
  ) {}

  async execute(node: DirectiveNode): Promise<void> {
    const directive = node.directive as EmbedDirective;
    
    logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      names: directive.names,
      location: node.location
    });

    try {
      // 1. Validate the directive
      await this.validationService.validate(node);
      
      // 2. Resolve the path and any variables
      const resolvedPath = await this.resolutionService.resolvePath(directive.path, {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        }
      });

      // 3. Check for circular references
      this.circularityService.beginImport(resolvedPath);

      try {
        // 4. Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Embed file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND
          );
        }

        // 5. Read the file content
        const rawContent = await this.fileSystemService.readFile(resolvedPath);

        // 6. Process the content based on directive options
        let processedContent = rawContent;

        // 6a. If section is specified, extract it first
        if (directive.section) {
          processedContent = await this.resolutionService.extractSection(
            processedContent,
            directive.section
          );
        }

        // 6b. If it's a .meld file and contains directives, parse and interpret it
        if (resolvedPath.endsWith('.meld') && processedContent.includes('@')) {
          // Create a child state for the embed
          const childState = await this.stateService.createChildState();

          try {
            // Parse and interpret the content
            const parsedNodes = await this.parserService.parse(processedContent);
            await this.interpreterService.interpret(parsedNodes, {
              initialState: childState,
              filePath: resolvedPath,
              mergeState: true
            });

            // Early return since interpret will handle adding nodes
            return;
          } catch (error) {
            throw new DirectiveError(
              `Failed to parse .meld file: ${error.message}`,
              this.kind,
              DirectiveErrorCode.PARSE_ERROR,
              { cause: error }
            );
          }
        }

        // 7. Handle named embeds or process content
        if (directive.names && directive.names.length > 0) {
          // Set each named variable with the raw content
          for (const name of directive.names) {
            await this.stateService.setTextVar(name, rawContent);
          }
        } else {
          // If no names specified, process and append the content

          // 7b. Resolve any variables in the content
          processedContent = await this.resolutionService.resolveContent(processedContent);

          // 7c. If heading level is specified, validate and apply it
          if (directive.headingLevel !== undefined) {
            if (directive.headingLevel < 1 || directive.headingLevel > 6) {
              throw new DirectiveError(
                `Invalid heading level: ${directive.headingLevel}. Must be between 1 and 6.`,
                this.kind,
                DirectiveErrorCode.VALIDATION_FAILED
              );
            }
          }

          // 7d. Append the processed content
          await this.stateService.appendContent(processedContent);
        }

        logger.debug('Embed content processed', {
          path: resolvedPath,
          section: directive.section,
          names: directive.names,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error) {
      logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error
      });

      if (error instanceof DirectiveError) {
        throw error;
      }

      throw new DirectiveError(
        `Failed to embed content: ${error.message}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { cause: error }
      );
    }
  }

  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      throw new DirectiveError(
        `Invalid heading level: ${level}. Must be between 1 and 6.`,
        this.kind,
        DirectiveErrorCode.INVALID_HEADING_LEVEL
      );
    }
    
    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
} 