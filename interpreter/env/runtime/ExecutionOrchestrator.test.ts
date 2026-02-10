import { describe, expect, it, vi } from 'vitest';
import type { CommandExecutionContext } from '../ErrorUtils';
import { ExecutionOrchestrator } from './ExecutionOrchestrator';
import { ShadowEnvironmentRuntime } from './ShadowEnvironmentRuntime';

function createEnvironmentRuntime(overrides: Record<string, any> = {}) {
  const bus = {} as any;
  const contextManager = {
    buildAmbientContext: vi.fn(() => ({ source: 'ambient' }))
  };

  return {
    bus,
    contextManager,
    runtime: {
      getExecutionDirectory: vi.fn(() => '/tmp/mlld'),
      getStreamingBus: vi.fn(() => bus),
      getContextManager: vi.fn(() => contextManager),
      getPipelineContext: vi.fn(() => ({
        stage: 0,
        totalStages: 1,
        currentCommand: 'echo hi',
        input: 'hi',
        previousOutputs: []
      })),
      getSecuritySnapshot: vi.fn(() => ({
        labels: ['secret'],
        taint: ['secret'],
        sources: ['fixture:test']
      })),
      getVariable: vi.fn(() => undefined),
      ...overrides
    }
  };
}

function createOrchestrator(overrides: Record<string, any> = {}) {
  const environment = createEnvironmentRuntime(overrides.environment ?? {});
  const executeCommand = vi.fn().mockResolvedValue('ok');
  const executeCode = vi.fn().mockResolvedValue('ok');
  const create = vi.fn(() => ({ executeCommand, executeCode }));
  const shadowRuntime = new ShadowEnvironmentRuntime({
    getFileDirectory: () => '/tmp/mlld',
    getCurrentFilePath: () => '/tmp/mlld/main.mld'
  });
  const variableProvider = {
    getVariables: vi.fn(() => new Map())
  };

  const orchestrator = new ExecutionOrchestrator(
    environment.runtime as any,
    {} as any,
    variableProvider as any,
    shadowRuntime,
    { create } as any
  );

  return {
    orchestrator,
    environment,
    create,
    executeCommand,
    executeCode
  };
}

describe('ExecutionOrchestrator', () => {
  it('merges command options and injects stream bus into execution context', async () => {
    const setup = createOrchestrator();

    await setup.orchestrator.executeCommand({
      command: 'echo hello',
      defaultOptions: { timeout: 100, errorBehavior: 'continue' },
      options: { maxOutputLines: 10 },
      context: { directiveType: 'run' }
    });

    expect(setup.create).toHaveBeenCalledTimes(1);
    expect(setup.executeCommand).toHaveBeenCalledWith(
      'echo hello',
      {
        timeout: 100,
        errorBehavior: 'continue',
        maxOutputLines: 10
      },
      {
        directiveType: 'run',
        bus: setup.environment.bus
      }
    );
  });

  it('injects ambient mx for js/node execution when params do not define mx', async () => {
    const setup = createOrchestrator({
      environment: {
        getVariable: vi.fn((name: string) => {
          if (name === 'test_mx') {
            return { value: { forced: true } };
          }
          return undefined;
        })
      }
    });

    await setup.orchestrator.executeCode({
      code: 'return 1;',
      language: 'js',
      params: { value: 1 },
      defaultOptions: { errorBehavior: 'halt' }
    });

    const call = setup.executeCode.mock.calls[0];
    expect(call[0]).toBe('return 1;');
    expect(call[1]).toBe('js');
    expect(call[2].value).toBe(1);
    expect(call[2].mx).toEqual({ forced: true });
    expect(Object.isFrozen(call[2].mx)).toBe(true);
    expect(call[5]).toEqual({ bus: setup.environment.bus });
  });

  it('preserves explicit mx params and normalizes legacy metadata-context overloads', async () => {
    const setup = createOrchestrator();
    const metadataAsContext: CommandExecutionContext = { directiveType: 'run' };

    await setup.orchestrator.executeCode({
      code: 'return mx.test;',
      language: 'node',
      params: { mx: { explicit: true } },
      metadata: metadataAsContext,
      defaultOptions: { showProgress: false }
    });

    const call = setup.executeCode.mock.calls[0];
    expect(call[2].mx).toEqual({ explicit: true });
    expect(call[3]).toBeUndefined();
    expect(call[5]).toEqual({ directiveType: 'run', bus: setup.environment.bus });
  });

  it('builds ambient context from ContextManager when test override variable is absent', async () => {
    const setup = createOrchestrator();

    await setup.orchestrator.executeCode({
      code: 'return 3;',
      language: 'javascript',
      defaultOptions: { timeout: 50 }
    });

    expect(setup.environment.contextManager.buildAmbientContext).toHaveBeenCalledWith({
      pipelineContext: expect.objectContaining({ stage: 0, totalStages: 1 }),
      securitySnapshot: expect.objectContaining({ labels: ['secret'] })
    });
    const call = setup.executeCode.mock.calls[0];
    expect(call[2].mx).toEqual({ source: 'ambient' });
  });
});
