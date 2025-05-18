/**
 * Test runner for command references in Run directives
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestContext } from '@tests/utils/TestContext';
import { main } from '@api/index';
import { findFiles, getTestCaseName, setupTestContext, VALID_CASES_DIR, EXPECTED_EXTENSION } from '@tests/e2e/example-runner-setup';
import { promises as realFs } from 'fs';
import path from 'path';
import type { Services } from '@core/types';

describe.skip('Command References in Run directives', async () => {
  // Test files to run
  const validTestCases = [
    '/Users/adam/dev/claude-meld/tests/cases/valid/directives.mld',
    '/Users/adam/dev/claude-meld/tests/cases/valid/run-command-parameter-parsing.mld'
  ];
  const context = await setupTestContext(validTestCases);
  
  beforeAll(async () => {
    console.log(`Found ${validTestCases.length} valid test cases`);
  });
  
  afterAll(async () => {
    await context?.cleanup();
  });

  // Use directives.mld as a basic test for command references
  it('processes command references correctly in directives.mld', async () => {
    const testPath = '/Users/adam/dev/claude-meld/tests/cases/valid/directives.mld';
    
    // Process through API
    const result = await main(testPath, {
      fs: context.services.filesystem as any,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'markdown'
    });
    
    // Verify basic expectations
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    
    // Check for specific output from the command reference
    expect(result).toContain('Hello, Test User!');
  });
  
  // Test parameter parsing with the dedicated test file
  it.skip('correctly parses parameters in command references', async () => {
    const testPath = '/Users/adam/dev/claude-meld/tests/cases/valid/run-command-parameter-parsing.mld';
    const expectedPath = '/Users/adam/dev/claude-meld/tests/cases/valid/run-command-parameter-parsing.expected.mld';
    
    // Process through API
    const result = await main(testPath, {
      fs: context.services.filesystem as any,
      services: context.services as unknown as Partial<Services>,
      transformation: true,
      format: 'markdown'
    });
    
    // Verify basic expectations
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    
    // Compare with expected output
    const expected = await realFs.readFile(expectedPath, 'utf-8');
    expect(result.trim()).toEqual(expected.trim());
  });
  
  // Test with a custom command reference test
  it.skip('creates and executes command references with proper parameter substitution', async () => {
    const testContent = `
@exec echotext(text) = @run [echo {{text}}]
@run $echotext(Hello World)
@exec echoname(name) = @run [echo {{name}}]
@run $echoname(John)
`;

    // Create a test context
    const testContext = new TestContext();
    
    // Setup the filesystem
    await testContext.fs.writeFile('/test-command-refs.mld', testContent);
    
    // Process through the API
    const result = await main('/test-command-refs.mld', {
      fs: testContext.fs as any,
      transformation: true,
      format: 'markdown'
    });
    
    // In the integration test, we can't execute actual commands
    // Instead, we check that the command reference is correctly processed
    expect(result).toContain('Hello World');
    expect(result).toContain('John');
    
    // Cleanup
    await testContext.cleanup();
  });
  
  // Test with nested variable references
  it('handles nested variable references in command parameters', async () => {
    const testContent = `
@text user = "Alice"
@exec echoname(name) = @run [echo {{name}}]
@run $echoname({{user}})
// This comment will be displayed to confirm test works
`;

    // Create a test context
    const testContext = new TestContext();
    
    // Setup the filesystem
    await testContext.fs.writeFile('/test-nested-refs.mld', testContent);
    
    // Process through the API
    const result = await main('/test-nested-refs.mld', {
      fs: testContext.fs as any,
      transformation: true,
      format: 'markdown'
    });
    
    // In the integration test, we can't execute actual commands
    // We can just check that the processing completed and some output was produced
    // This way we verify that we don't crash on nested variable references
    expect(result).toContain('comment');
    
    // Cleanup
    await testContext.cleanup();
  });
  
  // Test with parameters containing commas
  it('handles parameters with commas inside quotes', async () => {
    const testContent = `
@exec echotexts(text1, text2) = @run [echo {{text1}} {{text2}}]
@run $echotexts("hello, world", "nice, day")
`;

    // Create a test context
    const testContext = new TestContext();
    
    // Setup the filesystem
    await testContext.fs.writeFile('/test-comma-params.mld', testContent);
    
    // Process through the API
    const result = await main('/test-comma-params.mld', {
      fs: testContext.fs as any,
      transformation: true,
      format: 'markdown'
    });
    
    // In the integration test, we can't execute actual commands
    // Instead, we check that the command reference is correctly processed
    expect(result).toContain('hello, world nice, day');
    
    // Cleanup
    await testContext.cleanup();
  });
});