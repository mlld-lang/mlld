import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ResolutionResult } from '@core/resolvers/types';
import { DependencyResolver } from './DependencyResolver';
import { ModuleCache } from './ModuleCache';

class FakeResolverManager {
  public readonly calls: string[] = [];
  constructor(private readonly modules: Record<string, string>) {}

  async resolve(ref: string): Promise<ResolutionResult> {
    this.calls.push(ref);
    const content = this.lookup(ref);
    if (!content) {
      throw new Error(`Unknown module reference: ${ref}`);
    }

    return {
      content: {
        content,
        contentType: 'module',
        metadata: {
          source: ref,
          timestamp: new Date()
        }
      },
      resolverName: 'fake',
      matchedPrefix: undefined,
      resolutionTime: 1
    };
  }

  private lookup(ref: string): string | undefined {
    if (this.modules[ref]) {
      return this.modules[ref];
    }
    const atIndex = ref.lastIndexOf('@');
    if (atIndex > 0) {
      const base = ref.slice(0, atIndex);
      return this.modules[base];
    }
    return undefined;
  }
}

function moduleContent(frontmatter: string, body = ''): string {
  return `${frontmatter}\n${body}`;
}

describe('DependencyResolver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-dep-resolver-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('aggregates module needs across dependency graph', async () => {
    const modules: Record<string, string> = {
      '@alice/a@1.0.0': moduleContent(`---
name: '@alice/a'
author: alice
version: 1.0.0
needs:
  runtimes: ["node@18"]
  tools: ["jq"]
  packages:
    node: ["lodash@4.17.21"]
dependencies:
  "@bob/b": "1.0.0"
---
`),
      '@bob/b@1.0.0': moduleContent(`---
name: '@bob/b'
author: bob
version: 1.0.0
needs:
  tools: ["rg"]
  packages:
    node: ["lodash@^4.17.0", "axios@1.6.0"]
devDependencies:
  "@carol/dev": "0.1.0"
---
`),
      '@carol/dev@0.1.0': moduleContent(`---
name: '@carol/dev'
author: carol
version: 0.1.0
needs:
  runtimes: ["python@3.11"]
  packages:
    python: ["requests==2.31.0"]
---
`)
    };

    const cacheRoot = path.join(tmpDir, 'sha256');
    const cache = new ModuleCache(cacheRoot);
    const resolverManager = new FakeResolverManager(modules);
    const dependencyResolver = new DependencyResolver(resolverManager, cache);

    const result = await dependencyResolver.resolve([
      { name: '@alice/a', version: '1.0.0' }
    ]);

    expect(resolverManager.calls).toEqual(['@alice/a@1.0.0', '@bob/b@1.0.0']);
    expect(result.conflicts).toHaveLength(0);
    expect(Object.keys(result.modules)).toContain('@alice/a@1.0.0');
    expect(Object.keys(result.modules)).toContain('@bob/b@1.0.0');
    expect(Object.keys(result.modules)).not.toContain('@carol/dev@0.1.0');

    const aggregated = result.aggregatedNeeds;
    expect(aggregated.runtimes.map(r => r.raw)).toContain('node@18');
    expect(aggregated.tools.map(t => t.raw)).toEqual(expect.arrayContaining(['jq', 'rg']));

    const lodashSummary = aggregated.packages.find(pkg => pkg.name === 'lodash');
    expect(lodashSummary).toBeDefined();
    expect(lodashSummary?.resolved?.specifier).toBe('4.17.21');
    expect(lodashSummary?.requests).toHaveLength(2);
    expect(lodashSummary?.conflictMessage).toBeUndefined();

    const axiosSummary = aggregated.packages.find(pkg => pkg.name === 'axios');
    expect(axiosSummary?.resolved?.specifier).toBe('1.6.0');

    // Second run should hit cache (no new resolver calls)
    resolverManager.calls.length = 0;
    await dependencyResolver.resolve([
      { name: '@alice/a', version: '1.0.0' }
    ]);
    expect(resolverManager.calls).toHaveLength(0);
  });

  it('includes dev dependencies only when requested', async () => {
    const modules: Record<string, string> = {
      '@root/main@1.0.0': moduleContent(`---
name: '@root/main'
author: root
version: 1.0.0
dependencies:
  "@foo/lib": "1.0.0"
devDependencies:
  "@bar/dev": "2.0.0"
---
`),
      '@foo/lib@1.0.0': moduleContent(`---
name: '@foo/lib'
author: foo
version: 1.0.0
needs:
  packages:
    node: ["left-pad@1.3.0"]
---
`),
      '@bar/dev@2.0.0': moduleContent(`---
name: '@bar/dev'
author: bar
version: 2.0.0
needs:
  packages:
    node: ["left-pad@2.0.0"]
---
`)
    };

    const cache = new ModuleCache(path.join(tmpDir, 'dev-sha256'));
    const resolverManager = new FakeResolverManager(modules);
    const dependencyResolver = new DependencyResolver(resolverManager, cache);

    const withoutDev = await dependencyResolver.resolve([
      { name: '@root/main', version: '1.0.0' }
    ]);
    expect(Object.keys(withoutDev.modules)).toEqual(['@root/main@1.0.0', '@foo/lib@1.0.0']);

    const withDev = await dependencyResolver.resolve([
      { name: '@root/main', version: '1.0.0' }
    ], { includeDevDependencies: true });
    expect(Object.keys(withDev.modules)).toEqual(
      expect.arrayContaining(['@root/main@1.0.0', '@foo/lib@1.0.0', '@bar/dev@2.0.0'])
    );
  });

  it('reports package conflicts when requirements are incompatible', async () => {
    const modules: Record<string, string> = {
      '@root/main@1.0.0': moduleContent(`---
name: '@root/main'
version: 1.0.0
dependencies:
  "@a/pkg": "1.0.0"
  "@b/pkg": "1.0.0"
---
`),
      '@a/pkg@1.0.0': moduleContent(`---
name: '@a/pkg'
version: 1.0.0
needs:
  packages:
    node: ["cool-lib@1.0.0"]
---
`),
      '@b/pkg@1.0.0': moduleContent(`---
name: '@b/pkg'
version: 1.0.0
needs:
  packages:
    node: ["cool-lib@2.0.0"]
---
`)
    };

    const cache = new ModuleCache(path.join(tmpDir, 'conflict-sha256'));
    const resolverManager = new FakeResolverManager(modules);
    const dependencyResolver = new DependencyResolver(resolverManager, cache);

    const result = await dependencyResolver.resolve([
      { name: '@root/main', version: '1.0.0' }
    ]);

    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    expect(conflict.name).toBe('cool-lib');
    expect(conflict.ecosystem).toBe('node');
    expect(conflict.requests).toHaveLength(2);

    const summary = result.aggregatedNeeds.packages.find(pkg => pkg.name === 'cool-lib');
    expect(summary?.conflictMessage).toBeDefined();
    expect(summary?.resolved).toBeUndefined();
  });
});
