import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';

describe('Path Variable Embed Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should properly resolve custom path variables in embed directives', async () => {
    // Create a directory structure and files for testing
    await context.services.filesystem.mkdir('docs/directives', { recursive: true });
    await context.services.filesystem.writeFile('docs/directives/README.md', 
      '# Directives documentation\n\nThis is the documentation for directives.');
    
    // Create a test file that uses path variables in embed directive
    await context.services.filesystem.writeFile('test.mld',
      '@path d = "$./docs/directives"\n\n' +
      '## Embed with path variable\n\n' +
      '@embed [$d/README.md]'
    );

    // Test with transformation
    const result = await main('test.mld', {
      fs: context.services.filesystem,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'markdown'
    });

    // Verify the content was properly embedded
    expect(result).toContain('# Directives documentation');
    expect(result).toContain('This is the documentation for directives.');
    
    // Make sure the @embed directive was replaced
    expect(result).not.toContain('@embed');
    expect(result).not.toContain('$d');
  });
}); 