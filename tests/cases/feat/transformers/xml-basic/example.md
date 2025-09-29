# Test: XML transformer with llmxml

## Plain text to XML (wrapped in DOCUMENT)
/var @content = `
# Document
This is a test document.
It has multiple lines.
`

/var @xmlResult = run { cat } with { stdin: @content, pipeline: [@xml] }
/show @xmlResult

## Markdown with headers (llmxml conversion)
/var @mdContent = `
# Products
- Laptop: $999
- Mouse: $25
- Keyboard: $75
`

/var @xmlMd = run { cat } with { stdin: @mdContent, pipeline: [@XML] }
/show @xmlMd

## JSON to XML
/var @jsonData = `{"name": "Alice", "age": 30}`
/var @xmlJson = run { cat } with { stdin: @jsonData, pipeline: [@xml] }
/show @xmlJson
