import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluateOutput } from './output';
import { wrapStructured } from '../utils/structured-value';
import { createStructuredValueVariable } from '@core/types/variable';

function getDirectiveNodes(ast: any, kind: string) {
  const nodes = Array.isArray(ast) ? ast : Array.isArray(ast?.body) ? ast.body : [];
  return nodes.filter((node: any) => node.type === 'Directive' && (node.kind === kind || node.name === kind));
}

describe('evaluateOutput (structured boundaries)', () => {
  let env: Environment;
  let fs: MemoryFileSystem;

  beforeEach(() => {
    fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/');
    vi.spyOn(env, 'emitEffect').mockImplementation(() => undefined);
  });

  it('writes canonical structured text without re-stringifying data', async () => {
    const structured = wrapStructured(
      { id: 1, name: 'Ada' },
      'object',
      '{ "id": 1, "name": "Ada Lovelace" }'
    );
    const sourceInfo = {
      directive: 'var' as const,
      syntax: 'object' as const,
      hasInterpolation: false,
      isMultiLine: false
    };
    const variable = createStructuredValueVariable('custom', structured, sourceInfo);
    env.setVariable('custom', variable);

    const expectedText = structured.text;

    const source = `
/output @custom to "result.json"
`;
    const { ast } = await parse(source);
    const [outputDirective] = getDirectiveNodes(ast, 'output');
    expect(outputDirective).toBeDefined();
    const outputNode: any = {
      ...outputDirective,
      location: outputDirective.location || { line: 1, column: 1 },
      meta: outputDirective.meta || {}
    };

    await evaluateOutput(outputNode, env);
    const written = await fs.readFile('/result.json');
    expect(written).toBe(expectedText);
  });
});
