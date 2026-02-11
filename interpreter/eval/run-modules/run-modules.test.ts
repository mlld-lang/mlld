import { describe, expect, it } from 'vitest';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import {
  dedentCommonIndent,
  extractRawTextContent,
  mergeAuthUsing,
  resolveRunCodeOpType
} from './run-pure-helpers';
import {
  getPreExtractedExec,
  getPreExtractedRunCommand,
  getPreExtractedRunDescriptor,
  getPreExtractedRunStdin
} from './run-pre-extracted-inputs';

function buildContext(extractedInputs: unknown[]): EvaluationContext {
  return { extractedInputs } as unknown as EvaluationContext;
}

describe('run pure helpers', () => {
  it('extractRawTextContent preserves raw text and trims one leading newline', () => {
    const raw = extractRawTextContent([
      { type: 'Newline' } as any,
      { type: 'Text', content: 'alpha' } as any,
      { type: 'Newline' } as any,
      { type: 'Unknown', value: 'beta' } as any
    ]);

    expect(raw).toBe('alpha\nbeta');
  });

  it('dedentCommonIndent removes shared indentation only', () => {
    const source = ['    one', '      two', '', '    three'].join('\n');
    const result = dedentCommonIndent(source);

    expect(result).toBe(['one', '  two', '', 'three'].join('\n'));
  });

  it('resolveRunCodeOpType maps aliases and unknown values correctly', () => {
    expect(resolveRunCodeOpType(' bash ')).toBe('sh');
    expect(resolveRunCodeOpType('javascript')).toBe('js');
    expect(resolveRunCodeOpType('nodejs')).toBe('node');
    expect(resolveRunCodeOpType('python')).toBe('py');
    expect(resolveRunCodeOpType('prose')).toBe('prose');
    expect(resolveRunCodeOpType('ruby')).toBeNull();
  });

  it('mergeAuthUsing prefers overrides and falls back to base values', () => {
    const merged = mergeAuthUsing(
      { auth: { token: '@base' } as any, using: { one: '@base' } as any } as any,
      { using: { two: '@override' } as any } as any
    );
    expect(merged).toEqual({
      auth: { token: '@base' },
      using: { two: '@override' }
    });
    expect(mergeAuthUsing(undefined, undefined)).toBeUndefined();
  });
});

describe('run pre-extracted input readers', () => {
  it('reads pre-extracted command and descriptor', () => {
    const context = buildContext([
      {
        name: '__run_command__',
        value: 'echo hello',
        mx: { labels: ['secret'], taint: ['secret'], sources: ['fixture'] }
      }
    ]);

    expect(getPreExtractedRunCommand(context)).toBe('echo hello');
    const descriptor = getPreExtractedRunDescriptor(context);
    expect(descriptor?.labels).toEqual(['secret']);
    expect(descriptor?.taint).toEqual(['secret']);
    expect(descriptor?.sources).toEqual(['fixture']);
  });

  it('reads pre-extracted stdin text and descriptor', () => {
    const context = buildContext([
      {
        name: '__run_stdin__',
        value: 'stdin-value',
        mx: { labels: ['stdin'], taint: ['stdin'], sources: ['stdin:fixture'] }
      }
    ]);

    const stdin = getPreExtractedRunStdin(context);
    expect(stdin?.text).toBe('stdin-value');
    expect(stdin?.descriptor?.labels).toEqual(['stdin']);
  });

  it('resolves pre-extracted executable inputs by name', () => {
    const executable = { name: 'tool', type: 'executable', value: { type: 'command' } };
    const context = buildContext([
      executable,
      { name: 'notExec', type: 'text', value: 'x' }
    ]);

    expect(getPreExtractedExec(context, 'tool')).toBe(executable);
    expect(getPreExtractedExec(context, 'missing')).toBeUndefined();
  });
});
