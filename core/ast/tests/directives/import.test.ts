/// <reference types="vitest" />
import { describe, it } from 'vitest';
import { importTests, importInvalidTests } from '@core/syntax/types/test-fixtures';
import { type ParserTestCase } from '@core/syntax/types/parser'
import { testValidCase, testInvalidCase } from '../utils/test-utils';

describe('directives/@import', () => {
  describe('valid cases', () => {
    // Use the imported fixtures directly, as they contain the correct expected AST structure.
    importTests.forEach((test: ParserTestCase) => {
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