# Node.js Error Message Test

Tests that Node.js errors preserve their original error messages.

## Example

```mlld
/exe @checkFile(path) = node {
  const fs = require('fs');
  if (!fs.existsSync(path)) {
  throw new Error(`File not found: ${path}`);
  }
  return "File exists";
}

/var @result = @checkFile("/nonexistent/file.txt")
```

## Expected Error

Node.js error: File not found: /nonexistent/file.txt