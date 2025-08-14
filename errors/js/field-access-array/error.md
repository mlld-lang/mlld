## Cannot access field '${FIELD}' on array of files

You're trying to access '${FIELD}' directly on an array of loaded files: ${CONTEXT}

Arrays of loaded files don't have a '${FIELD}' property at the array level.
Each individual file in the array has this property.

### Solution

Use a /for loop to access properties of individual items:

```mlld
${SUGGESTION}
```

### Available properties

**On the array itself:**
- `.content` - Concatenates all file contents
- `.length` - Number of files

**On individual items:**
- `.filename` - File name (e.g., "README.md")
- `.relative` - Relative path
- `.absolute` - Full path
- `.content` - File contents
- `.tokest` - Estimated token count
- `.tokens` - Exact token count
- `.fm` - Frontmatter (markdown files)
- `.json` - Parsed JSON (JSON files)