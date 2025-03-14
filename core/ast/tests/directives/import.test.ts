/// <reference types="vitest" />
import { describe, it } from 'vitest';
import { importTests, importInvalidTests, type ParserTestCase } from '@core/syntax/types';
import { testValidCase, testInvalidCase } from '../utils/test-utils';

describe('directives/@import', () => {
  describe('valid cases', () => {
    // Modify the test cases to include cwd: false for special variables
    // and add the imports array to match the new AST structure
    const modifiedImportTests = importTests.map(test => {
      // Make a deep copy to avoid modifying the original
      const testCopy = JSON.parse(JSON.stringify(test));
      
      // Set cwd: false for special path variable tests and path variable tests
      if (test.description === 'Import with path variable' ||
          test.description === 'Import with HOMEPATH variable' ||
          test.description === 'Import with ~ alias for HOMEPATH' ||
          test.description === 'Import with PROJECTPATH variable' ||
          test.description === 'Import with . alias for PROJECTPATH') {
        if (testCopy.expected?.directive?.path?.structured) {
          testCopy.expected.directive.path.structured.cwd = false;
        }
        
        // Add isPathVariable: true for the path variable test
        if (test.description === 'Import with path variable') {
          testCopy.expected.directive.path.isPathVariable = true;
        }
      }
      
      // Add the imports array to all test cases
      if (testCopy.expected?.directive) {
        testCopy.expected.directive.imports = [{ name: '*', alias: null }];
      }
      
      return testCopy;
    });
    
    modifiedImportTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testValidCase(test);
      });
    });
  });

  describe('invalid cases', () => {
    importInvalidTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testInvalidCase(test);
      });
    });
  });
}); 