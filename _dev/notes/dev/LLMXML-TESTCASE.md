# LLMXML Section Extraction Test Case

This file demonstrates the issue with section extraction in the llmxml library. When attempting to extract "Section Two" from this document, the library fails to find it, even though it exists with standard markdown formatting.

## Section One

This is the content of section one.

## Section Two

This is the content of section two that llmxml fails to extract.

## Section Three

This is the content of section three.

## Test Case

```typescript
import { createLLMXML } from 'llmxml';

async function testSectionExtraction() {
  // Read the content of this file
  const content = await fs.readFile('LLMXML-TESTCASE.md', 'utf-8');
  
  // Create llmxml instance
  const llmxml = createLLMXML({
    defaultFuzzyThreshold: 0.7,
    warningLevel: 'none'
  });
  
  // Try to extract Section Two
  const section = await llmxml.getSection(content, 'Section Two', {
    exact: false,
    includeNested: true
  });
  
  // This often returns null even though the section exists
  console.log('Extracted section:', section ? 'Found!' : 'Not found!');
  
  // Manual extraction works fine
  const manualExtraction = extractManually(content, 'Section Two');
  console.log('Manual extraction:', manualExtraction ? 'Found!' : 'Not found!');
}

// Manual extraction function for comparison
function extractManually(content: string, heading: string): string | null {
  const lines = content.split('\n');
  
  // Find all headings with their levels
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        text: match[2].trim(),
        level: match[1].length,
        index: i
      });
    }
  }
  
  // Find the requested heading
  const targetHeading = headings.find(h => h.text === heading);
  if (!targetHeading) {
    return null;
  }
  
  // Find the end of the section (next heading of same or higher level)
  let endIndex = lines.length;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].text === targetHeading.text) {
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= targetHeading.level) {
          endIndex = headings[j].index;
          break;
        }
      }
      break;
    }
  }
  
  // Extract the section content
  const sectionLines = lines.slice(targetHeading.index, endIndex);
  return sectionLines.join('\n');
}

testSectionExtraction();
```

## Expected Behavior

Both the llmxml extraction and manual extraction should find "Section Two" and return its content.

## Actual Behavior

- Manual extraction correctly finds "Section Two"
- llmxml extraction often returns null, failing to find the section

## Suggested Improvements

1. Add better error diagnostics to show what's failing
2. Return available headings when section not found
3. Implement a more reliable heading detection algorithm
4. Add configurable fuzzy matching thresholds per call