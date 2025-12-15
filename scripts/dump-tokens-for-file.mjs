#!/usr/bin/env node
/**
 * Dump semantic tokens for a specific file in readable format
 * This simulates what editors receive
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';

const filePath = process.argv[2] || 'tmp/claude-helpers.mld';
const absolutePath = resolve(filePath);
const content = await readFile(absolutePath, 'utf-8');

// Import parser directly from generated file
import parser from '../grammar/generated/parser/parser.js';

// ASTSemanticVisitor isn't exported, so we'll use the validator instead
const validatorModule = await import('../tests/utils/token-validator/index.ts');
const { TokenCoverageValidator, NodeExpectationBuilder, createNodeTokenRuleMap } = validatorModule;

// Detect mode from filename
const mode = filePath.endsWith('.mld') ? 'strict' : 'markdown';
console.log(`\n=== Parsing ${filePath} (mode: ${mode}) ===\n`);

let ast;
try {
  ast = parser.parse(content, { mode });
} catch (err) {
  console.log('Parse failed:', err.message);
  process.exit(1);
}
console.log('AST nodes:', ast.length);

// Use validator to generate tokens (same code path it tests)
const nodeTokenRules = createNodeTokenRuleMap();
const expectationBuilder = new NodeExpectationBuilder(nodeTokenRules);
const validator = new TokenCoverageValidator(expectationBuilder, nodeTokenRules);

// Generate tokens using validator's method
const fixture = {
  name: filePath,
  input: content,
  ast: ast,
  mlldMode: mode
};

// Hack: call generateSemanticTokens directly by validating
const validationResult = await validator.validateFixture(fixture);

console.log(`\n=== Validator Results ===`);
console.log(`Coverage: ${validationResult.coveragePercentage.toFixed(1)}%`);
console.log(`Gaps: ${validationResult.gaps.length}`);

if (validationResult.gaps.length > 0) {
  console.log(`\n=== Gaps ===`);
  validationResult.gaps.forEach(gap => {
    console.log(`Line ${gap.location.start.line}: ${gap.nodeType}`);
    console.log(`  Expected: ${gap.expectedTokenTypes.join(', ')}`);
    console.log(`  Actual: ${gap.actualTokens.map(t => t.tokenType).join(', ') || 'none'}`);
    console.log(`  Text: "${gap.text.substring(0, 50)}"`);

    // Show diagnostic info if available
    if (gap.diagnostic && process.argv.includes('--diagnostics')) {
      console.log(`  🔍 Diagnostics:`);

      if (gap.diagnostic.visitorCalls.length > 0) {
        for (const call of gap.diagnostic.visitorCalls) {
          const status = call.called ? '✓' : '✗';
          console.log(`    ${status} ${call.visitorClass}: ${call.tokensEmitted} emitted, ${call.tokensAccepted} accepted, ${call.tokensRejected} rejected`);
        }
      } else {
        console.log(`    ✗ No visitor called`);
      }

      if (gap.diagnostic.tokenAttempts.length > 0) {
        console.log(`    Token attempts:`);
        for (const attempt of gap.diagnostic.tokenAttempts) {
          const status = attempt.accepted ? '✓' : '✗';
          const reason = attempt.rejectionReason ? ` (${attempt.rejectionReason})` : '';
          console.log(`      ${status} ${attempt.tokenType} at ${attempt.position.line}:${attempt.position.char}${reason}`);
        }
      }
    }
  });
}
