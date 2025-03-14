const fs = require('fs');
const path = require('path');

// Directory paths
const SOURCE_DIR = '/Users/adam/dev/claude-meld/meld-ast/test';
const DEST_DIR = '/Users/adam/dev/claude-meld/tests/ast';

// Files already migrated
const IGNORED_FILES = [
  'test-utils.ts', 
  'parser.test.ts', 
  'directives', 
  'manual',
  'array-access.test.ts',
  'debug-test.js'
];

// Files to migrate (only these specific files)
const FILES_TO_MIGRATE = [
  'comment-syntax.test.ts',
  'numeric-field-access.test.ts',
  'special-path-test.test.ts',
  'types.test.ts',
  'validation.test.ts',
  'variable-syntax.test.ts',
  'manual-numeric-test.ts'
];

// Process each file
FILES_TO_MIGRATE.forEach(file => {
  const sourcePath = path.join(SOURCE_DIR, file);
  const destPath = path.join(DEST_DIR, file);

  // Skip if file doesn't exist
  if (!fs.existsSync(sourcePath)) {
    console.log(`File not found: ${sourcePath}`);
    return;
  }

  // Read the content
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Replace imports
  content = content.replace(/'meld-spec'/g, "'@core/syntax/types'");
  content = content.replace(/'..\/src\/index.js'/g, "'@core/ast'");
  content = content.replace(/'..\/src\/types.js'/g, "'@core/ast/types'");
  content = content.replace(/'..\/src\/ast\/astTypes.js'/g, "'@core/ast/ast/astTypes'");
  content = content.replace(/'..\/src\/parser.js'/g, "'@core/ast/parser'");
  content = content.replace(/'\.\/test-utils.js'/g, "'./utils/test-utils'");

  // Write to destination
  fs.writeFileSync(destPath, content, 'utf8');
  console.log(`Migrated: ${file}`);
});

console.log('Migration completed!');