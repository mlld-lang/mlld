import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResolutionService } from './ResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { ResolutionContext } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

// Mock the logger
vi.mock('@core/utils/logger', () => ({
  resolutionLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('ResolutionService', () => {
  let service: ResolutionService;
  let stateService: IStateService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
    } as unknown as IStateService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn(),
    } as unknown as IParserService;

    service = new ResolutionService(
      stateService,
      fileSystemService,
      parserService
    );

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: stateService
    };
  });

  describe('resolveInContext', () => {
    it('should handle text nodes', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'simple text'
      };
      vi.mocked(parserService.parse).mockResolvedValue([textNode]);

      const result = await service.resolveInContext('simple text', context);
      expect(result).toBe('simple text');
    });

    it('should resolve text variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');

      const result = await service.resolveInContext('{{greeting}}', context);
      expect(result).toBe('Hello World');
    });

    it('should resolve data variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'config',
          value: '{ "key": "value" }'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getDataVar).mockReturnValue({ key: 'value' });

      const result = await service.resolveInContext('{{config}}', context);
      expect(result).toBe('{"key":"value"}');
    });

    it('should resolve path variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getPathVar).mockReturnValue('/home/user');

      const result = await service.resolveInContext('$HOMEPATH', context);
      expect(result).toBe('/home/user');
    });

    it('should resolve command references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          value: '$echo(hello)',
          args: ['hello']
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]'
      });

      const result = await service.resolveInContext('$echo(hello)', context);
      expect(result).toBe('echo hello');
    });

    it('should handle parsing failures by treating value as text', async () => {
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      const result = await service.resolveInContext('unparseable content', context);
      expect(result).toBe('unparseable content');
    });

    it('should concatenate multiple nodes', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'Hello '
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'name',
            value: 'World'
          }
        }
      ];
      vi.mocked(parserService.parse).mockResolvedValue(nodes);
      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await service.resolveInContext('Hello {{name}}', context);
      expect(result).toBe('Hello World');
    });
  });

  describe('resolveContent', () => {
    it('should read file content', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('file content');

      const result = await service.resolveContent('/path/to/file');
      expect(result).toBe('file content');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/file');
    });

    it('should throw when file does not exist', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(service.resolveContent('/missing/file'))
        .rejects
        .toThrow('File not found: /missing/file');
    });
  });

  describe('extractSection', () => {
    it('should extract section by heading', async () => {
      const content = `# Title
Some content

## Section 1
Content 1

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1');
    });

    it('should include content until next heading of same or higher level', async () => {
      const content = `# Title
Some content

## Section 1
Content 1
### Subsection
Subcontent

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1\n\n### Subsection\n\nSubcontent');
    });

    it('should throw when section is not found', async () => {
      const content = '# Title\nContent';

      await expect(service.extractSection(content, 'Missing Section'))
        .rejects
        .toThrow('Section not found: Missing Section');
    });
  });

  describe('validateResolution', () => {
    it('should validate text variables are allowed', async () => {
      context.allowedVariableTypes.text = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var',
          value: 'value'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('{{var}}', context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should validate data variables are allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'var',
          value: 'value'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('{{var}}', context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should validate path variables are allowed', async () => {
      context.allowedVariableTypes.path = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'var'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('$var', context))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should validate command references are allowed', async () => {
      context.allowedVariableTypes.command = false;
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'cmd',
          value: '$cmd()',
          args: []
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);

      await expect(service.validateResolution('$cmd()', context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect direct circular references', async () => {
      const nodeA: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'a',
          value: '{{b}}'
        }
      };
      const nodeB: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'b',
          value: '{{a}}'
        }
      };

      vi.mocked(parserService.parse)
        .mockImplementation((text) => {
          if (text === '{{a}}') return [nodeA];
          if (text === '{{b}}') return [nodeB];
          return [];
        });

      vi.mocked(stateService.getTextVar)
        .mockImplementation((name) => {
          if (name === 'a') return '{{b}}';
          if (name === 'b') return '{{a}}';
          return undefined;
        });

      await expect(service.detectCircularReferences('{{a}}'))
        .rejects
        .toThrow('Circular reference detected: a -> b -> a');
    });

    it('should handle non-circular references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello {{name}}'
        }
      };
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Hello ${name}')
        .mockReturnValueOnce('World');

      await expect(service.detectCircularReferences('{{greeting}}'))
        .resolves
        .not.toThrow();
    });
  });
}); 