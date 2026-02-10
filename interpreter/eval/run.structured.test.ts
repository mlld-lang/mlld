import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateRun } from './run';
import { asText, isStructuredValue } from '../utils/structured-value';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

function getDirectiveNodes(ast: any, name: string) {
  const nodes = Array.isArray(ast) ? ast : Array.isArray(ast?.body) ? ast.body : [];
  return nodes.filter((node: any) => {
    if (node.type !== 'Directive') return false;
    if (node.kind === name) return true;
    if (node.name === name) return true;
    return node.meta?.directiveType === name;
  });
}

describe('evaluateRun (structured)', () => {
  let env: Environment;
  const pythonAvailable = (() => {
    try {
      execSync('python - <<\"PY\"\nprint(\"ok\")\nPY', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  beforeEach(() => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/');
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
    expect((result.value as any).type).toBe('object');
    expect((result.value as any).data).toEqual({ count: 2 });
    expect(asText(result.value)).toBe('{"count":2}');
  });

  it('runs /run cmd with :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-cmd-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, tmpDir);

    try {
      const source = `/run cmd:${tmpDir} {pwd}`;
      const { ast } = await parse(source);
      const [runDirective] = getDirectiveNodes(ast, 'run');
      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs /run cmd with args and :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-cmd-args-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, '/');

    try {
      const source = `
/var @name = "mlld"
/run cmd(@name):${tmpDir} {bash -lc 'echo "$name"; pwd'}
`;
      const { ast } = await parse(source);
      const directives = Array.isArray(ast) ? ast : [];
      const varDirective = directives.find((node: any) => node.type === 'Directive' && node.kind === 'var');
      const runDirective = directives.find((node: any) => node.type === 'Directive' && node.kind === 'run');

      expect(varDirective).toBeDefined();
      expect(runDirective).toBeDefined();

      await evaluate(varDirective, localEnv);

      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
      expect(lines).toContain('mlld');
      const normalizedOutput = fs.realpathSync(lines[lines.length - 1]);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs /run js with :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-js-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, tmpDir);

    try {
      const source = `/run js:${tmpDir} {return process.cwd();}`;
      const { ast } = await parse(source);
      const [runDirective] = getDirectiveNodes(ast, 'run');
      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs /run sh with args and :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-sh-args-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, '/');

    try {
      const source = `
/var @name = "mlld"
/run sh(@name):${tmpDir} {
  echo "$name"
  pwd
}
`;
      const { ast } = await parse(source);
      const directives = Array.isArray(ast) ? ast : [];
      const varDirective = directives.find((node: any) => node.type === 'Directive' && node.kind === 'var');
      const runDirective = directives.find((node: any) => node.type === 'Directive' && node.kind === 'run');

      expect(varDirective).toBeDefined();
      expect(runDirective).toBeDefined();

      await evaluate(varDirective, localEnv);

      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
      expect(lines).toContain('mlld');
      const normalizedOutput = fs.realpathSync(lines[lines.length - 1]);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  (pythonAvailable ? it : it.skip)('runs /run python with :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-py-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, '/');

    try {
      const source = `/run python:${tmpDir} {import os; print(os.getcwd())}`;
      const { ast } = await parse(source);
      const [runDirective] = getDirectiveNodes(ast, 'run');
      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output.trim());
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runs /run node with :path working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-node-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, '/');

    try {
      const source = `/run node:${tmpDir} {console.log(process.cwd());}`;
      const { ast } = await parse(source);
      const [runDirective] = getDirectiveNodes(ast, 'run');
      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output.trim());
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports :path on exec definitions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-exe-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, tmpDir);

    try {
      const source = `
/exe @where(dir) = cmd:@dir {pwd}
/run @where("${tmpDir}")
`;
      const { ast } = await parse(source);
      const execDirectives = getDirectiveNodes(ast, 'exe');
      const [runDirective] = getDirectiveNodes(ast, 'run');

      for (const directive of execDirectives) {
        await evaluate(directive, localEnv);
      }

      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('respects :path on command executables', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-exe-cmd-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, process.cwd());

    try {
      const source = `
/exe @where(dir) = cmd:@dir {pwd}
/run @where("${tmpDir}")
`;
      const { ast } = await parse(source);
      const execDirectives = getDirectiveNodes(ast, 'exe');
      const [runDirective] = getDirectiveNodes(ast, 'run');

      for (const directive of execDirectives) {
        await evaluate(directive, localEnv);
      }

      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('respects :path on code executables', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-wd-exe-js-'));
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, process.cwd());

    try {
      const source = `
/exe @cwd(dir) = js:@dir { return process.cwd(); }
/run @cwd("${tmpDir}")
`;
      const { ast } = await parse(source);
      const execDirectives = getDirectiveNodes(ast, 'exe');
      const [runDirective] = getDirectiveNodes(ast, 'run');

      for (const directive of execDirectives) {
        await evaluate(directive, localEnv);
      }

      const runNode: any = {
        ...runDirective,
        location: runDirective.location || { line: 1, column: 1 },
        meta: runDirective.meta || {}
      };

      const result = await evaluateRun(runNode, localEnv);
      const output = isStructuredValue(result.value) ? asText(result.value) : String(result.value);
      const normalizedOutput = fs.realpathSync(output);
      const normalizedExpected = fs.realpathSync(tmpDir);
      expect(normalizedOutput).toBe(normalizedExpected);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects non-absolute working directories', async () => {
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const localEnv = new Environment(fileSystem, pathService, '/');

    const source = `/run cmd:relative/path {pwd}`;
    const { ast } = await parse(source);
    const [runDirective] = getDirectiveNodes(ast, 'run');
    const runNode: any = {
      ...runDirective,
      location: runDirective.location || { line: 1, column: 1 },
      meta: runDirective.meta || {}
    };

    await expect(evaluateRun(runNode, localEnv)).rejects.toThrow(/start with/);
  });
});
