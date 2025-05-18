import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';

describe('Add Directive Transformation E2E', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should replace add directive with file content in transformation mode', async () => {
    // Create file with embedded content
    await context.services.filesystem.writeFile('content.md', '# Section One\nContent one\n# Section Two\nContent two');
    await context.services.filesystem.writeFile('test.meld', '@add [content.md]');

    // Test add replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: add directive should be replaced with content
    expect(result.trim()).toBe('# Section One\nContent one\n# Section Two\nContent two');
    expect(result).not.toContain('@add');
    expect(result).not.toContain('[directive output placeholder]');
  });

  it('should replace add directive with section content in transformation mode', async () => {
    // Create file with embedded content
    await context.services.filesystem.writeFile('content.md', '# Section One\nContent one\n# Section Two\nContent two');
    await context.services.filesystem.writeFile('test.meld', '@add [content.md # Section Two]');

    // Test add replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: add directive should be replaced with the section content only
    // In output-literal mode, exact formatting is preserved, including blank lines
    expect(result.trim()).toBe('# Section Two\n\nContent two');
    expect(result).not.toContain('@add');
    expect(result).not.toContain('[directive output placeholder]');
  });

  it('should replace variable add with content in transformation mode', async () => {
    // Create file with variable and add
    const testContent = '@data role = { "architect": "Senior architect" }\n@add {{role.architect}}';
    await context.services.filesystem.writeFile('test.meld', testContent);
    
    // Test add replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });
    
    // Expected behavior: add directive should be replaced with variable content
    expect(result.trim()).toBe('Senior architect');
    expect(result).not.toContain('@add');
    expect(result).not.toContain('[directive output placeholder]');
  });
}); 