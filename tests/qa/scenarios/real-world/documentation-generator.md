# Real-World Scenario: Documentation Generator

## Scenario Description
Test mlld's ability to generate documentation by reading source files, extracting information, and creating formatted output. This tests multiple features working together in a realistic use case.

## Test Setup

1. Create a mock project structure:
```
test-project/
├── src/
│   ├── index.js
│   ├── utils.js
│   └── config.js
├── package.json
└── README.md
```

2. Create source files with comments:

**src/index.js**:
```javascript
/**
 * Main application entry point
 * @module index
 */

// Initialize the application
function init() {
  console.log("App initialized");
}

// Start the server
function startServer(port = 3000) {
  console.log(`Server running on port ${port}`);
}
```

**src/utils.js**:
```javascript
/**
 * Utility functions
 * @module utils
 */

// Format date to ISO string
function formatDate(date) {
  return date.toISOString();
}

// Parse JSON safely
function parseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
```

**package.json**:
```json
{
  "name": "test-project",
  "version": "1.0.0",
  "description": "Test project for mlld",
  "main": "src/index.js"
}
```

## Test Implementation

Create `generate-docs.mld`:

```mlld
# Documentation Generator

@import { * } from "./package.json"

@data files = run [find ./src -name "*.js" -type f | sort]

@text file_template(file) = [[
## {{file}}

```javascript
{{content}}
```

]]

@text extract_content(file) = run [cat {{file}}]

# Generate documentation for each file
@data file_docs = foreach @file_template(@files) with {
  pipeline: [@extract_content]
}

# Extract function names
@exec extract_functions(file) = run [grep -E "^function|^const.*=.*function" {{file}} | sed 's/function /- /g' | sed 's/(.*//' | sed 's/const /- /' | sed 's/ =.*//' | sort]

@text functions_template(file) = [[
### Functions in {{file}}:
{{functions}}
]]

@data all_functions = foreach @extract_functions(@files)
@data function_docs = foreach @functions_template(@files) with {
  pipeline: [@extract_functions]
}

# Generate final documentation
@text documentation = [[
# {{name}} Documentation

Version: {{version}}

{{description}}

## Project Structure

{{files}}

## Source Files

{{file_docs}}

## Function Index

{{function_docs}}

---
*Generated with mlld on {{TIME}}*
]]

@output { file: "./API_DOCS.md" }
@add @documentation
```

## Test Execution Steps

1. Create the test project structure
2. Run: `mlld generate-docs.mld`
3. Verify `API_DOCS.md` is created
4. Check the generated documentation

## Expected Results

The generated `API_DOCS.md` should:
- Include project metadata from package.json
- List all JavaScript files found
- Show source code for each file
- Extract and list function names
- Have proper markdown formatting
- Include generation timestamp

## Test Validation Checklist

### Feature Integration
- [ ] @import from JSON works
- [ ] @run with find command works
- [ ] foreach processes file list correctly
- [ ] Nested templates render properly
- [ ] Pipeline transformations work
- [ ] @exec with parameters works
- [ ] Time variable renders correctly
- [ ] @output creates file successfully

### Content Validation
- [ ] All source files included
- [ ] Function extraction accurate
- [ ] Markdown formatting correct
- [ ] No missing interpolations
- [ ] Special characters handled
- [ ] File paths correct

### Error Handling
- [ ] Missing files handled gracefully
- [ ] Empty directories work
- [ ] Invalid JSON fails appropriately
- [ ] Command failures reported

### Performance
- [ ] Completes in reasonable time
- [ ] Memory usage acceptable
- [ ] Large projects scale well

## Variations to Test

1. **Empty Project**: No source files
2. **Large Project**: 100+ files
3. **Deep Nesting**: Deeply nested directories
4. **Special Characters**: Files with spaces, unicode
5. **Mixed Languages**: .js, .ts, .py files
6. **No package.json**: Missing metadata
7. **Circular Imports**: Test robustness

## Issues to Watch For

1. **Path Handling**: Relative vs absolute paths
2. **Shell Escaping**: File names with spaces
3. **Performance**: Large file processing
4. **Memory**: Many files in foreach
5. **Encoding**: UTF-8 source files
6. **Line Endings**: CRLF vs LF

## Success Criteria

- [ ] Documentation generated successfully
- [ ] All files processed
- [ ] Output is valid Markdown
- [ ] Functions extracted correctly
- [ ] No errors or warnings
- [ ] Performance acceptable
- [ ] Output file created

## Cleanup
1. Remove test-project directory
2. Delete generate-docs.mld
3. Delete API_DOCS.md
4. Restore working directory