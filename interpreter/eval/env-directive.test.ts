import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

function findChildEnv(
  root: Environment,
  predicate: (env: Environment) => boolean
): Environment | undefined {
  const stack: Environment[] = [root];
  const visited = new Set<Environment>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (predicate(current)) {
      return current;
    }

    const children = Array.from(((current as any).childEnvironments ?? []) as Set<Environment>);
    for (const child of children) {
      stack.push(child);
    }
  }

  return undefined;
}

function findEnvWithScopedTools(root: Environment): Environment | undefined {
  return findChildEnv(root, current => {
    const allowed = (current as any).allowedTools;
    return allowed instanceof Set;
  });
}

describe('box directive', () => {
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
/box @baseEnv with { tools: @agentTools } [
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

  it('supports configless box blocks with with-clause-only config', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/exe @readData() = js { return "ok" }
/var tools @agentTools = {
  read: { mlld: @readData }
}
/box with { tools: @agentTools, profile: "readonly" } [
  show @mx.profile
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    const allowedTools = Array.from(((scopedEnv as any).allowedTools as Set<string>) || []).sort();
    expect(allowedTools).toEqual(['read']);
    expect(scopedEnv?.getScopedEnvironmentConfig()?.profile).toBe('readonly');
  });

  it('applies policy env constraints when deriving box runtime config', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());
    env.recordPolicyConfig('policy', {
      env: {
        default: '@provider/default',
        tools: { allow: ['read'] }
      }
    });

    const src = `
/exe @readData() = js { return "ok" }
/exe @writeData() = js { return "ok" }
/var tools @agentTools = {
  read: { mlld: @readData },
  write: { mlld: @writeData }
}
/box with { tools: @agentTools } [
  show "ok"
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    const allowedTools = Array.from(((scopedEnv as any).allowedTools as Set<string>) || []).sort();
    expect(allowedTools).toEqual(['read']);
    expect(scopedEnv?.getScopedEnvironmentConfig()?.provider).toBe('@provider/default');
    expect(scopedEnv?.getScopedEnvironmentConfig()?._policyDerivedConstraints?.policyEnv).toMatchObject({
      default: '@provider/default'
    });
  });

  it('rejects box config when selected provider is denied by policy', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());
    env.recordPolicyConfig('policy', {
      env: {
        providers: {
          '@provider/blocked': { allowed: false }
        }
      }
    });

    const { ast } = await parse('/box { provider: "@provider/blocked", tools: ["read"] } [ show "ok" ]');
    await expect(evaluate(ast, env)).rejects.toThrow(/denied by policy/i);
  });

  it('enforces tool attenuation', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());
    env.setAllowedTools(['read']);

    const src = `
/var @baseEnv = { provider: '@local' }
/box @baseEnv with { tools: ["read", "write"] } [
  show "ok"
]
`;

    const { ast } = await parse(src);
    await expect(evaluate(ast, env)).rejects.toThrow(/Tool scope cannot add tools outside parent/);
  });

  it('derives box configs with tool overrides', async () => {
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
/box @childEnv [
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

  it('rejects derived box tool expansion', async () => {
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

  it('applies VFS defaults for anonymous box blocks', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const { ast } = await parse('/box [ show "ok" ]');
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    const allowedTools = Array.from(((scopedEnv as any).allowedTools as Set<string>) || []).sort();
    expect(allowedTools).toEqual(['bash', 'glob', 'grep', 'read', 'write']);
    const allowedMcps = Array.from((((scopedEnv as any).allowedMcpServers as Set<string>) || []));
    expect(allowedMcps).toEqual([]);
    expect(scopedEnv?.getScopedEnvironmentConfig()?.net).toEqual({ allow: [] });
    expect(scopedEnv?.getScopedEnvironmentConfig()?.mcps).toEqual([]);
  });

  it('does not apply VFS defaults for object-config boxes without explicit workspace fs', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const { ast } = await parse('/box { tools: ["read"] } [ show "ok" ]');
    await evaluate(ast, env);

    const scopedEnv = findEnvWithScopedTools(env);
    expect(scopedEnv).toBeDefined();
    expect(scopedEnv?.getScopedEnvironmentConfig()?.net).toBeUndefined();
    expect(scopedEnv?.getScopedEnvironmentConfig()?.mcps).toBeUndefined();
  });

  it('does not expose box bridge context for shelf-only llm boxes without explicit workspace fs', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  execution_log: contact[]
}
/exe tool:r @lookup_message(query) = "ok"
/exe llm @agent(prompt, config) = js {
  return JSON.stringify({
    hasBox: Boolean(mx.box),
    inBox: Boolean(mx.llm && mx.llm.inBox)
  });
}
/var @boxState = box {
  shelf: {
    read: [@pipeline.execution_log as execution_log]
  }
} [
  => @agent("inspect", { tools: [@lookup_message] })
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const boxStateValue = env.getVariable('boxState')?.value;
    const boxStateRaw = isStructuredValue(boxStateValue) ? asData(boxStateValue) : boxStateValue;
    expect(boxStateRaw).toEqual({
      hasBox: false,
      inBox: false
    });
  });

  it('inherits parent scoped config when a nested box adds only shelf scope', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  execution_log: contact[]
}
/exe @readData() = js { return "ok" }
/var tools @agentTools = {
  read: { mlld: @readData }
}
/var @baseEnv = { provider: '@local' }
/box @baseEnv with { tools: @agentTools } [
  /box { shelf: { read: [@pipeline.execution_log] } } [
    show "ok"
  ]
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const scopedEnv = findChildEnv(env, current => {
      const scoped = (current as any).scopedEnvironmentConfig;
      return Boolean(scoped?.shelf?.__mlldShelfScope);
    });
    expect(scopedEnv).toBeDefined();

    const allowedTools = Array.from(scopedEnv?.getAllowedTools() ?? []).sort();
    expect(allowedTools).toEqual(['read']);
    expect(scopedEnv?.getScopedEnvironmentConfig()?.provider).toBe('@local');
    expect((scopedEnv?.getScopedEnvironmentConfig() as any)?.shelf?.__mlldShelfScope).toBe(true);
  });
});
