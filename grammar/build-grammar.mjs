#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import peggy from 'peggy';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- paths ----------
const ROOT_GRAMMAR = path.join(__dirname, 'mlld.peggy');
const DIST_DIR = path.join(__dirname, './generated/parser');
const DIST_PARSER_TS = path.join(DIST_DIR, 'parser.ts');
const DIST_PARSER_JS = path.join(DIST_DIR, 'parser.js');

// ensure dist dir
fs.mkdirSync(DIST_DIR, { recursive: true });

// ---------- fold all grammar sources ----------
// Use the new grammar file if available
const grammarFile = fs.existsSync(path.join(__dirname, 'mlld.peggy.new')) ? 
                   'mlld.peggy.new' : 'mlld.peggy';

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
  console.log('\n=== FILE MAPPING ===');
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

// ---------- peggy generate TypeScript ----------
const allowedStartRules = [
  'Start',
  'ExeBlockBody',
  'ForBlockBody',
  'ForBlockStatementList',
  'WhenConditionList',
  'WhenExpressionConditionList',
  'GuardRuleList',
  'WhenActionBlockContent',
  'TemplateBodyAtt',
  'TemplateBodyMtt'
];

const peggyOptsTS = {
  format: 'es',
  output: 'source',
  optimize: 'speed',
  allowedStartRules,
  // Native TypeScript type file!
  dts: true,
  returnTypes: { Start: 'import("@core/types").MlldNode[]' },
  dependencies: {
    NodeType: './deps/node-type.ts',
    DirectiveKind: './deps/directive-kind.ts',
    helpers: './deps/helpers.ts',
  },
};

