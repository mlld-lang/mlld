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
    await context?.cleanup();
  });

  it('should fix the path prefixing issue with data variable embeds', async () => {
    console.log('STARTING TEST: variable-based embed transformation fix');
    // Create a test file with variable embeds
    const testContent = '@data role = {\n' +
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
      '@embed {{task.code_review}}';
      
    await context.services.filesystem.writeFile('variable-output.meld', testContent);
    console.log('Created test file');
    
    // Manually set the variables to ensure they're available
    context.services.state.setDataVar('role', {
      "architect": "You are a senior architect skilled in TypeScript.",
      "ux": "You are a UX designer with experience in user testing."
    });
    
    context.services.state.setDataVar('task', {
      "code_review": "Review the code quality and suggest improvements.",
      "ux_review": "Review the user experience and suggest improvements."
    });
    
    console.log('Directly set variables in state');
    console.log('role:', context.services.state.getDataVar('role'));
    console.log('task:', context.services.state.getDataVar('task'));
    
    // Bypass the main function for debugging and directly use our own implementation
    console.log('Running with transformation mode enabled');
    const result = await main('variable-output.meld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'md'
    });
    
    console.log('RESULT LENGTH:', result.length);
    console.log('RESULT:', result);
    
    // For now, just log and assert the test variables were set
    expect(context.services.state.getDataVar('role').architect)
      .toBe('You are a senior architect skilled in TypeScript.');
    
    expect(context.services.state.getDataVar('task').code_review)
      .toBe('Review the code quality and suggest improvements.');
      
    // TODO: Uncomment these once the fix is working
    // Verify the result contains the resolved values
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