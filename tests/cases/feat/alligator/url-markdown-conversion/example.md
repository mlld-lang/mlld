# Alligator URL Markdown Conversion Test

This test verifies URL content conversion features.

## Load an HTML page

/var @html_page = <https://example.com>

## Access different content formats via .ctx

### Raw HTML
/show `Has HTML: @html_page.ctx.html.isDefined()`

### Plain text (HTML stripped)
/show `Has text: @html_page.ctx.text.isDefined()`

### Markdown conversion
/show `Has md: @html_page.ctx.md.isDefined()`

## Show URL metadata

/show `URL: @html_page.ctx.url`
/show `Domain: @html_page.ctx.domain`
/show `Title: @html_page.ctx.title`
