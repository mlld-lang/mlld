# LLMXML Parser Issue with Empty Code Blocks and Incorrect Line Numbers

## Issue Description

When processing Meld files that contain embedded content and code fences, the LLMXML parser fails with an empty code block error, but reports a line number that doesn't match the source file. Specifically, the error occurs at lines 140-141, despite the source file only containing 129 lines.

## Error Message

```
error: Failed to parse Markdown {"error":{"code":"PARSE_ERROR","details":{"node":{"lang":null,"meta":null,"position":{"end":{"column":1,"line":141,"offset":2322},"start":{"column":1,"line":140,"offset":2318}},"type":"code","value":""}},"name":"LLMXMLError"}
```

```
2025-02-27 23:43:02 [error] [output] Failed to convert output
{
  "format": "llm",
  "error": {
    "code": "PARSE_ERROR",
    "details": {
      "error": {
        "code": "PARSE_ERROR",
        "details": {
          "node": {
            "type": "code",
            "lang": null,
            "meta": null,
            "value": "",
            "position": {
              "start": {
                "line": 140,
                "column": 1,
                "offset": 2318
              },
              "end": {
                "line": 141,
                "column": 1,
                "offset": 2322
              }
            }
          }
        },
        "name": "LLMXMLError"
      }
    },
    "name": "LLMXMLError"
  }
}
```

## Steps to Reproduce

1. Run a Meld file with embedded content and code fences: `npm run meld -- examples/api-demo.meld`
2. Observe the error in the console output

## Root Cause Analysis

The issue appears to be related to how line numbers are tracked when combining content from multiple sources:

1. **Line Number Discrepancy**: The error reports a problem at lines 140-141, but the actual file `api-demo.meld` only has 129 lines. This suggests the line numbers are being calculated based on a concatenated or combined representation of content that includes:
   - The main file content
   - Imported files from `@import` directives 
   - Embedded content from `@embed` directives

2. **Empty Code Block**: The error specifically mentions an empty code block with no language identifier. This could be:
   - A formatting issue during the process of embedding content
   - A malformed or truncated code fence in one of the embedded files
   - A side effect of how nested code fences are handled

3. **Node Processing Sequence**: When the Meld processor handles embedded content, it parses and processes the embedded file nodes separately, but the LLMXML parser appears to be receiving a flattened representation of the entire document including all embedded content, which affects line numbering.

## Technical Details

### Location Calculation

The Meld processor tracks location information in multiple ways:

1. **Source Locations**: Each node in the AST has a `location` property with line and column information relative to its source file.
2. **Offset Information**: The LLMXML parser uses character offsets (2318-2322) as well as line and column numbers.

In this case, the error is occurring during the final output processing step when converting to LLMXML format. The character offsets (2318-2322) suggest there's only a 4-character span causing the issue, likely an empty code fence: ` ``` `.

### Empty Code Block

The error specifically mentions:
```
"node":{"lang":null,"meta":null,"position":{"end":{"column":1,"line":141,"offset":2322},"start":{"column":1,"line":140,"offset":2318}},"type":"code","value":""}
```

This indicates a code block with:
- No language specification (`lang:null`)
- No content (`value:""`)
- Spanning exactly 2 lines (140-141)

### Combined Content

The file `api-demo.meld` embeds several other files:
1. It imports `example-import.meld` multiple times
2. It embeds `example-import.meld` directly 
3. It contains multiple code fences

When combining all these elements, the total line count would exceed the 129 lines in the original file, explaining the line number discrepancy.

## Proposed Solutions

1. **Improved Location Tracking**: Maintain separate location contexts for embedded content rather than flattening all location information into a single coordinate space.

2. **LLMXML Parser Enhancement**: 
   - Make the LLMXML parser more robust to empty code blocks
   - Add preprocessing to filter out invalid empty code blocks before passing to the LLMXML parser
   - Add file path context to error messages to better identify the source of issues

3. **Debugging Enhancements**:
   - Add source file attribution to error locations (e.g., "line 10 in embedded file X")
   - Improve error reporting to show the actual problematic content

4. **Error Recovery**:
   - Add fallback mechanism to skip problematic nodes during output conversion
   - Implement a sanitization step that fixes common formatting issues before passing to LLMXML

## Additional Notes

1. The offset values in the error message can be used to locate the exact problematic text in the combined content buffer.

2. This issue only manifests when converting to LLMXML format - if output is set to markdown, the parsing succeeds.

3. This issue may be related to how nested code fences are handled in the code – the file contains examples of nested code fences, which could be causing the parser to become confused about fence boundaries.

4. The error seems to consistently occur at the same position across multiple runs, suggesting it's a deterministic parsing issue rather than a race condition or timing issue. 