import { OutputService } from '../OutputService';
import { MeldOutputError } from '../../../core/errors/MeldOutputError';
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '../../StateService/IStateService';

// Mock StateService
class MockStateService implements IStateService {
  private textVars = new Map<string, string>();
  private dataVars = new Map<string, unknown>();

  getAllTextVars(): Map<string, string> {
    return this.textVars;
  }

  getAllDataVars(): Map<string, unknown> {
    return this.dataVars;
  }

  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  setDataVar(name: string, value: unknown): void {
    this.dataVars.set(name, value);
  }

  // Add other required methods with empty implementations
  getTextVar(): string | undefined { return undefined; }
  getDataVar(): unknown | undefined { return undefined; }
  hasTextVar(): boolean { return false; }
  hasDataVar(): boolean { return false; }
  deleteTextVar(): void {}
  deleteDataVar(): void {}
  clearTextVars(): void {}
  clearDataVars(): void {}
  clone(): IStateService { return new MockStateService(); }
}

describe('OutputService', () => {
  let service: OutputService;
  let state: IStateService;

  beforeEach(() => {
    service = new OutputService();
    state = new MockStateService();
  });

  describe('Format Registration', () => {
    it('should have default formats registered', () => {
      expect(service.supportsFormat('markdown')).toBe(true);
      expect(service.supportsFormat('llm')).toBe(true);
    });

    it('should allow registering custom formats', async () => {
      const customConverter = async () => 'custom';
      service.registerFormat('custom', customConverter);
      expect(service.supportsFormat('custom')).toBe(true);
    });

    it('should throw on invalid format registration', () => {
      expect(() => service.registerFormat('', async () => '')).toThrow();
      expect(() => service.registerFormat('test', null as any)).toThrow();
    });

    it('should list supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain('markdown');
      expect(formats).toContain('llm');
    });
  });

  describe('Markdown Output', () => {
    it('should convert text nodes to markdown', async () => {
      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello world\n'
      }];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should convert directive nodes to markdown comments', async () => {
      const nodes: MeldNode[] = [{
        type: 'directive',
        directive: {
          kind: 'test',
          value: 'example'
        }
      }];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toContain('<!-- @test');
      expect(output).toContain('value":"example"');
    });

    it('should include state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Content'
      }];

      const output = await service.convert(nodes, state, 'markdown', {
        includeState: true
      });

      expect(output).toContain('# Text Variables');
      expect(output).toContain('@text greeting = "hello"');
      expect(output).toContain('# Data Variables');
      expect(output).toContain('@data count = 42');
      expect(output).toContain('Content');
    });

    it('should respect preserveFormatting option', async () => {
      const nodes: MeldNode[] = [{
        type: 'text',
        content: '\n  Hello  \n  World  \n'
      }];

      const preserved = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: true
      });
      expect(preserved).toBe('\n  Hello  \n  World  \n');

      const cleaned = await service.convert(nodes, state, 'markdown', {
        preserveFormatting: false
      });
      expect(cleaned).toBe('Hello  \n  World');
    });
  });

  describe('LLM XML Output', () => {
    it('should convert text nodes to XML', async () => {
      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello world'
      }];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('<text>Hello world</text>');
    });

    it('should convert directive nodes to XML', async () => {
      const nodes: MeldNode[] = [{
        type: 'directive',
        directive: {
          kind: 'test',
          value: 'example'
        }
      }];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('<directive kind="test">');
      expect(output).toContain('<value>"example"</value>');
    });

    it('should properly escape XML special characters', async () => {
      const nodes: MeldNode[] = [{
        type: 'text',
        content: '< > & " \''
      }];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('&lt; &gt; &amp; &quot; &apos;');
    });

    it('should include state variables in XML format when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Content'
      }];

      const output = await service.convert(nodes, state, 'llm', {
        includeState: true
      });

      expect(output).toContain('<state>');
      expect(output).toContain('<text-vars>');
      expect(output).toContain('name="greeting">hello</var>');
      expect(output).toContain('<data-vars>');
      expect(output).toContain('name="count">42</var>');
      expect(output).toContain('<content>');
      expect(output).toContain('<text>Content</text>');
    });
  });

  describe('Error Handling', () => {
    it('should throw MeldOutputError for unsupported formats', async () => {
      await expect(service.convert([], state, 'invalid' as any))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should throw MeldOutputError for unknown node types', async () => {
      const nodes = [{ type: 'unknown' }] as any[];
      await expect(service.convert(nodes, state, 'markdown'))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should wrap errors from format converters', async () => {
      service.registerFormat('error', async () => {
        throw new Error('Test error');
      });

      await expect(service.convert([], state, 'error'))
        .rejects
        .toThrow(MeldOutputError);
    });

    it('should preserve MeldOutputError when thrown from converters', async () => {
      service.registerFormat('error', async () => {
        throw new MeldOutputError('Test error', 'error');
      });

      await expect(service.convert([], state, 'error'))
        .rejects
        .toThrow(MeldOutputError);
    });
  });
}); 