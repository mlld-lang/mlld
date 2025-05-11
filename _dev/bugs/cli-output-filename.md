# CLI Output Filename Issue

## Overview

When using the CLI to process a `.mld` file without explicitly specifying an output path via the `-o` or `--output` option, the CLI was incorrectly defaulting to using the same filename as the input file. This could potentially lead to overwriting the source file if the formats matched, or creating files with unexpected extensions.

## Current Behavior

1. When running `meld example.mld`, the output was being written to `example.md` or `example.xml` based on the format
2. This behavior was inconsistent with the output filename handling fix implemented for version 10.2.0
3. The problem was in `cli/index.ts` where the output path determination didn't use the `.o.{format}` extension pattern
4. The `normalizeFormat` function also incorrectly handled the XML format by defaulting to 'markdown'

## Expected Behavior

1. When running `meld example.mld` without an explicit output path, the output should be written to `example.o.md` or `example.o.xml`
2. The naming convention should consistently follow the `.o.{format}` pattern
3. The `normalizeFormat` function should properly identify and use the XML format
4. All output files should use the correct extension based on the format

## Investigation Notes

The issue was found in two places in the codebase:

1. In `cli/index.ts`, the output path determination logic was using a simple extension replacement:

```typescript
// If no output path specified, use input path with new extension
const inputExt = '.meld';
const outputExt = getOutputExtension(normalizeFormat(cliOptions.format));
outputPath = cliOptions.input.replace(new RegExp(`${inputExt}$`), outputExt);
```

2. The `normalizeFormat` function was incorrectly handling the XML format:

```typescript
function normalizeFormat(format?: string): 'markdown' | 'xml' {
  if (!format) return 'markdown';
  
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'xml':
      return 'markdown'; // Default to markdown for XML format
    default:
      return 'markdown';
  }
}
```

## Reproduction Steps

1. Create a simple meld file (example.mld):
```
@text greeting = "Hello"
@text name = "World"

{{greeting}}, {{name}}!
```

2. Run through CLI without specifying output path:
```bash
meld example.mld
```

3. Observe that the output file is named `example.md` instead of `example.o.md`

## Fix Implemented

The fix involved two changes:

1. Updated the output path determination logic to use the `.o.{format}` extension pattern:

```typescript
// If no output path specified, use input path with .o.{format} extension pattern
const inputPath = cliOptions.input;
const inputExt = path.extname(inputPath);
const outputExt = getOutputExtension(normalizeFormat(cliOptions.format));

// Extract the base filename without extension
const basePath = inputPath.substring(0, inputPath.length - inputExt.length);

// Always append .o.{format} for default behavior
outputPath = `${basePath}.o${outputExt}`;
```

2. Fixed the `normalizeFormat` function to properly handle XML format:

```typescript
function normalizeFormat(format?: string): 'markdown' | 'xml' {
  if (!format) return 'markdown';
  
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'xml':
      return 'xml'; // Return 'xml' for XML format
    default:
      return 'markdown';
  }
}
```

## Related Issues

- [output-filename-handling.md](../features/output-filename-handling.md): Feature that introduced the `.o.{format}` extension pattern
- [xml-format-output.md](./xml-format-output.md): Issue with XML output format not generating proper XML tags

## Implementation Priority

High - This was a core functionality issue affecting a main feature of the product.

## Resolution

✅ Fixed in v10.2.3

### Changes Made:
- Updated the CLI output filename handling to consistently use `.o.{format}` extension pattern
- Fixed XML format handling to properly identify and use XML format instead of defaulting to markdown
- Updated filename generation logic to prevent source file overwriting issues
- Added tests to verify output filename pattern follows the expected conventions
- Ensured compatibility with the incremental filename generation when overwrite is declined

All tests pass with these changes, confirming that the fix doesn't break any existing functionality. 