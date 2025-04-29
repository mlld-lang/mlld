# AST Import Issue Resolution Attempts

## Problem Description

The AST tests fail to run with the error "'import', and 'export' cannot be used outside of module code". This is happening because:

1. The project is configured as ESM (`"type": "module"` in package.json).
2. The grammar files are generated as ESM modules.
3. Vitest has issues processing these modules when running tests.

## Goal

Make `npm run build:grammar && npm test core/ast` work correctly, by resolving the compatibility issues between the ESM grammar files and the test environment.

## Attempts and Approaches

### 1. Vitest Configuration Modifications

#### Attempt 1: Using `transformMode` and `testTransformMode`
```javascript
test: {
  transformMode: {
    web: [/core\/ast\/grammar/]
  },
}
```

**Result**: Failed. Vitest still couldn't process the ESM syntax in the grammar files correctly.

#### Attempt 2: Using `deps.optimizer` settings
```javascript
deps: {
  optimizer: {
    web: {
      include: [/core\/ast\/grammar/]
    },
    ssr: {
      include: [/core\/ast\/grammar/]
    }
  }
},
```

**Result**: Failed. The optimizer settings didn't correctly handle the ESM to CJS conversion needed.

#### Attempt 3: Using `deps.external` (equivalent to Jest's `transformIgnorePatterns`)
```javascript
deps: {
  external: ['/core/ast/grammar/']
},
```

**Result**: Failed. Marking the grammar files as external didn't resolve the module format compatibility issue.

#### Attempt 4: Using `ssr.noExternal`
```javascript
ssr: {
  noExternal: [/core\/ast\/grammar/],
},
```

**Result**: Failed. The server-side rendering settings didn't properly handle the module compatibility.

### 2. Custom Test Runners

#### Attempt 1: Creating a direct test runner
Created `run-ast-tests.mjs` to execute tests directly with Node.js, bypassing Vitest.

**Result**: Partial success. The test runner could load the parser, but still encountered module compatibility issues when running tests that imported the parser.

#### Attempt 2: Single test runner
Created `run-one-test.mjs` to run a single test file to isolate the issue.

**Result**: Failed. Similar module compatibility issues persisted.

#### Attempt 3: CJS test runner
Created `run-grammar-test.cjs` to test the grammar directly using CommonJS.

**Result**: Partial success. The test runner could load the parser in CJS format, but encountered issues with helper files.

### 3. Grammar Build Process Modifications

#### Attempt 1: Post-processing grammar files
Created `post-process-grammar.mjs` to modify the generated grammar files for better compatibility.

**Result**: Partial success. The post-processing helped create CJS-compatible versions of the files.

#### Attempt 2: Dual-format parser generation
Modified `build-grammar.mjs` to generate both ESM and CJS versions of the parser.

**Result**: Partial success. Both versions were generated, but the CJS version still had ESM dependencies.

#### Attempt 3: Import statement conversion
Enhanced the build script to convert import statements to require statements in the CJS version:

```javascript
processedCjsSource = processedCjsSource.replace(
  /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g, 
  (match, imports, source) => {
    // Convert import names to const { x, y } = require('...')
    const importNames = imports.split(',').map(name => name.trim());
    return `const { ${importNames.join(', ')} } = require("${source.replace(/\.mjs$/, '')}");`;
  }
);
```

**Result**: Partial success. The import statements were converted, but path issues remained.

#### Attempt 4: Helper file processing
Created `process-helpers.cjs` to convert helper files to CommonJS format, specifically handling the module.exports conversion:

```javascript
// Replace ESM export statements with CommonJS exports
let processedContent = content.replace(
  /export\s+\{([^}]+)\};?/g,
  (match, exports) => {
    const exportNames = exports.split(',').map(name => name.trim());
    return `module.exports = { ${exportNames.join(', ')} };`;
  }
);
```

**Result**: In progress. The helper file processing helped with some module syntax conversions.

### 4. Direct CJS Imports

#### Attempt 1: Modified test file
Created a variant test file that imports the CJS version of the parser directly.

**Result**: Failed. Path resolution issues occurred when trying to import the CJS parser.

#### Attempt 2: Smart path resolution in CJS
Enhanced the import statement conversion to handle different path formats:

```javascript
// Ensure helper paths point to the correct file extension
let requirePath = source;
if (source.includes('./helpers/')) {
  // Point to the .js version of helpers which is CJS compatible
  requirePath = source.replace(/\.mjs$/, '.js');
} else {
  // For other modules, just remove the extension
  requirePath = source.replace(/\.mjs$/, '');
}
```

**Result**: In progress. This approach aims to fix the path resolution issues in the CJS environment.

## Current Status

Despite multiple approaches, we're still encountering module compatibility issues, particularly with:

1. The ESM-to-CJS conversion in helper files (`module is not defined` error)
2. Path resolution between different module formats
3. Vitest's handling of the grammar files

## Next Steps

1. **Complete Helper File Processing**: Ensure all ESM syntax in helper files is properly converted to CJS.
2. **Path Resolution**: Fix all path-related issues in the CJS versions of files.
3. **Test with Direct CJS Import**: Once path and module format issues are resolved, test with the direct CJS test runner.
4. **Re-evaluate Vitest Config**: If the CJS approach works, update the Vitest configuration to incorporate these findings.

## Conclusion

The core issue lies in the module format compatibility between ESM and CommonJS, particularly in how Node.js and Vitest handle ESM modules. Our approaches are progressively getting closer to a solution by ensuring proper module format conversion and path resolution.
