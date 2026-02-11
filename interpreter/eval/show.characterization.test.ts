import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { parseSync } from '@grammar/parser';
import { createObjectVariable, createSimpleTextVariable } from '@core/types/variable';
import { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { evaluateShow } from './show';
import { asText, isStructuredValue } from '../utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { TestEffectHandler } from '../env/EffectHandler';

const SOURCE_INFO = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

const DEFAULT_LOCATION = {
  source: undefined,
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 }
};

function parseDirectives(source: string): DirectiveNode[] {
  return (parseSync(source) as DirectiveNode[]).filter((node: any) => node.type === 'Directive');
}

function toShowDirective(node: any): DirectiveNode {
  return {
    ...node,
    location: node.location || DEFAULT_LOCATION,
    meta: node.meta || {}
  } as DirectiveNode;
}

function textNode(content: string): any {
  return {
    type: 'Text',
    nodeId: `text-${content.length}`,
    content,
    location: DEFAULT_LOCATION
  };
}

function variableRefNode(identifier: string): any {
  return {
    type: 'VariableReference',
    nodeId: `var-${identifier}`,
    valueType: 'varIdentifier',
    identifier,
    location: DEFAULT_LOCATION
  };
}

function createShowDirective(
  subtype: string,
  values: Record<string, unknown>,
  meta: Record<string, unknown> = {}
): DirectiveNode {
  return {
    type: 'Directive',
    nodeId: `show-${subtype}`,
    kind: 'show',
    subtype,
    source: 'test',
    values,
    raw: {},
    meta,
    location: DEFAULT_LOCATION
  } as unknown as DirectiveNode;
}

async function evaluateSetupDirectives(directives: DirectiveNode[], env: Environment): Promise<void> {
  for (const directive of directives) {
    if (directive.kind === 'show') {
      continue;
    }
    await evaluate(directive, env);
  }
}

