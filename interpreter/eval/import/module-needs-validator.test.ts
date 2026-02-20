import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ModuleNeedsValidator } from './ModuleNeedsValidator';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('ModuleNeedsValidator', () => {
  it('keeps runtime/package unmet detection behavior stable', () => {
    const validator: any = new ModuleNeedsValidator(createEnv());
    vi.spyOn(validator, 'isCommandAvailable').mockImplementation((command: string) => command === 'sh');
    vi.spyOn(validator, 'isNodePackageAvailable').mockReturnValue(false);
    vi.spyOn(validator, 'isRuntimeAvailable').mockReturnValue(false);

    const unmet = validator.findUnmetNeeds({
      cmd: { type: 'list', commands: ['__missing_cmd__'] },
      packages: {
        node: [{ name: '__missing_pkg__' }],
        python: [{ name: 'requests' }]
      }
    });

    expect(unmet).toEqual(
      expect.arrayContaining([
        { capability: 'cmd', value: '__missing_cmd__', reason: 'command not found in PATH' },
        { capability: 'node', value: '__missing_pkg__', reason: 'package not installed' },
        { capability: 'python', reason: 'python runtime not available' }
      ])
    );
  });
});
