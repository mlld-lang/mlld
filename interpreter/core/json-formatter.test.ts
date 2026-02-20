import { describe, it, expect } from 'vitest';
import { formatForDisplay } from '@interpreter/utils/display-formatter';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { JSONFormatter } from '@interpreter/core/json-formatter';

describe('formatForDisplay', () => {
  it('pretty prints structured array data', () => {
    const data = [
      { name: 'Ada' },
      { name: 'Bob' }
    ];
    const structured = wrapStructured(data, 'array', JSON.stringify(data));

    const rendered = formatForDisplay(structured);
    expect(rendered).toBe(JSONFormatter.stringify(data, { pretty: true, indent: 2 }));
  });

  it('returns structured text for load-content metadata', () => {
    const structured = wrapStructured(
      { body: 'raw' },
      'object',
      '{\n  "body": "raw"\n}',
      { source: 'load-content' }
    );

    expect(formatForDisplay(structured)).toBe(structured.text);
  });

  it('joins string arrays with blank lines in foreach section mode', () => {
    const rendered = formatForDisplay(['first', 'second'], { isForeachSection: true });
    expect(rendered).toBe('first\n\nsecond');
  });

  it('serializes bare structured objects without wrapper fields', () => {
    const data = { mode: 'contending', confidence: 0.98 };
    const structured = wrapStructured(
      data,
      'object',
      JSON.stringify(data),
      { source: 'cmd', retries: 2 }
    );

    const rendered = JSONFormatter.stringify(structured, { pretty: false });
    expect(rendered).toBe(JSON.stringify(data));
  });

  it('serializes nested structured objects without wrapper fields', () => {
    const stance = { mode: 'contending', confidence: 0.98 };
    const structured = wrapStructured(
      stance,
      'object',
      JSON.stringify(stance),
      { source: 'cmd', retries: 2 }
    );

    const payload = { stance: structured };

    const rendered = formatForDisplay(payload, { pretty: false });
    expect(rendered).toBe(JSON.stringify({ stance }));
  });
});
