/**
 * Test runner for invalid Meld examples that should fail
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processMeld } from '@api/index.js';
import { findFiles, getTestCaseName, setupTestContext, INVALID_CASES_DIR, ERROR_EXTENSION } from '@tests/e2e/example-runner-setup.js';
import { promises as realFs } from 'fs';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { vi } from 'vitest';

describe('Invalid Meld Test Cases', async () => {
  const allInvalidFiles = await findFiles(INVALID_CASES_DIR, '.mld');
  const invalidTestCases = allInvalidFiles.filter(file => file.endsWith(ERROR_EXTENSION));
  const context = await setupTestContext(invalidTestCases);
  
  beforeAll(async () => {
    console.log(`Found ${invalidTestCases.length} invalid test cases`);
  });
  
  afterAll(async () => {
    if (context?.cleanup) { 
      await context.cleanup();
    }
  });

  // Create separate test for each invalid file
  for (const errorPath of invalidTestCases) {
    const testName = getTestCaseName(errorPath);
    
    it(`correctly fails on ${testName}`, async () => {
      expect(context).toBeDefined(); 
      expect(context.container).toBeDefined(); 

      let errorCaught = false;
      let errorMessage = '';
      
      // <<< Use context.fs here as well >>>
      const fileContent = await (context.fs as IFileSystem).readFile(errorPath);

      // Pass the pre-configured container from the context
      const options = {
        container: context.container.getContainer(),
        // No need to pass fs directly, it's in the container
      };
      
      try {
        await processMeld(fileContent, options);

        errorCaught = false; 
        errorMessage = 'Expected processMeld to throw an error, but it completed successfully.';
      } catch (error: any) {
        errorCaught = true;
        errorMessage = error.message || String(error); 
      }
      
      expect(errorCaught).toBe(true);
      expect(errorMessage).toBeTruthy(); 
      
      const expectedErrorPath = errorPath.replace(ERROR_EXTENSION, '.error-message');
      let exists = false;
      try {
        await realFs.access(expectedErrorPath);
        exists = true;
      } catch {
        exists = false;
      }
      
      if (exists) {
        const expectedError = await realFs.readFile(expectedErrorPath, 'utf-8');
        expect(errorMessage).toContain(expectedError.trim());
      } else {
        console.warn(`No specific error message file found at ${expectedErrorPath} for test ${testName}. Checking for non-empty error.`);
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    });
  }
});