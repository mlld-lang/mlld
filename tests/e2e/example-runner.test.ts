/**
 * End-to-End Test Runner for Meld Examples
 * 
 * This test suite runs the .mld files in the tests/cases directory to ensure they:
 * 1. Build without errors (valid cases)
 * 2. Fail as expected (invalid cases with .error.mld extension)
 * 3. Output expected content (specified in .expected files)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { main } from '@api/index';
import path from 'path';
import { promises as realFs } from 'fs';
import type { Services } from '@core/types';

// Configuration
const TEST_CASES_DIR = 'tests/cases';
const VALID_CASES_DIR = `${TEST_CASES_DIR}/valid`;
const INVALID_CASES_DIR = `${TEST_CASES_DIR}/invalid`;
const ERROR_EXTENSION = '.error.mld'; // Files expected to fail
const EXPECTED_EXTENSION = '.expected.md'; // Expected output files

// Helper function to recursively find files with a specific extension
async function findFiles(dir: string, extension: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await realFs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const nestedFiles = await findFiles(fullPath, extension);
        files.push(...nestedFiles);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return files;
}

// Get a list of test case names for reporting
function getTestCaseName(filePath: string): string {
  const relativePath = path.relative(TEST_CASES_DIR, filePath);
  return relativePath.replace(/\\/g, '/'); // Normalize path separators
}

describe.skip('E2E Meld Test Cases', () => {
  let context: TestContextDI;
  const testCases: Record<string, string[]> = {
    valid: [],
    invalid: []
  };
  
  // Setup and discover files before running tests
  beforeAll(async () => {
    try {
      // Find valid cases (recursively)
      testCases.valid = await findFiles(VALID_CASES_DIR, '.mld');
      
      // Find invalid cases (recursively)
      const allInvalidFiles = await findFiles(INVALID_CASES_DIR, '.mld');
      testCases.invalid = allInvalidFiles.filter(file => file.endsWith(ERROR_EXTENSION));
      
      // Log found files for debugging
      console.log(`Found ${testCases.valid.length} valid test cases and ${testCases.invalid.length} error test cases`);
    } catch (error) {
      console.error('Error finding test case files:', error);
      throw error;
    }
  });
  
  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
    
    // Enable transformation for test examples
    context.enableTransformation({
      variables: true,
      directives: true,
      commands: true,
      imports: true
    });
    
    // Add test files to the testing file system
    const allFiles = [...testCases.valid, ...testCases.invalid];
    
    for (const filePath of allFiles) {
      const content = await realFs.readFile(filePath, 'utf-8');
      await context.services.filesystem.writeFile(filePath, content);
      
      // Also add any related files in the same directory
      const dir = path.dirname(filePath);
      try {
        const otherFiles = await realFs.readdir(dir);
        // Add any supporting files that might be needed (e.g., for imports)
        for (const otherFile of otherFiles) {
          const otherPath = path.join(dir, otherFile);
          if (otherPath !== filePath && (otherFile.endsWith('.mld') || otherFile.endsWith('.md'))) {
            try {
              const otherContent = await realFs.readFile(otherPath, 'utf-8');
              await context.services.filesystem.writeFile(otherPath, otherContent);
            } catch (error) {
              // Skip if can't read
            }
          }
        }
      } catch (error) {
        // Skip if directory can't be read
      }
    }
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  describe('Valid Test Cases', () => {
    // Ensure we found test files
    it.skip('should find valid test cases', () => {
      expect(testCases.valid.length).toBeGreaterThan(0);
      console.log(`Found ${testCases.valid.length} valid test cases`);
    });
    
    // Create individual tests for each valid file
    for (const testPath of testCases.valid) {
      const testName = getTestCaseName(testPath);
      
      // Each test gets its own describe block to ensure it shows up in the output
      describe(`Valid: ${testName}`, () => {
        it.skip(`should process correctly`, async () => {
          // Process through API
          const result = await main(testPath, {
            fs: context.services.filesystem as any,
            services: context.services as unknown as Partial<Services>,
            transformation: true
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
      });
    }
  });
  
  describe.skip('Invalid Test Cases', () => {
    // Check if we have invalid test cases to run
    it.skip('should find invalid test cases', () => {
      if (testCases.invalid.length === 0) {
        console.log('No error test cases found, skipping error tests');
      } else {
        expect(testCases.invalid.length).toBeGreaterThan(0);
        console.log(`Found ${testCases.invalid.length} invalid test cases`);
      }
    });
    
    // Create individual tests for each invalid file
    for (const errorPath of testCases.invalid) {
      const testName = getTestCaseName(errorPath);
      
      // Each test gets its own describe block to ensure it shows up in the output
      describe.skip(`Invalid: ${testName}`, () => {
        it.skip(`should fail as expected`, async () => {
          // Expected to fail
          let errorCaught = false;
          let errorMessage = '';
          
          try {
            await main(errorPath, {
              fs: context.services.filesystem as any,
              services: context.services as unknown as Partial<Services>,
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
      });
    }
  });
});