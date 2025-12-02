import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClaudeCodeAdapter,
  ClaudeCodeAdapter,
  CLAUDE_CODE_SCHEMAS,
  CLAUDE_CODE_CONFIG
} from '@interpreter/streaming/adapters/claude-code';
import {
  AdapterRegistry,
  adapterRegistry,
  getAdapter,
  registerAdapter,
  hasAdapter
} from '@interpreter/streaming/adapter-registry';

describe('ClaudeCodeAdapter', () => {
  describe('schema configuration', () => {
    it('should have schemas for all event types', () => {
      const kinds = CLAUDE_CODE_SCHEMAS.map(s => s.kind);
      expect(kinds).toContain('thinking');
      expect(kinds).toContain('message');
      expect(kinds).toContain('tool-use');
      expect(kinds).toContain('tool-result');
      expect(kinds).toContain('error');
      expect(kinds).toContain('metadata');
    });

    it('should have templates for all schemas', () => {
      for (const schema of CLAUDE_CODE_SCHEMAS) {
        expect(schema.templates).toBeDefined();
      }
    });

    it('should be named claude-code', () => {
      expect(CLAUDE_CODE_CONFIG.name).toBe('claude-code');
    });
  });

  describe('parsing', () => {
    it('should parse thinking events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"thinking","thinking":"Let me think..."}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('thinking');
      expect(events[0].data.text).toBe('Let me think...');
    });

    it('should parse message events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"text","text":"Hello world"}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('message');
      expect(events[0].data.chunk).toBe('Hello world');
    });

    it('should parse tool_use events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"tool_use","name":"read_file","input":{"path":"test.txt"},"id":"tool-1"}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('tool-use');
      expect(events[0].data.name).toBe('read_file');
      expect(events[0].data.input).toEqual({ path: 'test.txt' });
    });

    it('should parse tool_result events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"tool_result","tool_use_id":"tool-1","content":"file contents","success":true}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('tool-result');
      expect(events[0].data.toolUseId).toBe('tool-1');
    });

    it('should parse error events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"error","message":"Something went wrong","code":"ERR_001"}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('error');
      expect(events[0].data.message).toBe('Something went wrong');
      expect(events[0].data.code).toBe('ERR_001');
    });

    it('should parse usage metadata events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"result","usage":{"input_tokens":100,"output_tokens":50}}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('metadata');
      expect(events[0].data.inputTokens).toBe(100);
      expect(events[0].data.outputTokens).toBe(50);
    });

    it('should handle unknown event types', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"custom","data":"something"}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('unknown');
    });

    it('should include templates in parsed events', () => {
      const adapter = createClaudeCodeAdapter();
      const events = adapter.processChunk('{"type":"thinking","thinking":"Test"}\n');

      expect(events[0].templates).toBeDefined();
      expect(events[0].templates!.text).toBeDefined();
      expect(events[0].templates!.ansi).toBeDefined();
    });
  });

  describe('ClaudeCodeAdapter class', () => {
    it('should be instantiable directly', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.name).toBe('claude-code');
      expect(adapter.format).toBe('ndjson');
    });
  });
});

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('builtin adapters', () => {
    it('should have claude-code adapter', () => {
      expect(registry.has('claude-code')).toBe(true);
    });

    it('should have anthropic adapter', () => {
      expect(registry.has('anthropic')).toBe(true);
    });

    it('should have ndjson adapter', () => {
      expect(registry.has('ndjson')).toBe(true);
    });

    it('should lazy-load claude-code adapter', async () => {
      const adapter = await registry.get('claude-code');
      expect(adapter).toBeDefined();
      expect(adapter!.name).toBe('claude-code');
    });

    it('should cache loaded adapters', async () => {
      const adapter1 = await registry.get('claude-code');
      const adapter2 = await registry.get('claude-code');
      expect(adapter1).toBe(adapter2);
    });
  });

  describe('custom adapters', () => {
    it('should register custom adapters', async () => {
      registry.register('custom', {
        version: '1.0.0',
        factory: () => createClaudeCodeAdapter()
      });

      expect(registry.has('custom')).toBe(true);

      const adapter = await registry.get('custom');
      expect(adapter).toBeDefined();
    });

    it('should register from config', async () => {
      registry.registerConfig({
        name: 'my-adapter',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'msg',
          extract: { chunk: 'text' }
        }]
      });

      const adapter = await registry.get('my-adapter');
      expect(adapter).toBeDefined();
      expect(adapter!.name).toBe('my-adapter');
    });

    it('should unregister custom adapters', () => {
      registry.register('temp', {
        version: '1.0.0',
        factory: () => createClaudeCodeAdapter()
      });

      expect(registry.has('temp')).toBe(true);
      registry.unregister('temp');
      expect(registry.has('temp')).toBe(false);
    });
  });

  describe('listing and info', () => {
    it('should list all available adapters', () => {
      const list = registry.list();
      expect(list).toContain('claude-code');
      expect(list).toContain('anthropic');
      expect(list).toContain('ndjson');
    });

    it('should get adapter info', () => {
      const info = registry.getInfo('claude-code');
      expect(info).toBeDefined();
      expect(info!.name).toBe('claude-code');
    });

    it('should return undefined for unknown adapters', async () => {
      const adapter = await registry.get('nonexistent');
      expect(adapter).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await registry.get('claude-code');
      expect(registry.getCached('claude-code')).toBeDefined();

      registry.clearCache();
      expect(registry.getCached('claude-code')).toBeUndefined();
    });
  });
});

describe('global registry functions', () => {
  it('getAdapter should work', async () => {
    const adapter = await getAdapter('claude-code');
    expect(adapter).toBeDefined();
  });

  it('hasAdapter should work', () => {
    expect(hasAdapter('claude-code')).toBe(true);
    expect(hasAdapter('nonexistent')).toBe(false);
  });

  it('registerAdapter should work', async () => {
    registerAdapter('test-global', {
      version: '1.0.0',
      factory: () => createClaudeCodeAdapter()
    });

    expect(hasAdapter('test-global')).toBe(true);
  });
});
