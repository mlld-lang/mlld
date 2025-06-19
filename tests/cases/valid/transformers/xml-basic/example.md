# Test: XML transformer with llmxml

## Plain text to XML (wrapped in DOCUMENT)
@text content = [[
This is a test document.
It has multiple lines.
]]

@text xmlResult = @run [(echo "@content")] with { pipeline: [@xml] }
@add @xmlResult

## Markdown with headers (llmxml conversion)
@text mdContent = [[
# Products
- Laptop: $999
- Mouse: $25
- Keyboard: $75
]]

@text xmlMd = @run [(echo "@mdContent")] with { pipeline: [@XML] }
@add @xmlMd

## JSON to XML
@text jsonData = [[{"name": "Alice", "age": 30}]]
@text xmlJson = @run [(echo "@jsonData")] with { pipeline: [@xml] }
@add @xmlJson