import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateShow } from './show';
import { isStructuredValue, asText } from '../utils/structured-value';

function getDirectiveNodes(ast: any, kind: string) {
  const nodes = Array.isArray(ast) ? ast : Array.isArray(ast?.body) ? ast.body : [];
  return nodes.filter((node: any) => node.type === 'Directive' && node.kind === kind);
}

describe('Alligator structured behaviour', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/workspace');
  });

  it('preserves metadata for alligator-loaded variables and show output', async () => {
    await fileSystem.writeFile('/workspace/README.md', '# Title\n\nBody text.');

    const source = `
/var @doc = <README.md>
/show @doc
`;

    const { ast } = await parse(source);
    const [varDirective] = getDirectiveNodes(ast, 'var');
    const [showDirective] = getDirectiveNodes(ast, 'show');

    expect(varDirective).toBeDefined();
    expect(showDirective).toBeDefined();

    await evaluate(varDirective, env);

    const variable = env.getVariable('doc');
    expect(variable).toBeDefined();
    const varValue = variable?.value;
    expect(isStructuredValue(varValue)).toBe(true);
    if (isStructuredValue(varValue)) {
      expect(varValue.mx.filename).toBe('README.md');
      expect(asText(varValue)).toContain('Body text.');
    }

    const showNode: any = {
      ...showDirective,
      location: showDirective.location || { line: 1, column: 1 },
      meta: showDirective.meta || {}
    };

    const showResult = await evaluateShow(showNode, env);
    expect(isStructuredValue(showResult.value)).toBe(true);
    if (isStructuredValue(showResult.value)) {
      expect(showResult.value.mx.filename).toBe('README.md');
      expect(asText(showResult.value)).toContain('Body text.');
    }
  });
});
