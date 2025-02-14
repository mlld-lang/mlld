import { DirectiveNode, EmbedDirective } from 'meld-spec';
import { IDirectiveHandler } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { IStateService } from '../../../StateService/IStateService';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';

export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService
  ) {}

  async execute(node: DirectiveNode): Promise<void> {
    const directive = node.directive as EmbedDirective;
    
    // 1. Validate the directive
    await this.validationService.validate(node);
    
    // 2. Resolve the path and any variables
    const resolvedPath = await this.resolutionService.resolvePath(directive.path);
    
    // 3. Get the content
    let content = await this.resolutionService.resolveContent(resolvedPath);
    
    // 4. If section is specified, extract it
    if (directive.section) {
      content = await this.resolutionService.extractSection(content, directive.section);
    }
    
    // 5. Apply heading level if specified
    if (directive.headingLevel) {
      content = this.applyHeadingLevel(content, directive.headingLevel);
    }
    
    // 6. Apply under header if specified
    if (directive.underHeader) {
      content = this.wrapUnderHeader(content, directive.underHeader);
    }
    
    // 7. Store the result
    await this.stateService.appendContent(content);
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