import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';

describe('Embed Directive Transformation E2E', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should replace embed directive with file content in transformation mode', async () => {
    // Create file with embedded content
    await context.services.filesystem.writeFile('content.md', '# Section One\nContent one\n# Section Two\nContent two');
    await context.services.filesystem.writeFile('test.meld', '@embed [content.md]');

    // Test embed replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: embed directive should be replaced with content
    expect(result.trim()).toBe('# Section One\nContent one\n# Section Two\nContent two');
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('[directive output placeholder]');
  });

  it('should replace embed directive with section content in transformation mode', async () => {
    // Create file with embedded content
    await context.services.filesystem.writeFile('content.md', '# Section One\nContent one\n# Section Two\nContent two');
    await context.services.filesystem.writeFile('test.meld', '@embed [content.md # Section Two]');

    // Test embed replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: embed directive should be replaced with the section content only
    expect(result.trim()).toBe('# Section Two\nContent two');
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('[directive output placeholder]');
  });

  it('should replace variable embed with content in transformation mode', async () => {
    // Create file with variable and embed
    await context.services.filesystem.writeFile('test.meld', '@data role = { "architect": "Senior architect" }\n@embed {{role.architect}}');

    // Test embed replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: embed directive should be replaced with variable content
    expect(result.trim()).toBe('Senior architect');
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('[directive output placeholder]');
  });
}); 