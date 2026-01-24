import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

function findEnvWithScopedTools(root: Environment): Environment | undefined {
  const stack: Environment[] = [root];
  const visited = new Set<Environment>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const allowed = (current as any).allowedTools;
    if (allowed instanceof Set) {
      return current;
    }

    const children = Array.from(((current as any).childEnvironments ?? []) as Set<Environment>);
    for (const child of children) {
      stack.push(child);
    }
  }

  return undefined;
}

describe('env directive', () => {
  it('sets scoped tools and environment config', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/exe @readData() = js { return "ok" }
/exe @writeData() = js { return "ok" }
/var tools @agentTools = {
  read: { mlld: @readData },
  write: { mlld: @writeData }
}
/var @baseEnv = { provider: '@local' }
/env @baseEnv with { tools: @agentTools } [
  show "ok"
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    const allowedTools = Array.from(((scopedEnv as any).allowedTools as Set<string>) || []).sort();
    expect(allowedTools).toEqual(['read', 'write']);
    expect(scopedEnv?.getScopedEnvironmentConfig()?.provider).toBe('@local');
  });

  it('enforces tool attenuation', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());
    env.setAllowedTools(['read']);

    const src = `
/var @baseEnv = { provider: '@local' }
/env @baseEnv with { tools: ["read", "write"] } [
  show "ok"
]
`;

    const { ast } = await parse(src);
    await expect(evaluate(ast, env)).rejects.toThrow(/Tool scope cannot add tools outside parent/);
  });

  it('derives env configs with tool overrides', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/exe @readData() = js { return "ok" }
/exe @writeData() = js { return "ok" }
/var tools @allTools = {
  read: { mlld: @readData },
  write: { mlld: @writeData }
}
/var @baseEnv = { provider: '@local', tools: @allTools }
/var @childEnv = new @baseEnv with { tools: ["read"] }
/env @childEnv [
  show "ok"
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    const allowedTools = Array.from(((scopedEnv as any).allowedTools as Set<string>) || []).sort();
    expect(allowedTools).toEqual(['read']);
  });

  it('rejects derived env tool expansion', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/var @baseEnv = { provider: '@local', tools: ["read"] }
/var @childEnv = new @baseEnv with { tools: ["read", "write"] }
`;

    const { ast } = await parse(src);
    await expect(evaluate(ast, env)).rejects.toThrow(/Tool scope cannot add tools outside parent/);
  });
});
