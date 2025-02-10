# Edge Cases

## Empty Section

## Malformed Code Block

```typescript
function broken() {
  // Missing closing brace
  if (true) {
    console.log('test');
```

## Invalid Table

| Header 1 | Header 2
|----------|----------
| Missing | Pipes

## Mixed Headers

# Top Level
### Skipped Level
##### Very Deep
## Back to Two

## Unicode Characters

### 你好，世界

Content in multiple languages: 
こんにちは and Café

### 🎉 Emoji Title 🚀

Testing emoji in headers.

## Duplicate Sections

### Duplicate

First instance.

### Duplicate

Second instance.

## Incomplete Code Fence

```typescript
let x = 1;

## False Section in Code Block

This looks like a section but is inside a code block.

## Escaped \# Characters

This tests \# escaped characters.

## HTML in Markdown

<h1>Raw HTML header</h1>

<div class="test">
  <p>Some HTML content</p>
</div>

## Invalid Characters in Headers

### Invalid UTF-8: �

Testing invalid UTF-8 sequences.

## Deeply Nested Lists

1. Level 1
   * Level 2
     * Level 3
       * Level 4
         * Level 5
           * Level 6

## Empty Code Blocks

```

```

## Multiple Adjacent Headers

# Header 1
## Header 2
### Header 3
#### Header 4 