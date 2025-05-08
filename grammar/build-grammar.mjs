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
// Use the new grammar file if available
const grammarFile = fs.existsSync(path.join(__dirname, 'meld.peggy.new')) ? 
                   'meld.peggy.new' : 'meld.peggy';

console.log(`Using grammar file: ${grammarFile}`);

// Add line tracking for debugging
const fileMap = [];
let lineCount = 0;

function addToFileMap(content, filepath) {
  const startLine = lineCount + 1;
  const fileLines = content.split('\n').length;
  lineCount += fileLines;
  
  fileMap.push({
    file: filepath,
    startLine,
    endLine: lineCount
  });
  
  return content;
}

// Read root grammar file
const rootContent = fs.readFileSync(path.join(__dirname, grammarFile), 'utf8');
addToFileMap(rootContent, grammarFile);

// Create arrays to store contents for each section
const baseFiles = [];
const patternFiles = [];
const coreFiles = [];
const directiveFiles = [];

// Process base files
fs.readdirSync(path.join(__dirname, 'base'))
  .filter(f => f.endsWith('.peggy'))
  .sort()
  .forEach(f => {
    const filepath = path.join('base', f);
    const content = fs.readFileSync(path.join(__dirname, filepath), 'utf8');
    addToFileMap(content, filepath);
    baseFiles.push(content);
  });

// Process pattern files
fs.readdirSync(path.join(__dirname, 'patterns'))
  .filter(f => f.endsWith('.peggy'))
  .sort()
  .forEach(f => {
    const filepath = path.join('patterns', f);
    const content = fs.readFileSync(path.join(__dirname, filepath), 'utf8');
    addToFileMap(content, filepath);
    patternFiles.push(content);
  });

// Process core files
fs.readdirSync(path.join(__dirname, 'core'))
  .filter(f => f.endsWith('.peggy'))
  .sort()
  .forEach(f => {
    const filepath = path.join('core', f);
    const content = fs.readFileSync(path.join(__dirname, filepath), 'utf8');
    addToFileMap(content, filepath);
    coreFiles.push(content);
  });

// Process directive files
fs.readdirSync(path.join(__dirname, 'directives'))
  .filter(f => f.endsWith('.peggy'))
  .sort()
  .forEach(f => {
    const filepath = path.join('directives', f);
    const content = fs.readFileSync(path.join(__dirname, filepath), 'utf8');
    addToFileMap(content, filepath);
    directiveFiles.push(content);
  });

// Combine all content
const sources = [
  rootContent,
  ...baseFiles,
  ...patternFiles,
  ...coreFiles,
  ...directiveFiles,
].join('\n');

// Check for debug flag
if (process.argv.includes('--debug')) {
  console.log("\n=== FILE MAPPING ===");
  fileMap.forEach(entry => {
    console.log(`${entry.file}: lines ${entry.startLine}-${entry.endLine}`);
  });
  
  // If an error occurs at this location
  const errorLine = 2603;
  const errorCol = 80;
  const errorFile = fileMap.find(entry => 
    errorLine >= entry.startLine && errorLine <= entry.endLine
  );
  
  if (errorFile) {
    const originalLine = errorLine - errorFile.startLine + 1;
    console.log(`\nLine ${errorLine}:${errorCol} in combined grammar comes from ${errorFile.file} line ${originalLine}`);
  }
}

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
let parserSource;
try {
  parserSource = peggy.generate(sources, peggyOpts);
} catch (error) {
  console.error('Parser generation failed:', error.message);
  
  if (error.location) {
    const errorLine = error.location.start.line;
    const errorCol = error.location.start.column;
    const errorFile = fileMap.find(entry => 
      errorLine >= entry.startLine && errorLine <= entry.endLine
    );
    
    if (errorFile) {
      const originalLine = errorLine - errorFile.startLine + 1;
      console.error(`\nError is in file: ${errorFile.file}, line ${originalLine}, column ${errorCol}`);
      console.error(`Error found: ${error.found}, expected: ${JSON.stringify(error.expected)}`);
      
      // Write the combined grammar to a file for inspection
      fs.writeFileSync('debug-combined-grammar.peggy', sources);
      console.error('Wrote concatenated grammar to debug-combined-grammar.peggy for inspection');
    }
  }
  
  throw error;
}

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