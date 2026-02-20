import { describe, expect, it } from 'vitest';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { PipelineWhileStageAdapter } from './while-stage-adapter';

describe('pipeline while stage adapter', () => {
  it('adapts exec-invocation processors into pipeline commands', () => {
    const adapter = new PipelineWhileStageAdapter();
    const structuredState = wrapStructured('state', 'text', 'state');

    const adapted = adapter.adaptProcessor(
      {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [
            {
              type: 'VariableReference',
              identifier: 'processor',
              fields: []
            }
          ],
          args: [
            { type: 'Text', content: 'x' },
            { type: 'VariableReference', identifier: 'argVar', fields: [] }
          ],
          fields: []
        },
        withClause: {
          stream: true
        }
      },
      structuredState
    );

    expect(adapted.command.rawIdentifier).toBe('processor');
    expect(adapted.command.rawArgs).toEqual(['x', '@argVar']);
    expect((adapted.command as any).stream).toBe(true);
    expect(adapted.input.structured).toBe(structuredState);
    expect(adapted.input.text).toBe('state');
  });

  it('normalizes non-structured state values and preserves fallback identifiers', () => {
    const adapter = new PipelineWhileStageAdapter();

    const adapted = adapter.adaptProcessor(
      {
        type: 'UnknownProcessorType',
        rawIdentifier: 'custom-adapter'
      },
      { count: 3 }
    );

    expect(adapted.command.rawIdentifier).toBe('custom-adapter');
    expect(adapted.command.args).toEqual([]);
    expect(adapted.input.structured.type).toBe('object');
    expect(adapted.input.text).toBe('{"count":3}');
  });
});