describe('evaluateShow (characterization)', () => {
  let fileSystem: MemoryFileSystem;
  let env: Environment;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), '/project');
    env.setCurrentFilePath('/project/main.mld');
    env.setEffectHandler(new TestEffectHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.cleanup();
  });

  it('keeps showVariable field-access and tail-pipeline behavior', async () => {
    const directives = parseDirectives(`
/var @user = { profile: { name: "ada" } }
/show @user.profile.name | @upper
`);
    await evaluateSetupDirectives(directives, env);
    const showDirective = directives.find(directive => directive.subtype === 'showVariable');
    expect(showDirective).toBeDefined();

    const result = await evaluateShow(toShowDirective(showDirective), env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(asText(result.value)).toBe('ADA');
  });

  it('keeps template-variable pipeline behavior stable', async () => {
    const [pipelineSourceDirective] = parseDirectives('/show @msg | @upper');
    const pipeline = (pipelineSourceDirective as any).values.invocation.withClause.pipeline;
    const showDirective = createShowDirective('showVariable', {
      invocation: {
        type: 'VariableReferenceWithTail',
        variable: {
          type: 'TemplateVariable',
          identifier: '__template__',
          content: [textNode('mixedCase')]
        },
        withClause: { pipeline }
      }
    });

    const result = await evaluateShow(showDirective, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(asText(result.value)).toBe('MIXEDCASE');
  });

  it('keeps namespace display formatting behavior stable', async () => {
    const namespaceSource = {
      directive: 'var' as const,
      syntax: 'object' as const,
      hasInterpolation: false,
      isMultiLine: false
    };
    const namespace = createObjectVariable(
      'tools',
      {
        fm: { title: 'Utilities' },
        answer: 42,
        greet: { __executable: true, paramNames: ['name'] }
      },
      false,
      namespaceSource
    );
    namespace.internal = { ...(namespace.internal || {}), isNamespace: true };
    env.setVariable('tools', namespace);

    const [showDirective] = parseDirectives('/show @tools');
    expect(showDirective?.subtype).toBe('showVariable');

    const result = await evaluateShow(toShowDirective(showDirective), env);
    const displayed = asText(result.value);
    expect(displayed).toContain('"frontmatter"');
    expect(displayed).toContain('"exports"');
    expect(displayed).toContain('"answer": 42');
    expect(displayed).toContain('<function(name)>');
  });

  it('keeps legacy showPath and showPathSection handling stable', async () => {
    await fileSystem.writeFile('/project/readme.md', '# Intro\n\n## Details\npayload line\n\n## Tail\nignored\n');

    const showPathDirective = createShowDirective('showPath', {
      path: [textNode('readme.md')]
    });
    const showPathResult = await evaluateShow(showPathDirective, env);
    expect(asText(showPathResult.value)).toContain('## Details');
    expect(asText(showPathResult.value)).toContain('payload line');

    const showPathSectionDirective = createShowDirective('showPathSection', {
      sectionTitle: [textNode('Details')],
      path: [textNode('readme.md')],
      newTitle: [textNode('### Summary')]
    });
    const showPathSectionResult = await evaluateShow(showPathSectionDirective, env);
    expect(asText(showPathSectionResult.value)).toContain('### Summary');
    expect(asText(showPathSectionResult.value)).toContain('payload line');
    expect(asText(showPathSectionResult.value)).not.toContain('## Tail');

    const levelOnlyRenameDirective = createShowDirective('showPathSection', {
      sectionTitle: [textNode('Details')],
      path: [textNode('readme.md')],
      newTitle: [textNode('###')]
    });
    const levelOnlyRenameResult = await evaluateShow(levelOnlyRenameDirective, env);
    expect(asText(levelOnlyRenameResult.value)).toContain('### Details');
  });

  it('keeps showInvocation and addInvocation execution behavior stable', async () => {
    const directives = parseDirectives(`
/exe @echo(@value) = js { return value; }
/show @echo("hi")
`);
    await evaluateSetupDirectives(directives, env);
    const showInvocation = directives.find(directive => directive.subtype === 'showInvocation');
    expect(showInvocation).toBeDefined();

    const showResult = await evaluateShow(toShowDirective(showInvocation), env);
    expect(asText(showResult.value)).toBe('hi');

    const addInvocation = {
      ...toShowDirective(showInvocation),
      subtype: 'addInvocation'
    } as DirectiveNode;
    const addResult = await evaluateShow(addInvocation, env);
    expect(asText(addResult.value)).toBe('hi');
  });

  it('keeps showInvocation method-call resolution behavior stable', async () => {
    const directives = parseDirectives(`
/var @items = ["a", "b"]
/show @items.includes("a")
`);
    await evaluateSetupDirectives(directives, env);
    const showInvocation = directives.find(directive => directive.subtype === 'showInvocation');
    expect(showInvocation).toBeDefined();

    const result = await evaluateShow(toShowDirective(showInvocation), env);
    expect(asText(result.value)).toBe('true');
  });

  it('keeps showInvocation non-executable error semantics stable', async () => {
    const directives = parseDirectives(`
/var @text = "value"
/show @text("x")
`);
    await evaluateSetupDirectives(directives, env);
    const showInvocation = directives.find(directive => directive.subtype === 'showInvocation');
    expect(showInvocation).toBeDefined();

    await expect(evaluateShow(toShowDirective(showInvocation), env)).rejects.toThrow(
      'Variable text is not executable'
    );
  });

  it('keeps showExecInvocation and addExecInvocation behavior stable', async () => {
    const directives = parseDirectives(`
/exe @echo(@value) = js { return value; }
/show @echo("exec")
`);
    await evaluateSetupDirectives(directives, env);
    const showInvocation = directives.find(directive => directive.subtype === 'showInvocation');
    expect(showInvocation).toBeDefined();
    const invocation = (showInvocation as any).values.invocation;

    const showExecInvocation = createShowDirective('showExecInvocation', {
      execInvocation: invocation
    });
    const showExecResult = await evaluateShow(showExecInvocation, env);
    expect(asText(showExecResult.value)).toBe('exec');

    const addExecInvocation = createShowDirective('addExecInvocation', {
      execInvocation: invocation
    });
    const addExecResult = await evaluateShow(addExecInvocation, env);
    expect(asText(addExecResult.value)).toBe('exec');
  });

  it('keeps addTemplateInvocation legacy template compatibility stable', async () => {
    const templateNodes = [textNode('Hello '), variableRefNode('name')];
    const templateExecutable: any = {
      type: 'executable',
      name: 'welcomeTemplate',
      value: {
        type: 'template',
        template: templateNodes,
        paramNames: ['name']
      },
      paramNames: ['name'],
      source: {
        directive: 'exe',
        syntax: 'template',
        hasInterpolation: true,
        isMultiLine: false
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      internal: {
        executableDef: {
          type: 'template',
          template: templateNodes
        }
      }
    };
    env.setVariable('welcomeTemplate', templateExecutable);

    const addTemplateInvocation = createShowDirective('addTemplateInvocation', {
      templateName: [textNode('welcomeTemplate')],
      arguments: [textNode('Ada')]
    });
    const result = await evaluateShow(addTemplateInvocation, env);
    expect(asText(result.value)).toBe('Hello Ada');
  });

  it('keeps showForeach and addForeach formatting behavior stable', async () => {
    const directives = parseDirectives(`
/exe @echo(@item) = js { return item; }
/var @items = ["a", "b"]
/show foreach @echo(@items) with { separator: " | " }
`);
    await evaluateSetupDirectives(directives, env);
    const showForeach = directives.find(directive => directive.subtype === 'showForeach');
    expect(showForeach).toBeDefined();

    const showResult = await evaluateShow(toShowDirective(showForeach), env);
    expect(asText(showResult.value)).toBe('a | b');

    const addForeach = {
      ...toShowDirective(showForeach),
      subtype: 'addForeach'
    } as DirectiveNode;
    const addResult = await evaluateShow(addForeach, env);
    expect(asText(addResult.value)).toBe('a | b');
  });

  it('keeps showLoadContent behavior stable for section rename flow', async () => {
    await fileSystem.writeFile('/project/doc.md', '# Intro\n\n## Details\nbody line\n');
    const [showDirective] = parseDirectives('/show <doc.md # Details> as "### Renamed"');
    expect(showDirective?.subtype).toBe('showLoadContent');

    const result = await evaluateShow(toShowDirective(showDirective), env);
    expect(asText(result.value)).toContain('## Details');
    expect(asText(result.value)).toContain('body line');
  });

  it('keeps showTemplate pipeline behavior stable', async () => {
    const [pipelineSourceDirective] = parseDirectives('/show @msg | @upper');
    const pipeline = (pipelineSourceDirective as any).values.invocation.withClause.pipeline;
    const showTemplateDirective = createShowDirective('showTemplate', {
      content: [textNode('body line')],
      pipeline
    });

    const result = await evaluateShow(showTemplateDirective, env);
    expect(asText(result.value)).toBe('BODY LINE');
  });

  it('keeps showCommand and showCode execution paths stable', async () => {
    const [showCommandDirective] = parseDirectives('/show {echo "test"}');
    expect(showCommandDirective?.subtype).toBe('showCommand');
    const commandSpy = vi
      .spyOn(env, 'executeCommand')
      .mockResolvedValue('command-output');

    const commandResult = await evaluateShow(toShowDirective(showCommandDirective), env);
    expect(commandSpy).toHaveBeenCalledTimes(1);
    expect(asText(commandResult.value)).toBe('command-output');

    const codeSpy = vi
      .spyOn(env, 'executeCode')
      .mockResolvedValue('code-output');
    const showCodeDirective = createShowDirective('showCode', {
      lang: [textNode('js')],
      code: [textNode('return 7;')]
    });
    const codeResult = await evaluateShow(showCodeDirective, env);
    expect(codeSpy).toHaveBeenCalledTimes(1);
    expect(asText(codeResult.value)).toBe('code-output');
  });

  it('keeps applyTailPipeline effect path stable for inline show content', async () => {
    const [pipelineSourceDirective] = parseDirectives('/show @msg | @upper');
    const pipeline = (pipelineSourceDirective as any).values.invocation.withClause.pipeline;
    const showDirective = createShowDirective(
      'show',
      {
        content: [textNode('tail pipeline')],
        withClause: { pipeline }
      },
      {
        applyTailPipeline: true
      }
    );
    env.setVariable('msg', createSimpleTextVariable('msg', 'unused', SOURCE_INFO));

    const result = await evaluateShow(showDirective, env);
    expect(asText(result.value)).toBe('TAIL PIPELINE');
  });
});
