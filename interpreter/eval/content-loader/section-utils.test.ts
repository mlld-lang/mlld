import { describe, expect, it } from 'vitest';
import { ContentLoaderSectionHelper } from './section-utils';

const helper = new ContentLoaderSectionHelper({
  interpolateAndRecord: async (nodes) => nodes.map((node: any) => node?.content ?? '').join('')
});

describe('ContentLoaderSectionHelper selectors', () => {
  const content = [
    '# Root',
    '',
    '## TL;DR',
    '',
    'tl dr body',
    '',
    '## Titled section',
    '',
    'section body',
    '',
    '### Child',
    '',
    'child body',
    '',
    '## Other',
    '',
    'other body',
    '',
    '## Another section title',
    '',
    'another body'
  ].join('\n');

  it('supports include/exclude selectors with quotes and list delimiters', async () => {
    const extracted = await helper.extractSection(
      content,
      '"Titled section", Other; !# tldr, "Another section title"'
    );

    expect(extracted).toContain('## Titled section');
    expect(extracted).toContain('### Child');
    expect(extracted).toContain('## Other');
    expect(extracted).not.toContain('## TL;DR');
    expect(extracted).not.toContain('## Another section title');
  });

  it('allows optional include selectors with ? suffix', async () => {
    const extracted = await helper.extractSection(
      content,
      '"Missing heading"?, other'
    );

    expect(extracted).toContain('## Other');
    expect(extracted).not.toContain('## Titled section');
  });

  it('errors on missing required include selectors', async () => {
    await expect(
      helper.extractSection(content, '"Missing heading", other')
    ).rejects.toThrow('Section "Missing heading" not found in content');
  });

  it('errors when !# is used without ; separator', async () => {
    await expect(
      helper.extractSection(content, 'tl;dr !# other')
    ).rejects.toThrow('use "; !# section" to start exclude selectors');
  });

  it('matches headings fuzzily by punctuation-insensitive prefix', async () => {
    const extracted = await helper.extractSection(content, 'tldr');
    expect(extracted).toContain('## TL;DR');
    expect(extracted).toContain('tl dr body');
  });

  it('keeps first-match behavior for duplicate fuzzy matches', async () => {
    const duplicateContent = [
      '# Root',
      '',
      '## Intro',
      '',
      'first',
      '',
      '## Introduction Extended',
      '',
      'second'
    ].join('\n');

    const extracted = await helper.extractSection(duplicateContent, 'intro');
    expect(extracted).toContain('## Intro');
    expect(extracted).toContain('first');
    expect(extracted).not.toContain('## Introduction Extended');
  });

  it('rejects rename when multiple sections are selected', async () => {
    await expect(
      helper.extractSection(content, 'titled, other', '## Renamed')
    ).rejects.toThrow('Renaming multiple sections is not supported yet');
  });
});
