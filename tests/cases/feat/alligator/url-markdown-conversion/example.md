# Alligator URL Markdown Conversion Test

This test verifies URL content conversion features.

## Load an HTML page

/var @html_page = <https://example.com>

## Access different content formats via .mx

### Raw HTML
/show `Has HTML: @html_page.mx.html.isDefined()`

### Plain text (HTML stripped)
/show `Has text: @html_page.mx.text.isDefined()`

### Markdown conversion
/show `Has md: @html_page.mx.md.isDefined()`

## Show URL metadata

/show `URL: @html_page.mx.url`
/show `Domain: @html_page.mx.domain`
/show `Title: @html_page.mx.title`
