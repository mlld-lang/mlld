# Test: XML transformer with llmxml

## Plain text to XML (wrapped in DOCUMENT)
/var @content = ::
This is a test document.
It has multiple lines.
::

/var @xmlResult = run {echo "@content"} with { pipeline: [@xml] }
/show @xmlResult

## Markdown with headers (llmxml conversion)
/var @mdContent = ::
# Products
- Laptop: $999
- Mouse: $25
- Keyboard: $75
::

/var @xmlMd = run {echo "@mdContent"} with { pipeline: [@XML] }
/show @xmlMd

## JSON to XML
/var @jsonData = ::{"name": "Alice", "age": 30}::
/var @xmlJson = run {echo "@jsonData"} with { pipeline: [@xml] }
/show @xmlJson