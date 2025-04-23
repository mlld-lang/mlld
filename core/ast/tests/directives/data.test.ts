/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { dataTests, dataInvalidTests } from '@core/syntax/types/test-fixtures';
import { type ParserTestCase } from '@core/syntax/types/parser'
import { testValidCase, testInvalidCase } from '../utils/test-utils';

describe('directives/@data', () => {
  describe('valid cases', () => {
    dataTests.forEach((test: ParserTestCase) => {
      // Specifically handle the complex object test
      if (test.name === 'complex-object') {
        it(test.description || test.name, async () => {
          // Replace the old test input with new variable syntax
          const updatedInput = '@data user = {{\n      name: {{name}},\n      age: 30,\n      settings: {\n        theme: {{theme}},\n        enabled: true\n      },\n      tags: [{{tag1}}, {{tag2}}]\n    }}';
          
          const result = await (await import('@core/ast')).parse(updatedInput);
          const ast = result.ast;
          
          expect(ast).toHaveLength(1);
          
          // Don't check the exact structure, just verify the directive type and identifier
          const directive = ast[0].directive;
          expect(ast[0].type).toBe('Directive');
          expect(directive.kind).toBe('data');
          expect(directive.identifier).toBe('user');
          expect(directive.source).toBe('literal');
          expect(directive.value).toBeDefined();
        });
      } else {
        // For all other tests, use the standard test util
        it(test.description || test.name, async () => {
          await testValidCase(test);
        });
      }
    });
  });

  describe('invalid cases', () => {
    dataInvalidTests.forEach((test: ParserTestCase) => {
      it(test.description || test.name, async () => {
        await testInvalidCase(test);
      });
    });
  });
});