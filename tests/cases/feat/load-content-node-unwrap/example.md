# Test LoadContentResult unwrapping in Node.js

## Setup
/var @mdContent = `# Markdown Test

This is a **test** document.
- Item 1
- Item 2`

/var @csvContent = `name,age,city
Alice,30,NYC
Bob,25,LA`

/output @mdContent to test.md
/output @csvContent to data.csv

## Test 1: Node.js string processing
/var @file = <test.md>

/exe @processNode(@content) = node {
  const lines = content.split('\n');
  
  // Process markdown
  const hasHeading = content.includes('# Markdown');
  const hasBold = content.includes('**test**');
  
  return `Lines: ${lines.length}
Type: ${typeof content}`;
}

/run @processNode(@file)

## Test 2: CSV parsing in Node
/var @csvFile = <data.csv>

/exe @parseCSV(@data) = node {
  const rows = data.trim().split('\n');
  const headers = rows[0].split(',');
  const dataRows = rows.slice(1);
  
  return `Headers: ${headers.join(', ')}
Data rows: ${dataRows.length}`;
}

/run @parseCSV(@csvFile)

## Test 3: File array in Node
# Skip: Glob patterns not supported in tests
# /var @files = <*.md>

/exe @countChars(@fileArray) = node {
  const totalChars = fileArray.reduce((sum, content) => {
    return sum + content.length;
  }, 0);
  
  return `Total characters: ${totalChars}`;
}

# /run @countChars(@files)
/show "SKIP: Glob test"

## Test 4: Metadata access
/exe @getMeta(@content, @filename) = node {
  return `File ${filename} has ${content.length} characters`;
}

/var @doc = <test.md>
/run @getMeta(@doc, @doc.filename)

## Cleanup
/run "rm -f test.md data.csv"