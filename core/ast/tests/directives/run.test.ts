/// <reference types="vitest" />
import { expect, describe, it } from 'vitest';
import { runTests, runInvalidTests } from '@core/syntax/types/test-fixtures.js';
import { type ParserTestCase } from '@core/syntax/types/parser.js'
import { testValidCase, testInvalidCase } from '../utils/test-utils.js';

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