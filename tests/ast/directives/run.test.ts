/// <reference types="vitest" />
import { runTests, runInvalidTests, type ParserTestCase } from '@core/syntax/types';
import { testValidCase, testInvalidCase } from '../utils/test-utils';

describe('directives/@run', () => {
  describe('valid cases', () => {
    runTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testValidCase(test);
      });
    });
  });

  describe('invalid cases', () => {
    runInvalidTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testInvalidCase(test);
      });
    });
  });
}); 