console.log('Generating TypeScript parser...');
let parserSourceTS;
try {
  parserSourceTS = peggy.generate(sources, peggyOptsTS);
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

// Convert JavaScript to TypeScript syntax
// Replace .js imports with .ts
parserSourceTS = parserSourceTS.replace(/from ['"](.+)\.js['"]/g, 'from \'$1.ts\'');

// Modify the generated parser to include a default export
const defaultExportAddition = `
// Add a default export for compatibility
const parser = { 
  parse: peg$parse, 
  SyntaxError: peg$SyntaxError,
  StartRules: peg$allowedStartRules
};
export default parser;
`;

parserSourceTS += defaultExportAddition;
fs.writeFileSync(DIST_PARSER_TS, parserSourceTS);
console.log('✓ parser.ts written with default export');

// ---------- peggy generate JavaScript (ESM) ----------
const peggyOptsJS = {
  format: 'es',
  output: 'source',
  optimize: 'speed',
  allowedStartRules,
  dependencies: {
    NodeType: './deps/node-type.js',
    DirectiveKind: './deps/directive-kind.js',
    helpers: './deps/helpers.js',
  },
};

console.log('Generating JavaScript ESM parser...');
let parserSourceJS;
try {
  parserSourceJS = peggy.generate(sources, peggyOptsJS);
} catch (error) {
  console.error('JavaScript parser generation failed:', error.message);
  throw error;
}

// Add default export to JavaScript version
parserSourceJS += defaultExportAddition;
fs.writeFileSync(DIST_PARSER_JS, parserSourceJS);
console.log('✓ parser.js written with default export');

// ---------- peggy generate JavaScript (CommonJS) ----------
const peggyOptsCJS = {
  format: 'commonjs',
  output: 'source',
  optimize: 'speed',
  allowedStartRules,
  dependencies: {
    NodeType: './deps/node-type.cjs',
    DirectiveKind: './deps/directive-kind.cjs',
    helpers: './deps/helpers.cjs',
  },
};

console.log('Generating JavaScript CommonJS parser...');
let parserSourceCJS;
try {
  parserSourceCJS = peggy.generate(sources, peggyOptsCJS);
} catch (error) {
  console.error('JavaScript CommonJS parser generation failed:', error.message);
  throw error;
}

// CommonJS exports
const cjsExportAddition = `
// Add exports for CommonJS compatibility
module.exports = {
  parse: peg$parse,
  SyntaxError: peg$SyntaxError,
  StartRules: peg$allowedStartRules
};
`;

parserSourceCJS += cjsExportAddition;
fs.writeFileSync(path.join(DIST_DIR, 'parser.cjs'), parserSourceCJS);
console.log('✓ parser.cjs written with CommonJS exports');

// ---------- copy runtime deps ----------
// Create deps directory in the output directory
fs.mkdirSync(path.join(DIST_DIR, 'deps'), { recursive: true });

// Convert helper files to TypeScript and CommonJS
for (const f of [
  'node-type.js',
  'directive-kind.js',
  'helpers.js',
]) {
  const srcPath = path.join(__dirname, 'deps', f);
  const destPathTS = path.join(DIST_DIR, 'deps', f.replace('.js', '.ts'));
  const destPathJS = path.join(DIST_DIR, 'deps', f);
  const destPathCJS = path.join(DIST_DIR, 'deps', f.replace('.js', '.cjs'));
  
  // Read the file
  const content = fs.readFileSync(srcPath, 'utf8');
  
  // Create TypeScript version
  let contentTS = content.replace('./grammar-core.js', '../grammar-core.ts');
  contentTS = contentTS.replace(/import\s+(.+?)\s+from\s+['"](.+?)\.js['"]/g, 'import $1 from \'$2.ts\'');
  fs.writeFileSync(destPathTS, contentTS);
  
  // Copy JavaScript ESM version as-is with path adjustments
  const contentJS = content.replace('./grammar-core.js', '../grammar-core.js');
  fs.writeFileSync(destPathJS, contentJS);
  
  // Create CommonJS version
  let contentCJS = content.replace('./grammar-core.js', '../grammar-core.cjs');
  // Convert ES modules to CommonJS
  contentCJS = contentCJS.replace(/^export\s+{([^}]+)}/gm, (match, exports) => {
    const exportList = exports.split(',').map(e => e.trim());
    return exportList.map(exp => `exports.${exp} = ${exp};`).join('\n');
  });
  contentCJS = contentCJS.replace(/^export\s+const\s+(\w+)/gm, 'exports.$1');
  contentCJS = contentCJS.replace(/^export\s+function\s+(\w+)/gm, 'exports.$1 = function $1');
  contentCJS = contentCJS.replace(/^import\s+{([^}]+)}\s+from\s+['"](.+?)['"]/gm, (match, imports, module) => {
    const importList = imports.split(',').map(i => i.trim());
    const modPath = module.endsWith('.js') ? module.replace('.js', '.cjs') : module;
    return `const { ${importList.join(', ')} } = require('${modPath}');`;
  });
  contentCJS = contentCJS.replace(/^import\s+(\w+)\s+from\s+['"](.+?)['"]/gm, (match, name, module) => {
    const modPath = module.endsWith('.js') ? module.replace('.js', '.cjs') : module;
    return `const ${name} = require('${modPath}');`;
  });
  
  fs.writeFileSync(destPathCJS, contentCJS);
  
  console.log(`✓ Converted ${f} to TypeScript, ESM, and CommonJS`);
}

// Also copy grammar-core.js
const coreJsPath = path.join(__dirname, 'deps/grammar-core.js');
const destCoreJsPathTS = path.join(DIST_DIR, 'grammar-core.ts');
const destCoreJsPathJS = path.join(DIST_DIR, 'grammar-core.js');
const destCoreJsPathCJS = path.join(DIST_DIR, 'grammar-core.cjs');

const coreContent = fs.readFileSync(coreJsPath, 'utf8');
fs.writeFileSync(destCoreJsPathTS, coreContent);
fs.writeFileSync(destCoreJsPathJS, coreContent);

// Create CommonJS version of grammar-core
let coreCJS = coreContent;
// Convert ES exports to CommonJS
coreCJS = coreCJS.replace(/^export\s+{([^}]+)}/gm, (match, exports) => {
  const exportList = exports.split(',').map(e => e.trim());
  return exportList.map(exp => `exports.${exp} = ${exp};`).join('\n');
});
coreCJS = coreCJS.replace(/^export\s+const\s+(\w+)/gm, 'exports.$1');
coreCJS = coreCJS.replace(/^export\s+function\s+(\w+)/gm, 'exports.$1 = function $1');

fs.writeFileSync(destCoreJsPathCJS, coreCJS);

console.log(`✓ Copied grammar-core.js to TypeScript, ESM, and CommonJS`);
console.log('✓ helper modules converted and copied');
console.log('Parser generation complete!');
