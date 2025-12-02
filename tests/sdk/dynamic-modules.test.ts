import { describe, it, expect } from 'vitest';
import { processMlld } from '@sdk/index';

describe('dynamic module imports', () => {
  it('imports selected values from object-backed modules', async () => {
    const script = `/import { @greeting, @count } from "@test/data"
/show @greeting
/show @count`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@test/data': { greeting: 'Hello', count: 2 }
      }
    });

    expect(result.trim()).toBe('Hello\n2');
  });

  it('supports namespace imports with nested dynamic data', async () => {
    const script = `/import "@state" as @state
/show @state.count
/show @state.profile.name`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@state': { count: 5, profile: { name: 'Ada' } }
      }
    });

    expect(result.trim()).toBe('5\nAda');
  });

  it('parses string-backed dynamic modules without filesystem paths', async () => {
    const script = `/import { @name } from "@inline"
/show @name`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@inline': '/var @name = "Inline"\n/export { @name }'
      }
    });

    expect(result.trim()).toBe('Inline');
  });
});
