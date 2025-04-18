/// <reference types="vitest" />
import { defineTests, defineInvalidTests } from '@core/syntax/types/test-fixtures.js';
import { type ParserTestCase } from '@core/syntax/types/parser.js'
import { testValidCase, testInvalidCase } from '../utils/test-utils.js';

describe('directives/@define', () => {
  describe('valid cases', () => {
    defineTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testValidCase(test);
      });
    });
  });

  describe('invalid cases', () => {
    defineInvalidTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testInvalidCase(test);
      });
    });
  });
});