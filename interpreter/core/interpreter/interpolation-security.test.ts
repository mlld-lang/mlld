import { describe, expect, it, vi } from 'vitest';
import { createInterpolationSecurityAdapter } from '@interpreter/core/interpreter/interpolation-security';

function descriptor(label: string): any {
  return {
    labels: [label],
    taint: [],
    sources: []
  };
}

function createEnvMock() {
  return {
    mergeSecurityDescriptors: vi.fn((...descriptors: any[]) => ({
      labels: descriptors.flatMap(item => item.labels || []),
      taint: [],
      sources: []
    })),
    recordSecurityDescriptor: vi.fn()
  };
}

describe('interpolation security adapter', () => {
  it('preserves interpolate output and records a single descriptor without merging', async () => {
    const env = createEnvMock();
    const alpha = descriptor('alpha');
    const interpolate = vi.fn(async (_nodes, _env, _context, options: any) => {
      options?.collectSecurityDescriptor?.(alpha);
      return 'alpha-text';
    });

    const { interpolateWithSecurityRecording } = createInterpolationSecurityAdapter(interpolate as any);
    const text = await interpolateWithSecurityRecording([{ type: 'Text', content: 'alpha' }], env as any);

    expect(text).toBe('alpha-text');
    expect(env.mergeSecurityDescriptors).not.toHaveBeenCalled();
    expect(env.recordSecurityDescriptor).toHaveBeenCalledTimes(1);
    expect(env.recordSecurityDescriptor).toHaveBeenCalledWith(alpha);
  });

  it('merges multiple descriptors in collection order before recording', async () => {
    const env = createEnvMock();
    const alpha = descriptor('alpha');
    const beta = descriptor('beta');
    const gamma = descriptor('gamma');
    const merged = descriptor('merged');
    env.mergeSecurityDescriptors.mockReturnValueOnce(merged);

    const interpolate = vi.fn(async (_nodes, _env, _context, options: any) => {
      options?.collectSecurityDescriptor?.(alpha);
      options?.collectSecurityDescriptor?.(beta);
      options?.collectSecurityDescriptor?.(gamma);
      return 'merged-text';
    });

    const { interpolateWithSecurityRecording } = createInterpolationSecurityAdapter(interpolate as any);
    const text = await interpolateWithSecurityRecording([{ type: 'Text', content: 'value' }], env as any);

    expect(text).toBe('merged-text');
    expect(env.mergeSecurityDescriptors).toHaveBeenCalledTimes(1);
    expect(env.mergeSecurityDescriptors).toHaveBeenCalledWith(alpha, beta, gamma);
    expect(env.recordSecurityDescriptor).toHaveBeenCalledTimes(1);
    expect(env.recordSecurityDescriptor).toHaveBeenCalledWith(merged);
  });

  it('does not merge or record when no descriptors are collected', async () => {
    const env = createEnvMock();
    const interpolate = vi.fn(async (_nodes, _env, _context, options: any) => {
      options?.collectSecurityDescriptor?.(undefined);
      return 'plain-text';
    });

    const { interpolateWithSecurityRecording } = createInterpolationSecurityAdapter(interpolate as any);
    const text = await interpolateWithSecurityRecording([{ type: 'Text', content: 'plain' }], env as any);

    expect(text).toBe('plain-text');
    expect(env.mergeSecurityDescriptors).not.toHaveBeenCalled();
    expect(env.recordSecurityDescriptor).not.toHaveBeenCalled();
  });

  it('keeps descriptor recording order stable across sequential interpolations', async () => {
    const env = createEnvMock();
    const first = descriptor('first');
    const second = descriptor('second');
    const third = descriptor('third');
    const mergedSecondThird = descriptor('second-third');
    env.mergeSecurityDescriptors.mockReturnValueOnce(mergedSecondThird);

    let callIndex = 0;
    const batches = [[first], [second, third]];
    const interpolate = vi.fn(async (_nodes, _env, _context, options: any) => {
      const batch = batches[callIndex] || [];
      for (const item of batch) {
        options?.collectSecurityDescriptor?.(item);
      }
      callIndex += 1;
      return `text-${callIndex}`;
    });

    const { interpolateWithSecurityRecording } = createInterpolationSecurityAdapter(interpolate as any);
    const firstText = await interpolateWithSecurityRecording([{ type: 'Text', content: 'a' }], env as any);
    const secondText = await interpolateWithSecurityRecording([{ type: 'Text', content: 'b' }], env as any);

    expect(firstText).toBe('text-1');
    expect(secondText).toBe('text-2');
    expect(env.recordSecurityDescriptor).toHaveBeenCalledTimes(2);
    expect(env.recordSecurityDescriptor.mock.calls[0][0]).toBe(first);
    expect(env.recordSecurityDescriptor.mock.calls[1][0]).toBe(mergedSecondThird);
  });
});
