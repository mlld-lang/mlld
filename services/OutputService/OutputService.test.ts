import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputService } from './OutputService.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import {
  createTextNode,
  createDirectiveNode,
  createCodeFenceNode,
  createLocation
} from '../../tests/utils/testFactories';

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

// Mock ResolutionService
class MockResolutionService implements IResolutionService {
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // For testing, just return the value as is
    return value;
  }

  // Add other required methods with empty implementations
  resolveText(): Promise<string> { return Promise.resolve(''); }
  resolveData(): Promise<any> { return Promise.resolve(null); }
  resolvePath(): Promise<string> { return Promise.resolve(''); }
  resolveCommand(): Promise<string> { return Promise.resolve(''); }
  resolveFile(): Promise<string> { return Promise.resolve(''); }
  resolveContent(): Promise<string> { return Promise.resolve(''); }
  validateResolution(): Promise<void> { return Promise.resolve(); }
  extractSection(): Promise<string> { return Promise.resolve(''); }
  detectCircularReferences(): Promise<void> { return Promise.resolve(); }
}

describe('OutputService', () => {
  let service: OutputService;
  let state: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    state = new MockStateService();
    resolutionService = new MockResolutionService();
    service = new OutputService(resolutionService);
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
      const nodes: MeldNode[] = [
        createTextNode('Hello world\n', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Hello world\n');
    });

    it('should convert directive nodes to markdown', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('test', { value: 'example' }, createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toContain('### test Directive');
      expect(output).toContain('"value": "example"');
    });

    it('should include state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

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
      const nodes: MeldNode[] = [
        createTextNode('\n  Hello  \n  World  \n', createLocation(1, 1))
      ];

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
    it('should preserve text content', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const nodes: MeldNode[] = [
        createCodeFenceNode('const x = 1;', 'typescript', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('typescript');
    });

    it('should preserve directive content', async () => {
      const nodes: MeldNode[] = [
        createDirectiveNode('test', { value: 'example' }, createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm');
      expect(output).toContain('test');
      expect(output).toContain('example');
    });

    it('should preserve state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'llm', {
        includeState: true
      });

      expect(output).toContain('greeting');
      expect(output).toContain('hello');
      expect(output).toContain('count');
      expect(output).toContain('42');
      expect(output).toContain('Content');
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