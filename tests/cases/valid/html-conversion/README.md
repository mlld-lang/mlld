# HTML to Markdown Conversion Tests

This directory contains comprehensive tests for mlld's HTML to Markdown conversion feature, which uses Mozilla's Readability for content extraction and Turndown for Markdown conversion.

## Test Coverage

### 1. Basic Article Extraction (`basic-article/`)
- Tests conversion of a well-formed HTML article
- Verifies navigation and ads are removed
- Checks metadata extraction (title, description)

### 2. Complex HTML Elements (`complex-elements/`)
- Tests conversion of various HTML elements:
  - Code blocks with syntax highlighting
  - Tables
  - Images and links with titles
  - Nested lists
  - Definition lists
  - Horizontal rules
  - Inline formatting (bold, italic, code, strikethrough)
  - Line breaks

### 3. Readability Extraction (`readability-extraction/`)
- Tests extraction from cluttered HTML pages
- Verifies removal of:
  - Navigation menus
  - Advertisements
  - Sidebars
  - Comments sections
  - Footers
  - Popup elements
- Ensures only article content is preserved

### 4. Edge Cases (`edge-cases/`)
- Tests handling of malformed HTML:
  - Unclosed tags
  - Improperly nested elements
  - Empty elements
- Special characters and entities
- Unicode and emoji support
- JavaScript and CSS removal
- HTML comments
- Very long lines
- Non-standard whitespace

### 5. Metadata Extraction (`metadata-extraction/`)
- Tests URL loading with metadata properties:
  - url: Full URL
  - domain: Domain name
  - title: Page title
  - description: Meta description
  - status: HTTP status code
  - contentType: Content-Type header
  - html: Raw HTML
  - text: Plain text
  - md: Markdown (same as content)

## Expected Behavior

1. **Content Extraction**: Readability should extract only the main article content
2. **Clean Conversion**: Turndown should produce clean, readable Markdown
3. **Metadata Preservation**: All metadata properties should be accessible
4. **Graceful Handling**: Malformed HTML should not break the converter
5. **Character Support**: Unicode and special characters should be preserved

## Running the Tests

These tests are run as part of the standard mlld test suite:

```bash
npm test tests/cases/valid/html-conversion
```

Each test compares the actual output against the expected Markdown in `expected.md` files.