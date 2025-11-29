import { describe, it, expect } from 'vitest';
import { resolveInterpretMode } from './FileProcessor';

describe('resolveInterpretMode', () => {
  it('defaults to document mode with streaming unchanged', () => {
    const config = resolveInterpretMode({ input: 'script.mld' } as any);
    expect(config.mode).toBe('document');
    expect(config.streaming).toBeUndefined();
    expect(config.jsonOutput).toBe(false);
  });

  it('disables streaming when --no-stream is set', () => {
    const config = resolveInterpretMode({ input: 'script.mld', noStream: true } as any);
    expect(config.mode).toBe('document');
    expect(config.streaming).toEqual({ enabled: false });
  });

  it('enables stream mode when --debug is set', () => {
    const config = resolveInterpretMode({ input: 'script.mld', debug: true } as any);
    expect(config.mode).toBe('stream');
    expect(config.streaming).toEqual({ enabled: true });
  });

  it('switches to debug mode with json output when --debug --json is set', () => {
    const config = resolveInterpretMode({ input: 'script.mld', debug: true, json: true } as any);
    expect(config.mode).toBe('debug');
    expect(config.streaming).toEqual({ enabled: false });
    expect(config.jsonOutput).toBe(true);
  });
});
