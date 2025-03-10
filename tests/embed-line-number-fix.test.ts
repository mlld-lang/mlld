import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';

describe('Embed Directive Line Number Mismatch Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should replace embed directive with content even if line numbers shift', async () => {
    // Create file with content that will cause line number shifts
    // The embedded file has many lines
    await context.services.filesystem.writeFile('content.md', 
      '# Section One\nContent one\n\n' + 
      '# Section Two\nContent two\n\n' +
      '# Section Three\nContent three\n\n' +
      '# Section Four\nContent four\n\n' +
      '# Section Five\nContent five\n\n'
    );
    
    // Create a test file with multiple directives to cause shifts
    await context.services.filesystem.writeFile('test.meld', 
      '@text title = "Test File"\n\n' +
      '# {{title}}\n\n' +
      '@text long_chunk = "This is a chunk that takes up multiple lines\n' +
      'and will cause line numbers to shift\n' +
      'when it\'s transformed."\n\n' +
      '{{long_chunk}}\n\n' +
      '@embed [content.md # Section Three]\n\n' +  // This is the embed we'll test
      'Some other content'
    );

    // Test embed replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // Expected behavior: even though line numbers may shift during transformation,
    // the embed directive should still be replaced with the section content
    expect(result).toContain('# Section Three');
    expect(result).toContain('Content three');
    expect(result).not.toContain('@embed [content.md # Section Three]');
    expect(result).not.toContain('[directive output placeholder]');
  });

  it('should handle multiple embed directives with potentially shifted line numbers', async () => {
    // Create files with content
    await context.services.filesystem.writeFile('content1.md', '# File One\nContent from file one');
    await context.services.filesystem.writeFile('content2.md', '# File Two\nContent from file two');
    await context.services.filesystem.writeFile('content3.md', '# File Three\nContent from file three');
    
    // Create a test file with multiple embed directives
    await context.services.filesystem.writeFile('test.meld', 
      '@text title = "Test File"\n\n' +
      '# {{title}}\n\n' +
      '@text long_chunk = "This is a chunk that takes up multiple lines\n' +
      'and will cause line numbers to shift\n' +
      'when it\'s transformed."\n\n' +
      '{{long_chunk}}\n\n' +
      '@embed [content1.md]\n\n' +  // First embed
      'Some content in between the embeds\n\n' +
      '@embed [content2.md]\n\n' +  // Second embed
      'More content here\n\n' +
      '@embed [content3.md]'        // Third embed
    );

    // Test embed replacement with transformation enabled
    const result = await main('test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });

    // All embed directives should be properly replaced
    expect(result).toContain('# File One');
    expect(result).toContain('Content from file one');
    expect(result).toContain('# File Two');
    expect(result).toContain('Content from file two'); 
    expect(result).toContain('# File Three');
    expect(result).toContain('Content from file three');
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('[directive output placeholder]');
  });
});