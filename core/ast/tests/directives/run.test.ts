/// <reference types="vitest" />
import { expect, describe, it } from 'vitest';
import { runTests, runInvalidTests } from '@core/syntax/types/test-fixtures';
import { type ParserTestCase } from '@core/syntax/types/parser'
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