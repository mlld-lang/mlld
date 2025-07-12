# HTML Metadata Extraction Test

This test verifies that metadata is properly extracted from HTML pages, including title, description, and other properties.

## Load a URL and access all metadata properties
/var @page = <https://example.com/article>

## Show converted content
/show `## Article Content`
/show @page

## Show all metadata properties
/show `
## Metadata Properties
- URL: @page.url
- Domain: @page.domain  
- Title: @page.title
- Description: @page.description
- Status: @page.status
- Content Type: @page.contentType`

## Access raw HTML and text versions
/var @rawHtml = @page.html
/var @plainText = @page.text

/show `
## Content Formats
- HTML length: @rawHtml.length characters
- Plain text length: @plainText.length characters`