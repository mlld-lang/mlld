import { describe, expect, it, vi } from 'vitest';
import { breakIntent, contentIntent, errorIntent, progressIntent } from '@interpreter/output/intent';
import type { OutputCoordinatorContext } from './OutputCoordinator';
import { OutputCoordinator } from './OutputCoordinator';

function createContext(overrides: Partial<OutputCoordinatorContext> = {}): OutputCoordinatorContext {
  const base: OutputCoordinatorContext = {
    getSecuritySnapshot: () => undefined,
    recordSecurityDescriptor: () => undefined,
    isImportingContent: () => false,
    isProvenanceEnabled: () => false,
    hasSDKEmitter: () => false,
    emitSDKEvent: () => undefined
  };
  return {
    ...base,
    ...overrides
  };
}

describe('OutputCoordinator', () => {
  it('suppresses doc effects while import content evaluation is active', () => {
    const effectHandler = { handleEffect: vi.fn() };
    const outputRenderer = { emit: vi.fn(), render: vi.fn() };
    const coordinator = new OutputCoordinator(effectHandler as any, outputRenderer as any);
    const context = createContext({ isImportingContent: () => true });

    coordinator.emitEffect('doc', 'hidden', undefined, context);

    expect(effectHandler.handleEffect).not.toHaveBeenCalled();
    expect(outputRenderer.render).not.toHaveBeenCalled();
  });

  it('renders output only for visible doc and both content', () => {
    const effectHandler = { handleEffect: vi.fn() };
    const outputRenderer = { emit: vi.fn(), render: vi.fn() };
    const coordinator = new OutputCoordinator(effectHandler as any, outputRenderer as any);
    const context = createContext();

    coordinator.emitEffect('doc', '\n\n', undefined, context);
    coordinator.emitEffect('doc', 'visible', undefined, context);
    coordinator.emitEffect('both', 'also-visible', undefined, context);

    expect(effectHandler.handleEffect).toHaveBeenCalledTimes(3);
    expect(outputRenderer.render).toHaveBeenCalledTimes(2);
  });

  it('attaches capability context and SDK provenance payload for emitted effects', () => {
    const effectHandler = { handleEffect: vi.fn() };
    const outputRenderer = { emit: vi.fn(), render: vi.fn() };
    const coordinator = new OutputCoordinator(effectHandler as any, outputRenderer as any);
    const recordSecurityDescriptor = vi.fn();
    const emitSDKEvent = vi.fn();
    const context = createContext({
      getSecuritySnapshot: () => ({
        labels: ['secret'],
        taint: ['secret'],
        sources: ['fixture:test'],
        operation: { type: 'run', command: 'echo hello' }
      }),
      recordSecurityDescriptor,
      isProvenanceEnabled: () => true,
      hasSDKEmitter: () => true,
      emitSDKEvent
    });

    coordinator.emitEffect('doc', 'secure-output', { path: '/tmp/out.md' }, context);

    expect(effectHandler.handleEffect).toHaveBeenCalledTimes(1);
    const effect = effectHandler.handleEffect.mock.calls[0][0];
    expect(effect.capability).toBeDefined();
    expect(effect.capability.kind).toBe('effect');
    expect(effect.capability.security.labels).toContain('secret');
    expect(effect.capability.metadata).toEqual({
      effectType: 'doc',
      path: '/tmp/out.md'
    });
    expect(recordSecurityDescriptor).toHaveBeenCalledTimes(1);

    expect(emitSDKEvent).toHaveBeenCalledTimes(1);
    const sdkEvent = emitSDKEvent.mock.calls[0][0];
    expect(sdkEvent.type).toBe('effect');
    expect(sdkEvent.effect.content).toBe('secure-output');
    expect(sdkEvent.effect.security.labels).toContain('secret');
    expect(sdkEvent.effect.provenance.labels).toContain('secret');
  });

  it('maps output intents into effect types and delegates renderer controls', () => {
    const effectHandler = { handleEffect: vi.fn() };
    const outputRenderer = { emit: vi.fn(), render: vi.fn() };
    const coordinator = new OutputCoordinator(effectHandler as any, outputRenderer as any);
    const context = createContext();

    coordinator.intentToEffect(contentIntent('doc text', 'directive'), context);
    coordinator.intentToEffect(breakIntent('\n'), context);
    coordinator.intentToEffect(progressIntent('working'), context);
    coordinator.intentToEffect(errorIntent('failed'), context);
    coordinator.emitIntent(contentIntent('queued', 'directive'));
    coordinator.renderOutput();

    const effectTypes = effectHandler.handleEffect.mock.calls.map(([effect]) => effect.type);
    expect(effectTypes).toEqual(['doc', 'doc', 'stdout', 'stderr']);
    expect(outputRenderer.emit).toHaveBeenCalledTimes(1);
    expect(outputRenderer.render).toHaveBeenCalledTimes(2);
  });
});
