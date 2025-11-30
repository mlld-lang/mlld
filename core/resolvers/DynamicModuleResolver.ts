import type {
  Resolver,
  ResolverCapabilities,
  ResolverContent,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError } from '@core/errors/ResolverError';

/**
 * Resolver for in-memory dynamic modules. Treats provided string content as
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

  constructor(modules: Record<string, string>) {
    for (const [path, content] of Object.entries(modules)) {
      if (typeof content !== 'string') {
        throw new TypeError(
          `Dynamic module content must be string, got ${typeof content} for '${path}'`
        );
      }
    }

    this.modules = new Map(Object.entries(modules));
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
}
