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

    expect(result.trim()).toBe('Hello\n\n2');
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

    expect(result.trim()).toBe('5\n\nAda');
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

  it('parses string dynamic modules in strict mode by default', async () => {
    const script = `/import { @x } from "@foo"
/show @x`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@foo': 'var @x = 42\nexport { @x }'
      }
    });

    expect(result.trim()).toBe('42');
  });

  it('rejects bare text in string dynamic modules (strict mode default)', async () => {
    const script = `/import { @x } from "@foo"
/show @x`;

    await expect(
      processMlld(script, {
        dynamicModules: {
          '@foo': 'Some text\nvar @x = 42\nexport { @x }'
        }
      })
    ).rejects.toThrow();
  });

  it('allows text in string dynamic modules with explicit markdown mode', async () => {
    const script = `/import { @x } from "@foo"
/show @x`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@foo': 'Some text\n/var @x = 42\n/export { @x }'
      },
      dynamicModuleMode: 'markdown'
    });

    expect(result.trim()).toBe('42');
  });
});

describe('@payload optional field access', () => {
  it('ternary returns default when field missing from namespace import', async () => {
    const script = `/import "@payload" as @payload
/var @topic = @payload.topic ? @payload.topic : "default"
/show @topic`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@payload': {}
      }
    });

    expect(result.trim()).toBe('default');
  });

  it('ternary returns value when field exists in namespace import', async () => {
    const script = `/import "@payload" as @payload
/var @topic = @payload.topic ? @payload.topic : "default"
/show @topic`;

    const result = await processMlld(script, {
      dynamicModules: {
        '@payload': { topic: 'foo' }
      }
    });

    expect(result.trim()).toBe('foo');
  });

  it('handles multiple optional fields with defaults', async () => {
    const script = `/import "@payload" as @payload
/var @topic = @payload.topic ? @payload.topic : "default-topic"
/var @count = @payload.count ? @payload.count : 0
/show \`@topic:@count\``;

    const result = await processMlld(script, {
      dynamicModules: {
        '@payload': { topic: 'test' }
      }
    });

    expect(result.trim()).toBe('test:0');
  });

  it('destructuring import fails for missing required fields', async () => {
    const script = `/import { @topic } from @payload
/show @topic`;

    await expect(
      processMlld(script, {
        dynamicModules: {
          '@payload': {}
        }
      })
    ).rejects.toThrow(/Import 'topic' not found/);
  });

  it('destructuring import succeeds for present fields', async () => {
    const script = `/import { @topic, @count } from @payload
/show \`@topic:@count\``;

    const result = await processMlld(script, {
      dynamicModules: {
        '@payload': { topic: 'hello', count: 42 }
      }
    });

    expect(result.trim()).toBe('hello:42');
  });
});
