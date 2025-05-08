#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import peggy from 'peggy';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- paths ----------
const ROOT_GRAMMAR = path.join(__dirname, 'meld.peggy');
const DIST_DIR = path.join(__dirname, '../core/ast/grammar');
const DIST_PARSER = path.join(DIST_DIR, 'parser.js');

// ensure dist dir
fs.mkdirSync(DIST_DIR, { recursive: true });

// ---------- fold all grammar sources ----------
const sources =
  [
    fs.readFileSync(ROOT_GRAMMAR, 'utf8'),
    ...fs.readdirSync(path.join(__dirname, 'lexer'))
        .filter(f => f.endsWith('.peggy'))
        .sort()
        .map(f => fs.readFileSync(path.join(__dirname, 'lexer', f), 'utf8')),
    ...fs.readdirSync(path.join(__dirname, 'directives'))
        .filter(f => f.endsWith('.peggy'))
        .sort()
        .map(f => fs.readFileSync(path.join(__dirname, 'directives', f), 'utf8')),
  ].join('\n');

// ---------- peggy generate ----------
const peggyOpts = {
  format: 'es',
  output: 'source',
  optimize: 'speed',
  allowedStartRules: ['Start'],
  // Native TypeScript type file!
  dts: true,
  returnTypes: { Start: 'import("@core/syntax").MeldNode[]' },
  dependencies: {
    NodeType: './deps/node-type.js',
    DirectiveKind: './deps/directive-kind.js',
    helpers: './deps/helpers.js',
  },
};

console.log('Generating parser...');
let parserSource = peggy.generate(sources, peggyOpts);

// Modify the generated parser.js to include a default export
const defaultExportAddition = `
// Add a default export for compatibility
const parser = { 
  parse: peg$parse, 
  SyntaxError: peg$SyntaxError,
  StartRules: peg$allowedStartRules
};
export default parser;
`;

parserSource += defaultExportAddition;
fs.writeFileSync(DIST_PARSER, parserSource);
console.log('✓ parser.js written with default export');

// ---------- copy runtime deps ----------
// Create deps directory in the output directory
fs.mkdirSync(path.join(DIST_DIR, 'deps'), { recursive: true });

// Copy grammar-core.js first
const coreJsPath = path.join(__dirname, 'deps/grammar-core.js');
const destCoreJsPath = path.join(DIST_DIR, 'grammar-core.js');
fs.copyFileSync(coreJsPath, destCoreJsPath);
console.log(`✓ Copied ${coreJsPath} to ${destCoreJsPath}`);

// Create deps directory in output dir
const depsDir = path.join(DIST_DIR, 'deps');
fs.mkdirSync(depsDir, { recursive: true });

// Copy shim files 
for (const f of [
  'node-type.js',
  'directive-kind.js',
  'helpers.js',
]) {
  const srcPath = path.join(__dirname, 'deps', f);
  const destPath = path.join(depsDir, f);
  
  // Read the file, adjust the import path if needed, and write to destination
  let content = fs.readFileSync(srcPath, 'utf8');
  content = content.replace('./grammar-core.js', '../grammar-core.js');
  
  fs.writeFileSync(destPath, content);
  console.log(`✓ Copied and fixed imports for ${f}`);
}

console.log('✓ helper modules copied');
console.log('Parser generation complete!');