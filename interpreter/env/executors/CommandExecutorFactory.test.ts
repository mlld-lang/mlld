import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandExecutorFactory, type ExecutorDependencies } from './CommandExecutorFactory';
import { ErrorUtils } from '../ErrorUtils';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { WorkspaceValue } from '@core/types/workspace';

function createWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

function createDependencies(workspace?: WorkspaceValue): ExecutorDependencies {
  return {
    errorUtils: new ErrorUtils(),
    workingDirectory: '/tmp/mlld-command-factory',
    shadowEnvironment: {} as any,
    nodeShadowProvider: {} as any,
    pythonShadowProvider: {} as any,
    variableProvider: {
      getVariables: () => new Map()
    },
    getStreamingBus: () => ({ emit: vi.fn() }) as any,
    workspaceProvider: {
      getActiveWorkspace: () => workspace,
      isToolAllowed: () => true,
      getProjectRoot: () => '/tmp/mlld-command-factory'
    } as any
  };
}

describe('CommandExecutorFactory workspace llm routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes workspace llm commands through shell executor without bridge mutation', async () => {
    const workspace = createWorkspace();
    const factory = new CommandExecutorFactory(createDependencies(workspace));

    const shellExecute = vi.fn().mockResolvedValue('llm-ok');

    (factory as any).shellExecutor = { execute: shellExecute };
    (factory as any).captureWorkspaceSnapshot = vi.fn().mockResolvedValue(new Map());
    (factory as any).recordWorkspaceCommandWrites = vi.fn().mockResolvedValue(undefined);

    const output = await factory.executeCommand(
      'claude -p "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: ['llm'] }
    );

    expect(output).toBe('llm-ok');
    expect(shellExecute).toHaveBeenCalledWith(
      'claude -p "hello"',
      undefined,
      expect.objectContaining({ exeLabels: ['llm'] })
    );
  });

  it('keeps non-llm workspace commands on ShellSession routing', async () => {
    const workspace = createWorkspace();
    const factory = new CommandExecutorFactory(createDependencies(workspace));

    const workspaceExecute = vi.fn().mockResolvedValue('workspace-ok');
    (factory as any).executeWorkspaceCommand = workspaceExecute;

    const output = await factory.executeCommand(
      'echo "hello"',
      undefined,
      { directiveType: 'run', exeLabels: ['task'] }
    );

    expect(output).toBe('workspace-ok');
    expect(workspaceExecute).toHaveBeenCalledTimes(1);
  });

  it('does not create workspace bridge when no workspace is active', async () => {
    const factory = new CommandExecutorFactory(createDependencies(undefined));
    const shellExecute = vi.fn().mockResolvedValue('host-ok');
    (factory as any).shellExecutor = { execute: shellExecute };

    const output = await factory.executeCommand(
      'claude -p "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: ['llm'] }
    );

    expect(output).toBe('host-ok');
    expect(shellExecute).toHaveBeenCalledWith(
      'claude -p "hello"',
      undefined,
      expect.objectContaining({ exeLabels: ['llm'] })
    );
  });

  it('falls back to env getExeLabels when context labels are empty', async () => {
    const workspace = createWorkspace();
    const deps = createDependencies(workspace);
    (deps.workspaceProvider as any).getExeLabels = () => ['llm'];
    const factory = new CommandExecutorFactory(deps);

    const shellExecute = vi.fn().mockResolvedValue('env-fallback-ok');
    (factory as any).shellExecutor = { execute: shellExecute };
    (factory as any).captureWorkspaceSnapshot = vi.fn().mockResolvedValue(new Map());
    (factory as any).recordWorkspaceCommandWrites = vi.fn().mockResolvedValue(undefined);

    const output = await factory.executeCommand(
      'claude -p "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: [] }
    );

    expect(output).toBe('env-fallback-ok');
    expect(shellExecute).toHaveBeenCalledTimes(1);
  });

  it('falls back to opStack getEnclosingExeLabels when both context and env labels are empty', async () => {
    const workspace = createWorkspace();
    const deps = createDependencies(workspace);
    (deps.workspaceProvider as any).getExeLabels = () => [];
    (deps.workspaceProvider as any).getEnclosingExeLabels = () => ['llm'];
    const factory = new CommandExecutorFactory(deps);

    const shellExecute = vi.fn().mockResolvedValue('opstack-fallback-ok');
    (factory as any).shellExecutor = { execute: shellExecute };
    (factory as any).captureWorkspaceSnapshot = vi.fn().mockResolvedValue(new Map());
    (factory as any).recordWorkspaceCommandWrites = vi.fn().mockResolvedValue(undefined);

    const output = await factory.executeCommand(
      'claude -p "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: [] }
    );

    expect(output).toBe('opstack-fallback-ok');
    expect(shellExecute).toHaveBeenCalledTimes(1);
  });

  it('routes to ShellSession when all label sources are empty', async () => {
    const workspace = createWorkspace();
    const deps = createDependencies(workspace);
    (deps.workspaceProvider as any).getExeLabels = () => [];
    (deps.workspaceProvider as any).getEnclosingExeLabels = () => [];
    const factory = new CommandExecutorFactory(deps);

    const workspaceExecute = vi.fn().mockResolvedValue('vfs-ok');
    (factory as any).executeWorkspaceCommand = workspaceExecute;

    const output = await factory.executeCommand(
      'echo "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: [] }
    );

    expect(output).toBe('vfs-ok');
    expect(workspaceExecute).toHaveBeenCalledTimes(1);
  });

  it('routes to ShellSession when no context is provided and no env/opStack labels', async () => {
    const workspace = createWorkspace();
    const deps = createDependencies(workspace);
    (deps.workspaceProvider as any).getExeLabels = () => undefined;
    const factory = new CommandExecutorFactory(deps);

    const workspaceExecute = vi.fn().mockResolvedValue('no-context-ok');
    (factory as any).executeWorkspaceCommand = workspaceExecute;

    const output = await factory.executeCommand('echo "hello"');

    expect(output).toBe('no-context-ok');
    expect(workspaceExecute).toHaveBeenCalledTimes(1);
  });
});
