import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as path from 'path';
import minimatch from 'minimatch';
import { glob } from 'tinyglobby';
import { unwrapStructuredForTest } from './test-helpers';
import { isStructuredExecEnabled } from '../utils/structured-exec';
import type { StructuredValueMetadata } from '../utils/structured-value';

function expectLoadContentMetadata(metadata?: StructuredValueMetadata): void {
  if (!isStructuredExecEnabled()) {
    return;
  }
  expect(metadata?.source).toBe('load-content');
}

vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('Content Loader AST patterns', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), process.cwd());

    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
      const { cwd = '/', absolute = false, ignore = [] } = options || {};

      const allFiles: string[] = [];
      const walkDir = async (dir: string) => {
        try {
          const entries = await fileSystem.readdir(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            try {
              const stat = await fileSystem.stat(fullPath);
              if (stat.isDirectory()) {
                await walkDir(fullPath);
              } else if (stat.isFile()) {
                allFiles.push(fullPath);
              }
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      };

      await walkDir(cwd);

      const matches = allFiles.filter(file => {
        const relativePath = path.relative(cwd, file);
        if (!minimatch(relativePath, pattern)) {
          return false;
        }
        for (const ignorePattern of ignore) {
          if (minimatch(relativePath, ignorePattern)) {
            return false;
          }
        }
        return true;
      });

      return absolute ? matches : matches.map(file => path.relative(cwd, file));
    });
  });

  it('extracts definitions and usage matches', async () => {
    const filePath = path.join(process.cwd(), 'service.ts');
    await fileSystem.writeFile(filePath, [
      'function helper() { return 1; }',
      'export function createUser() { return helper(); }',
      'export function updateProfile() { helper(); }'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'createUser' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results, metadata } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
    expectLoadContentMetadata(metadata);
  });

  it('deduplicates container and member selections', async () => {
    const filePath = path.join(process.cwd(), 'user.ts');
    await fileSystem.writeFile(filePath, [
      'export class User {',
      '  create() { return 1; }',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'User' },
        { type: 'definition', name: 'create' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('User');
  });

  it('captures interfaces, enums, and type aliases in javascript files', async () => {
    const filePath = path.join(process.cwd(), 'model.ts');
    await fileSystem.writeFile(filePath, [
      'export interface User { id: string; name: string; }',
      'export type UserId = string;',
      'export enum Role { Admin = 0, User = 1 }'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'User' },
        { type: 'definition', name: 'UserId' },
        { type: 'definition', name: 'Role' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(Array.isArray(results)).toBe(true);
    expect(results.map(r => (r as any)?.name ?? null)).toEqual(['User', 'UserId', 'Role']);
    expect(results.map(r => (r as any)?.type ?? null)).toEqual(['interface', 'type-alias', 'enum']);
  });

  it('supports python definitions', async () => {
    const filePath = path.join(process.cwd(), 'service.py');
    await fileSystem.writeFile(filePath, [
      'def helper():\n    return 1',
      'def create_user():\n    return helper()',
      'def update_profile():\n    helper()'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'create_user' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('create_user');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('update_profile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports go definitions', async () => {
    const filePath = path.join(process.cwd(), 'service.go');
    await fileSystem.writeFile(filePath, [
      'package main',
      '',
      'func helper() int { return 1 }',
      'func CreateUser() int { return helper() }',
      'func UpdateProfile() { helper() }'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'CreateUser' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('CreateUser');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('UpdateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports rust definitions', async () => {
    const filePath = path.join(process.cwd(), 'service.rs');
    await fileSystem.writeFile(filePath, [
      'fn helper() -> i32 { 1 }',
      'pub fn create_user() -> i32 { helper() }',
      'pub fn update_profile() { helper(); }'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'create_user' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('create_user');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('update_profile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports java definitions', async () => {
    const filePath = path.join(process.cwd(), 'Service.java');
    await fileSystem.writeFile(filePath, [
      'public class Service {',
      '  private final Helper helper = new Helper();',
      '',
      '  public int createUser() {',
      '    return helper.create();',
      '  }',
      '',
      '  public void updateProfile() {',
      '    helper.update();',
      '  }',
      '}',
      '',
      'class Helper {',
      '  public int create() {',
      '    return 1;',
      '  }',
      '',
      '  public void update() {',
      '    // noop',
      '  }',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'createUser' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('method');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports csharp definitions', async () => {
    const filePath = path.join(process.cwd(), 'Service.cs');
    await fileSystem.writeFile(filePath, [
      'public class Service',
      '{',
      '    private readonly Helper _helper = new Helper();',
      '',
      '    public int CreateUser()',
      '    {',
      '        return _helper.Create();',
      '    }',
      '',
      '    public void UpdateProfile()',
      '    {',
      '        _helper.Update();',
      '    }',
      '}',
      '',
      'public class Helper',
      '{',
      '    public int Create() => 1;',
      '',
      '    public void Update()',
      '    {',
      '    }',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'CreateUser' },
        { type: 'usage', name: '_helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('CreateUser');
    expect(results[0]?.type).toBe('method');
    expect(results[1]?.name).toBe('UpdateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports cpp definitions', async () => {
    const filePath = path.join(process.cwd(), 'service.cpp');
    await fileSystem.writeFile(filePath, [
      'int helper() { return 1; }',
      '',
      'class Service {',
      'public:',
      '  int createUser() {',
      '    return helper();',
      '  }',
      '',
      '  void updateProfile();',
      '};',
      '',
      'void Service::updateProfile() {',
      '  helper();',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'createUser' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('method');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports solidity definitions', async () => {
    const filePath = path.join(process.cwd(), 'Service.sol');
    await fileSystem.writeFile(filePath, [
      'pragma solidity ^0.8.0;',
      '',
      'contract Service {',
      '    function helper() internal pure returns (uint256) {',
      '        return 1;',
      '    }',
      '',
      '    function createUser() external returns (uint256) {',
      '        return helper();',
      '    }',
      '',
      '    function updateProfile() external {',
      '        helper();',
      '    }',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'createUser' },
        { type: 'usage', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it('supports ruby definitions', async () => {
    const filePath = path.join(process.cwd(), 'service.rb');
    await fileSystem.writeFile(filePath, [
      'module Billing',
      '  class Service',
      '    API_VERSION = 1',
      '    def create_user(user)',
      '      logger.info(user)',
      '      helper(user)',
      '    end',
      '  end',
      'end',
      '',
      'def helper(input)',
      '  input',
      'end'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'Billing::Service' },
        { type: 'definition', name: 'API_VERSION' },
        { type: 'definition', name: 'helper' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(Array.isArray(results)).toBe(true);
    const names = results.filter(Boolean).map(r => (r as any).name);
    expect(names).toEqual([
      'Billing::Service',
      'helper'
    ]);

    const constantNode = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'API_VERSION' }
      ]
    };

    const rawConstantResults = await processContentLoader(constantNode as any, env);
    const { data: constantResults } = unwrapStructuredForTest<Array<any | null>>(rawConstantResults);
    const constantNames = constantResults.filter(Boolean).map(r => (r as any).name);
    expect(constantNames).toEqual(['API_VERSION']);
  });

  it('includes file path for glob patterns', async () => {
    const dir = path.join(process.cwd(), 'src');
    const fileA = path.join(dir, 'a.ts');
    const fileB = path.join(dir, 'b.ts');
    await fileSystem.writeFile(fileA, 'export function a() { return 1; }');
    await fileSystem.writeFile(fileB, 'export function b() { return 2; }');

    const globPath = path.join('src', '*.ts');
    const node = {
      type: 'load-content',
      source: { type: 'path', raw: globPath, segments: [{ type: 'Text', content: globPath }] },
      ast: [
        { type: 'definition', name: 'a' },
        { type: 'definition', name: 'b' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(Array.isArray(results)).toBe(true);
    const files = results
      .filter(Boolean)
      .map(r => (r as any).file)
      .sort();
    expect(files).toEqual([fileA, fileB].sort());
  });

  it('returns null entries for missing definitions', async () => {
    const filePath = path.join(process.cwd(), 'missing.ts');
    await fileSystem.writeFile(filePath, 'export function present() { return 1; }');

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'present' },
        { type: 'definition', name: 'absent' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeNull();
  });

  it('returns null when python usage pattern misses', async () => {
    const filePath = path.join(process.cwd(), 'usage.py');
    await fileSystem.writeFile(filePath, [
      'def helper():',
      '    return 1',
      '',
      'def create_user():',
      '    helper()'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'usage', name: 'helper' },
        { type: 'usage', name: 'missing_call' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    expect(results.length).toBe(2);
    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
  });

  it('applies transform templates to AST results', async () => {
    const filePath = path.join(process.cwd(), 'templated.ts');
    await fileSystem.writeFile(filePath, [
      'export function createUser() {',
      '  return 1;',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [{ type: 'definition', name: 'createUser' }],
      options: {
        transform: {
          type: 'template',
          parts: [
            { type: 'Text', content: 'Name: ' },
            { type: 'placeholder', fields: [{ type: 'Field', value: 'name' }] },
            { type: 'Text', content: '\nCode:\n' },
            { type: 'placeholder' }
          ]
        }
      }
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<string>(rawResults);
    expect(typeof results).toBe('string');
    expect(results).toBe('Name: createUser\nCode:\nexport function createUser() {\n  return 1;\n}');
  });

  it('runs pipelines against AST results', async () => {
    const filePath = path.join(process.cwd(), 'piped.ts');
    await fileSystem.writeFile(filePath, [
      'export function createUser() {',
      '  return 1;',
      '}',
      'export function updateProfile() {',
      '  return 2;',
      '}'
    ].join('\n'));

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'createUser' },
        { type: 'definition', name: 'updateProfile' }
      ],
      pipes: [
        {
          type: 'CondensedPipe',
          transform: 'json',
          hasAt: true,
          args: [],
          location: null
        }
      ]
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result } = unwrapStructuredForTest<unknown>(rawResult);
    const parsed = Array.isArray(result) ? result : JSON.parse(result as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe('createUser');
    expect(parsed[1].name).toBe('updateProfile');
  });

  it('keeps sibling declarations from shared statements', async () => {
    const filePath = path.join(process.cwd(), 'shared.ts');
    await fileSystem.writeFile(filePath, 'const foo = 1, bar = 2;');

    const node = {
      type: 'load-content',
      source: { type: 'path', raw: filePath, segments: [{ type: 'Text', content: filePath }] },
      ast: [
        { type: 'definition', name: 'foo' },
        { type: 'definition', name: 'bar' }
      ]
    };

    const rawResults = await processContentLoader(node as any, env);
    const { data: results } = unwrapStructuredForTest<Array<any | null>>(rawResults);
    const names = results.filter(Boolean).map(r => (r as any).name).sort();
    expect(names).toEqual(['bar', 'foo']);
  });
});
