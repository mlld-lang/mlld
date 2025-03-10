import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestContext } from './utils/TestContext.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * End-to-end test for the codefence duplication bug fix.
 * This test simulates a real user working with a Meld file containing code fences.
 */
describe('Code Fence Duplication Fix', () => {
  const testContext = new TestContext();
  const testFileName = 'codefence-test.mld';
  const testOutputPath = 'codefence-test.o.md';

  // Set up test file in virtual filesystem
  beforeAll(async () => {
    // Initialize test
    await testContext.initialize();
    
    // Create a test file with a code fence
    const testContent = `
@text name = "Claude"

\`\`\`javascript
const name = "{{name}}"
const greet = (name) => {
    return \`Hello, \${name}!\`
}
\`\`\`

Some text after the code.
`;

    await testContext.fs.writeFile(testFileName, testContent);
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  it.skip('should not duplicate code fence markers in CLI output', async () => {
    // Run the meld command to process the test file
    const result = await testContext.runMeld({
      input: testFileName,
      format: 'markdown',
    });

    // Verify no errors occurred
    expect(result.exitCode).toBe(0);
    
    // Check if the output file exists
    const outputExists = await testContext.fs.exists(testOutputPath);
    expect(outputExists).toBe(true);
    
    // Read the output file and verify content
    const outputContent = await testContext.fs.readFile(testOutputPath, 'utf-8');
    
    // The output should include the code fence content
    expect(outputContent).toContain('javascript');
    expect(outputContent).toContain('const name = "Claude"');
    expect(outputContent).toContain('Hello, ${name}!');
    expect(outputContent).toContain('Some text after the code.');
    
    // Count the number of code fence markers (```) in the output
    const fenceMarkerCount = (outputContent.match(/```/g) || []).length;
    expect(fenceMarkerCount).toBe(2); // Should only be 2 markers (open and close), not 4
    
    // Make sure the output doesn't contain doubled code fence markers
    expect(outputContent).not.toContain('```javascript\n```javascript');
  });

  it.skip('should not duplicate code fence markers in XML output format', async () => {
    // Create a test file with a code fence
    const xmlTestContent = `
@text name = "Claude"

\`\`\`javascript
const name = "{{name}}"
const greet = (name) => {
    return \`Hello, \${name}!\`
}
\`\`\`

Some text after the code.
`;

    const xmlTestFileName = 'codefence-test-xml.mld';
    const xmlOutputPath = 'codefence-test-xml.o.xml';
    
    await testContext.fs.writeFile(xmlTestFileName, xmlTestContent);

    // Run the meld command to process the test file
    const result = await testContext.runMeld({
      input: xmlTestFileName,
      format: 'xml',
    });

    // Verify no errors occurred
    // Don't check for specific stdout message as it might change
    expect(result.exitCode).toBe(0);
    
    // Check if the output file exists
    const outputExists = await testContext.fs.exists(xmlOutputPath);
    expect(outputExists).toBe(true);
    
    // Read the output file and verify content
    const outputContent = await testContext.fs.readFile(xmlOutputPath, 'utf-8');
    
    // The output should include the code fence content
    expect(outputContent).toContain('<Code');
    expect(outputContent).toContain('const name = "Claude"');
    
    // Verify that code fence markers are not duplicated
    expect(outputContent).not.toContain('```javascript```javascript');
    expect(outputContent).not.toContain('``````');
  });
}); 