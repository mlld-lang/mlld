/// <reference types="vitest" />
import { defineTests, defineInvalidTests } from '@core/syntax/types/test-fixtures';
import { type ParserTestCase } from '@core/syntax/types/parser'
import { testValidCase, testInvalidCase } from '../utils/test-utils';

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