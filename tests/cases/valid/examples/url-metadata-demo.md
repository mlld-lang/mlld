# URL Metadata Demo

This example demonstrates the rich metadata available when loading URLs with the alligator syntax.

## Load a URL with metadata

/var @page = <https://example.com>

## Access URL metadata

### Basic Information
/show `URL: @page.url`
/show `Domain: @page.domain`
/show `Status: @page.status`
/show `Content Type: @page.contentType`

### Content Variations
/show `Title: @page.title`
/show `Description: @page.description`

### Different content formats
/var @htmlContent = @page.html
/var @textContent = @page.text
/var @markdownContent = @page.md

## Headers
/show `Response Headers:`
/show @page.headers

## Token Estimation
/show `Estimated tokens: @page.tokest`

Note: Full HTML to Markdown conversion with readability is pending implementation.