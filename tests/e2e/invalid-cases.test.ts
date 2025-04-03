/**
 * Test runner for invalid Meld examples that should fail
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { main } from '@api/index.js';
import { findFiles, getTestCaseName, setupTestContext, INVALID_CASES_DIR, ERROR_EXTENSION } from '@tests/e2e/example-runner-setup.js';
import { promises as realFs } from 'fs';
import type { Services } from '@core/types.js';

describe('Invalid Meld Test Cases', async () => {
  const allInvalidFiles = await findFiles(INVALID_CASES_DIR, '.mld');
  const invalidTestCases = allInvalidFiles.filter(file => file.endsWith(ERROR_EXTENSION));
  const context = await setupTestContext(invalidTestCases);
  
  beforeAll(async () => {
    console.log(`Found ${invalidTestCases.length} invalid test cases`);
  });
  
  afterAll(async () => {
    await context?.cleanup();
  });

  // Create separate test for each invalid file
  for (const errorPath of invalidTestCases) {
    const testName = getTestCaseName(errorPath);
    
    it(`correctly fails on ${testName}`, async () => {
      // Expected to fail
      let errorCaught = false;
      let errorMessage = '';
      
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
      
      try {
        await main(errorPath, {
          fs: context.services.filesystem as any,
          services: services as unknown as Partial<Services>,
          transformation: true
        });
      } catch (error: any) {
        // Error expected
        errorCaught = true;
        errorMessage = error.message || '';
      }
      
      expect(errorCaught).toBe(true);
      
      // Check for expected error message
      const expectedErrorPath = errorPath.replace(ERROR_EXTENSION, '.error-message');
      const exists = await realFs.access(expectedErrorPath).then(() => true).catch(() => false);
      
      if (exists) {
        // If expected error message file exists, check error message contains expected content
        const expectedError = await realFs.readFile(expectedErrorPath, 'utf-8');
        expect(errorMessage).toContain(expectedError.trim());
      } else {
        // Add a basic sanity check for the error
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    });
  }
});