/**
 * Test runner for valid Meld examples
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { main } from '@api/index.js';
import { findFiles, getTestCaseName, setupTestContext, VALID_CASES_DIR, EXPECTED_EXTENSION } from '@tests/e2e/example-runner-setup.js';
import { promises as realFs } from 'fs';
import type { Services } from '@core/types.js';

describe('Valid Meld Test Cases', async () => {
  const validTestCases = await findFiles(VALID_CASES_DIR, '.mld');
  const context = await setupTestContext(validTestCases);
  
  beforeAll(async () => {
    console.log(`Found ${validTestCases.length} valid test cases`);
  });
  
  afterAll(async () => {
    await context?.cleanup();
  });

  // Create separate test for each valid file
  for (const testPath of validTestCases) {
    const testName = getTestCaseName(testPath);
    
    it(`processes ${testName} correctly`, async () => {
      // Create a complete mock CommandExecutionService
      const mockCommandExecutionService = {
        executeShellCommand: vi.fn().mockImplementation(async (command) => {
          return { stdout: `Mocked output for: ${command}`, stderr: '', exitCode: 0 };
        }),
        executeLanguageCode: vi.fn().mockImplementation(async (code, language) => {
          return { stdout: `Mocked ${language} output`, stderr: '', exitCode: 0 };
        })
      };
      
      // Re-register the mock to ensure it's available
      context.registerMock('ICommandExecutionService', mockCommandExecutionService);
      
      // Process through API with properly structured services
      const services = {
        ...context.services,
        // Need to provide commandExecution property directly for main function
        commandExecution: mockCommandExecutionService 
      };
      
      const result = await main(testPath, {
        fs: context.services.filesystem as any,
        services: services as unknown as Partial<Services>,
        transformation: true,
        format: 'markdown'
      });
      
      // Verify basic expectations
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // Check for expected output file
      const expectedPath = testPath.replace('.mld', EXPECTED_EXTENSION);
      const exists = await realFs.access(expectedPath).then(() => true).catch(() => false);
      
      if (exists) {
        // If expected file exists, compare output
        const expected = await realFs.readFile(expectedPath, 'utf-8');
        expect(result.trim()).toEqual(expected.trim());
      } else {
        // Add a basic sanity check for output
        expect(result.length).toBeGreaterThan(0);
      }
    });
  }
});