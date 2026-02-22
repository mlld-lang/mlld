import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as child_process from 'child_process';
import { DefaultDependencyChecker } from './dependencies';

vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    execSync: vi.fn(original.execSync)
  };
});

function configureExecSyncResponses(responses: Record<string, string | Error>): void {
  const execSyncMock = vi.mocked(child_process.execSync);
  execSyncMock.mockImplementation(((command: string) => {
    const response = responses[command];
    if (response === undefined) {
      throw new Error(`Unexpected command: ${command}`);
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }) as any);
}

describe('DefaultDependencyChecker python checks', () => {
  let originalTestMode: string | undefined;

  beforeEach(() => {
    originalTestMode = process.env.MLLD_TEST_MODE;
    delete process.env.MLLD_TEST_MODE;
  });

  afterEach(() => {
    if (originalTestMode === undefined) {
      delete process.env.MLLD_TEST_MODE;
    } else {
      process.env.MLLD_TEST_MODE = originalTestMode;
    }
    vi.restoreAllMocks();
  });

  it('prefers pip3 when available', async () => {
    configureExecSyncResponses({
      'pip3 --version': 'pip 24.0',
      'pip3 show requests': 'Name: requests\nVersion: 2.31.0\n'
    });

    const checker = new DefaultDependencyChecker();
    const result = await checker.checkPythonPackages({ requests: '*' });

    expect(result).toEqual({
      satisfied: true,
      missing: [],
      mismatched: []
    });

    const commands = vi.mocked(child_process.execSync).mock.calls.map(([command]) => command);
    expect(commands).toEqual(['pip3 --version', 'pip3 show requests']);
  });

  it('falls back to pip when pip3 is unavailable', async () => {
    configureExecSyncResponses({
      'pip3 --version': new Error('command not found'),
      'pip --version': 'pip 24.0',
      'pip show requests': 'Name: requests\nVersion: 2.31.0\n'
    });

    const checker = new DefaultDependencyChecker();
    const result = await checker.checkPythonPackages({ requests: '*' });

    expect(result).toEqual({
      satisfied: true,
      missing: [],
      mismatched: []
    });

    const commands = vi.mocked(child_process.execSync).mock.calls.map(([command]) => command);
    expect(commands).toEqual(['pip3 --version', 'pip --version', 'pip show requests']);
  });

  it('reports missing packages when neither pip3 nor pip exists', async () => {
    configureExecSyncResponses({
      'pip3 --version': new Error('command not found'),
      'pip --version': new Error('command not found')
    });

    const checker = new DefaultDependencyChecker();
    const result = await checker.checkPythonPackages({ requests: '>=2.0.0' });

    expect(result).toEqual({
      satisfied: false,
      missing: ['requests>=2.0.0'],
      mismatched: []
    });
  });
});
