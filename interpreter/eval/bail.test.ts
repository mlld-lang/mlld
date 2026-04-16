import { beforeEach, describe, expect, it } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { createObjectVariable } from '@core/types/variable';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@interpreter/env/EnvironmentIdentity';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateBail } from './bail';

describe('bail directive evaluation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  const run = async (source: string, filePath = '/project/main.mld', mlldMode: 'strict' | 'markdown' = 'strict') => {
    return interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath,
      mlldMode
    });
  };

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    await fileSystem.mkdir('/project');
  });

  it('terminates with explicit string messages', async () => {
    await expect(run('bail "config missing"')).rejects.toMatchObject({ code: 'BAIL_EXIT' });
    await expect(run('bail "config missing"')).rejects.toThrow('config missing');
  });

  it('evaluates expression messages', async () => {
    const source = 'var @name = "Ada"\nbail `prereq @name missing`';
    await expect(run(source)).rejects.toThrow('prereq Ada missing');
  });

  it('uses a default message for bare bail', async () => {
    await expect(run('bail')).rejects.toThrow(/bail directive/i);
  });

  it('does not consume the next directive as a bare bail message', async () => {
    await expect(run('bail\nshow "this should not become bail message"')).rejects.toThrow(/bail directive/i);
  });

  it('works in markdown mode with /bail syntax', async () => {
    await expect(run('/bail "markdown stop"', '/project/main.mld.md', 'markdown')).rejects.toThrow('markdown stop');
  });

  it('terminates from if/when blocks', async () => {
    await expect(run('if true [ bail "if stop" ]')).rejects.toThrow('if stop');
    await expect(run('when true => [ bail "when stop" ]')).rejects.toThrow('when stop');
  });

  it('terminates from for loops, including parallel for loops', async () => {
    await expect(run('for @item in [1, 2] [ bail `for stop @item` ]')).rejects.toThrow('for stop 1');
    await expect(run('for parallel @item in [1, 2] [ bail "parallel stop" ]')).rejects.toThrow('parallel stop');
  });

  it('terminates the caller when an imported module bails', async () => {
    await fileSystem.writeFile('/project/module.mld', 'bail "module stop"\nvar @value = "ok"\nexport { value }');

    const source = 'import { value } from "./module.mld"\nshow @value';
    await expect(run(source)).rejects.toThrow('module stop');
  });

  it('stringifies object messages with opaque environment placeholders', async () => {
    const env = new Environment(fileSystem, pathService, '/project');
    const envLike: Record<string, unknown> = {};
    markEnvironment(envLike);
    Object.defineProperty(envLike, 'danger', {
      enumerable: true,
      get() {
        throw new Error('environment getter should not be walked');
      }
    });

    env.setVariable(
      'payload',
      createObjectVariable(
        'payload',
        { env: envLike },
        false,
        {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    const directive = {
      type: 'Directive',
      kind: 'bail',
      values: {
        message: [{ type: 'VariableReference', identifier: 'payload', fields: [] }]
      },
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 5, offset: 4 },
        filePath: '/project/main.mld'
      }
    } as unknown as DirectiveNode;

    try {
      await evaluateBail(directive, env);
      throw new Error('expected bail to throw');
    } catch (error) {
      expect(String(error)).toContain(ENVIRONMENT_SERIALIZE_PLACEHOLDER);
      expect(String(error)).not.toContain('danger');
    }
  });
});
