import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';

describe('run statements in block bodies', () => {
  it('executes run statements inside exe blocks', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/exe @otherfunc(x) = js { return x }
/exe @demo() = [
  run @otherfunc("ok")
  run cmd {echo hi}
  run js { return "ignored" }
  => "done"
]
/var @out = @demo()
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const outVar = env.getVariable('out');
    expect(outVar).toBeDefined();

    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(outVar!, env);
    expect(isStructuredValue(value) ? asText(value) : value).toBe('done');
  });

  it('executes run statements inside for blocks', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const src = `
/exe @noop(x) = js { return x }
/var @count = 0
/for @item in [1] [
  run @noop(@item)
  run "echo hi"
  run @item | cmd {echo hi}
  run cmd {echo hi}
  run js {return 1}
  @count += 1
]
`;

    const { ast } = await parse(src);
    await evaluate(ast, env);

    const countVar = env.getVariable('count');
    expect(countVar).toBeDefined();

    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(countVar!, env);
    expect(isStructuredValue(value) ? asText(value) : value).toBe(1);
  });
});
