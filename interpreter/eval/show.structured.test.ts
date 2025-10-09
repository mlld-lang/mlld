import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateShow } from './show';
import { asText, isStructuredValue } from '../utils/structured-value';
import { createObjectVariable } from '@core/types/variable';

function getDirectiveNodes(ast: any, name: string) {
  const nodes = Array.isArray(ast) ? ast : Array.isArray(ast?.body) ? ast.body : [];
  return nodes.filter((node: any) => {
    if (node.type !== 'Directive') return false;
    if (node.kind === name) return true;
    if (node.name === name) return true;
    return node.meta?.directiveType === name;
  });
}

describe('evaluateShow (structured)', () => {
  let env: Environment;

  beforeEach(() => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/');
  });

  it('wraps show exec output when structured flag is enabled', async () => {
    const source = `
/exe @emit() = js { return 'hello' }
/show @emit()
`;
    const { ast } = await parse(source);
    const execDirectives = getDirectiveNodes(ast, 'exe');
    const [showDirective] = getDirectiveNodes(ast, 'show');

    for (const directive of execDirectives) {
      await evaluate(directive, env);
    }

    expect(showDirective).toBeDefined();
    const showNode: any = {
      ...showDirective,
      location: showDirective.location || { line: 1, column: 1 },
      meta: showDirective.meta || {}
    };

    const result = await evaluateShow(showNode, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect((result.value as any).type).toBe('text');
    expect(asText(result.value)).toBe('hello');
  });

  it('returns structured data when showing object variables', async () => {
    const sourceInfo = {
      directive: 'var' as const,
      syntax: 'object' as const,
      hasInterpolation: false,
      isMultiLine: false
    };
    const objVariable = createObjectVariable('obj', { count: 2 }, false, sourceInfo);
    env.setVariable('obj', objVariable);

    const source = `
/show @obj
`;
    const { ast } = await parse(source);
    const [showDirective] = getDirectiveNodes(ast, 'show');
    expect(showDirective).toBeDefined();

    const showNode: any = {
      ...showDirective,
      location: showDirective.location || { line: 1, column: 1 },
      meta: showDirective.meta || {}
    };

    const result = await evaluateShow(showNode, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect((result.value as any).type).toBe('object');
    expect((result.value as any).data).toEqual({ count: 2 });
    expect(() => JSON.parse(asText(result.value))).not.toThrow();
  });
});
