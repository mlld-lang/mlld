import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateRun } from './run';
import { asText, isStructuredValue } from '../utils/structured-value';

function getDirectiveNodes(ast: any, name: string) {
  const nodes = Array.isArray(ast) ? ast : Array.isArray(ast?.body) ? ast.body : [];
  return nodes.filter((node: any) => {
    if (node.type !== 'Directive') return false;
    if (node.kind === name) return true;
    if (node.name === name) return true;
    return node.meta?.directiveType === name;
  });
}

describe('evaluateRun (structured flag)', () => {
  let env: Environment;
  let prevFlag: string | undefined;

  beforeEach(() => {
    prevFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'true';

    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/');
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = prevFlag;
    }
  });

  it('wraps run output when structured flag is enabled', async () => {
    const source = `
/exe @emit() = js { return '{"count":2}' }
/run @emit()
`;
    const { ast } = await parse(source);
    const execDirectives = getDirectiveNodes(ast, 'exe');
    const [runDirective] = getDirectiveNodes(ast, 'run');

    for (const directive of execDirectives) {
      await evaluate(directive, env);
    }

    expect(runDirective).toBeDefined();
    const runNode: any = {
      ...runDirective,
      location: runDirective.location || { line: 1, column: 1 },
      meta: runDirective.meta || {}
    };

    const result = await evaluateRun(runNode, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect((result.value as any).type).toBe('text');
    expect(asText(result.value)).toBe('{"count":2}');
  });

  it('returns structured pipeline output when flag is enabled', async () => {
    const source = `
/exe @emit() = js { return '{"count":2}' }
/exe @parseJson(val) = js { return JSON.parse(val) }
/run @emit() with { pipeline: [@parseJson] }
`;
    const { ast } = await parse(source);
    const execDirectives = getDirectiveNodes(ast, 'exe');
    const [runDirective] = getDirectiveNodes(ast, 'run');

    for (const directive of execDirectives) {
      await evaluate(directive, env);
    }

    expect(runDirective).toBeDefined();
    const runNode: any = {
      ...runDirective,
      location: runDirective.location || { line: 1, column: 1 },
      meta: runDirective.meta || {}
    };

    const result = await evaluateRun(runNode, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect((result.value as any).type).toBe('text');
    expect((result.value as any).data).toBe('{"count":2}');
    expect(() => JSON.parse(asText(result.value))).not.toThrow();
  });
});
