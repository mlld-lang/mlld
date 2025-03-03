import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputService } from './OutputService.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import {
  createTextNode,
  createDirectiveNode,
  createCodeFenceNode,
  createLocation
} from '../../../tests/utils/testFactories.js';
// Import centralized syntax examples
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  runDirectiveExamples,
  defineDirectiveExamples
} from '@core/syntax/index.js';
import { getExample, getInvalidExample, createNodeFromExample } from '@tests/utils/syntax-test-helpers.js';

// Mock StateService
class MockStateService implements IStateService {
  private textVars = new Map<string, string>();
  private dataVars = new Map<string, unknown>();
  private pathVars = new Map<string, string>();
  private commands = new Map<string, { command: string; options?: Record<string, unknown> }>();
  private nodes: MeldNode[] = [];
  private transformationEnabled = false;
  private transformedNodes: MeldNode[] = [];
  private imports = new Set<string>();
  private filePath: string | null = null;
  private _isImmutable = false;

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.dataVars);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.pathVars);
  }

  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }> {
    return new Map(this.commands);
  }

  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  setDataVar(name: string, value: unknown): void {
    this.dataVars.set(name, value);
  }

  setPathVar(name: string, value: string): void {
    this.pathVars.set(name, value);
  }

  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    const cmdDef = typeof command === 'string' ? { command } : command;
    this.commands.set(name, cmdDef);
  }

  isTransformationEnabled(): boolean {
    return this.transformationEnabled;
  }

  enableTransformation(enable: boolean = true): void {
    this.transformationEnabled = enable;
  }

  getTransformedNodes(): MeldNode[] {
    if (this.transformationEnabled) {
      return this.transformedNodes.length > 0 ? [...this.transformedNodes] : [...this.nodes];
    }
    return [...this.nodes];
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    const index = this.transformedNodes.indexOf(original);
    if (index >= 0) {
      this.transformedNodes[index] = transformed;
    }
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.transformedNodes = [...nodes];
  }

  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }

  appendContent(content: string): void {
    this.nodes.push({ type: 'Text', content } as TextNode);
  }

  addImport(path: string): void {
    this.imports.add(path);
  }

  removeImport(path: string): void {
    this.imports.delete(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.imports);
  }

  getCurrentFilePath(): string | null {
    return this.filePath;
  }

  setCurrentFilePath(path: string): void {
    this.filePath = path;
  }

  hasLocalChanges(): boolean {
    return true;
  }

  getLocalChanges(): string[] {
    return ['state'];
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new MockStateService();
    child.textVars = new Map(this.textVars);
    child.dataVars = new Map(this.dataVars);
    child.pathVars = new Map(this.pathVars);
    child.commands = new Map(this.commands);
    child.nodes = [...this.nodes];
    child.transformationEnabled = this.transformationEnabled;
    child.transformedNodes = [...this.transformedNodes];
    child.imports = new Set(this.imports);
    child.filePath = this.filePath;
    child._isImmutable = this._isImmutable;
    return child;
  }

  mergeChildState(childState: IStateService): void {
    const child = childState as MockStateService;
    // Merge all state
    for (const [key, value] of child.textVars) {
      this.textVars.set(key, value);
    }
    for (const [key, value] of child.dataVars) {
      this.dataVars.set(key, value);
    }
    for (const [key, value] of child.pathVars) {
      this.pathVars.set(key, value);
    }
    for (const [key, value] of child.commands) {
      this.commands.set(key, value);
    }
    this.nodes.push(...child.nodes);
    if (child.transformationEnabled) {
      this.transformationEnabled = true;
      this.transformedNodes.push(...child.transformedNodes);
    }
    for (const imp of child.imports) {
      this.imports.add(imp);
    }
  }

  clone(): IStateService {
    const cloned = new MockStateService();
    cloned.textVars = new Map(this.textVars);
    cloned.dataVars = new Map(this.dataVars);
    cloned.pathVars = new Map(this.pathVars);
    cloned.commands = new Map(this.commands);
    cloned.nodes = [...this.nodes];
    cloned.transformationEnabled = this.transformationEnabled;
    cloned.transformedNodes = [...this.transformedNodes];
    cloned.imports = new Set(this.imports);
    cloned.filePath = this.filePath;
    cloned._isImmutable = this._isImmutable;
    return cloned;
  }

  // Required interface methods
  getTextVar(name: string): string | undefined { return this.textVars.get(name); }
  getDataVar(name: string): unknown | undefined { return this.dataVars.get(name); }
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined { return this.commands.get(name); }
  getPathVar(name: string): string | undefined { return this.pathVars.get(name); }
  getLocalTextVars(): Map<string, string> { return new Map(this.textVars); }
  getLocalDataVars(): Map<string, unknown> { return new Map(this.dataVars); }
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
    service = new OutputService();
    service.initialize(state, resolutionService);
  });

  describe('Format Registration', () => {
    it('should have default formats registered', () => {
      expect(service.supportsFormat('markdown')).toBe(true);
      expect(service.supportsFormat('xml')).toBe(true);
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
      expect(formats).toContain('xml');
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

    it('should handle directive nodes according to type', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      
      // Definition directive - using @text example
      const textExample = getExample('text', 'atomic', 'simpleString');
      const textNode = await createNodeFromExample(textExample.code);
      let output = await service.convert([textNode], state, 'markdown');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive - using @run example
      const runExample = getExample('run', 'atomic', 'simple');
      const runNode = await createNodeFromExample(runExample.code);
      output = await service.convert([runNode], state, 'markdown');
      expect(output).toBe('[run directive output placeholder]\n');
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

  describe('XML Output', () => {
    it('should preserve text content', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello world', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('Hello world');
    });

    it('should preserve code fence content', async () => {
      const nodes: MeldNode[] = [
        createCodeFenceNode('const x = 1;', 'typescript', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'xml');
      expect(output).toContain('const x = 1;');
      expect(output).toContain('typescript');
    });

    it('should handle directives according to type', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      
      // Definition directive - using @text example
      const textExample = getExample('text', 'atomic', 'simpleString');
      const textNode = await createNodeFromExample(textExample.code);
      let output = await service.convert([textNode], state, 'xml');
      expect(output).toBe(''); // Definition directives are omitted

      // Execution directive - using @run example
      const runExample = getExample('run', 'atomic', 'simple');
      const runNode = await createNodeFromExample(runExample.code);
      output = await service.convert([runNode], state, 'xml');
      expect(output).toContain('[run directive output placeholder]');
    });

    it('should preserve state variables when requested', async () => {
      state.setTextVar('greeting', 'hello');
      state.setDataVar('count', 42);

      const nodes: MeldNode[] = [
        createTextNode('Content', createLocation(1, 1))
      ];

      const output = await service.convert(nodes, state, 'xml', {
        includeState: true
      });

      expect(output).toContain('greeting');
      expect(output).toContain('hello');
      expect(output).toContain('count');
      expect(output).toContain('42');
      expect(output).toContain('Content');
    });
  });

  describe('Transformation Mode', () => {
    it('should use transformed nodes when transformation is enabled', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        // Using a run directive example
        await createNodeFromExample(getExample('run', 'atomic', 'simple').code)
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('test output\n', createLocation(1, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('test output\n');
    });

    it('should handle mixed content in transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example
        await createNodeFromExample(getExample('run', 'atomic', 'simple').code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);

      const output = await service.convert(originalNodes, state, 'markdown');
      expect(output).toBe('Before\ntest output\nAfter\n');
    });

    it('should handle definition directives in non-transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a text directive example from centralized examples
        await createNodeFromExample(getExample('text', 'atomic', 'simpleString').code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\nAfter\n');
    });

    it('should show placeholders for execution directives in non-transformation mode', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const nodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example from centralized examples
        await createNodeFromExample(getExample('run', 'atomic', 'simple').code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      const output = await service.convert(nodes, state, 'markdown');
      expect(output).toBe('Before\n[run directive output placeholder]\nAfter\n');
    });

    it('should preserve code fences in both modes', async () => {
      // Create a code fence node using the proper factory function
      const codeFenceNode = createCodeFenceNode(
        'const greeting = \'Hello, world!\';\nconsole.log(greeting);',
        'js',
        createLocation(1, 1)
      );
      
      const originalNodes = [
        createTextNode('Before\n', createLocation(1, 1)),
        codeFenceNode,
        createTextNode('\nAfter', createLocation(3, 1))
      ];

      // Test non-transformation mode
      state.enableTransformation(false);
      
      let output = await service.convert(originalNodes, state, 'markdown');
      expect(output).to.include('Before');
      expect(output).to.include('```js');
      expect(output).to.include('const greeting = \'Hello, world!\';');
      expect(output).to.include('console.log(greeting);');
      expect(output).to.include('After');

      // Test transformation mode
      state.enableTransformation(true);
      // Set the transformed nodes to be the same as the original nodes
      state.setTransformedNodes(originalNodes);
      
      output = await service.convert(originalNodes, state, 'markdown');
      expect(output).to.include('Before');
      expect(output).to.include('```js');
      expect(output).to.include('const greeting = \'Hello, world!\';');
      expect(output).to.include('console.log(greeting);');
      expect(output).to.include('After');
    });

    it('should handle XML output in both modes', async () => {
      // MIGRATION: Using centralized syntax examples instead of hardcoded examples
      const originalNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        // Using a run directive example
        await createNodeFromExample(getExample('run', 'atomic', 'simple').code),
        createTextNode('After\n', createLocation(3, 1))
      ];

      // Non-transformation mode
      let output = await service.convert(originalNodes, state, 'xml');
      expect(output).toContain('Before');
      expect(output).toContain('[run directive output placeholder]');
      expect(output).toContain('After');

      // Transformation mode
      const transformedNodes: MeldNode[] = [
        createTextNode('Before\n', createLocation(1, 1)),
        createTextNode('test output\n', createLocation(2, 1)),
        createTextNode('After\n', createLocation(3, 1))
      ];

      state.enableTransformation();
      state.setTransformedNodes(transformedNodes);
      output = await service.convert(originalNodes, state, 'xml');
      expect(output).toContain('Before');
      expect(output).toContain('test output');
      expect(output).toContain('After');
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