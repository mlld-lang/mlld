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

// Import from local dist (this script runs in repo context)
const { parseSync } = await import('../dist/index.mjs');
const { TextDocument } = await import('vscode-languageserver-textdocument');
const { SemanticTokensBuilder } = await import('vscode-languageserver/node.js');

// ASTSemanticVisitor isn't exported, so we'll use the validator instead
const validatorModule = await import('../tests/utils/token-validator/index.ts');
const { TokenCoverageValidator, NodeExpectationBuilder, createNodeTokenRuleMap } = validatorModule;

// Detect mode from filename
const mode = filePath.endsWith('.mld') ? 'strict' : 'markdown';
console.log(`\n=== Parsing ${filePath} (mode: ${mode}) ===\n`);

const result = parseSync(content, { mode });

if (!result.success) {
  console.log('Parse failed:', result.error.message);
  process.exit(1);
}

const ast = result.ast;
console.log('AST nodes:', ast.length);

// Use validator to generate tokens (same code path it tests)
const nodeTokenRules = createNodeTokenRuleMap();
const expectationBuilder = new NodeExpectationBuilder(nodeTokenRules);
const validator = new TokenCoverageValidator(expectationBuilder);

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
  });
}
