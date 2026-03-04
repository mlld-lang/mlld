import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandExecutorFactory, type ExecutorDependencies } from './CommandExecutorFactory';
import { ErrorUtils } from '../ErrorUtils';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { WorkspaceValue } from '@core/types/workspace';

const { bridgeFactoryMock } = vi.hoisted(() => ({
  bridgeFactoryMock: vi.fn()
}));

vi.mock('./workspace-mcp-bridge', () => ({
  createWorkspaceMcpBridge: bridgeFactoryMock
}));

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

  it('routes workspace llm commands through the MCP bridge and real shell executor', async () => {
    const workspace = createWorkspace();
    const factory = new CommandExecutorFactory(createDependencies(workspace));

    const shellExecute = vi.fn().mockResolvedValue('llm-ok');
    const bridgeCleanup = vi.fn().mockResolvedValue(undefined);

    (factory as any).shellExecutor = { execute: shellExecute };
    (factory as any).captureWorkspaceSnapshot = vi.fn().mockResolvedValue(new Map());
    (factory as any).recordWorkspaceCommandWrites = vi.fn().mockResolvedValue(undefined);

    bridgeFactoryMock.mockResolvedValue({
      allowedTools: ['Read', 'Write'],
      mcpConfigPath: '/tmp/mock-mcp.json',
      injectCommand: (command: string) => `${command} --mcp-config /tmp/mock-mcp.json`,
      cleanup: bridgeCleanup
    });

    const output = await factory.executeCommand(
      'claude -p "hello"',
      undefined,
      { directiveType: 'exec', exeLabels: ['llm'] }
    );

    expect(output).toBe('llm-ok');
    expect(bridgeFactoryMock).toHaveBeenCalledTimes(1);
    expect(shellExecute).toHaveBeenCalledWith(
      'claude -p "hello" --mcp-config /tmp/mock-mcp.json',
      undefined,
      expect.objectContaining({ exeLabels: ['llm'] })
    );
    expect(bridgeCleanup).toHaveBeenCalledTimes(1);
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
    expect(bridgeFactoryMock).not.toHaveBeenCalled();
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
    expect(bridgeFactoryMock).not.toHaveBeenCalled();
  });
});
