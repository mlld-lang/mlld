import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';

describe('Embed Directive Variable Path Prefix Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should fix the path prefixing issue with data variable embeds', async () => {
    // Create a test file that resembles examples/output.meld
    await context.services.filesystem.writeFile('variable-output.meld',
      '@data role = {\n' +
      '  "architect": "You are a senior architect skilled in TypeScript.",\n' +
      '  "ux": "You are a UX designer with experience in user testing."\n' +
      '}\n\n' +
      '@data task = {\n' +
      '  "code_review": "Review the code quality and suggest improvements.",\n' +
      '  "ux_review": "Review the user experience and suggest improvements."\n' +
      '}\n\n' +
      '## Role\n' +
      '@embed {{role.architect}}\n\n' +
      '## Task\n' +
      '@embed {{task.code_review}}'
    );

    // Test with transformation
    const result = await main('variable-output.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'markdown'
    });

    // Verify no prefixing issues
    expect(result).toContain('You are a senior architect skilled in TypeScript.');
    expect(result).toContain('Review the code quality and suggest improvements.');
    
    // Make sure no "examples/" or other folder prefixes appear
    expect(result).not.toContain('examples/');
    expect(result).not.toContain('/');
    
    // Also verify the @embed directive is properly replaced
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('{{role.architect}}');
    expect(result).not.toContain('{{task.code_review}}');
  });
});