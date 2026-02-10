import { describe, expect, it, vi } from 'vitest';
import type {
  GuardContextSnapshot,
  GuardHistoryEntry,
  OperationContext,
  PipelineContextSnapshot,
  DeniedContextSnapshot
} from '../ContextManager';
import { ContextFacade } from './ContextFacade';

function createContextManager() {
  return {
    withOperation: vi.fn(async (_context, fn) => fn()),
    updateOperation: vi.fn(),
    getEnclosingExeLabels: vi.fn(() => ['secure']),
    setToolAvailability: vi.fn(),
    recordToolCall: vi.fn(),
    resetToolCalls: vi.fn(),
    withPipelineContext: vi.fn(async (_context, fn) => fn()),
    withGuardContext: vi.fn(async (_context, fn) => fn()),
    withDeniedContext: vi.fn(async (_context, fn) => fn()),
    pushGenericContext: vi.fn(),
    popGenericContext: vi.fn(() => ({ popped: true })),
    peekGenericContext: vi.fn(() => ({ current: true })),
    withGenericContext: vi.fn(async (_type, _context, fn) => fn())
  };
}

function createGuardRegistry() {
  return {
    serializeOwn: vi.fn(() => [{ name: 'policy-guard' }]),
    serializeByNames: vi.fn((names: readonly string[]) => names.map(name => ({ name }))),
    importSerialized: vi.fn()
  };
}

describe('ContextFacade', () => {
  it('tracks shared pipeline guard history entries', () => {
    const contextManager = createContextManager();
    const guardRegistry = createGuardRegistry();
    const store: { entries?: GuardHistoryEntry[] } = {};
    const facade = new ContextFacade(contextManager as any, guardRegistry as any, store);

    expect(facade.getPipelineGuardHistory()).toEqual([]);

    const entry = {
      stage: 0,
      operation: null,
      decision: 'allow',
      trace: [],
      hints: [],
      reasons: []
    } as GuardHistoryEntry;
    facade.recordPipelineGuardHistory(entry);
    expect(store.entries).toHaveLength(1);
    expect(store.entries?.[0]).toBe(entry);

    facade.resetPipelineGuardHistory();
    expect(store.entries).toEqual([]);
  });

  it('delegates guard serialization and import behavior', () => {
    const contextManager = createContextManager();
    const guardRegistry = createGuardRegistry();
    const facade = new ContextFacade(contextManager as any, guardRegistry as any, {});

    expect(facade.serializeLocalGuards()).toEqual([{ name: 'policy-guard' }]);
    expect(facade.serializeGuardsByNames(['a', 'b'])).toEqual([{ name: 'a' }, { name: 'b' }]);

    facade.registerSerializedGuards(undefined);
    facade.registerSerializedGuards([]);
    expect(guardRegistry.importSerialized).not.toHaveBeenCalled();

    const defs = [{ name: 'c' }];
    facade.registerSerializedGuards(defs as any);
    expect(guardRegistry.importSerialized).toHaveBeenCalledWith(defs);
  });

  it('delegates operation, pipeline, guard, denied, and generic context wrappers', async () => {
    const contextManager = createContextManager();
    const guardRegistry = createGuardRegistry();
    const facade = new ContextFacade(contextManager as any, guardRegistry as any, {});

    const opContext = { type: 'run' } as OperationContext;
    await expect(facade.withOpContext(opContext, async () => 'ok')).resolves.toBe('ok');
    facade.updateOpContext({ subtype: 'shell' });
    expect(facade.getEnclosingExeLabels()).toEqual(['secure']);
    facade.setToolsAvailability(['echo'], ['rm']);
    facade.recordToolCall({ name: 'echo', timestamp: Date.now(), ok: true });
    facade.resetToolCalls();

    const pipelineContext = {
      stage: 0,
      totalStages: 1,
      currentCommand: 'echo hi',
      input: 'hi',
      previousOutputs: []
    } as PipelineContextSnapshot;
    await expect(facade.withPipeContext(pipelineContext, async () => 42)).resolves.toBe(42);

    const guardContext = { attempt: 1 } as GuardContextSnapshot;
    await expect(facade.withGuardContext(guardContext, async () => 'guarded')).resolves.toBe('guarded');

    const deniedContext = { denied: true } as DeniedContextSnapshot;
    await expect(facade.withDeniedContext(deniedContext, async () => 'denied')).resolves.toBe('denied');

    facade.pushExecutionContext('loop', { index: 0 });
    expect(facade.popExecutionContext('loop')).toEqual({ popped: true });
    expect(facade.getExecutionContext('loop')).toEqual({ current: true });
    await expect(
      facade.withExecutionContext('loop', { index: 1 }, async () => 'scoped')
    ).resolves.toBe('scoped');

    expect(contextManager.withOperation).toHaveBeenCalledWith(opContext, expect.any(Function));
    expect(contextManager.withPipelineContext).toHaveBeenCalledWith(
      pipelineContext,
      expect.any(Function)
    );
    expect(contextManager.withGuardContext).toHaveBeenCalledWith(guardContext, expect.any(Function));
    expect(contextManager.withDeniedContext).toHaveBeenCalledWith(
      deniedContext,
      expect.any(Function)
    );
    expect(contextManager.withGenericContext).toHaveBeenCalledWith(
      'loop',
      { index: 1 },
      expect.any(Function)
    );
  });
});
