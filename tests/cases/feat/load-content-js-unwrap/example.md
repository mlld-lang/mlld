# Test LoadContentResult auto-unwrapping in JavaScript functions

## Setup test file
/var @testContent = `# Test Content

This is the content of the test file.
It has multiple lines.
`
/output @testContent to test-file.md

## Test: LoadContentResult passed to JS function
/var @file = <test-file.md>

/exe @checkUnwrap(@content) = js {
  // Should receive the string content, not the LoadContentResult object
  if (typeof content !== 'string') {
    return `FAIL: Expected string, got ${typeof content}`;
  }
  
  if (content === '[object Object]') {
    return "FAIL: Got [object Object] instead of content";
  }
  
  if (content.includes("Test Content") && content.includes("multiple lines")) {
    return "PASS: Content properly unwrapped";
  }
  
  return "FAIL: Unexpected content";
}

/run @checkUnwrap(@file)

## Cleanup
/run "rm -f test-file.md"