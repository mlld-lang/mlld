import type {
  Resolver,
  ResolverCapabilities,
  ResolverContent,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError } from '@core/errors/ResolverError';

type DynamicModuleValue = string | Record<string, unknown>;

const MAX_SERIALIZED_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_DEPTH = 10;
const MAX_KEYS_PER_OBJECT = 1000;
const MAX_ELEMENTS_PER_ARRAY = 1000;
const MAX_TOTAL_NODES = 10000;

/**
 * Resolver for in-memory dynamic modules. Treats provided string or object content as
 * module sources and resolves strictly by exact key match.
 */
export class DynamicModuleResolver implements Resolver {
  name = 'dynamic';
  description = 'Resolves in-memory modules injected at runtime';
  type: ResolverType = 'input';

  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['module'],
    defaultContentType: 'module',
    priority: 1,
    cache: { strategy: 'none' }
  };

  private modules: Map<string, string>;

  constructor(modules: Record<string, DynamicModuleValue>) {
    this.modules = this.normalizeModules(modules);
  }

  canResolve(ref: string): boolean {
    return this.modules.has(ref);
  }

  async resolve(ref: string): Promise<ResolverContent> {
    const content = this.modules.get(ref);

    if (content === undefined) {
      throw new ResolverError(`Dynamic module not found: '${ref}'`, {
        resolverName: this.name,
        reference: ref,
        operation: 'resolve'
      });
    }

    return {
      content,
      contentType: 'module',
      ctx: {
        source: `dynamic://${ref}`,
        taintLevel: 'resolver',
        labels: ['dynamic'],
        timestamp: new Date(),
        size: Buffer.byteLength(content, 'utf8')
      }
    };
  }

  async list(): Promise<Array<{ path: string; type: 'file' }>> {
    return Array.from(this.modules.keys()).map(path => ({ path, type: 'file' as const }));
  }

  hasModule(ref: string): boolean {
    return this.modules.has(ref);
  }

  private normalizeModules(modules: Record<string, DynamicModuleValue>): Map<string, string> {
    const normalized = new Map<string, string>();

    for (const [path, content] of Object.entries(modules)) {
      if (typeof content === 'string') {
        normalized.set(path, content);
        continue;
      }

      if (!content || Array.isArray(content) || typeof content !== 'object' || !this.isPlainObject(content)) {
        throw new TypeError(`Dynamic module '${path}' must be string or plain object`);
      }

      const serialized = this.serializeObjectModule(path, content as Record<string, unknown>);
      normalized.set(path, serialized);
    }

    return normalized;
  }

  private serializeObjectModule(path: string, data: Record<string, unknown>): string {
    const stats = { nodes: 0 };
    this.validateStructuredData(path, data, 1, stats);

    const entries = Object.keys(data)
      .sort()
      .map(key => `@${key} = ${this.serializeValue(path, (data as Record<string, unknown>)[key], 2, stats)}`);

    const moduleSource = `/export\n${entries.join('\n')}`;
    this.ensureSizeWithinLimit(path, moduleSource);
    return moduleSource;
  }

  private serializeValue(path: string, value: unknown, depth: number, stats: { nodes: number }): string {
    this.validateStructuredData(path, value, depth, stats);

    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      const items = value.map(item => this.serializeValue(path, item, depth + 1, stats));
      return `[${items.join(',')}]`;
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => `${JSON.stringify(key)}:${this.serializeValue(path, obj[key], depth + 1, stats)}`);
    return `{${pairs.join(',')}}`;
  }

  private validateStructuredData(path: string, value: unknown, depth: number, stats: { nodes: number }): void {
    stats.nodes += 1;
    if (stats.nodes > MAX_TOTAL_NODES) {
      throw new TypeError(`Dynamic module '${path}' exceeds maximum node count (${MAX_TOTAL_NODES})`);
    }

    if (depth > MAX_DEPTH) {
      throw new TypeError(`Dynamic module '${path}' exceeds maximum depth (${MAX_DEPTH})`);
    }

    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > MAX_ELEMENTS_PER_ARRAY) {
        throw new TypeError(`Dynamic module '${path}' array exceeds maximum length (${MAX_ELEMENTS_PER_ARRAY})`);
      }
      return;
    }

    if (typeof value === 'object') {
      if (!this.isPlainObject(value)) {
        throw new TypeError(`Dynamic module '${path}' contains unsupported object type`);
      }
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length > MAX_KEYS_PER_OBJECT) {
        throw new TypeError(`Dynamic module '${path}' object exceeds maximum keys (${MAX_KEYS_PER_OBJECT})`);
      }
      return;
    }

    throw new TypeError(`Dynamic module '${path}' contains unsupported value type`);
  }

  private ensureSizeWithinLimit(path: string, moduleSource: string): void {
    const size = Buffer.byteLength(moduleSource, 'utf8');
    if (size > MAX_SERIALIZED_SIZE_BYTES) {
      throw new TypeError(`Dynamic module '${path}' exceeds maximum serialized size (${MAX_SERIALIZED_SIZE_BYTES} bytes)`);
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
}
