import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { Services } from '@core/types/index.js';
import * as fs from 'fs';

// Utility function to write debug info
function debugWrite(message: string) {
  try {
    fs.appendFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', message + '\n');
  } catch (error) {
    console.error('Failed to write debug info:', error);
  }
}

describe('Debug Variable-based Embed Transformation', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    
    // Clear debug file
    fs.writeFileSync('/Users/adam/dev/claude-meld/debug-embed.txt', '');
    
    debugWrite('========= TEST RUN STARTED =========');
  });

  afterEach(async () => {
    debugWrite('========= TEST RUN ENDED =========');
    await context?.cleanup();
  });

  it('should debug the issue with variable embed transformation', async () => {
    debugWrite('Creating test file with variable embed');
    
    // Create a simple test file with a variable embed
    const testContent = '@data role = { "architect": "Senior architect" }\n@embed {{role.architect}}';
    await context.services.filesystem.writeFile('debug-test.meld', testContent);
    
    debugWrite('Test file created. Content: ' + testContent);
    
    // Print info about the state service (debug only)
    debugWrite('State service info:');
    debugWrite('State service type: ' + typeof context.services.state);
    
    // Write variable into state directly
    context.services.state.setDataVar('role', { architect: 'Senior architect' });
    
    debugWrite('Added role variable directly to state');
    debugWrite('Role: ' + JSON.stringify(context.services.state.getDataVar('role')));
    
    // Process with transformation mode enabled
    debugWrite('Running main() with transformation mode enabled');
    
    let result;
    try {
      result = await main('debug-test.meld', {
        fs: context.services.filesystem,
        services: context.services as unknown as Partial<Services>,
        transformation: true,
        format: 'md'
      });
      
      debugWrite('main() completed successfully');
      debugWrite('Result: "' + result + '"');
    } catch (error) {
      debugWrite('Error running main(): ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
    
    // Log expectations for debugging
    debugWrite('Expected: "Senior architect"');
    debugWrite('Actual: "' + result + '"');
    
    // For debugging, don't throw expect errors yet
    if (result.trim() === 'Senior architect') {
      debugWrite('✅ PASS: result matches expected value');
    } else {
      debugWrite('❌ FAIL: result does not match expected value');
    }
    
    if (result.includes('@embed')) {
      debugWrite('❌ FAIL: result still contains @embed directive');
    } else {
      debugWrite('✅ PASS: result does not contain @embed directive');
    }
    
    // For a successful test run, use expect assertions
    expect(result.trim()).toBe('Senior architect');
    expect(result).not.toContain('@embed');
  });
});