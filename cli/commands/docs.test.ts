import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interpreter/index', () => ({
  interpret: vi.fn()
}));

vi.mock('./info', () => ({
  getModuleInfo: vi.fn(),
  highlightMarkdown: (value: string) => value
}));

import { interpret } from '@interpreter/index';
import { getModuleInfo } from './info';
import { docsCommand } from './docs';

describe('docsCommand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses docsUrl for directory modules', async () => {
    vi.mocked(getModuleInfo).mockResolvedValue({
      name: 'demo',
      author: 'alice',
      sourceUrl: 'https://example.com/modules/demo/index.mld',
      docsUrl: 'https://example.com/modules/demo/README.md'
    } as any);

    vi.mocked(interpret).mockImplementation(async (source: string) => {
      if (source.includes('README.md # tldr')) {
        return { output: 'tldr text' } as any;
      }

      if (source.includes('README.md # docs')) {
        return { output: 'docs text' } as any;
      }

      return { output: '' } as any;
    });

    await docsCommand('@alice/demo', { basePath: '/tmp' });

    expect(interpret).toHaveBeenCalledTimes(2);
    expect(vi.mocked(interpret).mock.calls[0]?.[0]).toContain('<https://example.com/modules/demo/README.md # tldr>');
    expect(vi.mocked(interpret).mock.calls[1]?.[0]).toContain('<https://example.com/modules/demo/README.md # docs>');
  });
});
