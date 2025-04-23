import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { main } from '@api/index';
import type { Services } from '@core/types/index';

describe('Comment Handling Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should properly handle files with comment lines starting with >>', async () => {
    // Create a file with comment lines (starting with >>)
    await context.services.filesystem.writeFile('comment-test.meld', 
      '>> This is a comment and should be ignored\n' +
      '>> Another comment line that should be ignored\n\n' +
      '@text title = "Test File With Comments"\n\n' +
      '# {{title}}\n\n' +
      'This is regular content that should appear in the output.'
    );

    // Process the file
    const result = await main('comment-test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      format: 'markdown'
    });

    // Verify comments are excluded from output
    // Match the actual output format (variables are expanded with newlines)
    expect(result).toContain('# ');
    expect(result).toContain('Test File With Comments');
    expect(result).toContain('This is regular content that should appear in the output.');
    // Comments should not appear in the output
    expect(result).not.toContain('This is a comment and should be ignored');
    expect(result).not.toContain('Another comment line that should be ignored');
  });

  it('should handle files with a mix of comments and directives', async () => {
    // Create a file with comments and directives
    await context.services.filesystem.writeFile('comment-directive-test.meld', 
      '>> This file has comments and directives\n' +
      '@data user = { "name": "Test User", "role": "Developer" }\n' +
      '>> Another comment\n\n' +
      '# Hello {{user.name}}\n\n' +
      'Your role is: {{user.role}}'
    );

    // Process the file
    const result = await main('comment-directive-test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      format: 'markdown'
    });

    // Verify comments are excluded but directives are processed
    // Match the actual output format (variables are expanded with newlines)
    expect(result).toContain('# Hello ');
    expect(result).toContain('Test User');
    expect(result).toContain('Your role is:');
    expect(result).toContain('Developer');
    // Comments should not appear in the output
    expect(result).not.toContain('This file has comments and directives');
    expect(result).not.toContain('Another comment');
  });

  it('should handle comments in transformation mode', async () => {
    // Create a file with comments and content
    await context.services.filesystem.writeFile('transform-comment-test.meld', 
      '>> These comments should be ignored in transformation mode\n' +
      '>> More comments to ignore\n\n' +
      '@text transformed = "This content should be visible"\n\n' +
      '{{transformed}}'
    );

    // Process the file with transformation enabled
    const result = await main('transform-comment-test.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      format: 'markdown',
      transformation: true
    });

    // Verify transformation worked and comments are ignored
    expect(result).toContain('This content should be visible');
    expect(result).not.toContain('These comments should be ignored');
    expect(result).not.toContain('More comments to ignore');
  });
});