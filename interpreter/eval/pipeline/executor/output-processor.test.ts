import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  applySecurityDescriptorToStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { makeSecurityDescriptor } from '@core/types/security';
import { PipelineOutputProcessor } from './output-processor';

function createProcessor(): PipelineOutputProcessor {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  return new PipelineOutputProcessor(env);
}

describe('pipeline output processor', () => {
  it('normalizes null, primitive, object, array, structured, and pipeline-input outputs', () => {
    const processor = createProcessor();

    const structured = wrapStructured('ok', 'text', 'ok');
    expect(processor.normalizeOutput(structured)).toBe(structured);

    expect(() => processor.normalizeOutput(null)).toThrow(TypeError);

    const numberOutput = processor.normalizeOutput(12);
    expect(numberOutput.type).toBe('text');
    expect(numberOutput.text).toBe('12');

    const objectOutput = processor.normalizeOutput({ id: 1 });
    expect(objectOutput.type).toBe('object');
    expect(objectOutput.data).toEqual({ id: 1 });

    const arrayOutput = processor.normalizeOutput([1, 2, 3]);
    expect(arrayOutput.type).toBe('array');
    expect(arrayOutput.data).toEqual([1, 2, 3]);

    const pipelineInput = {
      type: 'pipeline-input',
      text: '{"kind":"pipeline"}',
      data: { kind: 'pipeline' }
    } as any;
    expect(processor.normalizeOutput(pipelineInput)).toBe(pipelineInput);
  });

  it('merges stage descriptors and applies provenance to finalized outputs', () => {
    const processor = createProcessor();

    const inputDescriptor = makeSecurityDescriptor({ labels: ['input'], taint: ['input'] });
    const rawDescriptor = makeSecurityDescriptor({ labels: ['raw'], taint: ['raw'] });
    const existingDescriptor = makeSecurityDescriptor({ labels: ['existing'], taint: ['existing'] });
    const hintDescriptor = makeSecurityDescriptor({ labels: ['hint'], taint: ['hint'] });

    const stageInput = wrapStructured('seed', 'text', 'seed');
    applySecurityDescriptorToStructuredValue(stageInput, inputDescriptor);

    const rawOutput = wrapStructured('raw', 'text', 'raw');
    applySecurityDescriptorToStructuredValue(rawOutput, rawDescriptor);

    const normalized = wrapStructured('value', 'text', 'value');
    applySecurityDescriptorToStructuredValue(normalized, existingDescriptor);

    const finalized = processor.finalizeStageOutput(normalized, stageInput, rawOutput, hintDescriptor);
    expect(finalized.mx?.labels ?? []).toEqual(expect.arrayContaining(['input', 'raw', 'existing', 'hint']));
    expect(finalized.mx?.taint ?? []).toEqual(expect.arrayContaining(['input', 'raw', 'existing', 'hint']));
  });

  it('propagates source descriptors onto initial wrappers', () => {
    const processor = createProcessor();
    const source = wrapStructured('source', 'text', 'source');
    applySecurityDescriptorToStructuredValue(source, makeSecurityDescriptor({ labels: ['source-label'], taint: ['source-label'] }));

    const target = wrapStructured('target', 'text', 'target');
    processor.applySourceDescriptor(target, source);

    expect(target.mx?.labels ?? []).toContain('source-label');
    expect(target.mx?.taint ?? []).toContain('source-label');
  });
});
