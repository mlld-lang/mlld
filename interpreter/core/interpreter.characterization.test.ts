import { describe, expect, it, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import {
  createObjectVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  cleanNamespaceForDisplay,
  evaluate,
  interpolate
} from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const TEXT_SOURCE = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

const OBJECT_SOURCE = {
  directive: 'var' as const,
  syntax: 'object' as const,
  hasInterpolation: false,
  isMultiLine: false
};

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

function variableReferenceNode(
  identifier: string,
  fields?: Array<{ type: 'field'; value: string }>
): any {
  return {
    type: 'VariableReference',
    nodeId: `${identifier}-ref`,
    identifier,
    valueType: 'varIdentifier',
    ...(fields ? { fields } : {})
  };
}

describe('interpreter phase-0 characterization', () => {
  it('keeps public interpreter API entrypoints stable', async () => {
    const { env } = createEnv();
    expect(typeof evaluate).toBe('function');
    expect(evaluate.length).toBe(3);
    expect(typeof interpolate).toBe('function');
    expect(typeof cleanNamespaceForDisplay).toBe('function');
    expect(cleanNamespaceForDisplay.length).toBe(1);
    expect(await interpolate('plain-text' as any, env)).toBe('plain-text');
  });

  it('captures array evaluation vs single-node evaluation behavior', async () => {
    const single = createEnv();
    const singleResult = await evaluate(textNode('single'), single.env);
    single.env.renderOutput();

    expect(singleResult.value).toBe('single');
    expect(single.effects.getEffects()).toHaveLength(0);
    expect(single.env.getNodes()).toHaveLength(0);

    const array = createEnv();
    const arrayResult = await evaluate([textNode('single')], array.env);
    array.env.renderOutput();

    expect(arrayResult.value).toBe('single');
    expect(array.env.getNodes().map(node => node.type)).toEqual(['Text']);
    expect(
      array.effects
        .getEffects()
        .filter(effect => effect.type === 'doc')
        .map(effect => effect.content)
    ).toEqual(['single']);
  });

  it('preserves frontmatter traversal and non-frontmatter ordering semantics', async () => {
    const { env, effects } = createEnv();
    const nodes = [
      frontmatterNode('title: Demo\n'),
      textNode('alpha'),
      newlineNode('\n'),
      textNode('beta')
    ];

    await evaluate(nodes, env);
    env.renderOutput();

    const frontmatter = env.getVariable('fm');
    expect(frontmatter).toBeTruthy();
    expect((frontmatter as any).value).toMatchObject({ title: 'Demo' });

    // Frontmatter is consumed for metadata and is not recorded as a document node.
    expect(env.getNodes().map(node => node.type)).toEqual(['Text', 'Newline', 'Text']);
    expect(
      effects
        .getEffects()
        .filter(effect => effect.type === 'doc')
        .map(effect => effect.content)
    ).toEqual(['alpha', '\n', 'beta']);
  });

  it('suppresses intent emission and node recording in expression context', async () => {
    const { env, effects } = createEnv();
    const result = await evaluate(
      [textNode('alpha'), newlineNode('\n')],
      env,
      { isExpression: true }
    );

    env.renderOutput();

    expect(result.value).toBe('\n');
    expect(effects.getEffects()).toHaveLength(0);
    expect(env.getNodes()).toHaveLength(0);
  });

  it('keeps unknown-node and expression-missing-variable dispatch behavior stable', async () => {
    const { env } = createEnv();

    const missing = await evaluate(variableReferenceNode('missingVar'), env, {
      isExpression: true
    });
    expect(missing.value).toBeUndefined();

    await expect(
      evaluate({ type: 'DefinitelyUnknownNode', nodeId: 'unknown-node' } as any, env)
    ).rejects.toThrow('Unknown node type: DefinitelyUnknownNode');
  });

  it('keeps variable field resolution behavior stable', async () => {
    const { env } = createEnv();
    env.setVariable(
      'profile',
      createObjectVariable(
        'profile',
        { user: { name: 'Ada' } },
        true,
        OBJECT_SOURCE
      )
    );

    const result = await evaluate(
      variableReferenceNode('profile', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'name' }
      ]),
      env
    );

    expect(result.value).toBe('Ada');
  });

  it('keeps variable pipeline-tail resolution behavior stable', async () => {
    const { env } = createEnv();
    await evaluate(
      parseSync(`
/var @name = "ada"
/exe @upper(input) = js { return input.toUpperCase(); }
      `),
      env
    );

    const showDirective = parseSync('/show @name | @upper')[0] as any;
    const invocation = showDirective.values.invocation;
    const result = await evaluate(invocation, env, { isExpression: true });

    expect(isStructuredValue(result.value)).toBe(true);
    expect(asText(result.value as any)).toBe('ADA');
  });

  it('keeps interpolation security recording semantics stable', async () => {
    const { env } = createEnv();
    const alphaDescriptor = makeSecurityDescriptor({ labels: ['secret-alpha'] });
    const betaDescriptor = makeSecurityDescriptor({ labels: ['secret-beta'] });

    env.setVariable(
      'alpha',
      createSimpleTextVariable('alpha', 'A', TEXT_SOURCE, {
        security: alphaDescriptor
      })
    );
    env.setVariable(
      'beta',
      createSimpleTextVariable('beta', 'B', TEXT_SOURCE, {
        security: betaDescriptor
      })
    );

    const recordSpy = vi.spyOn(env, 'recordSecurityDescriptor');

    const templateLikeNode = {
      wrapperType: 'doubleQuote',
      content: [
        variableReferenceNode('alpha'),
        textNode('-'),
        variableReferenceNode('beta')
      ]
    };

    const result = await evaluate(templateLikeNode as any, env);

    expect(result.value).toBe('A-B');
    expect(recordSpy).toHaveBeenCalled();

    const snapshot = env.getSecuritySnapshot();
    expect(snapshot?.labels).toEqual(
      expect.arrayContaining(['secret-alpha', 'secret-beta'])
    );
  });

  it('keeps intent emission ordering and node reconstruction behavior stable', async () => {
    const { env, effects } = createEnv();
    const nodes = [
      textNode('alpha'),
      newlineNode('\n'),
      commentNode('skip me'),
      textNode('\n\n'),
      codeFenceNode('console.log("code");'),
      textNode('omega')
    ];

    await evaluate(nodes, env);
    env.renderOutput();

    expect(env.getNodes().map(node => node.type)).toEqual([
      'Text',
      'Newline',
      'Comment',
      'Text',
      'CodeFence',
      'Text'
    ]);

    expect(
      effects
        .getEffects()
        .filter(effect => effect.type === 'doc')
        .map(effect => effect.content)
    ).toEqual(['alpha', '\n', '\n', 'console.log("code");', 'console.log("code");', 'omega']);
  });

  it('keeps cleanNamespaceForDisplay output contract stable', () => {
    const rendered = cleanNamespaceForDisplay({
      fm: { title: 'Demo' },
      count: { value: 3 },
      name: 'Ada',
      callable: { __executable: true, paramNames: ['value'] },
      typedExecutable: {
        type: 'executable',
        value: { paramNames: ['left', 'right'] }
      }
    });

    const parsed = JSON.parse(rendered);
    expect(parsed).toEqual({
      frontmatter: { title: 'Demo' },
      exports: {
        variables: {
          count: 3,
          name: 'Ada'
        },
        executables: {
          callable: '<function(value)>',
          typedExecutable: '<function(left, right)>'
        }
      }
    });
  });
});
