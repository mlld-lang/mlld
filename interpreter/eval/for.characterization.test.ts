import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';

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
const BLOCK_RETRY_KEY = 'TEST_FOR_BLOCK_RETRY_TRIG';

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
    delete process.env[BLOCK_RETRY_KEY];
  });

  afterEach(() => {
    delete process.env[ACTIVE_KEY];
    delete process.env[MAX_KEY];
    delete process.env[BLOCK_RETRY_KEY];
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

  it('attaches array-iteration indices to @item.mx.index', async () => {
    const env = await interpretWithEnv(`
/var @items = ["a", "b", "c"]
/var @indexes = for @item in @items => @item.mx.index
/var @templated = for @item in @items => \`@item.mx.index:@item\`
/var @filtered = for @item in @items when @item.mx.index > 0 => \`@item.mx.index:@item\`
`);

    expect(await requireValue(env, 'indexes')).toEqual([0, 1, 2]);
    expect(await requireValue(env, 'templated')).toEqual(['0:a', '1:b', '2:c']);
    expect(await requireValue(env, 'filtered')).toEqual(['1:b', '2:c']);
  });

  it('keeps mx.index independent for nested loop bindings', async () => {
    const env = await interpretWithEnv(`
/var @rows = [["a", "b"], ["c"]]
/var @pairs = for @row in @rows => for @cell in @row => \`@row.mx.index:@cell.mx.index:@cell\`
`);

    expect(await requireValue(env, 'pairs')).toEqual([
      ['0:0:a', '0:1:b'],
      ['1:0:c']
    ]);
  });

  it('preserves original array indices in for parallel iteration metadata', async () => {
    const env = await interpretWithEnv(`
/exe @slow(value) = js {
  const delay = value === "a" ? 30 : value === "b" ? 20 : 10;
  await new Promise(resolve => setTimeout(resolve, delay));
  return value;
}
/var @pairs = for parallel(3) @item in ["a", "b", "c"] [
  let @ignored = @slow(@item)
  => \`@item.mx.index:@item\`
]
`);

    expect(await requireValue(env, 'pairs')).toEqual(['0:a', '1:b', '2:c']);
  });

  it('does not set mx.index during object iteration', async () => {
    const env = await interpretWithEnv(`
/var @items = { "first": "a", "second": "b" }
/var @indexDefined = for @item in @items => @item.mx.index.isDefined()
/var @keys = for @item in @items => @item.mx.key
`);

    expect(await requireValue(env, 'indexDefined')).toEqual([false, false]);
    expect(await requireValue(env, 'keys')).toEqual(['first', 'second']);
  });

  it('exposes mx.index in for directive templates', async () => {
    const { output } = await interpretWithOutputAndEnv(`
/for @item in ["x", "y"] => show \`@item.mx.index:@item\`
`);
    const lines = output.trim().split('\n').filter(Boolean);
    expect(lines).toContain('0:x');
    expect(lines).toContain('1:y');
  });

  it('supports for...when guard syntax with block bodies', async () => {
    const env = await interpretWithEnv(`
/exe @loadSlide(num, name) = \`@num:@name\`
/var @slideNum = 3
/var @slideMap = [
  { "num": 1, "name": "intro" },
  { "num": 2, "name": "body" },
  { "num": 4, "name": "appendix" }
]
/var @results = for @entry in @slideMap when @entry.num < @slideNum [
  let @data = @loadSlide(@entry.num, @entry.name)
  when @data => \`<slide>\\n@data\\n</slide>\`
]
`);

    const results = await requireValue(env, 'results');
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]).toContain('1:intro');
    expect(results[1]).toContain('2:body');
  });

  it('supports for directives with when guards and block actions', async () => {
    const { output } = await interpretWithOutputAndEnv(`
/var @results = [
  { "file": "alpha.md", "notes": "alpha", "gaps": ["one", "two"] },
  { "file": "beta.md", "notes": "beta", "gaps": [] }
]
/for @r in @results when @r.gaps.length > 0 [
  let @gapList = for @g in @r.gaps => \`  - @g\`
  show \`### @r.file\\n@r.notes\\n@gapList\\n\`
]
`);

    expect(output).toContain('### alpha.md');
    expect(output).toContain('alpha');
    expect(output).toContain('  - one');
    expect(output).toContain('  - two');
    expect(output).not.toContain('### beta.md');
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

  it('emits bare exec invocation output for directive non-block actions', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const output = await interpret(`
/exe @echo(value) = js { return value }
/for @x in ["a", "b"] => @echo(@x)
`, {
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
    expect(lines).toEqual(['a', 'b']);
  });

  it('retries rate-limit failures in directive block actions', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const source = `
/exe @maybeRateLimited(value) = js {
  if (!process.env.${BLOCK_RETRY_KEY}) {
    process.env.${BLOCK_RETRY_KEY} = '1';
    const err = new Error('rate limit');
    // @ts-ignore
    err.status = 429;
    throw err;
  }
  return value;
}
/for @x in ["ok"] [
  let @value = @maybeRateLimited(@x)
  show @value
]
`;

    const started = Date.now();
    const output = await interpret(source, {
      fileSystem,
      pathService: runtimePathService,
      format: 'markdown',
      mlldMode: 'markdown',
      ephemeral: true,
      useMarkdownFormatter: false
    });
    const elapsed = Date.now() - started;
    const lines = output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(lines).toEqual(['ok']);
  });

  it('applies batch pipeline post-processing for for-expression results', async () => {
    const env = await interpretWithEnv(`
/exe @wrap(x) = js { return [x, x * 2] }
/exe @flat(values) = js { return values.flat() }
/var @numbers = [1, 2, 3]
/var @pairs = for @n in @numbers => @wrap(@n) => | @flat
`);

    expect(await requireValue(env, 'pairs')).toEqual([1, 2, 2, 4, 3, 6]);
  });

  it('falls back to collected values when for-expression batch pipeline fails', async () => {
    const env = await interpretWithEnv(`
/exe @failBatch(values) = js { throw new Error("batch failed") }
/var @result = for @n in [1, 2, 3] => @n => | @failBatch
`);

    expect(await requireValue(env, 'result')).toEqual([1, 2, 3]);
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

  it('unwraps for-parallel when branch results before js consumption', async () => {
    const env = await interpretWithEnv(`
/var @seed = { findings: [1] }
/var @result = for parallel @n in [1, 2] => when [
  @n == 1 => @seed
  * => { findings: [@n] }
]
/exe @inspect(values) = js {
  return values.map(value => value.findings[0]).join(",");
}
/var @summary = @inspect(@result)
`);

    expect(await requireValue(env, 'result')).toEqual([
      { findings: [1] },
      { findings: [2] }
    ]);
    const summary = await requireValue(env, 'summary');
    const summaryText = isStructuredValue(summary) ? asText(summary) : String(summary);
    expect(summaryText).toBe('1,2');
  });

  it('fails fast for for-parallel expressions when first qualifying iteration errors', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/exe @explode(n) = js {
  if (n == 1) {
    throw new Error("first qualifying failed");
  }
  return n;
}
/var @result = for parallel(2) @n in [1, 2] => @explode(@n)
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
    ).rejects.toThrow('first qualifying failed');
  });

  it('fails fast for for-parallel directives when first qualifying iteration errors', async () => {
    const { fileSystem, pathService: runtimePathService } = createRuntime();
    const input = `
/exe @explode(n) = js {
  if (n == 2) {
    throw new Error("directive canary failed");
  }
  return n;
}
/for parallel(2) @n in [0, 2, 3] when @n > 1 [
  let @value = @explode(@n)
  show @value
]
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
    ).rejects.toThrow('When expression evaluation failed');
  });

  it('keeps post-canary parallel expression errors as iteration markers', async () => {
    const env = await interpretWithEnv(`
/exe @maybeFail(n) = js {
  if (n == 2) {
    throw new Error("late iteration failed");
  }
  return n;
}
/var @result = for parallel(2) @n in [1, 2] => @maybeFail(@n)
`);

    expect(await requireValue(env, 'result')).toEqual([
      1,
      expect.objectContaining({
        index: 1,
        error: 'late iteration failed'
      })
    ]);
  });
});
