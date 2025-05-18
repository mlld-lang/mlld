import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';

describe('Path Variable Add Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should properly resolve custom path variables in add directives', async () => {
    // Create a directory structure and files for testing
    await context.services.filesystem.mkdir('docs/directives', { recursive: true });
    await context.services.filesystem.writeFile('docs/directives/README.md', 
      '# Directives documentation\n\nThis is the documentation for directives.');
    
    // Create a test file that uses path variables in add directive
    await context.services.filesystem.writeFile('test.mld',
      '@path d = "$./docs/directives"\n\n' +
      '## Add with path variable\n\n' +
      '@add [$d/README.md]'
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
    
    // Make sure the @add directive was replaced
    expect(result).not.toContain('@add');
    expect(result).not.toContain('$d');
  });
}); 