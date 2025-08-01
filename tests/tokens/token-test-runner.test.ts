import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateSemanticTokens } from './utils/semantic-tokens';
import { parseTokenTest } from './utils/parser';
import { validateExpectedTokens, validateNotExpectedTokens } from './utils/validation';

describe('Semantic Tokens - Precision Tests', () => {
  const testFiles = glob.sync('tests/tokens/**/*.mld');

  testFiles.forEach(file => {
    const testName = path.relative('tests/tokens', file).replace('.mld', '');

    it(testName, async () => {
      const content = await fs.readFile(file, 'utf8');
      const test = parseTokenTest(content);

      const actualTokens = await generateSemanticTokens(test.input);

      // Always validate that token generation doesn't crash
      expect(actualTokens).toBeDefined();

      if (test.expectedTokens) {
        validateExpectedTokens(actualTokens, test.expectedTokens, test.isPartial);
      }

      if (test.notExpectedTokens) {
        validateNotExpectedTokens(actualTokens, test.notExpectedTokens);
      }
    });
  });
});