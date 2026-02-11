import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
} as const;

const ACTIVE_KEY = 'TEST_FOR_EXPR_PAR_ACTIVE';
const MAX_KEY = 'TEST_FOR_EXPR_PAR_MAX';

function createRuntime() {
  const fileSystem = new MemoryFileSystem();
  const service = new PathService(fileSystem, '/');
  return { fileSystem, pathService: service };
}

async function interpretWithEnv(source: string): Promise<Environment> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    useMarkdownFormatter: false,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return environment;
}

async function requireValue(env: Environment, identifier: string): Promise<unknown> {
  const variable = env.getVariable(identifier);
  if (!variable) {
    throw new Error(`Expected variable @${identifier} to exist`);
  }
  return extractVariableValue(variable, env);
}

async function interpretWithOutputAndEnv(source: string): Promise<{ output: string; env: Environment }> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | null = null;
  const output = await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: pathContext.filePath,
    format: 'markdown',
    normalizeBlankLines: true,
    useMarkdownFormatter: false,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error('Failed to capture environment');
  }

  return { output, env: environment };
}

describe('for evaluator characterization', () => {
  beforeEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
  });

  afterEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
  });

  it('binds dotted iteration fields and keeps full item access in for expressions', async () => {
    const env = await interpretWithEnv(`
/var @items = [
  { "path": "alpha.md", "size": 10 },
  { "path": "beta.md", "size": 20 }
]
/var @paths = for @item.path in @items => @item.path
/var @sizes = for @item.path in @items => @item.size
`);

    expect(await requireValue(env, 'paths')).toEqual(['alpha.md', 'beta.md']);
    expect(await requireValue(env, 'sizes')).toEqual([10, 20]);
  });

  it('attaches object-iteration keys to @item.mx.key', async () => {
    const env = await interpretWithEnv(`
/var @items = {
  "first": { "value": 1 },
  "second": { "value": 2 }
}
/var @keys = for @item in @items => @item.mx.key
`);

    expect(await requireValue(env, 'keys')).toEqual(['first', 'second']);
  });

  it('preserves file metadata for file-like object values during iteration binding', async () => {
    const env = await interpretWithEnv(`
/var @files = [
  { "content": "alpha", "filename": "a.md", "relative": "docs/a.md", "absolute": "/repo/docs/a.md" },
  { "content": "beta", "filename": "b.md", "relative": "docs/b.md", "absolute": "/repo/docs/b.md" }
]
/var @relativePaths = for @file in @files => @file.mx.relative
/var @dirNames = for @file in @files => @file.mx.dirname
`);

    expect(await requireValue(env, 'relativePaths')).toEqual(['docs/a.md', 'docs/b.md']);
    expect(await requireValue(env, 'dirNames')).toEqual(['docs', 'docs']);
  });

  it('includes iteration key context when dotted field access fails', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/var @items = [{ "name": "alpha" }]
/var @paths = for @item.path in @items => @item.path
`;

    await expect(
      interpret(input, {
        fileSystem,
        pathService: runtimePathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      })
    ).rejects.toThrow('Field "path" not found in object in for binding @item.path (key 0)');
  });

  it('rejects key-variable field access in for key/value bindings', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/var @obj = { "a": 1 }
/var @pairs = for @k.path, @v in @obj => @v
`;

    await expect(
      interpret(input, {
        fileSystem,
        pathService: runtimePathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      })
    ).rejects.toThrow('Cannot access field "@path" on loop key "@k" - keys are primitive values (strings)');
  });

  it('resolves parallel cap and pacing options from variable references in for expressions', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/var @cap = "2"
/var @pace = "0.01s"
/exe @slowEcho(input) = js {
  const active = Number(process.env.${ACTIVE_KEY} || '0') + 1;
  process.env.${ACTIVE_KEY} = String(active);
  const currentMax = Number(process.env.${MAX_KEY} || '0');
  if (active > currentMax) process.env.${MAX_KEY} = String(active);
  await new Promise(resolve => setTimeout(resolve, 20));
  process.env.${ACTIVE_KEY} = String(active - 1);
  return input;
}
/var @result = for parallel(@cap, @pace) @x in ["a", "b", "c", "d"] => @slowEcho(@x)
`;

    const started = Date.now();
    const env = await interpretWithEnv(input);
    const elapsed = Date.now() - started;

    expect(process.env[MAX_KEY]).toBe('2');
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(await requireValue(env, 'result')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('supports numeric cap with duration-literal pacing in for expressions', async () => {
    const input = `
/exe @slowEcho(input) = js {
  const active = Number(process.env.${ACTIVE_KEY} || '0') + 1;
  process.env.${ACTIVE_KEY} = String(active);
  const currentMax = Number(process.env.${MAX_KEY} || '0');
  if (active > currentMax) process.env.${MAX_KEY} = String(active);
  await new Promise(resolve => setTimeout(resolve, 20));
  process.env.${ACTIVE_KEY} = String(active - 1);
  return input;
}
/var @result = for parallel(2, 0.01s) @x in ["a", "b", "c", "d"] => @slowEcho(@x)
`;

    const started = Date.now();
    const env = await interpretWithEnv(input);
    const elapsed = Date.now() - started;

    expect(process.env[MAX_KEY]).toBe('2');
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(await requireValue(env, 'result')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('supports duration-node pacing values sourced from variables', async () => {
    const input = `
/var @cap = 2
/exe @durationNode() = js {
  return { type: "TimeDuration", value: 0.01, unit: "seconds" };
}
/var @pace = @durationNode()
/exe @slowEcho(input) = js {
  const active = Number(process.env.${ACTIVE_KEY} || '0') + 1;
  process.env.${ACTIVE_KEY} = String(active);
  const currentMax = Number(process.env.${MAX_KEY} || '0');
  if (active > currentMax) process.env.${MAX_KEY} = String(active);
  await new Promise(resolve => setTimeout(resolve, 20));
  process.env.${ACTIVE_KEY} = String(active - 1);
  return input;
}
/var @result = for parallel(@cap, @pace) @x in ["a", "b", "c", "d"] => @slowEcho(@x)
`;

    const started = Date.now();
    const env = await interpretWithEnv(input);
    const elapsed = Date.now() - started;

    expect(process.env[MAX_KEY]).toBe('2');
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(await requireValue(env, 'result')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps iteration context parity between directive and expression runners', async () => {
    const { output, env } = await interpretWithOutputAndEnv(`
/var @exprCtx = for @n in [10, 20, 30] => \`@n,@mx.for.index,@mx.for.total,@mx.for.parallel\`
/for @n in [10, 20, 30] => show \`@n,@mx.for.index,@mx.for.total,@mx.for.parallel\`
`);

    const directiveLines = output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const exprValues = await requireValue(env, 'exprCtx');

    expect(Array.isArray(exprValues)).toBe(true);
    expect(directiveLines).toEqual(exprValues);
    expect(exprValues).toEqual([
      '10,0,3,false',
      '20,1,3,false',
      '30,2,3,false'
    ]);
  });

  it('throws for invalid parallel cap values', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/var @cap = "fast"
/var @result = for parallel(@cap) @x in [1, 2] => @x
`;

    await expect(
      interpret(input, {
        fileSystem,
        pathService: runtimePathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      })
    ).rejects.toThrow('for parallel cap expects a number.');
  });

  it('throws for invalid parallel pacing values', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/var @pace = "later"
/var @result = for parallel(2, @pace) @x in [1, 2] => @x
`;

    await expect(
      interpret(input, {
        fileSystem,
        pathService: runtimePathService,
        format: 'markdown',
        mlldMode: 'markdown',
        ephemeral: true,
        useMarkdownFormatter: false
      })
    ).rejects.toThrow('for parallel pacing expects a duration like 1s or 500ms.');
  });

  it('handles continue and done markers in for expressions', async () => {
    const env = await interpretWithEnv(`
/var @result = for @n in [1, 2, 3, 4, 5] => when [
  @n < 2 => continue @n
  @n > 3 => done @n
  * => @n
]
`);

    expect(await requireValue(env, 'result')).toEqual([2, 3]);
  });

  it('handles continue and done markers in for directives', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/for @n in [1, 2, 3, 4, 5] => when [
  @n < 2 => continue @n
  @n > 3 => done @n
  * => show @n
]
`;

    const output = await interpret(input, {
      fileSystem,
      pathService: runtimePathService,
      format: 'markdown',
      mlldMode: 'markdown',
      ephemeral: true,
      useMarkdownFormatter: false
    });

    const lines = output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    expect(lines).toEqual(['2', '3']);
  });
});
