import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectiveService } from './DirectiveService';
import type { DirectiveNode, TextDirective, DataDirective, ImportDirective, EmbedDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';

describe('DirectiveService', () => {
  let service: DirectiveService;
  let mockValidationService: any;
  let mockStateService: any;
  let mockPathService: any;
  let mockFileSystemService: any;
  let mockParserService: any;
  let mockInterpreterService: any;

  beforeEach(() => {
    // Create mock services
    mockValidationService = {
      validate: vi.fn()
    };

    mockStateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      createChildState: vi.fn(),
      mergeChildState: vi.fn()
    };

    mockPathService = {
      resolvePath: vi.fn()
    };

    mockFileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn()
    };

    mockParserService = {
      parse: vi.fn()
    };

    mockInterpreterService = {
      interpret: vi.fn()
    };

    // Create service instance
    service = new DirectiveService();
    service.initialize(
      mockValidationService,
      mockStateService,
      mockPathService,
      mockFileSystemService,
      mockParserService,
      mockInterpreterService
    );
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      expect(() => service.getSupportedDirectives()).not.toThrow();
    });

    it('should support all default directive types', () => {
      const supported = service.getSupportedDirectives();
      expect(supported).toContain('text');
      expect(supported).toContain('data');
      expect(supported).toContain('import');
      expect(supported).toContain('embed');
    });

    it('should throw if used before initialization', () => {
      const uninitializedService = new DirectiveService();
      expect(() => uninitializedService.getSupportedDirectives()).toThrow();
    });
  });

  describe('Text directive handling', () => {
    it('should process a valid text directive', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        } as TextDirective,
        location: { start: { line: 1, column: 1 } }
      };

      await service.processDirective(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockStateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle validation errors', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        } as TextDirective
      };

      mockValidationService.validate.mockImplementation(() => {
        throw new MeldDirectiveError('Invalid text directive', 'text');
      });

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });
  });

  describe('Data directive handling', () => {
    it('should process a valid data directive with string value', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'data',
          name: 'config',
          value: '{"key": "value"}'
        } as DataDirective,
        location: { start: { line: 1, column: 1 } }
      };

      await service.processDirective(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });

    it('should process a valid data directive with object value', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'data',
          name: 'config',
          value: { key: 'value' }
        } as DataDirective,
        location: { start: { line: 1, column: 1 } }
      };

      await service.processDirective(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });
  });

  describe('Import directive handling', () => {
    it('should process a valid import directive', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: 'test.md'
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };

      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'text', content: 'Test content' }];
      const mockChildState = {};

      mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(mockContent);
      mockStateService.createChildState.mockResolvedValue(mockChildState);
      mockParserService.parse.mockResolvedValue(mockParsedNodes);
      mockInterpreterService.interpret.mockResolvedValue(mockChildState);

      await service.processDirective(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockPathService.resolvePath).toHaveBeenCalledWith('test.md');
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md', 'utf8');
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(mockParserService.parse).toHaveBeenCalledWith(mockContent);
      expect(mockInterpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/test.md',
          mergeState: true
        })
      );
    });

    it('should handle missing import files', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'import',
          path: 'missing.md'
        } as ImportDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/resolved/missing.md');
      mockFileSystemService.exists.mockResolvedValue(false);

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });
  });

  describe('Embed directive handling', () => {
    it('should process a valid embed directive', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          format: 'markdown'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'text', content: 'Test content' }];
      const mockChildState = {};

      mockPathService.resolvePath.mockResolvedValue('/resolved/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(mockContent);
      mockStateService.createChildState.mockResolvedValue(mockChildState);
      mockParserService.parse.mockResolvedValue(mockParsedNodes);
      mockInterpreterService.interpret.mockResolvedValue(mockChildState);

      await service.processDirective(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockPathService.resolvePath).toHaveBeenCalledWith('test.md');
      expect(mockFileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md', 'utf8');
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(mockParserService.parse).toHaveBeenCalledWith(mockContent);
      expect(mockInterpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/test.md',
          mergeState: true
        })
      );
    });

    it('should handle missing embed files', async () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'missing.md'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/resolved/missing.md');
      mockFileSystemService.exists.mockResolvedValue(false);

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });
  });

  describe('Multiple directives processing', () => {
    it('should process multiple directives in sequence', async () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'greeting',
            value: 'Hello'
          } as TextDirective
        },
        {
          type: 'directive',
          directive: {
            kind: 'data',
            name: 'config',
            value: { key: 'value' }
          } as DataDirective
        }
      ];

      await service.processDirectives(nodes);

      expect(mockValidationService.validate).toHaveBeenCalledTimes(2);
      expect(mockStateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });

    it('should stop processing on first error', async () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'greeting',
            value: 'Hello'
          } as TextDirective
        },
        {
          type: 'directive',
          directive: {
            kind: 'unknown'
          } as any
        }
      ];

      await expect(service.processDirectives(nodes)).rejects.toThrow(MeldDirectiveError);
      expect(mockStateService.setTextVar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Section extraction', () => {
    let service: DirectiveService;
    let mockValidationService: any;
    let mockStateService: any;
    let mockPathService: any;
    let mockFileSystemService: any;
    let mockParserService: any;
    let mockInterpreterService: any;

    beforeEach(() => {
      mockValidationService = { validate: vi.fn() };
      mockStateService = {
        setTextVar: vi.fn(),
        setDataVar: vi.fn(),
        createChildState: vi.fn(),
        mergeChildState: vi.fn()
      };
      mockPathService = { resolvePath: vi.fn() };
      mockFileSystemService = { exists: vi.fn(), readFile: vi.fn() };
      mockParserService = { parse: vi.fn() };
      mockInterpreterService = { interpret: vi.fn() };

      service = new DirectiveService();
      service.initialize(
        mockValidationService,
        mockStateService,
        mockPathService,
        mockFileSystemService,
        mockParserService,
        mockInterpreterService
      );
    });

    it('should extract exact section matches', async () => {
      const content = `# Title
## Section One
Content in section one
## Section Two
Content in section two`;

      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          section: 'Section One'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('## Section One');
      expect(parsedContent).toContain('Content in section one');
      expect(parsedContent).not.toContain('Section Two');
    });

    it('should extract sections with fuzzy matching', async () => {
      const content = `# Title
## Getting Started Guide
Content in guide
## Other Section
Other content`;

      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          section: 'Getting Started',
          fuzzy: 0.7
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('## Getting Started Guide');
      expect(parsedContent).toContain('Content in guide');
      expect(parsedContent).not.toContain('Other Section');
    });

    it('should include nested sections', async () => {
      const content = `# Title
## Section One
Content in section one
### Subsection
Nested content
## Section Two
Other content`;

      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          section: 'Section One'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('## Section One');
      expect(parsedContent).toContain('### Subsection');
      expect(parsedContent).toContain('Nested content');
      expect(parsedContent).not.toContain('Section Two');
    });

    it('should throw with helpful message for non-existent sections', async () => {
      const content = `# Title
## Section One
Content`;

      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          section: 'Nonexistent Section'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);

      await expect(service.processDirective(node))
        .rejects
        .toThrow(MeldDirectiveError);

      // The error should contain the closest match suggestion
      await expect(service.processDirective(node))
        .rejects
        .toMatchObject({
          message: expect.stringContaining('Section One')
        });
    });
  });

  describe('Content formatting', () => {
    let service: DirectiveService;
    let mockValidationService: any;
    let mockStateService: any;
    let mockPathService: any;
    let mockFileSystemService: any;
    let mockParserService: any;
    let mockInterpreterService: any;

    beforeEach(() => {
      mockValidationService = { validate: vi.fn() };
      mockStateService = {
        setTextVar: vi.fn(),
        setDataVar: vi.fn(),
        createChildState: vi.fn(),
        mergeChildState: vi.fn()
      };
      mockPathService = { resolvePath: vi.fn() };
      mockFileSystemService = { exists: vi.fn(), readFile: vi.fn() };
      mockParserService = { parse: vi.fn() };
      mockInterpreterService = { interpret: vi.fn() };

      service = new DirectiveService();
      service.initialize(
        mockValidationService,
        mockStateService,
        mockPathService,
        mockFileSystemService,
        mockParserService,
        mockInterpreterService
      );
    });

    it('should format code blocks with language', async () => {
      const content = 'const x = 1;';
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.ts',
          format: 'typescript'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.ts');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should format quotes with > prefix', async () => {
      const content = 'Line 1\nLine 2';
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'quote.txt',
          format: 'quote'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/quote.txt');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toBe('> Line 1\n> Line 2');
    });

    it('should auto-detect format from file extension', async () => {
      const content = 'const x = 1;';
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.ts'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.ts');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should preserve markdown content as-is', async () => {
      const content = '# Title\n## Section';
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.md',
          format: 'markdown'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.md');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toBe(content);
    });

    it('should handle unknown formats as plain text', async () => {
      const content = 'Some content';
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'embed',
          path: 'test.xyz',
          format: 'unknown'
        } as EmbedDirective,
        location: { start: { line: 1, column: 1 } }
      };

      mockPathService.resolvePath.mockResolvedValue('/test.xyz');
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(content);
      mockParserService.parse.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = mockParserService.parse.mock.calls[0][0];
      expect(parsedContent).toBe(content);
    });
  });
}); 