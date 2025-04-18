/// <reference types="vitest" />
import { describe, it } from 'vitest';
import { textTests, textInvalidTests } from '@core/syntax/types/test-fixtures.js';
import { type ParserTestCase } from '@core/syntax/types/parser.js'
import { testValidCase, testInvalidCase } from '../utils/test-utils.js';

describe('directives/@text', () => {
  describe('valid cases', () => {
    // TODO: @api and @call directives are not yet supported in meld
    // We filter out call-with-payload test case until these directives are implemented
    const filteredTests = textTests.filter((test: ParserTestCase) => test.name !== 'call-with-payload');
    filteredTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testValidCase(test);
      });
    });
  });

  describe('invalid cases', () => {
    textInvalidTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testInvalidCase(test);
      });
    });
  });
}); 