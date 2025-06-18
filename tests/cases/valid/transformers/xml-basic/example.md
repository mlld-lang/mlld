# Test: XML transformer with llmxml

## Convert simple text to XML
@text content = [[
This is a test document.
It has multiple lines.
]]

@text xmlResult = @run [(echo "@content")] | @xml
@add @xmlResult

## Using lowercase alias
@text xmlLower = @run [(echo "Another test")] | @xml
@add @xmlLower