/**
 * Streaming Adapter Registry
 *
 * Central registry for streaming format adapters.
 * Provides lazy-loading of builtin adapters and registration of custom adapters.
 */

import type { StreamAdapter, AdapterConfig } from './adapters/base';
import { createNDJSONAdapter } from './adapters/ndjson';

export type BuiltinAdapterName =
  | 'claude-code'
  | 'anthropic'
  | 'ndjson'
  | 'claude-agent-sdk'
  | '@mlld/claude-agent-sdk';

export interface AdapterRegistryEntry {
  name: string;
  version: string;
  description?: string;
  factory: () => StreamAdapter;
}

/**
 * Builtin adapter definitions with lazy loading.
 */
const BUILTIN_ADAPTERS: Record<BuiltinAdapterName, () => Promise<StreamAdapter>> = {
  'claude-code': async () => {
    const { createClaudeCodeAdapter } = await import('./adapters/claude-code');
    return createClaudeCodeAdapter();
  },
  'claude-agent-sdk': async () => {
    const { createClaudeCodeAdapter } = await import('./adapters/claude-code');
    return createClaudeCodeAdapter();
  },
  '@mlld/claude-agent-sdk': async () => {
    const { createClaudeCodeAdapter } = await import('./adapters/claude-code');
    return createClaudeCodeAdapter();
  },
  'anthropic': async () => {
    // Anthropic API uses the same format as Claude Code for now
    const { createClaudeCodeAdapter } = await import('./adapters/claude-code');
    return createClaudeCodeAdapter();
  },
  'ndjson': async () => {
    // Generic NDJSON adapter with minimal schema
    return createNDJSONAdapter({
      name: 'generic-ndjson',
      schemas: [{
        kind: 'message',
        matchPath: 'type',
        matchValue: 'text',
        extract: { chunk: ['text', 'content', 'message', 'data'] }
      }]
    });
  }
};

/**
 * Adapter Registry
 *
 * Manages streaming format adapters with support for:
 * - Builtin adapters (lazy-loaded)
 * - Custom adapter registration
 * - Adapter lookup by name
 */
export class AdapterRegistry {
  private customAdapters: Map<string, AdapterRegistryEntry> = new Map();
  private adapterCache: Map<string, StreamAdapter> = new Map();

  /**
   * Register a custom adapter.
   */
  register(name: string, entry: Omit<AdapterRegistryEntry, 'name'>): void {
    this.customAdapters.set(name, { name, ...entry });
    // Clear cache to force fresh creation
    this.adapterCache.delete(name);
  }

  /**
   * Register an adapter from a configuration object.
   */
  registerConfig(config: AdapterConfig): void {
    this.register(config.name, {
      version: '1.0.0',
      description: `Custom adapter: ${config.name}`,
      factory: () => createNDJSONAdapter(config)
    });
  }

  /**
   * Get an adapter by name.
   * Returns a cached instance if available.
   */
  async get(name: string): Promise<StreamAdapter | undefined> {
    // Check cache first
    if (this.adapterCache.has(name)) {
      return this.adapterCache.get(name);
    }

    // Check custom adapters
    if (this.customAdapters.has(name)) {
      const entry = this.customAdapters.get(name)!;
      const adapter = entry.factory();
      this.adapterCache.set(name, adapter);
      return adapter;
    }

    // Check builtin adapters
    if (name in BUILTIN_ADAPTERS) {
      const factory = BUILTIN_ADAPTERS[name as BuiltinAdapterName];
      const adapter = await factory();
      this.adapterCache.set(name, adapter);
      return adapter;
    }

    return undefined;
  }

  /**
   * Get a builtin adapter by name (synchronous).
   * Only works if the adapter has been loaded previously.
   */
  getCached(name: string): StreamAdapter | undefined {
    return this.adapterCache.get(name);
  }

  /**
   * Check if an adapter exists (builtin or custom).
   */
  has(name: string): boolean {
    return this.customAdapters.has(name) || name in BUILTIN_ADAPTERS;
  }

  /**
   * Get list of all available adapter names.
   */
  list(): string[] {
    const builtins = Object.keys(BUILTIN_ADAPTERS);
    const custom = Array.from(this.customAdapters.keys());
    return [...new Set([...builtins, ...custom])];
  }

  /**
   * Get information about an adapter.
   */
  getInfo(name: string): AdapterRegistryEntry | undefined {
    if (this.customAdapters.has(name)) {
      return this.customAdapters.get(name);
    }

    if (name in BUILTIN_ADAPTERS) {
      return {
        name,
        version: '1.0.0',
        description: `Builtin adapter for ${name} streaming format`,
        factory: () => { throw new Error('Use get() for builtin adapters'); }
      };
    }

    return undefined;
  }

  /**
   * Clear the adapter cache.
   */
  clearCache(): void {
    this.adapterCache.clear();
  }

  /**
   * Unregister a custom adapter.
   */
  unregister(name: string): boolean {
    this.adapterCache.delete(name);
    return this.customAdapters.delete(name);
  }
}

/**
 * Global adapter registry instance.
 */
export const adapterRegistry = new AdapterRegistry();

/**
 * Get an adapter by name from the global registry.
 */
export async function getAdapter(name: string): Promise<StreamAdapter | undefined> {
  return adapterRegistry.get(name);
}

/**
 * Register a custom adapter in the global registry.
 */
export function registerAdapter(name: string, entry: Omit<AdapterRegistryEntry, 'name'>): void {
  adapterRegistry.register(name, entry);
}

/**
 * Check if an adapter exists in the global registry.
 */
export function hasAdapter(name: string): boolean {
  return adapterRegistry.has(name);
}
