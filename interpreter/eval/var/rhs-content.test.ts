import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { createRhsContentEvaluator } from './rhs-content';

const mocks = vi.hoisted(() => ({
  accessField: vi.fn(),
  applyHeaderTransform: vi.fn((content: string, header: string) => `${header}\n${content}`),
  getSection: vi.fn(),
  processContentLoader: vi.fn(),
  readFileWithPolicy: vi.fn()
}));

vi.mock('@interpreter/policy/filesystem-policy', () => ({
  readFileWithPolicy: mocks.readFileWithPolicy
}));

vi.mock('../show', () => ({
  applyHeaderTransform: mocks.applyHeaderTransform
}));

vi.mock('@interpreter/utils/llmxml-instance', () => ({
  llmxmlInstance: {
    getSection: mocks.getSection
  }
}));

vi.mock('@interpreter/utils/field-access', () => ({
  accessField: mocks.accessField
}));

vi.mock('../content-loader', () => ({
  processContentLoader: mocks.processContentLoader
}));

function createEnvStub(): Environment {
  return {} as Environment;
}

describe('rhs content evaluator', () => {
  beforeEach(() => {
    mocks.accessField.mockReset();
    mocks.applyHeaderTransform.mockClear();
    mocks.getSection.mockReset();
    mocks.processContentLoader.mockReset();
    mocks.readFileWithPolicy.mockReset();
  });

  it('evaluates path nodes using interpolated path and source location policy', async () => {
    const env = createEnvStub();
    const sourceLocation = {
      filePath: '/test/source.mld'
    } as SourceLocation;
    const interpolateWithSecurity = vi.fn().mockResolvedValue('/docs/readme.md');
    mocks.readFileWithPolicy.mockResolvedValue('path-content');

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity,
      sourceLocation
    });

    const result = await evaluator.evaluatePath({ segments: [{ type: 'Text', content: 'readme.md' }] });

    expect(result).toBe('path-content');
    expect(interpolateWithSecurity).toHaveBeenCalledWith([{ type: 'Text', content: 'readme.md' }]);
    expect(mocks.readFileWithPolicy).toHaveBeenCalledWith(env, '/docs/readme.md', sourceLocation);
  });

  it('evaluates sections via llmxml and applies asSection header transform', async () => {
    const env = createEnvStub();
    const interpolateWithSecurity = vi
      .fn()
      .mockResolvedValueOnce('/docs/spec.md')
      .mockResolvedValueOnce('Overview')
      .mockResolvedValueOnce('## Renamed');
    mocks.readFileWithPolicy.mockResolvedValue('# Overview\nBody');
    mocks.getSection.mockResolvedValue('Section Body');

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity,
      withClause: {
        asSection: [{ type: 'Text', content: '## Renamed' }]
      }
    });

    const result = await evaluator.evaluateSection({
      path: [{ type: 'Text', content: 'spec.md' }],
      section: [{ type: 'Text', content: 'Overview' }]
    });

    expect(result).toBe('## Renamed\nSection Body');
    expect(mocks.getSection).toHaveBeenCalledWith('# Overview\nBody', 'Overview', {
      includeNested: true,
      includeTitle: true
    });
    expect(mocks.applyHeaderTransform).toHaveBeenCalledWith('Section Body', '## Renamed');
  });

  it('falls back to local section extraction when llmxml errors', async () => {
    const env = createEnvStub();
    const interpolateWithSecurity = vi
      .fn()
      .mockResolvedValueOnce('/docs/spec.md')
      .mockResolvedValueOnce('Details');
    mocks.readFileWithPolicy.mockResolvedValue(
      '# Intro\nTop\n## Details\nLine A\nLine B\n## Next\nDone'
    );
    mocks.getSection.mockRejectedValue(new Error('llmxml unavailable'));

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity
    });

    const result = await evaluator.evaluateSection({
      path: [{ type: 'Text', content: 'spec.md' }],
      section: [{ type: 'Text', content: 'Details' }]
    });

    expect(result).toBe('## Details\nLine A\nLine B\n## Next\nDone');
  });

  it('applies asSection as section.renamed for single-file load-content', async () => {
    const env = createEnvStub();
    const interpolateWithSecurity = vi.fn();
    const asSectionParts = [{ type: 'Text', content: '## New Title' }];
    const valueNode = {
      type: 'load-content',
      source: { raw: 'guide.md' },
      options: {}
    };
    mocks.processContentLoader.mockResolvedValue('loaded-single');

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity,
      withClause: { asSection: asSectionParts }
    });

    const result = await evaluator.evaluateLoadContent(valueNode);

    expect(result).toBe('loaded-single');
    expect(valueNode.options.section.renamed).toEqual({
      type: 'rename-template',
      parts: asSectionParts
    });
    expect(mocks.processContentLoader).toHaveBeenCalledWith(valueNode, env);
  });

  it('applies asSection as transform for glob load-content sources', async () => {
    const env = createEnvStub();
    const interpolateWithSecurity = vi.fn();
    const asSectionParts = [{ type: 'Text', content: '## <>.fm.title' }];
    const valueNode = {
      type: 'load-content',
      source: { raw: '*.md' },
      options: {}
    };
    mocks.processContentLoader.mockResolvedValue('loaded-glob');

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity,
      withClause: { asSection: asSectionParts }
    });

    const result = await evaluator.evaluateLoadContent(valueNode);

    expect(result).toBe('loaded-glob');
    expect(valueNode.options.transform).toEqual({
      type: 'template',
      parts: asSectionParts
    });
    expect(valueNode.options.section).toBeUndefined();
  });

  it('evaluates file references through load-content and chained field access', async () => {
    const env = createEnvStub();
    const interpolateWithSecurity = vi.fn();
    const valueNode = {
      type: 'FileReference',
      source: { raw: 'data.json' },
      options: { format: 'json' },
      pipes: [],
      fields: [{ type: 'field', value: 'users' }, { type: 'field', value: '0' }]
    };

    mocks.processContentLoader.mockResolvedValue({ users: [{ id: 1 }] });
    mocks.accessField.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce('first-user');

    const evaluator = createRhsContentEvaluator(env, {
      interpolateWithSecurity
    });

    const result = await evaluator.evaluateFileReference(valueNode);

    expect(result).toBe('first-user');
    expect(mocks.processContentLoader).toHaveBeenCalledWith(
      {
        type: 'load-content',
        source: valueNode.source,
        options: valueNode.options,
        pipes: valueNode.pipes
      },
      env
    );
    expect(mocks.accessField).toHaveBeenCalledTimes(2);
  });
});
