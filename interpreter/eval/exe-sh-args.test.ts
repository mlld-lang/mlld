import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createEnvironment(): { env: Environment; effects: TestEffectHandler } {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const effects = new TestEffectHandler();
  env.setEffectHandler(effects);
  return { env, effects };
}

async function runScript(source: string): Promise<string> {
  const { env, effects } = createEnvironment();
  const { ast } = await parse(source, { mode: 'strict' });
  await evaluate(ast, env);
  env.renderOutput();
  return effects.getEffects().map(effect => effect.content).join('');
}

describe('exe sh(@var) support', () => {
  it('supports sh(@param) in exe definitions', async () => {
    const output = await runScript([
      '/needs { sh }',
      '/exe @deploy(path) = sh(@path) { printf "%s" "$path" }',
      '/show @deploy("release-x")'
    ].join('\n'));

    expect(output).toContain('release-x');
  });

  it('supports sh(@var) bindings from caller scope in exe definitions', async () => {
    const output = await runScript([
      '/needs { sh }',
      '/var @target = "outer-target"',
      '/exe @deploy() = sh(@target) { printf "%s" "$target" }',
      '/show @deploy()'
    ].join('\n'));

    expect(output).toContain('outer-target');
  });
});
