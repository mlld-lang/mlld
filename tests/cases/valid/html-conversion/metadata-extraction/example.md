# HTML Metadata Extraction Test

This test verifies that metadata is properly extracted from HTML pages, including title, description, and other properties.

## Load a local HTML file and access metadata properties
/var @page = <test.html>

## Show converted content
/show `## Article Content`
/show @page

## Show available metadata properties
/show `
## Metadata Properties
- Title: @page.title
- Description: @page.description
- Filename: @page.filename
- Path: @page.relative
`

## Access raw HTML and text versions
/var @rawHtml = @page.html
/var @plainText = @page.text

/exe @strlen(@str) = js {return str.length}
/var @htmlLen = @strlen(@rawHtml)
/var @textLen = @strlen(@plainText)

/show `
## Content Formats
- HTML length: @htmlLen characters
- Plain text length: @textLen characters`