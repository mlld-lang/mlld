# XML Format Output Issues

## Overview

The XML output format is not working correctly when specified with the `--format xml` option or `{ format: 'xml' }` in the API. The output does not contain proper XML tags as expected, and often returns plain text instead of valid XML.

## Current Behavior

1. When using the CLI with `--format xml`, the output does not contain proper XML tags
2. When using the API with `{ format: 'xml' }`, the output is not properly converted to XML
3. In `api/run-meld.ts`, the default format is set to `'markdown'` rather than using the appropriate OutputFormat type
4. The XML conversion in `services/pipeline/OutputService/OutputService.ts` may not be working correctly

## Expected Behavior

1. When requesting XML format, the output should be valid XML with proper tags
2. The llmxml library should be used correctly to convert content to XML
3. Default format in API should be 'markdown', with 'xml' as an option when specified
4. Output files should follow the new naming convention (.o.xml for XML output)

## Investigation Notes

The OutputService has a `convertToXML` method that uses the llmxml library:

```typescript
private async convertToXML(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  try {
    // First convert to markdown since XML is based on markdown
    const markdown = await this.convertToMarkdown(nodes, state, options);

    // Use llmxml directly with version 1.3.0+ which handles JSON content properly
    const { createLLMXML } = await import('llmxml');
    const llmxml = createLLMXML({
      defaultFuzzyThreshold: 0.7,
      includeHlevel: false,
      includeTitle: false,
      tagFormat: 'PascalCase',
      verbose: false,
      warningLevel: 'all'
    });
    
    try {
      return llmxml.toXML(markdown);
    } catch (error) {
      // Error handling...
    }
  } catch (error) {
    // Error handling...
  }
}
```

However, tests indicate that this method may not be producing proper XML output. Logs from tests show that the llmxml instance is created, but the final output may not contain XML tags.

## Reproduction Steps

1. Create a simple meld file (example.mld):
```
@text greeting = "Hello"
@text name = "World"

{{greeting}}, {{name}}!
```

2. Run through CLI:
```bash
meld example.mld --format xml
```

3. Run through API:
```javascript
const { runMeld } = require('meld');

const result = await runMeld(meldContent, { format: 'xml' });
console.log(result); // Should contain XML tags
```

## Fix Proposal

1. Verify the llmxml integration:
   - Ensure the `toXML` method is working correctly
   - Check if llmxml version is compatible (requires ^1.3.0)
   - Test XML conversion directly with llmxml

2. Fix the format handling:
   - Update `api/run-meld.ts` to ensure XML format is properly passed through
   - Verify format conversion in `services/pipeline/OutputService/OutputService.ts`
   - Add tests specifically for XML output validation

3. Implement proper output file naming:
   - Use the .o.xml extension for XML output as described in the output-filename-handling feature
   - Ensure CLI help documentation reflects the correct default behavior

## Related Issues

- [output-filename-handling.md](../features/output-filename-handling.md): New feature for improved output file naming conventions

## Implementation Priority

High - This is a core functionality issue affecting a main feature of the product. 

## Resolution

✅ Fixed in v10.2.0

### Changes Made:
- Simplified the `convertToXML` method in `OutputService.ts` to directly use the llmxml library without complex fallbacks
- Added support for direct markdown input through the `formatOptions.markdown` parameter
- Improved error handling in the XML conversion process
- Added tests to verify XML output format works correctly, especially with JSON content
- Ensured compatibility with llmxml's XML format

The fix ensures that XML output is properly generated both via the CLI (`--format xml`) and the API (`{ format: 'xml' }`), with proper XML tags. The implementation now relies directly on the llmxml library to produce the XML output, with any formatting issues to be addressed in that library directly rather than through fallback mechanisms in Meld.

Combined with the output filename handling improvements, XML output files now use the `.o.xml` extension by default. 