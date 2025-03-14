const fs = require('fs');
const path = require('path');

// Directory paths
const SOURCE_DIR = '/Users/adam/dev/claude-meld/meld-ast/test/directives';
const DEST_DIR = '/Users/adam/dev/claude-meld/tests/ast/directives';

// Files already migrated
const IGNORED_FILES = ['data.test.ts', 'define.test.ts'];

// Read all files in source directory
const files = fs.readdirSync(SOURCE_DIR);

// Process each file
files.forEach(file => {
  if (IGNORED_FILES.includes(file)) {
    console.log(`Skipping already migrated file: ${file}`);
    return;
  }

  // Only process .ts files
  if (!file.endsWith('.ts')) {
    return;
  }

  const sourcePath = path.join(SOURCE_DIR, file);
  const destPath = path.join(DEST_DIR, file);

  // Read the content
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Replace imports
  content = content.replace(/'meld-spec'/g, "'@core/syntax/types'");
  content = content.replace(/'..\/test-utils.js'/g, "'../utils/test-utils'");
  content = content.replace(/'..\/..\/src\/index.js'/g, "'@core/ast'");
  content = content.replace(/'..\/..\/src\/types.js'/g, "'@core/ast/types'");

  // Write to destination
  fs.writeFileSync(destPath, content, 'utf8');
  console.log(`Migrated: ${file}`);
});

console.log('Migration completed!');