import { describe, it, expect, beforeEach } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as path from 'path';

describe('Content Loader AST patterns', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), process.cwd());
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

    const results = await processContentLoader(node as any, env);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
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

    const results = await processContentLoader(node as any, env);
    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe('User');
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
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

    const results = await processContentLoader(node as any, env);
    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe('createUser');
    expect(results[0]?.type).toBe('function');
    expect(results[1]?.name).toBe('updateProfile');
    expect(results[0]?.file).toBeUndefined();
  });

  it.skip('includes file path for glob patterns', async () => {
    const dir = path.join(process.cwd(), 'src');
    const fileA = path.join(dir, 'a.ts');
    const fileB = path.join(dir, 'b.ts');
    await fileSystem.writeFile(fileA, 'export function a() { return 1; }');
    await fileSystem.writeFile(fileB, 'export function b() { return 2; }');

    const globPath = path.join(dir, '*.ts');
    const node = {
      type: 'load-content',
      source: { type: 'path', raw: globPath, segments: [{ type: 'Text', content: globPath }] },
      ast: [
        { type: 'definition', name: 'a' },
        { type: 'definition', name: 'b' }
      ]
    };

    const results = await processContentLoader(node as any, env);
    expect(results.length).toBe(2);
    const files = results.map(r => r?.file).sort();
    expect(files).toEqual([fileA, fileB].sort());
  });
});
