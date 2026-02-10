import { describe, expect, it } from 'vitest';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

interface EnvWithEffects {
  env: Environment;
  effects: TestEffectHandler;
}

function createEnv(): EnvWithEffects {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const effects = new TestEffectHandler();
  env.setEffectHandler(effects);
  return { env, effects };
}

function textNode(content: string, nodeId = 'text-node'): any {
  return { type: 'Text', nodeId, content };
}

function newlineNode(content = '\n', nodeId = 'newline-node'): any {
  return { type: 'Newline', nodeId, content };
}

function commentNode(content: string, nodeId = 'comment-node'): any {
  return { type: 'Comment', nodeId, content };
}

function codeFenceNode(content: string, nodeId = 'code-fence-node'): any {
  return { type: 'CodeFence', nodeId, content };
}

function frontmatterNode(content: string, nodeId = 'frontmatter-node'): any {
  return { type: 'Frontmatter', nodeId, content };
}

function documentEffects(effects: TestEffectHandler): string[] {
  return effects
    .getEffects()
    .filter(effect => effect.type === 'doc')
    .map(effect => effect.content);
}

describe('interpreter traversal behavior', () => {
  it('preserves non-frontmatter traversal ordering for mixed documents', async () => {
    const { env, effects } = createEnv();
    const body = [
      textNode('alpha'),
      newlineNode('\n'),
      commentNode('skip me'),
      textNode('\n\n'),
      codeFenceNode('console.log("code");'),
      textNode('omega')
    ];

    await evaluate(body, env);
    env.renderOutput();

    expect(env.getNodes().map(node => node.type)).toEqual([
      'Text',
      'Newline',
      'Comment',
      'Text',
      'CodeFence',
      'Text'
    ]);

    expect(documentEffects(effects)).toEqual([
      'alpha',
      '\n',
      '\n',
      'console.log("code");',
      'console.log("code");',
      'omega'
    ]);
  });

  it('preserves frontmatter traversal ordering and body intent equivalence', async () => {
    const body = [
      textNode('alpha'),
      newlineNode('\n'),
      commentNode('skip me'),
      textNode('\n\n'),
      codeFenceNode('console.log("code");'),
      textNode('omega')
    ];

    const withFrontmatter = createEnv();
    await evaluate([frontmatterNode('title: Demo\n'), ...body], withFrontmatter.env);
    withFrontmatter.env.renderOutput();

    const withoutFrontmatter = createEnv();
    await evaluate(body, withoutFrontmatter.env);
    withoutFrontmatter.env.renderOutput();

    const frontmatter = withFrontmatter.env.getVariable('fm');
    expect(frontmatter).toBeTruthy();
    expect((frontmatter as any).value).toMatchObject({ title: 'Demo' });

    expect(withFrontmatter.env.getNodes().map(node => node.type)).toEqual(
      withoutFrontmatter.env.getNodes().map(node => node.type)
    );

    expect(documentEffects(withFrontmatter.effects)).toEqual(
      documentEffects(withoutFrontmatter.effects)
    );
  });
});
