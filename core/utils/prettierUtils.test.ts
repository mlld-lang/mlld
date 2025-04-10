import { formatWithPrettier } from './prettierUtils.js';
import { describe, it, expect } from 'vitest';

describe('Prettier Utils', () => {
  it('should format markdown content', async () => {
    const unformatted = `# Heading\n  - Item 1\n  - Item 2\n\n\n\nText with      extra      spaces`;
    const formatted = await formatWithPrettier(unformatted, 'markdown');
    
    expect(formatted).toContain('# Heading');
    expect(formatted).toContain('- Item 1');
    expect(formatted).toContain('- Item 2');
    expect(formatted).not.toContain('\n\n\n');
    expect(formatted).not.toContain('Text with      extra      spaces');
  });
  
  it('should format JSON content', async () => {
    const unformatted = `{"key":"value","nested":{"prop1":"val1","prop2":"val2"}}`;
    const formatted = await formatWithPrettier(unformatted, 'json');
    
    expect(formatted).toContain('"key": "value"');
    expect(formatted).toContain('"nested": {');
    expect(formatted).toContain('"prop1": "val1"');
  });
  
  it('should handle invalid content gracefully', async () => {
    // Invalid markdown shouldn't cause problems
    const invalidMarkdown = `# Heading\n{% invalid %}`;
    const formattedMarkdown = await formatWithPrettier(invalidMarkdown, 'markdown');
    
    // Should return something reasonable, or the original content
    expect(formattedMarkdown).toBeTruthy();
    expect(formattedMarkdown).toContain('# Heading');
  });
});