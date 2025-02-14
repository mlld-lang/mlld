import { DirectiveNode, EmbedDirective } from 'meld-spec';
import { EmbedDirectiveHandler } from '../EmbedDirectiveHandler';
import { IValidationService } from '../../../../ValidationService/IValidationService';
import { IResolutionService } from '../../../../ResolutionService/IResolutionService';
import { IStateService } from '../../../../StateService/IStateService';
import { DirectiveError } from '../../../errors/DirectiveError';
import { describe, it, expect, beforeEach, vi, Vi } from 'vitest';

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let mockValidationService: Vi.Mocked<IValidationService>;
  let mockResolutionService: Vi.Mocked<IResolutionService>;
  let mockStateService: Vi.Mocked<IStateService>;

  beforeEach((): void => {
    // Create mock services with proper typing
    mockValidationService = vi.mocked({
      validate: vi.fn()
    } as IValidationService);

    mockResolutionService = vi.mocked({
      resolvePath: vi.fn(),
      resolveContent: vi.fn(),
      extractSection: vi.fn()
    } as IResolutionService);

    mockStateService = vi.mocked({
      appendContent: vi.fn()
    } as IStateService);

    handler = new EmbedDirectiveHandler(
      mockValidationService,
      mockResolutionService,
      mockStateService
    );
  });

  it('should handle basic embed without modifiers', async (): Promise<void> => {
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

  it('should handle embed with heading level', async (): Promise<void> => {
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

  it('should handle embed with under header', async (): Promise<void> => {
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

  it('should handle embed with both section and heading level', async (): Promise<void> => {
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

  it('should throw error for invalid heading level', async (): Promise<void> => {
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

  it('should not include format property in processing', async (): Promise<void> => {
    // Using Partial<EmbedDirective> to indicate intentionally incomplete type
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'embed',
        path: '$PROJECTPATH/doc.md',
        format: 'markdown'  // Testing legacy property
      } as Partial<EmbedDirective>
    };

    mockResolutionService.resolvePath.mockResolvedValue('/resolved/doc.md');
    mockResolutionService.resolveContent.mockResolvedValue('Test content');

    await handler.execute(node);

    expect(mockStateService.appendContent).toHaveBeenCalledWith('Test content');
  });
}); 