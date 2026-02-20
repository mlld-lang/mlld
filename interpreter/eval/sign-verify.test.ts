import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '../env/Environment';
import { evaluateSign, evaluateVerify } from './sign-verify';
import { createTemplateVariable } from '@core/types/variable';
import type { DirectiveNode } from '@core/types';

const pathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('/sign evaluation', () => {
  it('stores template content and signature metadata', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var @prompt = ::Evaluate @input::
/sign @prompt by "alice" with sha256
`.trim();

    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    const sigPath = '/project/.sig/content/prompt.sig.json';
    const contentPath = '/project/.sig/content/prompt.sig.content';
    const signature = JSON.parse(await fileSystem.readFile(sigPath));
    const content = await fileSystem.readFile(contentPath);

    expect(content).toBe('Evaluate @input');
    expect(signature.algorithm).toBe('sha256');
    expect(signature.signedBy).toBe('alice');
    expect(signature.hash.startsWith('sha256:')).toBe(true);
  });
});

function makeDirective(
  kind: 'sign' | 'verify',
  identifier: string,
  method?: string
): DirectiveNode {
  return {
    type: 'Directive',
    kind,
    subtype: kind,
    nodeId: 'test',
    values: {
      identifier: [{ type: 'Text', content: identifier, nodeId: 'id' }],
      ...(method ? { method: [{ type: 'Text', content: method, nodeId: 'method' }] } : {})
    }
  } as DirectiveNode;
}

function makeTemplateVariable(name: string, content: string | any[]) {
  return createTemplateVariable(
    name,
    content,
    undefined,
    'doubleColon',
    {
      directive: 'var',
      syntax: 'template',
      wrapperType: 'doubleColon',
      hasInterpolation: true,
      isMultiLine: false
    }
  );
}

describe('/verify evaluation', () => {
  it('verifies signed template content', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/project');
    const templateNodes = [
      { type: 'Text', content: 'Evaluate ', nodeId: 't1' },
      { type: 'VariableReference', identifier: 'input', nodeId: 'v1', valueType: 'variable' }
    ];
    env.setVariable('prompt', makeTemplateVariable('prompt', templateNodes));

    await evaluateSign(makeDirective('sign', 'prompt', 'sha256'), env);
    const result = await evaluateVerify(makeDirective('verify', 'prompt'), env);

    expect(result.value.verified).toBe(true);
    expect(result.value.template).toBe('Evaluate @input');
    expect(result.value.hash?.startsWith('sha256:')).toBe(true);
    expect(result.value.error).toBeUndefined();
  });

  it('returns false when content changes', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/project');
    const templateNodes = [
      { type: 'Text', content: 'Evaluate ', nodeId: 't1' },
      { type: 'VariableReference', identifier: 'input', nodeId: 'v1', valueType: 'variable' }
    ];
    env.setVariable('prompt', makeTemplateVariable('prompt', templateNodes));

    await evaluateSign(makeDirective('sign', 'prompt', 'sha256'), env);
    const promptVar = env.getVariable('prompt');
    if (promptVar) {
      promptVar.value = 'Evaluate @input with care';
    }
    const result = await evaluateVerify(makeDirective('verify', 'prompt'), env);

    expect(result.value.verified).toBe(false);
    expect(result.value.template).toBeUndefined();
    expect(typeof result.value.error).toBe('string');
  });
});
