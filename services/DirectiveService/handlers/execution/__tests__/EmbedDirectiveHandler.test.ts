import { DirectiveNode, EmbedDirective } from 'meld-spec';
import { EmbedDirectiveHandler } from '../EmbedDirectiveHandler';
import { IValidationService } from '../../../../ValidationService/IValidationService';
import { IResolutionService } from '../../../../ResolutionService/IResolutionService';
import { IStateService } from '../../../../StateService/IStateService';
import { DirectiveError } from '../../../errors/DirectiveError';

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let mockValidationService: jest.Mocked<IValidationService>;
  let mockResolutionService: jest.Mocked<IResolutionService>;
  let mockStateService: jest.Mocked<IStateService>;

  beforeEach(() => {
    mockValidationService = {
      validate: jest.fn()
    } as any;

    mockResolutionService = {
      resolvePath: jest.fn(),
      resolveContent: jest.fn(),
      extractSection: jest.fn()
    } as any;

    mockStateService = {
      appendContent: jest.fn()
    } as any;

    handler = new EmbedDirectiveHandler(
      mockValidationService,
      mockResolutionService,
      mockStateService
    );
  });

  it('should handle basic embed without modifiers', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md'
      } as EmbedDirective
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await handler.execute(node);

    expect(mockStateService.appendContent).toHaveBeenCalledWith('Test content');
  });

  it('should handle embed with heading level', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        headingLevel: 2
      } as EmbedDirective
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await handler.execute(node);

    expect(mockStateService.appendContent).toHaveBeenCalledWith('## Test content');
  });

  it('should handle embed with under header', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        underHeader: 'Important Notes'
      } as EmbedDirective
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await handler.execute(node);

    expect(mockStateService.appendContent).toHaveBeenCalledWith('Important Notes\n\nTest content');
  });

  it('should handle embed with both section and heading level', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        section: 'MySection',
        headingLevel: 3
      } as EmbedDirective
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Full content');
    mockResolutionService.extractSection.mockResolvedValue('Section content');

    await handler.execute(node);

    expect(mockResolutionService.extractSection).toHaveBeenCalledWith('Full content', 'MySection');
    expect(mockStateService.appendContent).toHaveBeenCalledWith('### Section content');
  });

  it('should throw error for invalid heading level', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        headingLevel: 7  // Invalid - must be 1-6
      } as EmbedDirective
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
  });

  it('should not include format property in processing', async () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        format: 'markdown'  // Should be ignored
      } as any  // Using any to test legacy format property
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await handler.execute(node);

    // Verify content is processed without format consideration
    expect(mockStateService.appendContent).toHaveBeenCalledWith('Test content');
  });
}); 