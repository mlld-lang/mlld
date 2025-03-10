import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContextDI } from './utils/di/TestContextDI.js';
import { OutputService } from '../services/pipeline/OutputService/OutputService.js';
import { StateService } from '../services/state/StateService/StateService.js';

describe('XML Output Format', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    // Set up test context
    context = TestContextDI.create();
    await context.initialize();
    
    // Enable test mode for PathService
    context.services.path.enableTestMode();
  });

  afterEach(async () => {
    // Clean up
    await context.cleanup();
  });

  it('should convert markdown to XML format directly', async () => {
    // Create a simple markdown string
    const markdown = "# Hello World\n\nThis is a test.";
    
    // Get services from dependency injection container
    const outputService = context.services.output;
    const stateService = context.services.state;
    
    // Call the convertToXML method directly using type assertion to access private method
    const xmlOutput = await (outputService as any).convertToXML([], stateService, {
      formatOptions: {
        markdown
      }
    });
    
    // Debug log
    console.log('Direct XML Output:', xmlOutput);
    
    // Verify XML output contains proper XML tags
    expect(xmlOutput).toContain('<');  // Should have at least one XML tag
    expect(xmlOutput).toContain('>');  // Should have at least one closing tag
    expect(xmlOutput).toContain('HelloWorld');  // Should contain the content (without space)
    expect(xmlOutput).toContain('This is a test');  // Should contain the content
  });

  it('should properly handle JSON content in markdown when converting to XML', async () => {
    // Create markdown with JSON content
    const markdown = `# Test with JSON

Here's some JSON data:

\`\`\`json
{
  "name": "Test User",
  "age": 30,
  "items": ["apple", "orange", "banana"]
}
\`\`\`

More text after the JSON.`;
    
    // Get services from dependency injection container
    const outputService = context.services.output;
    const stateService = context.services.state;
    
    // Call the convertToXML method directly
    const xmlOutput = await (outputService as any).convertToXML([], stateService, {
      formatOptions: {
        markdown
      }
    });
    
    // Debug log
    console.log('XML Output with JSON:', xmlOutput);
    
    // Verify XML output handles the JSON content properly
    expect(xmlOutput).toContain('<');  // Should have XML tags
    expect(xmlOutput).toContain('>');  // Should have closing tags
    
    // Check that the XML contains content from the JSON
    expect(xmlOutput).toContain('TestWithJson');  // llmxml removes spaces and uses PascalCase
    expect(xmlOutput).toContain('name');
    expect(xmlOutput).toContain('Test User');
    expect(xmlOutput).toContain('apple');
    
    // The output should maintain the structure defined by llmxml
    // We're not testing for a specific XML structure, just that it processes without errors
    // and maintains the content from the input
  });
}); 