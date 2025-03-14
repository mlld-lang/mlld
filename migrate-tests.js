const fs = require('fs');
const path = require('path');

// Source and destination directories
const SRC_DIR = '/Users/adam/dev/claude-meld/meld-ast/test';
const DEST_DIR = '/Users/adam/dev/claude-meld/tests/ast';

// Directories to ignore (already migrated)
const IGNORED_FILES = [
  'test-utils.ts',
  'parser.test.ts',
  'directives/data.test.ts',
  'manual/data-array.test.ts'
];

// Map of old imports to new imports
const IMPORT_MAP = {
  "'meld-spec'": "'@core/syntax/types'",
  "'../src/types.js'": "'@core/ast/types'",
  "'../src/index.js'": "'@core/ast'",
  "'../src/parser.js'": "'@core/ast/parser'",
  "'../src/ast/astTypes.js'": "'@core/ast/ast/astTypes'",
  "'../../src/index.js'": "'@core/ast'",
  "'../../src/types.js'": "'@core/ast/types'",
  "'../../src/parser.js'": "'@core/ast/parser'",
  "'../test-utils.js'": "'../utils/test-utils'",
  "'../../test/test-utils.js'": "'../../tests/ast/utils/test-utils'"
};

// Function to recursively copy and update files
function copyAndUpdateFiles(src, dest) {
  // Create destination directory if it doesn't exist
  if (\!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read all files in the source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Skip .DS_Store files
    if (entry.name === '.DS_Store') continue;

    // Get relative path for checking ignored files
    const relativePath = path.relative(SRC_DIR, srcPath);
    
    if (entry.isDirectory()) {
      // Recursively copy directory
      copyAndUpdateFiles(srcPath, destPath);
    } else if (entry.isFile() && \!IGNORED_FILES.includes(relativePath)) {
      // Read file content
      let content = fs.readFileSync(srcPath, 'utf8');
      
      // Update imports
      for (const [oldImport, newImport] of Object.entries(IMPORT_MAP)) {
        content = content.replace(new RegExp(oldImport, 'g'), newImport);
      }
      
      // Write updated content to destination
      fs.writeFileSync(destPath, content, 'utf8');
      console.log(`Migrated: ${relativePath}`);
    }
  }
}

// Start the migration
copyAndUpdateFiles(SRC_DIR, DEST_DIR);
console.log('Migration completed\!');
