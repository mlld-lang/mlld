import fs from 'fs';
import path from 'path';
import peggy from 'peggy';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRAMMAR_FILE = path.resolve(__dirname, './meld.peggy');
const DIST_DIR = path.resolve(__dirname, '../core/ast/grammar');
const SRC_PARSER = path.resolve(DIST_DIR, './parser.ts');
const GRAMMAR_DIST = path.resolve(DIST_DIR, 'meld.pegjs');
const DIST_PARSER_ESM = path.resolve(DIST_DIR, 'parser.js');
const DIST_PARSER_CJS = path.resolve(DIST_DIR, 'parser.cjs');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Read and merge grammar files
const GRAMMAR_SOURCES = [
  // order matters
  ...fs.readdirSync(path.resolve(__dirname, './lexer'))
      .filter(f => f.endsWith('.peggy'))
      .sort()
      .map(f => fs.readFileSync(path.resolve(__dirname, './lexer', f), 'utf8')),
  ...fs.readdirSync(path.resolve(__dirname, './directives'))
      .filter(f => f.endsWith('.peggy'))
      .sort()
      .map(f => fs.readFileSync(path.resolve(__dirname, './directives', f), 'utf8')),
  fs.readFileSync(GRAMMAR_FILE, 'utf8') // root goes last
].join('\n');

// Validate grammar
console.log('Validating grammar...');
try {
  peggy.generate(GRAMMAR_SOURCES, { output: 'source' });
  console.log('Grammar validation successful');
} catch (error) {
  console.error('Grammar validation failed:', error);
  process.exit(1);
}

// Common options for all parser generations
const commonOpts = {
  output: 'source',
  cache: false,
  optimize: 'speed',
  plugins: [],
  allowedStartRules: ['Start'],
  exportVar: false,
  dependencies: {
    NodeType:      './node-type.js',
    DirectiveKind: './directive-kind.js',
    helpers:       './helpers.js'
  }
};

// Generate TypeScript parser
const tsSource = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'es', trace: true });

// Add imports at the top and export only what we need
const tsWrapped = `// Generated TypeScript parser
import type { MeldNode } from '@core/syntax/types.js';

// Define return type for the parser
type ParseFunction = (input: string, options?: any) => MeldNode[];

// Define SyntaxError type
class SyntaxError extends Error {
  expected: any;
  found: any;
  location: any;
  name: string;
  constructor(message: string, expected?: any, found?: any, location?: any) {
    super(message);
    this.expected = expected;
    this.found = found;
    this.location = location;
    this.name = "SyntaxError";
  }
}

// Peggy-generated code below
${tsSource.replace(/export \{[^}]+\};/g, '')}

// Export all symbols in a single block
export {
  peg$DefaultTracer as DefaultTracer,
  peg$allowedStartRules as StartRules,
  SyntaxError,
  peg$parse as parse
};

// Export the parser function and error type as default
const parser = { parse: peg$parse, SyntaxError };
export default parser;`;

// Write TypeScript parser to src
fs.writeFileSync(SRC_PARSER, tsWrapped);

// Generate ESM and CJS versions
const esmSource = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'es' });
const cjsSource = peggy.generate(GRAMMAR_SOURCES, { ...commonOpts, format: 'commonjs' });

// Write ESM parser to dist
fs.writeFileSync(DIST_PARSER_ESM, `// Generated ESM parser

// Define return type for the parser
/** @typedef {import('@core/syntax/types.js').MeldNode} MeldNode */
/** @type {(input: string, options?: any) => MeldNode[]} */

// Define SyntaxError type
class SyntaxError extends Error {
  constructor(message, expected, found, location) {
    super(message);
    this.expected = expected;
    this.found = found;
    this.location = location;
    this.name = "SyntaxError";
  }
}

// Peggy-generated code below
${esmSource.replace(/export \{[^}]+\};/g, '')}

// Export all symbols in a single block
export {
  peg$DefaultTracer as DefaultTracer,
  peg$allowedStartRules as StartRules,
  SyntaxError,
  peg$parse as parse
};

// Export the parser function and error type as default
const parser = { parse: peg$parse, SyntaxError };
export default parser;`);

// Write CJS parser to dist
fs.writeFileSync(DIST_PARSER_CJS, `// Generated CJS parser
"use strict";

// Define return type for the parser
/** @typedef {import('@core/syntax/types.js').MeldNode} MeldNode */
/** @typedef {(input: string, options?: any) => MeldNode[]} ParseFunction */

// Define SyntaxError type
class SyntaxError extends Error {
  constructor(message, expected, found, location) {
    super(message);
    this.expected = expected;
    this.found = found;
    this.location = location;
    this.name = "SyntaxError";
  }
}

// Peggy-generated code below
${cjsSource}

// Export the parser function and error type
const parser = { parse: peg$parse, SyntaxError };
module.exports = parser;`);

// No need to copy grammar file to dist anymore

// Copy dependency files to both ESM and CJS locations
['node-type.js', 'directive-kind.js', 'helpers.js'].forEach(file => {
  // Copy to ESM parser location
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(DIST_PARSER_ESM), file)
  );
  // Copy to CJS parser location
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(DIST_PARSER_CJS), file)
  );
  // Copy to TypeScript parser location
  fs.copyFileSync(
    path.resolve(__dirname, './deps', file),
    path.resolve(path.dirname(SRC_PARSER), file)
  );
});

console.log('Successfully generated parser:');
console.log('- TypeScript:', SRC_PARSER);
console.log('- ESM:', DIST_PARSER_ESM);
console.log('- CJS:', DIST_PARSER_CJS);
console.log('- Grammar:', GRAMMAR_DIST);