import { describe, it, expect } from 'vitest';
import { markExecutableDefinition } from '@core/types/executable';
import { attachToolCollectionMetadata } from '@core/types/tools';
import { formatForDisplay } from '@interpreter/utils/display-formatter';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@interpreter/env/EnvironmentIdentity';
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

  it('serializes interpolated wrapped strings instead of returning empty text', () => {
    const value = {
      message: {
        wrapperType: 'doubleColon',
        content: [
          { type: 'Text', content: 'Hello ' },
          { type: 'VariableReference', identifier: 'name' },
          { type: 'Text', content: '!' }
        ]
      }
    };

    const rendered = JSONFormatter.stringify(value, { pretty: false });
    expect(rendered).toBe(JSON.stringify({ message: 'Hello @name!' }));
  });

  it('treats tagged environment values as opaque during JSON formatting', () => {
    const envLike: Record<string, unknown> = {};
    markEnvironment(envLike);
    Object.defineProperty(envLike, 'danger', {
      enumerable: true,
      get() {
        throw new Error('environment getter should not be walked');
      }
    });

    const rendered = JSONFormatter.stringify({ env: envLike }, { pretty: false });
    expect(rendered).toBe(JSON.stringify({ env: ENVIRONMENT_SERIALIZE_PLACEHOLDER }));
  });

  it('summarizes executable definitions while preserving tool collection surface fields', () => {
    const tool = markExecutableDefinition({
      type: 'code',
      sourceDirective: 'exec',
      language: 'js',
      paramNames: ['payload'],
      codeTemplate: [{ type: 'Text', content: 'noop' }],
      description: 'Search contacts.'
    });
    const tools = attachToolCollectionMetadata({
      build: { mlld: tool, description: 'Build tool.' }
    }, {});

    const rendered = JSONFormatter.stringify({ tool, tools }, { pretty: false });
    expect(rendered).toBe(
      JSON.stringify({
        tool: '<function(payload)>',
        tools: {
          build: {
            mlld: '<function(payload)>',
            description: 'Build tool.'
          }
        }
      })
    );
  });
});
