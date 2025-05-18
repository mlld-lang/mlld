import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';

describe('Add Directive Variable Path Prefix Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should fix the path prefixing issue with data variable embeds', async () => {
    // Create a test file with variable embeds for field access in data objects
    const testContent = '@data role = {\n' +
      '  "architect": "You are a senior architect skilled in TypeScript.",\n' +
      '  "ux": "You are a UX designer with experience in user testing."\n' +
      '}\n\n' +
      '@data task = {\n' +
      '  "code_review": "Review the code quality and suggest improvements.",\n' +
      '  "ux_review": "Review the user experience and suggest improvements."\n' +
      '}\n\n' +
      '## Role\n' +
      '@add {{role.architect}}\n\n' +
      '## Task\n' +
      '@add {{task.code_review}}';
      
    // Write test file using proper filesystem service
    const testFilePath = 'variable-output.meld';
    await context.services.filesystem.writeFile(testFilePath, testContent);
    
    // Process the file with the standard API in transformation mode
    // This uses a proper API call pattern instead of manually setting variables
    const result = await main(testFilePath, {
      fs: context.services.filesystem,
      transformation: true, // Enable transformation mode for directive processing
      format: 'md' // Output as markdown
    });
    
    // Assert the transformed output contains the correct resolved values
    expect(result).toContain('You are a senior architect skilled in TypeScript.');
    expect(result).toContain('Review the code quality and suggest improvements.');
    
    // Verify no path-related artifacts appear in the output
    // This validates the fix for the path prefixing issue
    expect(result).not.toContain('examples/');
    expect(result).not.toContain('/');
    
    // Verify the @add directive is properly replaced in the output
    expect(result).not.toContain('@add');
    expect(result).not.toContain('{{role.architect}}');
    expect(result).not.toContain('{{task.code_review}}');
  });
});