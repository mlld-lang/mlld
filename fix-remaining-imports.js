const fs = require('fs');
const path = require('path');

// List of files to fix
const filesToFix = [
  'tests/ast/directives/embed-header.test.ts',
  'tests/ast/directives/embed-syntax-invalid.test.ts',
  'tests/ast/directives/multiline-embed.test.ts',
  'tests/ast/directives/multiline-template.test.ts',
  'tests/ast/directives/path-variable-embed.test.ts',
  'tests/ast/directives/path-variable-import.test.ts',
  'tests/ast/directives/variable-syntax.test.ts',
  'tests/ast/directives/embed-template-variables.test.ts',
  'tests/ast/directives/line-start.test.ts',
  'tests/ast/directives/named-import.test.ts'
];

// Map of old imports to new imports
const replacements = [
  { from: '../../src', to: '@core/ast' },
  { from: '../../src/index', to: '@core/ast' },
  { from: '../../src/parser.js', to: '@core/ast/parser' },
  { from: '../test-utils.js', to: '../utils/test-utils' }
];

// Process each file
filesToFix.forEach(filePath => {
  const fullPath = path.join('/Users/adam/dev/claude-meld', filePath);
  
  // Skip if file doesn't exist
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${fullPath}`);
    return;
  }
  
  // Read content
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Apply replacements
  replacements.forEach(({ from, to }) => {
    const regex = new RegExp(`'${from}'`, 'g');
    content = content.replace(regex, `'${to}'`);
  });
  
  // Write updated content
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Fixed imports in: ${filePath}`);
});

console.log('Done fixing imports!');